# Slice 2 plan: the review list (spec v4.1)

*Integrator's plan, 2026-11-19, written on autopilot (the user is away and asked for the slices to be built without stopping; `verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md` logs every choice made without them). The specification is `verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md`; clause IDs below refer to it. Three designs fed this plan: the session engine, the review UI, and the checks. §7.1 says how their conflicts were resolved. Every choice the spec does not make is listed in §7.2 as an "AUTOPILOT DECISION", with its alternative, for the decisions log; the text refers to them as (D2-n).*

*Simplified the same day by the integrator on autopilot (AP-24; §8, D2-61–D2-69), because two fix rounds kept finding new major problems in the most intricate mechanisms. The results of a stage are now shown or hidden together; nothing is decided while Claude's step runs; and every queue of Claude steps runs to its end before the stage opens. The machinery that only the per-Result reveal and the decisions during a step needed is removed. References such as (F7) point to the findings of the workflow's second recheck (`bundle_21/subagent_reports/slice2_planfix_workflow/agents/recheck_round2.json`), which §8 maps to the sections that resolve them; they are not the review findings that the spec cites. References such as (AF3) point to the findings of the recheck that followed AP-24 (numbered F1–F14 there), fixed the same day; §8 maps them too.*

**Slice 2 = ★D8 (a) item 2, the review list:** real edit sessions, started by Formalize for dependencies.
- **Several targets** per Formalize, proved sources first, one Claude step each. The steps run as one queue, and the stage opens when the last one ends (D2-63). The end of each queue and every decision re-judge every inference (ES-2, RV-11). Formalize can run again during a stage, from the Proposed view, once the results are shown (RV-9, D2-65).
- **The review list is the status table** (RV-1–RV-13):
  - items for Formalize, Vocabulary (N), definitions and presuppositions, Add arrow, Add premise and Result;
  - the statuses in review, accepted, declined and to be redone;
  - item dependencies, and own-Accept classes recomputed on every judged state;
  - meaning before proof, as one reveal for the whole stage (D2-61);
  - groups, the stage report, and Submit review.
- **Decline options:**
  - a plain decline for arrow items (DO-0);
  - Reject, with "Rejected in this session" (DO-1);
  - Shaky (DO-3).
  Transform (DO-2) is shown but disabled until slice 4 (§5.7).
- **While Claude works, the list is read-only** (D2-62): no decision, Show results or Undo until the queue ends; Cancel step, answering Claude's questions and Exit stay. This departs slightly from RV-3's "at any time".
- **Failures, reload, base:**
  - a failed step rolls back; Cancel step, which also drops the rest of its queue ("not run"), and Retry step;
  - Resume after a reload;
  - a base that never moves, with a live drift notice (ES-4–ES-8).
- **The end:** Submit review leads to the end confirmation, with the final check and the backstop (EN-1–EN-4, §14.5). From there:
  - Apply: one history entry, one Undo step, and the endorsements;
  - or Exit.
- **Undo:** the session stack (UN-4–UN-6), sealed when each queue after the first starts (§4.6), routed by view (UN-1). The board stack stays locked (UN-3).
- **The session bar** replaces the proposal banner (CM-6).
- **Appendix B for several inferences:**
  - B.1 with Claude's arrows E(T);
  - B.2 on every judged state and at Apply;
  - B.3, B.4, and the backstop.
- **Claude's own arrows** into the step's target, each an Add arrow item.

**Not in slice 2:**
- **FROZEN (slice 3).** There is no Freeze/Unfreeze, no held set, no unfreeze request, no frozen banner and no keep tick. So **Accept freezes nothing** (RV-4 waits for slice 3), and accepted content is protected in two other ways:
  - during a step, by ES-2's preset, which the gate enforces as the step's limits;
  - at Apply, by the accepted content key.

  An accepted item that a later step or a re-judgement changes returns to "in review", marked "updated" (§3.5).
- "Open the whole model" and "Claude may add cards" (Formalize's ▾): slice 3 (D2-12).
- The transform window (slice 4) and references (slice 5).
- Consistency checking (M3).

So the item kinds Add (of a card), Change, Delete, Remove arrow and Proof broken are defined, rendered and covered by the backstop, but no slice-2 step can produce them: the step limits refuse every change they would stand for.

---

## 0. Rules for everyone working on slice 2

Slice 1's rules hold unchanged (§0 of `docs/slice1-plan.md`; the builder rules file is pasted into every builder's brief):
- no git changes, no installs, never real Claude (`TELELEAN_NO_REAL_CLAUDE=1`), never write `packages/extension/dist` or `out`;
- one heavy job at a time under `capped.sh`;
- vitest with one worker; the extension's vitest with `--no-cache`;
- binaries from `node_modules/.bin` (never `npx` or `npm`); `TELELEAN_TEST_TMP` in the scratch dir;
- real-Lean tests only for the files a change touches, and only above the 12 GB rule; otherwise listed as not run.

Additions for slice 2:
- **Fixtures.** `test-fixtures/` is the integrator's: the recorded facts are regenerated there (§2.1). New FakeBackend session scripts go in `packages/runner/test/run/fixtures/sessions/`.
- **Contracts.** The contracts of §2 are the integrator's. A builder who must change one records it in §8 with the reason, and says so in the report when another sub-slice already uses it.
- **Texts.** Every user-facing text quoted in this plan is used verbatim. Core `review/texts.ts` holds those shared by host and webview, and 2a1 writes every such text this plan quotes. A sub-slice that runs beside 2g reports a missing text instead of adding it, and the integrator adds it between sub-slices.
- **One builder at a time in core.** Every package compiles core's sources (`@telelean/core` resolves to `core/src/index.ts`), so a half-written core file breaks every package's tsc and vitest. No sub-slice runs beside one that changes a core source file: 2a1, 2a2, 2b1a, 2b1b, 2b2, 2c1 and 2c2 run one after another, and 2g runs beside 2b3 and 2d–2f only because they change no core source. A builder who finds that one must change stops and reports it.
- **Tests that move** (from 2d on). Every start is then a session, so the existing manager, extension and e2e tests of Accept, Feedback and ghosts fail until 2e, 2f or 2h rewrites or retires them. 2d marks each such test `it.skip` with "moves to 2e/2f/2h: ‹name›" and lists them in its report; the sub-slice named un-skips or deletes it, and the integrator checks at the slice end that the list is empty.
- **Browser and VS Code tests.** Webview test builds go to a scratch folder (`TELELEAN_WEBVIEW_OUT`). Only the integrator runs Playwright and the VS Code suite, and only when RAM allows (AP-6).
- **Baseline before 2a1:** measured by the integrator after slice 1's last fixer (§9).

## 1. Order of work

Each sub-slice ends compiling, with the unit tests of every package it touched passing, its entry in §8, and a patch saved (§7.4). Each is sized for one builder. The core ones, 2a1 to 2c2, run strictly one after another (§0).

| Sub-slice | What | Main clauses | After |
|---|---|---|---|
| 2a1 | Review contracts and the item model, part 1 (core, pure): the shared contracts of §2.9 with stubs for later sub-slices, the texts, closures, ownership (`computeItems`) and content keys | RV-1, RV-2 | slice 1 |
| 2a2 | The item model, part 2 (core, pure): RV-7 classes, RV-5 dependencies, the stage reveal rule, the reconcile rules, and the status reducer with the session stack | RV-3–RV-8, RV-11, A1, DO-0/1/3 cascades, UN-4–UN-6 | 2a1 |
| 2b1a | Judging, part 1 (core, refactor only): the rule helpers taken out of `evaluate()`, with `evaluateRules` and every gate suite unchanged | Appendix B (kept rules) | 2a2 |
| 2b1b | Judging, part 2 (core): step limits, B.1–B.4, `judgeState` over every inference, the new tokens, `proposeArrowProblems` | ES-2, B.1–B.4, Appendix B, AR-3 | 2b1a |
| 2b2 | The backstop, taking content out (with a new `replace-decl` LeanOp), the start checks, Submit's plan, and `holdAs` in adoption (core, pure) | §14.5, Appendix B, AR-8, RV-1, RV-9, RV-12 | 2b1b |
| 2c1 | The base mask, the build's mask option and endorsements, `endorsementHash`, and the protocol messages (core) | RV-6, CM-6 | 2b2 |
| 2c2 | The session view, `buildSessionView` (core), and the host's `not-yet` answers | RV-2, RV-6, RV-10 | 2c1 |
| 2b3 | In two parts, one after the other (D2-75). 2b3a: the type-constant probe, isolated in its own Lean job, its measurement, and the recordings and core's Spyro facts regenerated with it. 2b3b: the runner engine: the shadow's kinds, `CheckContext.session`, judge, final check, the premise write and its completion, the ghost check with E(T), `planApply` | ES-2, B.1–B.4, EN-2 | 2c2 (2b3b after 2b3a) |
| 2d | Sessions, queues and steps (runner, with the host's routing for them) | ES-1, ES-2, ES-4, ES-6, RV-9, RV-11, RV-13, A12 | 2b3 |
| 2e | Review actions (runner + host): decisions on the working copy, re-judging, Reject and Shaky, Submit review, session Undo, Show results | RV-3, RV-5, RV-6, RV-11, RV-12, DO-0/1/3, UN-4–UN-6 | 2d |
| 2f | Add premise items and the end (runner + host): confirmation, final check, Apply, Exit, drift, endorsements | RV-1 (Add premise), EN-1–EN-4, ES-7, ES-8, §14.5 | 2e |
| 2g | The review panel and the session bar (webview) | RV-2, RV-3, RV-6, RV-8, RV-10, DO-*, CM-6, EN-2, ES-4, ES-7 | 2c2 (may run beside 2b3 and 2d–2f, §0) |
| 2h | The Proposed view in a session; Formalize for several targets and mid-stage; session Undo; retiring the old review; the user guide | BD-5, RV-9, AR-8, CM-2, CM-4, UN-1, UN-4, ES-9 | 2f, 2g |
| 2i | Cleanup of built code found by the coverage audit (AP-29): the card-only Delete removed, an old axiom's declared premises named, the guide corrected | ES-9, S9, A19, BD-3 | 2h |

- **A session cannot be reviewed on the board until 2g lands.** From 2d on, Formalize starts a session, which the old stepper does not show. The user's installed extension is not affected: `dist` is rebuilt only at the verified slice end (AP-8).
- **2a2, 2c2, 2b3, 2d and 2g are the largest.** If a builder reports running out of room:
  - 2a2 splits after the reveal rule (2a2a: classify, deps and `resultsState`; 2a2b: reconcile and the reducer);
  - 2c2 splits after the item views (2c2a: the items, their details and the counts; 2c2b: the report, the board, the gates and the confirmation);
  - 2b3 is split from the start (D2-75): 2b3a, the isolated probe, its measurement and the regenerated recordings; then 2b3b, the shadow, the engine and `planApply`;
  - 2d splits after the StepRunner extraction (2d1: the extraction and run.json v2; 2d2: the session layer and its queues);
  - 2g splits after the store (2g1: the store, the list and the detail; 2g2: the stage report, the session bar and the end confirmation).

### 1.1 Scope of each sub-slice

The files named are where the work lands; builders may add helper files next to them.

**2a1: review contracts and the item model, part 1.** Core only, pure.
- Contracts: `core/src/review/types.ts` (§2.2, §2.9, and §2.7's `StepScope` and `JudgeInput`, which §2.9 refers to), `view.ts` (types only), `texts.ts`; `facts.ts` (the `typeConsts` field, §2.1); `run.ts` and `actions.ts` (additive fields, §2.3, and the code `refused` added to `ActionErrorCode`, AF9; M2's `RunView.frozen` stays as it is, D2-68). The `GateFindingCode` additions stay with 2b1b.
- `core/src/review/index.ts` with every export of slice 2's core functions (the signatures of §2.9, which name every one of them, AF8), and its line in `core/src/index.ts`. The functions of 2a2, 2b1b, 2b2, 2c1 and 2c2 start as stubs that throw `notImplemented`, so no later sub-slice edits an index file.
- The model, part 1:
  - `review/closure.ts` (§4.1);
  - `items.ts`: `computeItems` (ownership fixed at creation, a Result for every inference whose step ended, marked `asInBase` when it is B's version (AF1), premise items only for inferences whose step ended (AF10), enclosing lines), keys and content keys, the premise drafts' keys included (§4.2, §4.3).
- Test helper: `fakeFacts` gains `typeConsts: true` and per-declaration `typeConsts` / `noTypeConsts` overrides.

**2a2: the item model, part 2.** Core only, pure; after 2a1, never beside it (§0).
- `classify.ts` (§4.4, both class maps, and "adds no new basis" on the class, AF8) and `deps.ts` (§4.5);
- `reveal.ts`: `resultsState`, the stage reveal rule, with the undecided items to be redone (§4.7, AF4);
- `reconcile.ts`: the reconcile rules (§3.5), item ids from the run id and the key (AF7);
- `reducer.ts`: statuses, cascades, groups (`planGroupAccept`, `planGroupDecline`), and the session stack with every effect of an action, Undo and Redo checked against the current state (§4.6, AF13).

**2b1a: judging, part 1 (refactor only).** Core only.
- Take the rules out of `evaluate()` (one 1,161-line closure in `gate/rules.ts`) into per-rule helpers, one at a time, keeping `evaluateRules`' signature and behaviour, and every gate suite green after each move. No new rule, finding code or token.

**2b1b: judging, part 2.** Core only; after 2b1a.
- The gate: `gate/types.ts`, `rules.ts`, `permitted.ts`, `describe.ts`, `index.ts` (§2.7): the new codes and tokens, built on 2b1a's helpers.
- B.1 in `review/permitted.ts` (§4.8); judging and `proposeArrowProblems` in `review/judge.ts` (§4.9).

**2b2: the backstop, taking content out, several targets.** Core only, pure.
- The backstop in `review/backstop.ts` (§4.10), `not-written` included (AF2).
- Taking content out in `review/revert.ts` (§4.11), a premise's completion included (AF2), with a new LeanOp `replace-decl { name, text }` in `markup/types.ts` and `leanOps.ts`. Restoring B's text of a theorem or a vocabulary item needs it, and no LeanOp that EditSession offers today can do it.
- Several targets in `review/formalize.ts` (§4.12).
- Submit's plan in `review/submit.ts`: `planSubmit` gives the affected inferences, the content to take out first, and the order of the steps (§3.7, D2-57). The view (2c2) counts with it, and 2e runs it.
- `gate/adoption.ts`: `holdAs` (§3.8). It moved here from 2f, so 2f changes no core file.
- The failed probe's core half (§2.1, D2-75; here because 2b3 changes no core source, §0): `LeanFacts.probe`, `ProbeRunFacts` and `probeFailure` (with its sentences) in `facts.ts`; in `review/items.ts`, every draft with a declaration is `factsMissing` when the judged state's facts say the probe failed (ADV-3's path); the `facts` problem of `review/judge.ts` and the backstop's `facts` refusal name the cause; `fakeFacts` gains `probe`. No check is coming to lift such a refusal (the same files fail the same way), so `review/classify.ts` gives each such class the sentence (`ItemClass.probeFailure`, §2.2), and the reducer's Accept refusal of it reads that sentence plus "Decline what caused it, or Exit." (`REVIEW_TEXTS.acceptProbeFailed`), never ADV-3's "its file did not build. Wait for the check to finish." (AP30-5).
- G0 refuses the `init` attribute, in `@[…]` and in `attribute […] x` alike (`gate/g0.ts`, beside `WORD_CODES`; §2.1's "No Claude code runs at import", AP30-1, AP30-1 r2), comparing each attribute name as Lean reads it, after `eraseMacroScopes`; and it refuses every hand-written hygienic name in Claude's lines (AP30-1 r3, below).

**2c1: the base mask, the build option, the messages.** Core only.
- `review/mask.ts`: `baseMask` and `maskFacts`, field by field (§4.7, AF6).
- The build's mask option, with `codeOverride` placed against B's range (AF6), and endorsements input (`project/types.ts`, `build.ts`, §2.6); `paths.ts` (`endorsementsPath`), with `endorsementHash(text)` beside it, the one hash that 2f writes and the build compares.
- `protocol.ts`: the `session` message, and the webview → host messages with their validators and limits (§2.4).

**2c2: the session view.** Core, plus the host's answers.
- Core: `review/view.ts` (`buildSessionView`, §2.3, §4.7).
- Host (`extension/src/logic/boardSession.ts`, `runs.ts`): routing comes with the runner's sub-slices. Until then the host answers a valid message it does not route yet with `not-yet`, "Not built yet (slice 2)".

**2b3: the probe and the runner engine.** Runner, plus core's test fixtures; no core source (§0). In two sub-slices, one after the other (D2-75).

**2b3a: the isolated probe.**
- First, with real Lean (capped, with the RAM gate): the probe job loads the Spyro fixture's built modules with `Lean.importModules` on the pinned toolchain, and its `valueConsts` equal 1d's (§2.1). If it cannot, the builder stops and reports, and the integrator chooses D2-75's fallback or its alternative before anything is built on it.
- The probe (§2.1): a new `semantic/probeFile.ts` (the probe file and its reading); `semantic/checkFile.ts` (the check file without the probe and its imports; `valueProbeLines` with the type walk and the `modules` option); `refresh.ts` (the probe job right after the check, the constants and the `probe` marker into the facts, and no second run without the probe, AP-21); `gate/scratch.ts` (the ghost check keeps its in-file probe, with the type walk); `gate/findings.ts` and `engine.ts` (a failed probe at check, freeze and gate on today's `evaluateRules` path, and at `checkBase`, which refuses the start, §2.1, AP30-2). Two new overlays, `test-fixtures/semantic/overlays/probe-forge` for the cheat and `probe-init` for a model's own `[init]` (§6.1, AP30-1), each with its README row; being additions to the integrator's `test-fixtures/`, they are listed in the report.
- The measurement (§2.1's Cost).
- It ends with the integrator's regeneration (§2.1's Recordings): `test-fixtures/semantic/recorded/*`, and core's three hand-written Spyro facts with real `typeConsts` and the marker. The core suite is run again on them.

**2b3b: the runner engine.**
- G0 (fixer 2b1b r1, S-F6; its order fixed by AP30-1 r2): judgeState does not run it (its ProjectModels hold only the Lean files), so the engine does. G0 runs first, before any Lean job, at every purpose, as runCheck does today. When it finds anything, the engine syncs no mirror and runs no build, check, probe, render or challenge, so text G0 refuses never reaches the mirror, where every Lean job runs:
  - at step purposes (check, freeze and gate, with or without `CheckContext.session`, and the ghost check's check of ws/) it returns G0's findings as today (`outcome: 'problems'`, counted), with no judgement;
  - at `stage` and `final` (`judge`, `finalCheck`) it judges the files without facts (`current.facts` undefined, so the judgement has the `facts` problem), with G0's findings merged into `global`, so `ok` is false and the final check fails;
  - `writePremise` and `complete` judge nothing: they answer `{ ok: false }` with G0's first message as `error`. The premise write then fails as one whose probe failed does, and the completion as one that does not pass (§3.8), each with that message. Their failure reports carry no judgement, and step 4 never reads a partial one (AP30-4).

  Merging G0's findings never builds the state G0 refused (§2.1's "No Claude code runs at import"). This replaces the reading of builder 2b1b's G0 entry and of S-F6's hand-off (§8) in which the state was built and judged first and G0's findings merged afterwards.
- The shadow (`shadow/types.ts`, `workspace.ts`): the new commit kinds and `lastCommitSince`.
- The gate (`gate/types.ts`, `engine.ts`, `findings.ts`): `CheckContext.session`, `judge` (with the premise re-checks), `finalCheck`, `writePremise`, `complete` (§2.9), the re-exported challenge, and the ghost check with E(T).
- The failed probe on the session path (§2.1, AP30-3): check, freeze and gate with `CheckContext.session` apply §2.1's failed-probe rule to the judgement's `stepFindings`: an `environment` outcome with `probeFailure`'s sentence when they are empty or only `source-only`, else the findings as usual. A session step never passes or fails on `ok` alone (a failed probe shows there only as the `facts` problem, which is never in `stepFindings`). `writePremise` on a judgement whose probe failed answers `{ ok: false, environment: probeFailure's sentence }` (§3.8, AP30-4).
- `proposal/service.ts`: `planApply`.

**2d: sessions, queues and steps.**
- Runner:
  - `run/step.ts`: the StepRunner, extracted from `manager.ts` with behaviour unchanged first, every existing manager test still green;
  - `run/session.ts` (the session layer: queues, the stage that opens when a queue ends, and the single write queue, in which a queue's start is itself a write, §2.6, AF3; the in-memory session changing only at a write's first and last steps, AF11; the stage judgement computed again on load, D2-72) and `run/legacy.ts` (old runs, adopted ghosts as written Add premise items, AF12);
  - the session's RunView (§3.12: `activity` and `notices` as empty arrays, and the InferenceView's question rule, AF5, AF9); a rollback that drops its step's premise drafts (AF10); when each RunManager call resolves (§2.5, AF14);
  - `run/types.ts`, `persist.ts` (`writeStateChecked`, §2.6), `prompts.ts`, `systemPrompt.ts`;
  - `llm/toolSchemas.ts`, `llm/types.ts`, and the system-prompt fixture.
- Host (`boardSession.ts`, `runs.ts`): `formalize` (start and mid-stage), `cancelRun` as Cancel step, `retryStep`, `resumeRun`, and the `session` message.
  - `busyRefusal` refuses any start while a run is active, so a `formalize` that carries `runId` and `stage` (mid-stage) bypasses it. The session's own checks (§3.2) apply instead.
- `persist.ts`: `isPersistedRun` accepts versions 1 and 2 (§2.6).
- The runner refuses every review action while a step runs, with D2-62's text; the host passes the refusal on.
- The tests that move (§0) are marked and listed.
- Scope: §2.8, §3.1–3.5, §3.11–3.13.

**2e: review actions.**
- Runner: `run/session.ts`; `proposal/files.ts` (the inverse merge for un-reject).
- Host routing: `decideItems`, `revealResult`, `sessionUndo`, `sessionRedo`, `submitReview`, `openSessionDiff` (`needs-confirmation` while the results are hidden, unless `confirmed`, §2.4).
- Scope: §3.6, §3.7.

**2f: Add premise items and the end.** No core file (`holdAs` comes from 2b2, and Apply uses M2's history kind, D2-67).
- Runner:
  - `run/premises.ts` (the premise writes and completions that are due, `recover()` enqueueing them, and taking a written premise out, §3.8, AF2) and `run/sessionEnd.ts`;
  - `proposal/sidecarStore.ts` (attempt records at the end);
  - `workspace/files.ts` (`isSubjectSidecarFile` adds `endorsements.json`), `workspace/modelWorkspace.ts` and `workspace/types.ts` (`applyChanges` accepts the two sidecars, §2.6);
  - `workspace/modelWorkspace.ts` also reads `endorsements.json` (on load, when it changes, and after an Apply or its Undo) and passes it to `buildProjectModel`.
- Host routing: `endSession` (with `exit` outside the host's run queue, as `cancelRun`, AF14) and `moveProposed`.
- The D-21 rebase block and the `accept-base` / `rebase` writers are deleted.
- Scope: §3.8–3.10.

**2g: the review panel and the session bar.**
- Webview:
  - state: `state/session.ts` (wired into `store.ts`), `model/review.ts`, `model/sessionBar.ts`;
  - components: `run/review/*`, `run/SessionBar.tsx`, `run/RunPanel.tsx`, `run/RunBadge.tsx`, `dialogs/Dialogs.tsx`, `App.tsx`;
  - `styles/board.css`; test fixtures in `test/shared/sessions.ts`.
- The old stepper keeps working while `session` is null, until 2h.
- Scope: §5.1–5.9, §5.13.
- Drafts `test/e2e/s2-review.spec.ts` (not run).

**2h: the board in a session, Formalize, Undo, retirement.**
- Webview:
  - `model/sessionBoard.ts`;
  - `board/*`: edges, the EdgeEngine's badges, NodeCard's marks, GhostCards, gestures, menu, contextActions, useFormalize, runAction;
  - `header/ContextSection.tsx`, `Header.tsx`, `legend.ts`, `main.tsx`.
- Retirement (deleted tests listed in the report):
  - webview: the stepper, `ProposalBanner`, `GhostSuggestion`, and the old store actions;
  - core protocol: the old messages (§2.4);
  - runner: `accept`, `feedback`, `discard`, `adoptGhost`, `rejectGhost`, `proposalDiff` and `proposal()`. `upgradeLegacyProposal` stays, for 2d's conversion.
  - core: with `adoptGhost` gone, `GhostAdoptionRequest.holdAs` becomes required (fixer 2b2 r1, S-V2B2-S2: until then it defaults to `axiom` for M2's caller, and a session write that forgot it would write an AXIOM card for a premise the person holds as pending), with a test that a request without it does not compile and one that `undefined` is refused (`invalid`). 2f's premise write passes the record's `accepted.holdAs`, never a default (§3.8).
- `docs/user-guide.md`: the review list, the read-only list while Claude works, the stage reveal and Show results, the session bar, the decline options, Apply and Exit, and the two Undo stacks.
- Scope: §5.10–5.12, §5.14.
- Drafts `test/e2e/s2-board.spec.ts` (not run).

**2i: cleanup of built code (coverage audit, AP-29).** Core, webview, docs; small.
- **The card-only Delete goes (ES-9 bullet 5, S9; audit G4).** "Delete card only, keep Lean" leaves `axiom ….holds` behind as an unmarked axiom, a hidden belief. Remove it end to end: the button and its warning in `webview/src/dialogs/Dialogs.tsx`; `keepLean` in `core/src/edit/planDelete.ts`, `core/src/actions.ts` and `core/src/protocol.ts` (the validator refuses a message that still carries `keepLean: true`, with the error "Deleting a card always deletes its Lean."); `docs/user-guide.md`'s description of it. "Delete anyway" (deleting with dependents) stays. Every test that used `keepLean` is updated or deleted, and each is listed in the report.
- **An old axiom's declared premises are named (A19; audit G11).** An AXIOM block that still has `premises:` (files from before v4) keeps them undrawn (builder 1b), but the card chip's tooltip and the card's details row now name each premise's card (by sentence), not just their count, so the choice between "Make it a proposition (pending)" and "Drop these arrows" is not made blind. TL122's message names them too.
- **The guide is corrected (audit G9):** `docs/user-guide.md` says a card added from the A|P box, or with "New proposition here", stores its position with the add, in the same Undo step; opening a board still writes nothing; Tidy layout and moves write positions; kind changes and deletes drop a stored position.
- Tests: §6.1's 2i list. Scope: this entry only.

## 2. Contracts (integrator's; builders implement them as written)

### 2.1 Facts: `DeclFacts.typeConsts` (the field in 2a1; the probe in 2b3, isolated in 2b3a; its core half in 2b2)
- **What it holds** (`typeConsts?: string[]`): the constants of the declaration's elaborated type, plus, for an inductive type (a structure or class too), those of every constructor's type. Same rules as `valueConsts`:
  - only declarations of the facts are listed;
  - a model-library constant that is not probed is replaced by its own type and value constants, transitively;
  - constants from outside the library are left out.
- **Why** (D2-30): today's closures miss three cases, and S5's definition cheat could pass through any of them:
  - a definition reached only through a class or structure field type (`class Wicked (c : Character) : Prop where p : Evil c`);
  - an instance's class;
  - an axiom's type.
- **The probe:**
  - the isolated probe's `#eval` (below) prints one line, `{"telelean-value-consts":[…],"telelean-type-consts":[…]}`: in each array one entry per probed declaration, in the probed order, `null` for a name Lean's environment does not have;
  - `parseValueProbe` returns both arrays;
  - a line without the type key gives no `typeConsts`, so old recordings still parse;
  - the ghost scratch file reports them too, from its in-file probe (below).
- **The probe is isolated** (2b3a, D2-75; the slice-3 ultra review's S3-1, confirmed by its refuter). Until 2b3a the probe is an `#eval` at the end of the check file, which imports the model. Its own code (`IO.println`, `String ++`, `for` and `while`, `toString`) is therefore elaborated with the model's instances in scope, and G0 forbids no instance: a high-priority `ToString String` instance in the model can rewrite the line it prints, and a `ForIn m Lean.Loop Unit` instance can end its walk at once. B.2 and the bands, RV-5, RV-7, content keys, D2-41's step limits and the backstop all read that line. So the probe runs as its own Lean job, whose code is elaborated where only Lean's own modules are, and which reads the model as data when it runs:
  - **The file** (new runner `semantic/probeFile.ts`; generated like the check file and fed on stdin), in outline:
    ```lean
    import Lean.CoreM
    import Lean.Util.FoldConsts
    #eval show IO Unit from do
      let mods : Array Lean.Import := ((‹modules›).splitOn " ").toArray.map fun s => { module := (s.splitOn ".").foldl Lean.Name.mkStr Lean.Name.anonymous }
      let env ← Lean.importModules mods {} (loadExts := false) (level := .private)
      -- then 1d's walk over `env` (valueProbeLines: the names, the library, valueOf, inLibrary, the loop), plus the type walk
      IO.println ‹the line above›
    ```
    ‹modules› are the check file's imports (the fresh modules) and the names are its probed declarations, each list passed as one JSON-escaped string literal, as today, so no name is ever parsed as Lean syntax. `valueProbeLines` gains the type walk (a declaration's type's constants, and for an inductive every constructor type's; an unprobed library constant is replaced by its own type and value constants) and an option `modules`, which makes its `#eval` this `IO` action instead of one that reads the file's own environment. The model is never in scope where this code is elaborated, so no instance, coercion or notation of it can change what the probe walks or prints. The probe file calls `Lean.importModules mods {} (loadExts := false) (level := .private)` (4.35's defaults, written out so a toolchain bump cannot change them), so no environment extension and no `[init]` runs in it, and module-system files load whole; and G0 refuses both `initialize` and the `init` attribute, and runs before any Lean job at every purpose (below, AP30-1), so no earlier Lean job of a refresh runs Claude's IO, which could rewrite the `.lake` artefacts the probe loads or inject Lean messages (for a model whose files import only its own modules: below, AP30-7). And since the model is never imported beside `Lean.CoreM`, a model name that Lean's modules also declare can no longer make the probe's imports fail.
  - **How it runs.** refresh runs it as a second job right after the check file, inside the same refresh (one heavy job at a time): the memory guard again, then `lake env lean --stdin --json` under runLean with the check's options (its timeout, and its memory cap lowered by `spawnMemoryMax`). The board's refresh and the gate's (in the mirror) both use it. The check's results are unchanged.
  - **How it is read.** Lean's messages (`parseLeanJsonMessages`): the probe's line is the information message at the `#eval`'s line that holds the key, read by `parseValueProbe`. refresh takes each declaration's `valueConsts` and `typeConsts` from it and everything else from the check file (`toDeclFacts`), and records the job in `LeanFacts.probe`, the facts' marker (below).
  - **The check file** keeps only its `#check`, `#print`, `#print axioms` and `type_of%` probes, and imports only the model's modules: `generateCheckFile` loses its value probe and the probe's imports, and refresh its second run without the probe (1d fixer, AP-21), since nothing the check file imports can clash with the model any more. Their 1d tests change.
  - **If `importModules` cannot load the model** on the pinned toolchain (2b3a confirms it first, with real Lean), the builder stops and reports. The integrator then chooses, before anything is built on the probe: the constants read from the kernel export instead (`lake env leanexport`, which G4 already runs, with a parser in the runner), or D2-75's alternative.
  - **No Claude code runs at import** (2b2, `gate/g0.ts`; AP30-1). G0 refused the keywords `initialize` and `builtin_initialize`, but not the `init` attribute that `initialize` expands to, and `@[init] def x : IO Unit := …`, `@[init f] opaque y : T` and `attribute [init] x` need only Init. On the pinned 4.35 every frontend `lean` process that imports such a module runs it (`processHeader` imports with `loadExts := true`, `finalizePersistentExtensions` then calls `runInitAttrs`, and a non-module importer skips no IR phase): the build of every downstream model module, the check job, and the ghost and render scratch files, each in a sandbox where `<shadow>/.lake` is writable. Claude's IO there could restore a stashed `.olean` after the build, which the probe job then loads, or print JSON lines that `parseLeanJsonMessages` takes for Lean's messages (`parseCheckOutput` reads the first information message at a probe's line). So G0 refuses, as `metaprogramming`, an attribute named `init` or `builtin_init`, by canonical name (`«init»` too), wherever an attribute list names it, in `@[…]` and in `attribute […] x` alike: first in the list, or after a comma, `scoped` or `local` (so `attribute [simp, init] x` and `attribute [local init] x` as much as `@[simp, init]`). **Names as Lean reads them (AP30-1 r3).** Lean names a plain attribute by `eraseMacroScopes` of its identifier (Elab/Attributes.lean 57-58 on 4.35), which cuts a name whose last component is `_hyg` before its `«_@»` component, so `@[init.«_@».x._hyg]` attaches `init`. G0 therefore compares each attribute name after applying the same erasure to its canonical name, and, more simply and for every word G0 guards (`init`, `builtin_init`, `macro`, `implemented_by`, `csimp`, …), refuses as `metaprogramming` **any identifier in Claude's lines that has a `«_@»` component or a last component `_hyg`**: a hand-written hygienic name, which no model needs, with the message "‹name› is a hygienic name, which is not allowed in the model files: rename it." An attribute list is judged as a whole: if any line of an `@[…]` or `attribute […]` list is Claude's, an `init` or `builtin_init` anywhere in it is refused, even on a line whose text B also has. The identifier `init` stays allowed everywhere else: `foldl (init := 0)`, a binder named `init`, `simp [init]`. G0 runs first, before any Lean job, at every purpose, as `runCheck` does today (2b3b; AP30-1 r2). When it finds anything, the engine syncs no mirror and runs no build, check, probe, render or challenge: at step purposes it returns G0's findings as today (`outcome: 'problems'`, counted), with no judgement; at `stage` and `final` it judges the files without facts (`current.facts` undefined, so the judgement has the `facts` problem), with G0's findings merged into `global`, so `ok` is false; `writePremise` and `complete` fail with G0's message (§1.1's 2b3b). Merging G0's findings never builds the state G0 refused, so no state holding such text is ever built. (A session path that built, checked and probed first and merged G0's findings afterwards would run that IO before the attempt failed, and an `.olean` it rewrote, of a module whose source never changes again, would stay in the mirror for every later job to load after Claude removed the attribute.) As for every G0 rule, the person's own lines (B's) are not judged.
  - **All this holds for a model whose files import only its own modules** (Init is always there; AP30-7). A person's file that imports one of Lean's modules (`import Lean`: refresh keeps such header imports, and every module downstream of that file then reaches Lean) gives Claude's modules Lean's elaborator attributes (`command_elab`, `term_elab`, `tactic`, `delab`), usable on a plain `def` with no token G0 refuses, and the `register_*` commands (`register_option`, `register_simp_attr`), which expand to `initialize` without the token G0 refuses. The attributes run Claude's code in later Lean jobs: a `@[command_elab]` for `#check`, say, runs at every later `#check`, in downstream builds and the check job, with `.lake` writable, and can print forged JSON lines too. This is logged, not closed (D2-75): the person's model imports nothing but its own modules today, and telelean writes no other import.

```ts
// core facts.ts (2b2): LeanFacts +
/** 2b3a's isolated probe (§2.1, D2-75): present whenever the probe job ran on these facts, whatever it gave (the
 *  facts' marker). Absent in facts from before 2b3a (old recordings, a converted v1 run's base-facts.json). */
probe?: ProbeRunFacts;
export interface ProbeRunFacts {
  /** `ok`: its line was read. `cut`: Lean's output passed runLean's 32 MB cap. `failed`: an error in its `#eval` or its
   *  imports, no line, or a line `parseValueProbe` cannot read. The sandbox's statuses end the refresh with the same
   *  status, as the check's do, so facts that have declarations only ever carry the first three. */
  status: 'ok' | 'cut' | 'failed' | 'oom' | 'timeout' | 'cancelled' | 'could-not-start';
  durationMs: number;
  peakMemoryBytes?: number;
  /** For `failed`: Lean's first error, with its line, or what could not be read. */
  detail?: string;
}
/** The cause of a failed probe as a sentence (below), for `cut` and `failed`. Undefined when the probe gave its line
 *  (`ok`), for the sandbox's statuses (`oom`, `timeout`, `cancelled`, `could-not-start`: such facts carry no
 *  declarations, and their status already says why; AP30-5), or when the facts have no marker. */
export function probeFailure(facts: LeanFacts | undefined, options?: { detail?: boolean }): string | undefined;
// (fixer 2b2 r1, A-V2B2-ADV-7; additive) `detail: false`: "the probe failed." without Lean's error, which can name or
// quote hidden proof material: the stage's `facts` problem and `classesBeforeReveal`'s sentence use it (§4.7).
```
- **A failed probe never passes** (D2-25's pattern; the slice-3 ultra review's S3-2, which the isolation narrows: with no import clash left, a judged state's probe fails only on the size of its output, an error in its `#eval`, or a broken toolchain, each the same every time the same files are probed). When `probe.status` is `cut` or `failed`, no declaration of those facts gets constants, and refresh reports the cause as a check problem (status `check-errors`, or `build-errors` when the build failed too, with the cause in its detail). `probeFailure` then reads "telelean could not read what the declarations of this state use in Lean: ‹cause›.", ‹cause› "Lean's answer was over 32 MB" (`cut`) or "the probe failed: ‹detail›" (`failed`). A judged state with such facts is refused at every purpose:
  - at check, freeze and gate (step purposes), the rules run as usual. When they find nothing, or only B.2's `source-only` (which the missing constants cause), the engine returns an `environment` outcome with that sentence (2b3a, `gate/findings.ts`, beside slice 1e's `unseenProofEnvironment`, on today's `evaluateRules` path; 2b3b applies the same rule to a session step's `stepFindings`, never deciding on `ok` alone, AP30-3); otherwise their findings fail the check as usual. Either way nothing passes, and an attempt is counted only for what the rules found. Claude reads the cause and can take out what caused it;
  - at `stage`, the judgement is partial (2b2): every draft with a declaration is `factsMissing` (fixer 2a's ADV-3 path), so reconcile keeps every record as it was and makes no revert but no-longer-builds (B.2's `source-only` takes no Result out), and the Accept of each such item is refused with that sentence and "Decline what caused it, or Exit." (`ItemClass.probeFailure`, AP30-5). The stage has the `facts` problem, with that sentence and "Apply stays disabled until telelean can read it." (the final check refuses it too). A judge of other files, after a decision that changes them, reads the probe again; D2-72's recompute after a reload reads the same marker, so it gives the same partial judgement;
  - at `final`, the judgement is not ok (its `facts` problem), and the backstop's `facts` refusal names the cause (§4.10);
  - at the start, on B's own facts (`checkBase`, 2b3a; AP30-2). Every state of a session holds B's declarations, so a probe that fails on B (its size, or an error of the walk on the person's own files) would fail every step, stage and final check, and the person would learn it only after Claude had worked. So when B's facts carry a failed probe, `checkBase` still writes base-facts.json (B built), and answers an `environment` outcome with that sentence and "Claude's work on this model cannot be checked.", and the start refuses before anything is sent to Claude, with today's notice ("telelean could not run Lean on your files (…); nothing was sent to Claude"), not the one for Lean errors in the person's files.
- **A probe job that runs out of memory** (fixer 2b3a r1, S-V2B3A-S1; AP-33). refresh ends with `oom` and the marker `oom`, as the check's kill does (the contract above), but the engine does not read it as the check's kill: the probe loads Lean's own library a second time (about 390 MB more than the check, §2.1's Cost), so it is the job most likely to pass a memory cap lowered on a machine short of memory, and its kill is telelean's own overhead far more often than Claude's proof or the person's files. `classifyFacts` (`gate/findings.ts`, `probeOomEnvironment`) makes facts whose status and marker are both `oom` an `environment` outcome, "telelean's probe ran out of memory, so telelean could not read what the declarations of this state use in Lean (‹detail›)": not counted at check, freeze, both gates and the ghost check (the gate tries again once after 30 s, then the run stops, "not Claude's fault"), and at the start (`checkBase`) the environment notice ("telelean could not run Lean on your files (…); nothing was sent to Claude"), not the one for Lean errors. Nothing passes either way. The build's and the check's own kills (no marker) and the probe's timeout stay a counted budget finding, as before (the probe adds little time). For 2b3b: a session step's check, freeze and gate keep classifying the facts with `classifyFacts`, so the rule holds there too.
- **Compared approximately only where telelean cannot do better** (the S3-2 fix's rule). B's facts are the person's own content, so a probe that failed on B refuses no judged state (the start refuses such a B, above; base facts written again later, as the slice-3 plan's re-check of an older session's base, can still carry one): where base-facts.json lacks a name's constants, comparisons with B go without them, as built (2a1 compares facts only where both states have them; D2-41 compares a first step, whose S₀ is B, by printed type and value). So do comparisons with S₀'s facts when its own probe failed (a queue started from a partial stage: the queue's end judges every change again with fresh facts, and what changed shows there as "updated" items or an `unowned` problem). Facts without the marker (old recordings; a converted v1 run's base-facts.json, 2d) keep D2-25's fallbacks. F's facts are always the final check's own, so the final check and the backstop never pass a state whose probe failed. On the board, facts whose probe failed fall back to the references, and no band gets its ✓, as before (1d).
- **The ghost check keeps its in-file probe** (slice 1e's scratch check of an Add premise draft, `gate/scratch.ts`, now with the type walk too): its theorem and the suggestion's pinned statement are in no built module, so `importModules` cannot load them. Residual (D2-75's own): model text in ws/ can still forge that file's constants through its instances on Lean's types (no `[init]` code can run there, since G0 refuses it, above). They decide only the draft's gap check (B.2 on its proof) and its facts before it is written (`PremiseDraft.facts`: its statement's reach in `classes` while the results are shown, and its dependencies). Every decision that counts is judged again with the isolated probe: the written premise by `writePremise` and every judge after it, its completion's B.2 by `complete`'s gate, D2-23 and RV-5 at the next judge, and the backstop's classes and B.2 at Apply. Also, a model that declares a name that `Lean.CoreM`'s modules declare makes the ghost file's imports fail, so its suggestions are refused (fail closed, as before).
- **Missing `typeConsts` fails closed** (D2-25):
  - closures report `complete: false`;
  - RV-7 then counts every new or changed definition and instance as a belief;
  - item dependencies over-approximate with refs ∪ valueConsts;
  - Apply is refused, with "telelean could not see what the final statements rely on".
- **Cost.** 2b3a measures peak RSS and time as 1d did (the Spyro fixture, `/usr/bin/time` under `capped.sh`), for the check file, the probe job and the whole refresh, and reports them. If the refresh costs more than 1.5 times 1d's, the integrator decides before going on. It also reports the size of the probe's message per probed declaration, and from it the model size (declarations) at which the message would reach runLean's 32 MB cap: past it every state's probe is `cut`, so such a model cannot be checked at all, and the start refuses it (above). The limit is logged in D2-75 (AP30-2). *(Measured by builder 2b3a, §8: `importModules` loads the model on 4.35; the refresh's peak RSS rises from 567 to 954 MB and its time from 0.97 to 1.48 s, above 1.5 times 1d's; the integrator accepted it (AP-33; D2-75 has the figures). The message is about 52 to 66 bytes per declaration, so the cap is reached near 500,000 such declarations, but near 13,000 declarations that list about 100 constants each (about 25 bytes per listed constant; fixer 2b3a r1, S-V2B3A-S5).)*
- **Recordings.** The integrator regenerates `test-fixtures/semantic/recorded/*` with `UPDATE_SEMANTIC_RECORDINGS=1` when RAM allows, at the end of 2b3a and with the isolated probe: the check files without the probe; the probe file and its output as new recordings `probe-spyro.lean` and `probe-spyro.jsonl`; the facts with `typeConsts` and the marker; a README row for each. Core's three hand-written Spyro facts (`core/test/fixtures/project/spyro-*facts.json`) get the same from the probe's output. 2b3b starts after it. This regeneration has also been pending since 1d.

### 2.2 The review model (core `review/types.ts`, 2a1)

```ts
/** RV-1. Slice 2 produces formalize, add-premise, add-arrow, vocabulary-term, declaration and result. */
export type ItemKind =
  | 'add' | 'add-premise' | 'add-arrow' | 'remove-arrow' | 'formalize' | 'change' | 'delete'
  | 'vocabulary-term' | 'declaration' | 'result' | 'proof-broken';
/** For `declaration` items. Structures, inductives, classes, abbrevs and opaques count as `definition`. */
export type DeclKind = 'definition' | 'instance' | 'coercion' | 'presupposition' | 'vocabulary-change';
export type ItemStatus = 'in-review' | 'accepted' | 'declined' | 'to-be-redone' | 'withdrawn';
/** `plain`: arrow items only (DO-0). `transform` is refused until slice 4. */
export type DeclineOption = 'plain' | 'reject' | 'shaky' | 'transform';
export type ItemMarker =
  | 'updated' | 'no-alternative-found' | 'seen-early' | 'meaning-differs-in-place' | 'completion-not-checked'
  | 'unused-premise' | 'adds-no-new-basis' | 'sentence-lean-may-disagree' | 'no-longer-builds'
  /** A premise draft that no longer closes the gap when checked again (§3.8). */
  | 'no-longer-closes-gap';
/** Shown only while the results are shown (§4.7). */
export type ResultFlag = 'proved-from-nothing' | 'replaces-your-proof' | 'proves-changed-statement';

export interface ClassReason { code: 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'c1' | 'c2' | 'c3' | 'c4'; name?: string; arrow?: ArrowEnds; cards?: string[] }
export interface ItemClass {
  belief: boolean;
  changesProved: boolean;
  reasons: ClassReason[];
  /** False when a closure met a declaration without valueConsts or typeConsts; `belief` is then true (D2-25). */
  complete: boolean;
  /** c4 only: the arrow "adds no new basis" (§4.4). classify sets it; the view reads it from the class in force (AF8). */
  addsNoNewBasis?: boolean;
  /** (fixer 2a, ADV-3) Its draft lacks its declarations' facts (`ItemDraft.factsMissing`): its Accept waits, and no badge
   *  comparison (RV-7, D2-23) reads the map while any class has it. */
  factsMissing?: true;
  /** (2b2, AP30-5; additive) With `factsMissing`, when the judged state's probe failed: `probeFailure`'s sentence (§2.1).
   *  The reducer's Accept refusal then reads it plus "Decline what caused it, or Exit." (`REVIEW_TEXTS.acceptProbeFailed`)
   *  instead of ADV-3's text, since no check is coming that would lift it. */
  probeFailure?: string;
}

/** Enough to render an earlier version and to re-apply a rejected one. */
export interface ItemContent {
  decls: Array<{ name: string; text: string; kind?: string }>;
  fields?: Record<string, string>;
  arrow?: ArrowEnds;
  premise?: PremiseDraft;
}

export interface ItemRecord {
  /** `it` and the first 16 hex digits of the sha256 of the run id and the key (the hash of §4.3), made by reconcile. One
   *  record per key, so it is never reused in the session, and it never depends on how many other items, hidden ones
   *  included, exist (AF7). Matches RUN_TOKEN_PATTERN (D2-31). */
  id: string;
  /** The item's identity across stages (table below). */
  key: string;
  kind: ItemKind;
  declKind?: DeclKind;
  /** 1 for the first version, +1 whenever its content key changes (a newer proposal, RV-1). */
  rev: number;
  /** The step that first proposed it, its inference, and whether before or after that step fixed its statements.
   *  Set when the record is made, never re-derived (§4.2). */
  origin: { step: string; target: string; phase: 'statements' | 'proof' };
  /** The target whose Result it is part of (`ItemDraft.partOfResult`), set when the record is made. Such an item is
   *  hidden while the results are (§4.7). */
  partOf?: string;
  status: ItemStatus;
  decline?: { option: DeclineOption; note?: string; at: string; commit?: string };
  /** `result`: a Result's verdict and Rests on when it was accepted; the backstop compares them on F (§4.10).
   *  `holdAs` and `rationale`: add-premise only, the hold-as choice and the one-line Why of its Accept. The premise
   *  write and its replay after a crash (`inFlight`, §2.6) read them here, never a default (§3.8); a Redo sends them
   *  again from its recorded request (AF13). */
  accepted?: { how: 'own' | 'group'; fingerprint: string; belief: boolean; changesProved: boolean; at: string;
    result?: { verdict: 'established' | 'proved' | 'not-proved'; restsOn: string[] };
    holdAs?: 'axiom' | 'pending'; rationale?: string };
  redo?: { because: string[]; reverted: boolean };
  markers: ItemMarker[];
  /** Content key of the current version (§4.3). */
  fingerprint: string;
  content: ItemContent;
  /** Earlier versions, newest last: RV-1's "previous proposal", DO-1's superseded rejected versions. */
  versions: Array<{ rev: number; stage: number; fingerprint: string; content: ItemContent; rejected?: boolean }>;
  /** DO-1: content keys of the versions rejected in this session; a step may not propose them again (§4.9). */
  rejectedFingerprints: string[];
  /** add-premise: the card id once telelean wrote it. */
  card?: string;
  /** (fixer 2a, V2A-S1) `result` only: its inference's verdict, Rests on and RV-5 dependencies (item keys), each sorted, in
   *  the last judgement reconcile applied while its content was in ws/. RV-11 compares the next judgement with it,
   *  whatever the status (§3.5); an Accept copies verdict and Rests on into `accepted.result`, and is refused without it. */
  judged?: { verdict: 'established' | 'proved' | 'not-proved'; restsOn: string[]; deps: string[] };
}

/** What telelean itself wrote or recorded. Persisted outside ws/; G5, B.3, ownership and the backstop read it. In
 *  `premise`, `mark-removed` and `completion`, `item` is the Add premise item's key (`premise:<T>:<leanName>`), so
 *  computeItems keys the written premise by its draft's key (§3.5); taking the premise out drops all three (§3.8). */
export type LedgerEntry =
  /** propose_arrow (D2-1); written into the target's `premises:` at the step's next normalise. */
  | { kind: 'arrow'; source: string; target: string; step: string; why: string; written?: string }
  | { kind: 'premise'; card: string; target: string; holdAs: 'axiom' | 'pending'; item: string; commit: string }
  | { kind: 'mark-removed'; card: string; item: string; commit: string }
  | { kind: 'completion'; target: string; item: string; commit: string }
  /** The step that first created a declaration, and in which phase (D2-43). It fixes the declaration's owner for the
   *  whole session (§4.2). */
  | { kind: 'created'; name: string; step: string; phase: 'statements' | 'proof';
      /** (fixer 2a1, V2A1-C3) A proof-phase definition: the key of the step's premise draft that reached it (D2-42). */
      draft?: string };

export interface SessionInference {
  target: string;
  /** Q(T): the selected arrows' sources (your arrows, or Claude's accepted ones); [] with fromNothing for the mark.
   *  A re-ask replaces it only when its step proves T (§3.2); DO-0 on a selected Claude arrow removes that source (D2-59). */
  question: { sources: string[]; fromNothing: boolean };
  /** Sources first (formalizeOrder), ties by reading order. */
  order: number;
  steps: string[];
}

/** A missing premise Claude proposed (propose_assumption): outside ws/ until accepted (RV-1). */
export interface PremiseDraft {
  target: string;
  step: string;
  naturalName: string;
  leanName: string;
  leanStatement: string;
  explicit: string;
  whyNeeded: string;
  proof: string;
  footprint: string[];
  /** "may simply restate the target" */
  aloneEntails: boolean;
  /** The scratch facts of its statement's declarations, by Lean name; replaced at each re-check (§3.8). R_stmt, the
   *  item's `mentions` and its statement view read them, so classes and dependencies survive a reload (F12). */
  facts: Record<string, DeclFacts>;
}

/** The part of an item's record that one action may change (F4). */
export type ItemState = Pick<ItemRecord, 'status' | 'decline' | 'accepted' | 'redo' | 'markers' | 'rejectedFingerprints'> & {
  /** The revs of `versions` marked rejected. */
  rejectedRevs: number[] };
/** Show results' force (§4.7): the results stay shown until a statement or belief item next becomes undecided (AF4), a
 *  Result that RV-11 returns to review, or the end of any queue of Claude steps (§4.7).
 *  `decided` (fixer 2a, ADV-1): telelean's own force, set when the results were shown because every meaning item was
 *  decided and D2-23's returns at that show would hide them again; it marks no Result seen early (§4.6, §4.7). */
export interface SessionForce { via: 'show-result' | 'raw-diff' | 'activity' | 'decided'; at: string }
/** One step of the session stack (UN-4). It records every effect of its action, so Undo restores `before` exactly (F4),
 *  once the reducer has checked the restored statuses against the current state; Redo sends `request` again through the
 *  reducer, never a recorded state (AF13). With `accepted` come an Add premise's `holdAs` and `rationale`. `id` comes
 *  from the session's counter (`PersistedSession.nextAction`) and is never reused, so a request naming an action (Undo,
 *  Redo) can never hit a newer action that happens to sit at the same depth. */
export type SessionAction = { id: number } & (
  | { kind: 'decide'; label: string;
      /** The decisions as the user sent them, for Redo (AF13). */
      request: { decisions: ItemDecision[]; own: boolean };
      /** `rev` (builder 2a2): the item's rev when the action was made; Undo gives `conflict` when a listed one changed. */
      changes: Array<{ item: string; rev: number; before: ItemState; after: ItemState }>;
      /** The written Add premises its write took out (§3.8): their card, written key and ledger entries, which Undo puts
       *  back with the files. The write fills it in its step 4, when it adds its commit (AF2): only those written when
       *  the write started, so one whose card only the write's own un-reject merge brought back is taken out but not
       *  recorded (fixer 2b1a r1; ItemWrite, §2.9). */
      takenOut: Array<{ item: string; card: string; fingerprint: string; ledger: LedgerEntry[] }>;
      /** DO-0 adds its arrow; un-reject of an arrow item removes it. */
      rejectedArrows: { added: ArrowEnds[]; removed: ArrowEnds[] };
      /** DO-0 on an arrow that a question selected takes its source out of that question (D2-59). */
      questions: Array<{ target: string; before: SessionInference['question']; after: SessionInference['question'] }>;
      /** The force this action ended, if any (§4.7): Undo puts it back. */
      endedForce?: SessionForce;
      /** (fixer 2a, ADV-1) The `decided` force this action set: Undo removes it. */
      startedForce?: SessionForce;
      commits: string[]; at: string }
  /** Show results. Undo removes the force; the seen-early markers stay (UN-4). */
  | { kind: 'reveal'; label: string; force: SessionForce;
      /** (fixer 2a, V2A-S4) The items D2-23 returned at this show: Undo restores them, through the same checks. */
      changes: Array<{ item: string; rev: number; before: ItemState; after: ItemState }>;
      /** (builder 2b1a, carry-over R1-2) As decide's: a written Add premise resting on a returned item returns to review
       *  with it, so the show's write takes it out (§3.8); its step 4 fills both, and Undo inverts and puts back. */
      takenOut: Array<{ item: string; card: string; fingerprint: string; ledger: LedgerEntry[] }>;
      commits: string[] }
  | { kind: 'move'; label: string; before: Record<string, CanvasPosition | null>; after: Record<string, CanvasPosition>; at: string }
  | { kind: 'seal'; by: SealBy; at: string });
/** UN-5's sealing actions. Every queue of Claude steps after the session's first starts with exactly one, written by
 *  its `queue-start` write (D2-63); the session's first queue, which the starting Formalize queues, has none (fixer 2b3a
 *  r1, C-V2B3A-C1: `buildSessionView`'s D2-59 removals count a decision made after k seals against queues 1 to k + 1).
 *  Answering Claude's question needs no seal of its own: nothing is decided while the queue runs (D2-62), so the
 *  queue's seal already covers it. */
export type SealBy = 'submit' | 'formalize' | 'retry';

/** webview → host, in `decideItems`. The message's `own` flag, never the count, makes an Accept the item's own (RV-7, D2-32). */
export interface ItemDecision {
  item: string;
  /** The version the user saw: a stale rev is refused (`conflict`). */
  rev: number;
  to: 'accepted' | 'declined' | 'in-review';
  /** Required with `declined`, and only there. */
  option?: DeclineOption;
  /** Only with `shaky`: the person's note for Claude (D2-13). */
  note?: string;
  /** Only with `accepted`, on an add-premise item. One already written (an adopted ghost of a converted v1 run, §3.11)
   *  takes only `axiom` (AF12). */
  holdAs?: 'axiom' | 'pending';
  /** Only with `holdAs`: the new card's Why, one line. */
  rationale?: string;
}
```

**Item keys** (identity; persisted; never shown):

| Key | Item | Kinds |
|---|---|---|
| `card:<node>` | a card's fields | formalize, change, delete; add, for a card Claude creates (slice 3) |
| `proof:<node>` | a card's proof | result, proof-broken |
| `premise:<target>:<leanName>` | a missing premise with its arrow | add-premise |
| `arrow:<source>><target>` / `unarrow:<source>><target>` | Claude's arrow | add-arrow / remove-arrow |
| `vocab:<lean name>` | one new plain vocabulary term | vocabulary-term |
| `decl:<lean name>` | a definition, instance or coercion; a presupposition with its helper instance; a change to existing vocabulary | declaration |

Every vocabulary term is its own item, shown in one "Vocabulary (N)" group with "k of N accepted" (D2-31).

### 2.3 Views (host → webview; built only by `buildSessionView`, 2c2)

```ts
export type Gate = { ok: true } | { ok: false; reason: string; missing?: string[] };
export interface CardRef { id: string; type: NodeType; sentence: string; wordedBy: 'user' | 'agent' }
export interface LeanStatementView { name: string; pretty: string; explicit: string; closure: StatementReview['closure'] }

export interface SessionView {
  runId: string;
  subject: string;
  /** The review stage, from 1; 0 until the session's first queue ends. */
  stage: number;
  phase: 'step' | 'interrupted' | 'stage' | 'confirming' | 'applying';
  /** The stage reveal (RV-6, §4.7): shown when no statement or belief item is undecided, or when Show results forced
   *  them. `waitingFor`: the undecided statement and belief items: in review, or to be redone with their content still
   *  in ws/ (AF4). */
  results: { shown: boolean; forced: boolean; waitingFor: string[] };
  inferences: InferenceView[];
  steps: StepView[];
  /** ES-4. */
  heading: { kind: 'did-not-pass' | 'cancelled' | 'failed'; text: string; firstStep: boolean; retry: Gate } | null;
  /** In list order (§5.5). While the results are hidden, each Result is a neutral row and Results' parts are left out
   *  (§4.7). While a queue runs: the stage as it was when the queue started, with every action gate closed (D2-62, D2-63). */
  items: ItemView[];
  /** Listed items only; a Result is not counted while the results are hidden. */
  counts: { inReview: number; accepted: number; declined: number; toBeRedone: number };
  report: StageReportView;
  rejected: RejectedView[];
  board: SessionBoardView;
  /** `step`: the id of the stack action (SessionAction.id) that Undo or Redo would act on; null while a step runs. */
  undo: { step: number; label: string } | null;
  redo: { step: number; label: string } | null;
  sealed: { by: SealBy; at: string } | null;
  drift: { files: string[]; at: string } | null;
  /** A judge runs or is due, or the session's write queue holds a write (a decision's, a take-out, a premise write, a
   *  completion): Submit, Apply, a mid-stage Formalize and Retry wait (§3.6, AF3). */
  judging: boolean;
  /** Open only while the results are shown (§3.7), so `work` reads real statuses (`planSubmit`). */
  submit: { gate: Gate; next?: 'confirm' | 'claude-steps'; work?: { shaky: number; redo: number; steps: number } };
  /** Mid-stage Formalize (RV-9): closed while a step runs, while judging, and while the results are hidden (D2-65). */
  formalize: Gate;
  confirmation?: EndConfirmationView;
  /** telelean's own changes since the user's last action, newest last, at most 50; never about a hidden item. No event
   *  is made for a change that touches only hidden items, and the runner numbers each new event after the last one, so
   *  the ids count visible events only (AF7). */
  events: Array<{ id: number; at: string; text: string; items: string[] }>;
  /** (fixer 2c2 r1, S-STAGE-PROBLEMS-NO-PATH; additive) The stage's problems, which the final check refuses too (§2.1,
   *  §3.5, §3.8, §4.2): the stage judgement's `facts` and `unowned` problems; an item that disappeared with no decision
   *  removing it (§3.5's rule, read from the records and the judgement's drafts, not while judging); the runner's own
   *  (`SessionViewInput.problems`: a premise write that failed). `items`: the listed items each names. Never about a
   *  hidden item: while the results are hidden, a judgement's problem that names only hidden items, or a runner's that
   *  names one, is left out. `no-longer-builds` problems are not repeated (reconcile's event and the "no longer builds"
   *  marker name those items; their text holds Lean's message and positions, which hidden lines move). */
  problems: Array<{ text: string; items: string[] }>;
}

export interface InferenceView {
  target: CardRef;
  /** While the results are hidden: the question the target's latest ended step asked, whether or not that step proved
   *  it (§3.2); while a step runs, the same for a target whose step ended in the running queue, since a proved re-ask
   *  puts its question on the record when it ends (fixer 2c2 r1, A-V2C2-ADV-1). Either is shown less the sources the
   *  user's declines took out of it once that step's queue had started (D2-59, A-V2C2-ADV-6; builder 2b3a, R1-1).
   *  Otherwise the question on record. */
  question: CardRef[];
  fromNothing: boolean;
  order: number;
  /** The Result item, once a step for the target ended (D2-44). */
  result?: string;
}

export interface StepView {
  id: string;
  index: number;
  of: number;
  kind: 'formalize' | 'submit';
  target: string;
  /** While the results are hidden, an ended step reads `ended`, whatever happened (passed, gave up, statements only).
   *  `not-run`: a Cancel step or a failure earlier in its queue dropped it; Retry step runs it (§3.4). */
  state: 'queued' | 'running' | 'ended' | 'cancelled' | 'failed' | 'interrupted' | 'not-run';
  /** Only while the results are shown: what happened, in telelean's words. */
  outcome?: string;
  /** Claude's activity, gate attempts and notices of this step: withheld while a step runs and while the results are
   *  hidden (D2-10). */
  activity: 'shown' | 'withheld';
}

export interface ItemView {
  id: string;
  rev: number;
  kind: ItemKind;
  declKind?: DeclKind;
  /** The kind's short label ("Formalize", "Add arrow", "Vocabulary term", "Definition", "Result" …). */
  label: string;
  group: { kind: 'card'; card: CardRef } | { kind: 'vocabulary' } | { kind: 'definitions' };
  cards: CardRef[];
  /** null on a Result while the results are hidden: the row reads "result after the review" (§4.7). */
  status: ItemStatus | null;
  /** The current decline, when declined. (`decline` below is the action's gate.) */
  declined?: { option: DeclineOption; note?: string };
  redo?: { because: string[] };
  /** null on a hidden Result: its class would tell whether a proof was found (D2-61). */
  classes: { belief: boolean; changesProved: boolean; reasons: string[] } | null;
  markers: ItemMarker[];
  /** RV-5, listed items only; [] on a hidden Result. A hidden dependency is not named (§4.5). */
  dependsOn: string[];
  /** Accepted listed items that depend on it; [] on a hidden Result. */
  dependents: string[];
  accept: Gate;
  decline: Gate & { options: Array<{ option: DeclineOption; disabled?: string }> };
  /** Back to "in review", un-reject included. */
  review: Gate;
  detail: ItemDetailView;
  previous?: ItemDetailView;
  origin: { step: string; target: string };
}

export type ItemDetailView =
  | { kind: 'formalize'; card: CardRef; statement: LeanStatementView }
  | { kind: 'change'; card: CardRef; fields: FieldChangeView[]; mentionedBy: CardRef[] }
  | { kind: 'add'; card: CardRef; statement?: LeanStatementView; fields: Array<{ field: string; value: string; by: 'user' | 'agent' }> }
  /** `heldAs`: from the Accept (`accepted.holdAs`), shown from the Accept on. `writtenInReview`: an adopted ghost of a
   *  converted v1 run, already written as an AXIOM card, so hold-as offers only "as an axiom" (§3.11, AF12). */
  | { kind: 'add-premise'; sentence: string; leanName: string; target: CardRef; statement: LeanStatementView; whyNeeded: string;
      mayRestate: boolean; replacesFromNothing: boolean; heldAs?: 'axiom' | 'pending'; writtenInReview?: true }
  | { kind: 'add-arrow' | 'remove-arrow'; source: CardRef; target: CardRef; why?: string; addsNoNewBasis: boolean }
  | { kind: 'delete'; card: CardRef; arrows: ArrowEnds[]; mentionedBy: CardRef[] }
  | { kind: 'vocabulary-term'; name: string; vocabKind: VocabKind; type?: string; gloss?: string; glossBy?: 'user' | 'agent'; code: string }
  | { kind: 'declaration'; declKind: DeclKind; name: string; code: string; before?: string; gloss?: string; glossBy?: 'user' | 'agent';
      usedByStatementsOf: CardRef[] }
  /** Hidden: `question` as in its InferenceView. Shown: `gap` and `summary` too (D2-10). */
  | { kind: 'result'; target: CardRef; question: CardRef[]; fromNothing: boolean; revealed: false; seenEarly: boolean }
  | { kind: 'result'; target: CardRef; question: CardRef[]; fromNothing: boolean; revealed: true; seenEarly: boolean;
      verdict: 'established' | 'proved' | 'not-proved'; reasonChip?: string; flags: ResultFlag[];
      proof?: { name: string; code: string }; previousProof?: string;
      band: { used: string[]; notNeeded: string[]; complete: boolean; open: string[] };
      restsOn: string[]; throughResults: string[]; basisChanged: CardRef[];
      gap?: string; missingArrows: Array<{ source: string; drawn: boolean }>; arrowItems: string[]; premiseItems: string[];
      completion?: 'checked' | 'not-checked'; summary?: string }
  | { kind: 'proof-broken'; card: CardRef; error: string };
export interface FieldChangeView {
  field: 'sentence' | 'statement' | 'why' | 'stance' | 'source' | 'dependencies';
  before?: string; after?: string; beforeStatement?: LeanStatementView; afterStatement?: LeanStatementView;
}

export interface SessionBoardView {
  /** The stage judgement's working copy. While the results are hidden, under the base mask (§4.7): every proof-derived
   *  datum as in B, statements and vocabulary from the working copy. */
  graph: TlGraph;
  /** Targets with the neutral chip: every target while the results are hidden, else []. */
  hiddenTargets: string[];
  /** Listed items per card, for the card's mark. While the results are hidden, Results are left out: the target's
   *  neutral chip stands for them, so no status is ever needed for a hidden one (AF9). */
  marks: Record<string, Array<{ item: string; kind: ItemKind; status: ItemStatus }>>;
  /** Arrow items, only while the results are shown. `used`: the proof uses it. */
  arrows: Array<{ item: string; change: 'add' | 'remove'; source: string; target: string; status: ItemStatus; used: boolean }>;
  /** Add premise items that are not written yet, only while the results are shown. */
  premises: Array<{ item: string; target: string; sentence: string; status: ItemStatus }>;
  removedNodes: TlNode[];
  /** Moves on the Proposed view (UN-4, D2-33). */
  positions?: Record<string, CanvasPosition>;
}

export interface StageReportView {
  stage: number;
  /** `verdict`, `band`, `restsOn` and the rest only while the results are shown. */
  targets: Array<{ target: string; revealed: boolean; verdict?: 'established' | 'proved' | 'not-proved'; reasonChip?: string;
    band?: { used: string[]; complete: boolean; open: string[] }; restsOn?: string[]; throughResults?: string[];
    notNeeded?: string[]; missing?: Array<{ text: string; select?: ArrowEnds }> }>;
  /** Claude's words: only while the results are shown (D2-10). */
  steps: Array<{ step: string; target: string; revealed: boolean; summary?: string;
    assumedWithoutAsking?: Array<{ text: string; items: string[] }>; proposedNothing?: string }>;
  /** telelean's lines about questions, only while the results are shown: a re-ask that was not proved (§3.2), and a
   *  source that left a question (D2-59). */
  notes: string[];
  consistency: 'unchecked';
  /** Results and their parts are left out while the results are hidden (F10). */
  withdrawn: Array<{ label: string; at: string }>;
}

export type FinalCheckRule =
  | 'drift' | 'facts' | 'build' | 'rules' | 'permitted' | 'no-hidden-edges' | 'arrows' | 'kinds' | 'comparator' | 'items' | 'backstop';
export interface EndConfirmationView {
  changes: Array<{ item: string; label: string }>;
  rejected: Array<{ item: string; label: string }>;
  notRun: string[];   // inferences whose step never ended (D2-44)
  endorsed: Array<{ name: string; declKind: DeclKind }>;
  check: { id: string; state: 'running' | 'passed' | 'failed'; reusedFileChecks: boolean;
    failures: Array<{ rule: FinalCheckRule; text: string; items?: string[]; declaration?: string }> };
  /** Nothing accepted: Apply only records the outcome (D2-39). */
  empty: boolean;
  apply: Gate;
}
/** "Rejected in this session". Results and their parts are left out while the results are hidden (F10). */
export interface RejectedView { item: string; label: string; rev: number; at: string; unreject: Gate; superseded: boolean }
```

**RunView of a session** (core `run.ts`, additive):
- `session?: { stage: number; phase: SessionView['phase'] }`, present for a session;
- `inferences?: Array<{ target: string; premises: string[] }>`; `target` and `premises` are the first inference's, for old readers. All three follow the InferenceView's question rule: while the results are hidden, a target's premises are the sources of the question its latest ended step asked, so a re-ask's outcome never shows here (AF5); and while a step runs, so do those of a target whose step ended in the running queue (fixer 2c2 r1, A-V2C2-ADV-1: a proved re-ask's question reaches the record mid-queue), each less D2-59's removals;
- `step?: { index: number; of: number; target: string; kind: StepView['kind']; statementsFixed: boolean }`;
- in a session (§3.12) the runner:
  - never sets `verdict` to a proof outcome (only `cancelled`, `failed` and `cap-reached`, which describe a step);
  - sets `activity` and `notices` to empty arrays (M2's validator requires both), and leaves out gate attempts, while a step runs and while the results are hidden (AF9);
  - leaves out `frozen`: its `PermittedSummary` lists what each source contributes (whether it is in `unusable`, and its session-proof footprint), which tells earlier outcomes. M2's type stays as it is, and `step.statementsFixed` gives the panel what it needs (D2-68);
  - keeps `ghosts` empty and `proposalId` absent.

**ActionOutcome** (core `actions.ts`, additive):
- ok: `review?: { taken: string[]; left: Array<{ item: string; reason: string }>; cascade: CascadeEntry[] }`;
- `needs-confirmation`: `cascade?: CascadeEntry[]`, `hiddenResults?: true` (§3.6, D2-64), and `reveal?: true` (the raw diff would show the results, §2.4);
- `CascadeEntry = { item: string; to: ItemStatus; why: string }`. While the results are hidden, a Result or a Result's part is never an entry;
- `conflict` for a stale `rev`, `stage`, Undo `step` or check id, with "“‹item›” changed since you looked at it: look again." (or the check's own text);
- `refused` while a step runs, with "Claude's step is running: you can review when it ends." (D2-62). `refused` is a new `ActionErrorCode` (2a1, AF9).

### 2.4 Protocol (core `protocol.ts`; types and validators in 2c1, routing in 2d–2f)

**Host → webview:** `session { session: SessionView | null }`. It is posted on `ready`, and whenever the session itself changes: items, statuses, phase, step states, the reveal, the stack, drift, the heading, judging, the confirmation. A step's progress ticks reach the webview only through `run` (§3.12).
- It gets a light check, like `proposal`: `runId`, `stage` and `phase` present; `items`, `inferences`, `steps`, `board.graph.nodes` and `board.graph.edges` are arrays.

**Webview → host.** Every message:
- takes `requestId` and is answered by `actionResult`;
- is in `RUN_MESSAGE_TYPES`, so the ES-9 lock never refuses it;
- has a hand-written validator that returns a fresh object without unknown fields.
`stage` is an integer from 0 to `LIMITS.stages`, and the host refuses one that is not the current stage.

| Message | Payload | Validator rules |
|---|---|---|
| `formalize` | `{ inferences: Array<{ target, premises }>, runId?, stage? }` | 1–50 inferences; distinct targets; a target never among its own premises; all premises together ≤ `listLength`; `runId` and `stage` together (mid-stage) or neither (a start) |
| `decideItems` | `{ runId, stage, own, decisions: ItemDecision[], confirmed? }` | 1–500 decisions; no item twice; `own` a boolean, true only with exactly one decision (D2-32); `option` required with `declined`, and only there; `note` only with `shaky` (≤ `textLength`, may span lines, dropped when blank); `holdAs` only with `accepted`; `rationale` only with `holdAs` (one line, ≤ `textLength`); `rev` 0–1 000 000 |
| `revealResult` | `{ runId, stage, via: 'show-result' \| 'activity' }` | `via` one of the two; it shows every Result of the stage (D2-61) |
| `sessionUndo` / `sessionRedo` | `{ runId, step, confirmed? }` | `step`: the SessionAction id the user saw (`SessionView.undo.step`), 0–1 000 000 |
| `submitReview` | `{ runId, stage }` | |
| `endSession` | `{ runId, decision: 'apply' \| 'exit' \| 'back', stage?, check? }` | `apply` needs `stage` and `check`; `back` needs `stage`; `exit` neither |
| `retryStep` | `{ runId }` | |
| `openSessionDiff` | `{ runId, stage, confirmed?, file? }` | as `openProposalDiff`, plus `confirmed`, a boolean. While the results are hidden the host opens the diff only with `confirmed` (the raw diff shows every proof, so it counts as Show results); otherwise it answers `needs-confirmation` with `reveal: true` |
| `moveProposed` | `{ runId, positions }` | as `moveCards` |

- **While a step runs** (phases `step` and `interrupted`), the runner refuses every message of this table except `endSession` with `exit`, with "Claude's step is running: you can review when it ends." (D2-62). `answerQuestions`, `cancelRun`, `resumeRun` and `dismissRun` are not refused.
- **Kept:** `answerQuestions`, `cancelRun` (now Cancel step), `resumeRun`, `dismissRun`.
- **`startRun`** stays, as a one-inference `formalize`, until 2h.
- **Retired in 2h:** `startRun`, `acceptProposal`, `feedback`, `discardProposal`, `adoptGhost`, `rejectGhost`, `openProposalDiff`, and the host → webview `proposal`.
- **New LIMITS:** `inferences: 50`, `decisions: 500`, `stages: 10_000`, `revision: 1_000_000`.

### 2.5 RunManager (runner `run/types.ts`; each method added by the sub-slice that implements it)

```ts
session(): SessionView | null;
formalize(r: { subject: string; inferences: ReadonlyArray<{ target: string; premises: readonly string[] }>;
  runId?: string; stage?: number }): Promise<ActionOutcome>;
decide(runId: string, stage: number, own: boolean, decisions: readonly ItemDecision[], confirmed: boolean): Promise<ActionOutcome>;
reveal(runId: string, stage: number, via: 'show-result' | 'activity'): Promise<ActionOutcome>;
undoSession(runId: string, step: number, confirmed: boolean): Promise<ActionOutcome>;
redoSession(runId: string, step: number, confirmed: boolean): Promise<ActionOutcome>;
submit(runId: string, stage: number): Promise<ActionOutcome>;
end(runId: string, decision: 'apply' | 'exit' | 'back', stage?: number, check?: string): Promise<ActionOutcome>;
retry(runId: string): Promise<ActionOutcome>;
sessionDiff(runId: string, stage: number, confirmed: boolean): Promise<{ ok: true; kind: 'diff'; files: FileChange[] } | ActionOutcome>;
moveProposed(runId: string, positions: Readonly<Record<string, CanvasPosition>>): Promise<ActionOutcome>;
```
- `RunChange` gains `session: boolean`.
- `undoSession` and `redoSession` take the SessionAction id the user saw. `sessionDiff` answers `needs-confirmation` while the results are hidden, unless `confirmed`; with it, the diff counts as Show results (§2.4).
- `start(request)` becomes a one-inference `formalize`; the runner's tests and scripts keep using it.
- In a session, `cancel(runId)` is Cancel step. On a running or interrupted step it ends that step as cancelled (back to S₀), marks the rest of the queue `not-run`, puts them in `retry`, and opens the stage (§3.4, D2-55). It never ends the session.
- While a step runs, `decide`, `reveal`, `undoSession`, `redoSession`, `submit`, `retry`, `sessionDiff`, `moveProposed`, a mid-stage `formalize`, and `end` other than `exit` answer `refused` with D2-62's text.
- `answer`, `resume`, `dismiss`, `recover` and `dispose` keep their meaning. `answer` adds no seal: the seal at the queue's start already covers it (UN-5, D2-62).
- **When each call resolves** (D2-74). The host runs every run message except `cancelRun` through one queue (`enqueueRun`) and waits for each call, so no call may wait for Claude, a judge or a Lean job it starts:
  - `formalize`, `submit` and `retry` resolve once their queue's first step is working, as `start` does; a `submit` that leads to the end confirmation, once the phase is `confirming` (its final check runs after);
  - `decide`, `reveal`, `undoSession`, `redoSession` and `moveProposed` resolve after their write's step 4 (§2.6), never after the judge, the premise write or the completion they start;
  - `end` with `exit` is not queued by the host, as `cancelRun` is not, so it can stop a running step at once; `end` with `back` resolves after its run.json write, and with `apply` when Apply ends.

  So an answer to a question that Claude asks during a queue never waits behind the call that started the queue.

### 2.6 Persistence
- **run.json version 2:** `PersistedRun.version: 1 | 2` and `session?: PersistedSession`. `isPersistedRun` (`run/persist.ts`) accepts only version 1 today; from 2d it accepts versions 1 and 2, so a version-2 run is never dropped on recovery. Version 1 is still read; a v1 run in review is converted when it is recovered (§3.11).

```ts
interface PersistedSession {
  format: 'telelean-session'; version: 1;
  stage: number;
  phase: SessionView['phase'];
  inferences: SessionInference[];
  steps: PersistedStep[];
  /** Step ids still to run in the current queue. */
  queue: string[];
  /** After a Cancel step or a failure: the cancelled or failed step and the steps of its queue that it dropped
   *  (`not-run`), in either mode, a statements-only step's included (F3). Retry step moves them back to `queue`, and
   *  each decides its mode again at its new S₀; Submit review and a mid-stage Formalize drop them (D2-44). */
  retry: string[];
  /** Item ids come from the run id and the key (§2.2), so no item counter is kept (AF7). */
  items: ItemRecord[];
  /** The next SessionAction id (never reused in the session). */
  nextAction: number;
  /** Add premise drafts, outside ws/ until accepted. */
  premises: PremiseDraft[];
  ledger: LedgerEntry[];
  /** DO-0. */
  rejectedArrows: ArrowEnds[];
  stack: { done: SessionAction[]; undone: SessionAction[] };
  /** Show results' force, until a statement or belief item next becomes undecided, a Result that RV-11 returns to review,
   *  or the end of any queue of Claude steps (§4.7). */
  forced?: SessionForce;
  /** The shadow commit ws/ is at outside a running step: set by each write's step 4 (below) and by each step's end. */
  head: string;
  /** A write to ws/ in progress (the write order below); `recover()` finishes it. `SessionWrite`: §2.9. */
  inFlight?: { action: SessionWrite; parent: string };
  /** The stage judgement that the records and the view describe. A `judge-apply`, a premise write or a completion
   *  replaces it (AF9), so it stays as it was while a queue runs (D2-63). The StateJudgement itself is not persisted:
   *  `recover()` computes it again from the judged commit's files and `judged-facts.json` (§3.11, D2-72). */
  judged?: { commit: string; filesKey: string; ok: boolean; problems: string[]; at: string };
  heading?: SessionView['heading'];
  confirmation?: { checkId: string; filesKey: string; state: 'running' | 'passed' | 'failed';
    failures: EndConfirmationView['check']['failures'];
    /** (fixer 2c2 r1, S-PERSIST-NEW-RECORD-FIELDS; additive) EN-2: the final check reused the last judgement's file
     *  checks; 2f writes it with the check's result, `toSessionRecords` maps it (SessionRecords.confirmation). */
    reusedFileChecks?: boolean };
  /** ES-7: the files that differ from B, and when that was first seen; absent while none differs (AF9). */
  drift?: { files: string[]; at: string };
  positions?: Record<string, CanvasPosition>;
  events: SessionView['events'];
  /** Raised whenever the view changes in a way the user can see; the masked graph's `version` (F17). */
  viewVersion: number;
}
interface PersistedStep {
  id: string;
  kind: 'formalize' | 'submit';
  target: string;
  stage: number;
  /** The step's limits; for a re-asked target, `scope.question` is the new question (§3.2). */
  scope: StepScope;
  retryOf?: string;
  /** StepState (§2.9). A statements-only step (A12, D2-4) ends `passed` (or `gave-up`). */
  state: StepState;
  /** (fixer 2c2 r1, S-PERSIST-NEW-RECORD-FIELDS; additive) The queue it runs in, numbered from 1 in the session: 2d
   *  writes it in the `queue-start` write that queues the step (and in the session's first queue), a Retry step's new
   *  queue number included, so `toSessionRecords` maps it (SessionRecords.steps[].queue) and StepView's `index` and
   *  `of` count the same after a reload (D2-72). */
  queue?: number;
  startCommit?: string;
  freezeCommit?: string;
  endCommit?: string;
  freezes: FreezeRecord[];
  gateAttempts: GateAttemptView[];
  lastFinish?: FinishArgs;
  counters: RunCounters;
  agentMs: number;
  /** Written to attempts.jsonl only when the session ends (D2-11). */
  attempt?: AttemptRecord;
}
```
- **The run directory** holds, all outside ws/ and so out of Claude's reach (S3):
  - `base-facts.json`, as today; the base mask takes proofs from it (§4.7);
  - `judged-facts.json`: the stage judgement's facts, replaced only with `judged` (the judgement itself is computed again on load, D2-72);
  - `renderings.json`: Lean's renderings of statements, by content key (§3.12);
  - `transcript.jsonl`.
- **Write order** (D2-51). Every write telelean makes to ws/ outside a running step is made in four writes, in the order below. That covers a decision, an Add premise's write and its completion, Submit's take-out, the judge's outcome (its reverts), and a queue's start (whose step 2 writes no file).
  1. run.json gets `inFlight` (atomic replace).
  2. The files are written into ws/.
  3. The shadow commit is made.
  4. run.json gets the new records, with `head` set to that commit and `inFlight` cleared (atomic replace).

  Outside a running step, `recover()` reverts ws/ to `head` (a `revert` commit, or nothing when they are equal) and runs `inFlight` again, which is idempotent. A write is then either not made or fully made, never half made. A ledger entry is written to run.json before the normalise that writes it into ws/.

  **The in-memory session changes only at step 1** (`inFlight`) **and step 4** (the records, `head`, `inFlight` cleared); a records-only write changes it at its one run.json write. Everything in between, reconcile's output included, works on copies. So `dispose()`, which writes the in-memory run.json at once when the window closes, always writes a state this order allows: never records ahead of `head` without `inFlight` (AF11).
- **One write queue** (D2-51). Every write of a session runs in one queue, in order, from its step 1 to its step 4, with nothing interleaved: decisions, an Add premise's write and its completion, Submit's take-out (§3.7), the judge's outcome (`judge-apply`), and the start of a queue of Claude steps in a stage (`queue-start`: its seal and its first `step-start` commit, AF3). So `inFlight` needs only one slot, and no write overwrites another's.
  - A change to the records alone (Accept, back to review, Shaky, Show results, a move) also takes the queue, for one run.json write. It waits only behind a write in progress, a premise write's or a completion's Lean job included, never behind a judge.
  - Each write plans its files when it starts, for its step 2, on the head and the ledger as they are then (a replay after a crash plans them again). So a take-out also covers a premise that a write queued before it has written meanwhile (§3.8).
  - While the queue holds a write, queued or running, the session is `judging` (§3.6, AF3): Submit review, Apply, a mid-stage Formalize and Retry step wait until it is empty and no judge runs. A queue of Claude steps then starts as the queue's last write (`queue-start`), so no premise write, completion or decision write is ever left behind it.
  - The judge's Lean job runs outside the queue, on the head. Its whole outcome is one `judge-apply` write, planned inside the queue (F8). When the head is no longer the commit it judged (a decision moved it meanwhile), the write is dropped and the judge runs again on the new head. Otherwise `reconcile` (§3.5) runs on the records as they are then, so a decision made meanwhile is kept; the judge's reverts (§3.6) are the write's ws/ part, and its records, `judged` and `judged-facts.json` are written in its step 4.
  - While a step runs, the session takes no action (D2-62), and a queue starts only once the write queue is empty (above), so no session write interleaves with the step's own commits and run.json writes, nor with the step that comes after it.
  - Steps 1 and 4 use a new `RunFiles.writeStateChecked`, which rejects when the write fails (today's `writeState` logs the failure and resolves). A failed step 1 aborts the write: ws/ and the records stay as they were, and the action is refused with "telelean could not save the session: ‹error›". A failed step 4 is tried once more; if it still fails, the queue stops with the same text, and after a reload `recover()` finishes the write.
- **Shadow commit kinds:**
  - new: `step-start` (S₀), `decision` (telelean carried out a decline) and `completion` (a premise completion);
  - a step's rollback target is `lastCommitSince(step.startCommit, ['gate-pass', 'freeze', 'step-start'])`;
  - `rebase` and `accept-base` stay readable, but nothing writes them any more.
- **Sidecars:**
  - `attempts.jsonl`: one AttemptRecord per step (`round` = the step's index, `premises` = its question) plus its resolution, all written when the session ends (D2-11);
  - new `.telelean/subjects/<S>/endorsements.json`: `{ format: 'telelean-endorsements', version: 1, endorsed: Array<{ name: string; textHash: string; run: string; date: string }> }`. Apply writes it inside its history entry. Core build drops `definitional-choice` from a definition whose name and text hash are endorsed (D2-18). `textHash` is core's `endorsementHash(text)` (2c1), so 2f writes exactly what the build compares. The runner's ModelWorkspace reads the file and passes it to `buildProjectModel` (2f).
  - **Apply's sidecars** (an additive change to M2's frozen `ExternalChangeSet`):
    - `ExternalChangeSet.changes` may include the subject's `layout.json` and `endorsements.json`;
    - `ModelWorkspace.applyChanges`, which today refuses every file that is not a model file, accepts exactly those two besides model files;
    - `isSubjectSidecarFile` adds `endorsements.json`, so History's snapshots and Undo cover both.
  - **Apply's history entry** uses M2's kind `accept-proposal`, with its own label (§3.10, D2-67), so no history kind is added.
- **Webview state:** `review?: { runId; current; filter }`, used only for the same runId (ES-6).

### 2.7 Gate contracts (core `gate/`; 2b1b)

```ts
/** ES-2's preset for one step, relative to its start S₀. */
export interface StepScope {
  step: string;
  target: string;
  question: { sources: string[]; fromNothing: boolean };
  /** Cards at either end of a selected arrow whose Lean statement is empty at S₀; never E(T)'s sources (D2-21). */
  fuzzyStatements: string[];
  /** The target's proof may be written, replaced or completed; never made an axiom. */
  openProof: boolean;
  /** propose_arrow into the target; false when the question is the target's mark. */
  openArrows: boolean;
  /** Submit steps: keys of this inference's Shaky and to-be-redone items, whose content may change or go. */
  openItems: string[];
  /** A12 (D2-4): the source, an earlier target of the queue, that has no `.holds` at S₀. The step only formalises
   *  statements: `openProof` and `openArrows` are false, and it finishes not proved naming this source. Never in a view. */
  statementsOnly?: string;
}
export interface JudgeInput {
  purpose: 'check' | 'freeze' | 'gate-proved' | 'gate-other' | 'stage' | 'final';
  stage: 'formalise' | 'prove';
  /** The state judged: its shadow commit and files key, passed through to StateJudgement. */
  commit: string;
  filesKey: string;
  /** B, with the base facts. */
  base: ProjectModel;
  /** The judged state, with fresh facts. */
  current: ProjectModel;
  /** S₀ and the step's limits: step purposes only. */
  stepStart?: ProjectModel;
  scope?: StepScope;
  /** The active step's freeze. */
  freeze?: FrozenSnapshot;
  inferences: readonly SessionInference[];
  ledger: readonly LedgerEntry[];
  /** The session's item records. They do not change while a queue runs (D2-62), so a step's checks, and its Resume,
   *  read the records of its start. */
  items: readonly ItemRecord[];
  /** Add premise drafts: computeItems makes their items (§3.5), and `classes` counts their statements (§4.1). */
  premises: readonly PremiseDraft[];
  /** The inferences whose step ended: each has a Result draft (§4.2). */
  ended: readonly string[];
  rejectedArrows: readonly ArrowEnds[];
  /** The step's finish said it found no other arrangement (DO-3). */
  noAlternative?: boolean;
}
export function judgeState(input: JudgeInput): StateJudgement;   // StateJudgement: §2.9
// GateFindingCode: + 'arrow' | 'holds-kind' | 'rejected-repeat' | 'stray-command'
// GateFinding:     + inference?: string   (the target of a per-inference finding)
```

New tokens (each with a board sentence in `describeFinding`, and a message for Claude):
- `existing-changed`:
  - new token `session`: content proposed earlier in this session, "leave it exactly as it is in this step";
  - `meaning` now also fires when the sets of value or type constants differ (D2-41);
  - (fixer 2b1b r1) `closed-proof`: the target's `.holds` while the step's proof is closed; `text`: a line of S₀ outside declarations removed or moved; `unowned`: a difference no review item can hold that S₀ did not have, which no other rule named (§4.9).
  - (fixer 2b1b r2, R1-3) `uncovered`: content an earlier step of the session wrote that no review item of S₀ covers (`session` is for content the person reviews); `closed-proof`'s sentence names any change of the closed proof (added, changed, removed or moved).
- `arrow` (B.3): `not-target`, `into-axiom`, `mark`, `no-holds`, `declined`, `cycle`, `unknown-card`, `drawn`, and `other-target` (the source is another target of the session, D2-50).
- `holds-kind` (B.4): `theorem-to-axiom`, `axiom-for-proposition`, `type-changed`; (fixer 2b1b r1) `axiom-to-theorem` and `not-target`: a theorem `.holds` on a card other than the step's target (at a stage and the end, than a session target), from an axiom, or new or rewritten.
- `markup` (G5, fixer 2b1b r1): token `lines`, a block's other lines reordered, added or rewritten (computeItems' F1 rule).
- `rejected-repeat` (step purposes only, for content created or changed since S₀; D2-66): `rejected` (DO-1), `arrow` (DO-0), `premise` (a rejected Add premise), `shaky-identical` (DO-3).
- `new-axiom`: + `type-changed` (a reused name with another type: S6).
- `undeclared-premise`: + `other-result` (a declaration of a Result's proof phase used outside it, D2-50, §4.9).
- `stray-command`, a new code: a top-level command that is not a declaration, nor a line enclosing new declarations (D2-52).

`status-mismatch` already has the tokens `changed` and `removed`, which the slice-1e fixer added; slice 2 adds none.

`evaluateRules` keeps its signature and slice 1's behaviour, as the single-target entry point built on the same rule helpers (2b1a), so the M2 and 1e gate suites keep guarding every rule. Sessions use `judgeState`.

### 2.8 Tools and turns (runner; 2d)
- **New tool `propose_arrow { source: string; target: string; why: string }`** (D2-1).
  - It is validated at once by core `proposeArrowProblems` (§4.9); a refusal is the tool result's text.
  - An accepted proposal becomes a ledger `arrow` entry. telelean writes it into the target's `premises:` at the step's next normalise, before each gate attempt; Claude never edits that field.
  - It does not count as a check.
- **`finish`** gains `no_alternative?: boolean` (DO-3).
- **`freeze_statements`** fixes exactly the step's target, once per step. `propose_assumption` keeps its shape; its check changes (§3.8).
- **Turns.** Their first lines are fixed, so FakeBackend scripts can `match` them.
  - The session's first turn is today's context bundle, with its first line unchanged (`Run: "These suffice" for the subject …`), plus a FORMALIZE PLAN: the targets in order, each with its question.
  - Each step starts with `Step <i> of <n>: formalize and prove “<target id>”`, `Step <i> of <n>: rework “<target id>” after the review`, or, for a statements-only step (§3.3), `Step <i> of <n>: formalize the statements of “<target id>” (no proof: “<source id>” was not proved)`. Then:
    - the target, its question, and Claude's arrows so far;
    - what is open, and what is fixed (everything else, content under review included).
  - The first Submit step is preceded by `Review submitted (stage <n>)`, with ACCEPTED, REJECTED, SHAKY (each note quoted), TO BE REDONE and STEPS PLANNED (§3.7).
  - Nothing is decided while a queue runs (D2-62), so all the steps of a queue see the same decisions. The first step of a mid-stage Formalize or a Retry queue lists the decisions made since the previous queue, under `Your decisions since the last step:`; a Submit queue's feedback turn covers them.
- **System prompt** (and the fixture `system-prompt-5.1.txt`):
  - "You work in steps: one target per step."
  - The arrow rule: "If the proof needs an existing card that is not a selected premise and has a `.holds`, propose its arrow with propose_arrow (the person reviews it as an item), then use it. If that card has no `.holds`, finish not_proved and name it in gap. Never edit `premises:`, `follows_from:` or any other field of a block yourself."
  - For a target whose question is its "follows from nothing" mark: no arrows; propose a missing premise with propose_assumption.
  - "Never propose an arrow from another target of this session, and never use a lemma from another target's proof unless that target is a selected premise. A statement may never use a declaration you wrote after fixing the statements." (D2-50)
  - "Write only declarations: no `open`, `variable`, `universe`, `attribute` or `#check` lines, and no `open … in` before a declaration. Write fully qualified names (e.g. `Classical.em`), and put `@[…]` on the declaration itself." (D2-52)
- `docs/m2-plan.md` §2 (the state machine) and §5 (the prompts) get dated notes pointing here.

### 2.9 Shared contracts (core `review/types.ts` in 2a1; runner `gate/types.ts` and `run/types.ts` in 2b3 and 2d)

These types cross sub-slices. 2a1 writes the core ones, with the functions stubbed (§1.1), and every later sub-slice implements them as written.

```ts
// ---- core review/types.ts (2a1)

/** One inference judged on one state (§4.8, §4.9; filled by 2b1b). */
export interface InferenceJudgement {
  target: string;
  /** Every per-inference rule holds in this state. */
  passes: boolean;
  verdict: 'established' | 'proved' | 'not-proved';
  reasonChip?: string;
  flags: ResultFlag[];
  /** `#print axioms` of T.holds; [] without a proof. */
  footprint: string[];
  /** B.2's direct(T): card ids. */
  direct: string[];
  /** E(T)'s sources: Claude's arrows into T that are not declined and that the judged state draws into T (the running
   *  step's own entries before its normalise draws them), and T's written premises (§4.8; fixer 2b1b r2, R1-2: never
   *  the ledger and the records alone, so `extraSources` requires the judged state). */
  extra: string[];
  /** B.1: what each source of Q(T) ∪ E(T) contributes. */
  contrib: Record<string, { kind: 'claim' | 'own-proof' | 'session-proof' | 'nothing'; reason?: ContribReason; pending?: boolean }>;
  permitted: string[];
  /** Sources whose session proof counted: the RV-5 edges Result(T) → Result(u). */
  throughResults: string[];
  restsOn: string[];
  band: { used: string[]; notNeeded: string[]; complete: boolean; open: string[] };
  missing: Array<{ source: string; drawn: boolean }>;
  findings: GateFinding[];
}
export type ContribReason = 'no-holds' | 'conditional' | 'mismatch' | 'circular' | 'not-passing' | 'unchecked';

/** One judged state (judgeState, §4.9): everything reconcile (§3.5), the view (2c2) and the end (§3.10) read about it. */
export interface StateJudgement {
  commit: string;
  filesKey: string;
  purpose: JudgeInput['purpose'];
  /** It built, its facts are complete where needed, and there is no global finding. */
  ok: boolean;
  global: GateFinding[];
  /** Step purposes: `global` plus the active inference's findings. */
  stepFindings: GateFinding[];
  /** By target; judged sources first. */
  inferences: Record<string, InferenceJudgement>;
  /** computeItems on this state (§4.2): premise items included, and a Result for every inference whose step ended. */
  drafts: ItemDraft[];
  /** RV-7 classes by item key, every premise draft's statement counted in R_stmt: in force while the results are
   *  shown (§4.1, D2-42). */
  classes: Record<string, ItemClass>;
  /** The same with no premise draft counted: in force while the results are hidden, and the only one the reveal rule
   *  reads (§4.7). */
  classesBeforeReveal: Record<string, ItemClass>;
  /** RV-5 edges by item key: the keys each item depends on (§4.5). */
  deps: Record<string, string[]>;
  /** R_stmt's `by`: the cards and drafts whose statements reach each name. */
  reach: Record<string, string[]>;
  /** `engine.judge` only: the premise drafts not written yet that it checked again on this state, by item key (§3.8). */
  premiseChecks?: Record<string, { closesGap: boolean; facts: Record<string, DeclFacts> }>;
  /**
   * Unowned differences, build errors mapped to item keys, missing facts. `scc` (a cycle of items partly accepted) is
   * not emitted by judgeState (builder 2b1b): it depends on the records, which change without a judge, so planSubmit,
   * the view and the backstop compute it from the records.
   */
  problems: Array<{ code: 'unowned' | 'no-longer-builds' | 'facts' | 'scc'; text: string; keys?: string[]; declaration?: string }>;
}

/** computeItems' output for one key (§4.2). */
export interface ItemDraft {
  key: string;
  kind: ItemKind;
  declKind?: DeclKind;
  /** For a new record: the creating step, its inference and phase (ledger `created`, `arrow`, `premise`). */
  origin: ItemRecord['origin'];
  provides: { decls: string[]; arrows: ArrowEnds[]; cards: string[] };
  /** Its declarations' `uses` constants (§4.1). */
  mentions: string[];
  /** The target whose Result it is part of, hidden while the results are (§4.7): arrow items into the target, its
   *  premise items, and the `decl:` items created in its steps' proof phases that its premise drafts reach. Read from
   *  the ledger, never from later reach (§4.2). A declaration created in a statement phase is never part of a Result. */
  partOfResult?: string;
  contentKey: string;
  content: ItemContent;
  /** A Result's draft that is B's version: T.holds as in B (the same text, or absent in both) and no proof material.
   *  It exists only because the step ended (F9), and reconcile never reads it as a new proposal (§3.5, AF1). */
  asInBase?: true;
  /** (fixer 2a, ADV-3) A declaration it provides has no facts in this state (its module did not build): its key and
   *  `mentions` are partial, so reconcile keeps its record, and classify marks its class. */
  factsMissing?: true;
}

/** The step of a session's queue (PersistedStep.state). */
export type StepState = 'queued' | 'running' | 'passed' | 'gave-up' | 'cancelled' | 'failed' | 'interrupted' | 'not-run';

/** The ws/ changes of one action, carried out at once through the write queue (§2.6): `reapply`'s inverse merges first,
 *  then `revert`, then the premise take-outs (fixer 2a, V2A-C2).
 *  Taking a written Add premise out (§3.8) removes whatever of it is in ws/ when the take-out runs and drops its ledger
 *  entries; step 4 clears the record's `card` and gives it its draft key again, and records in the action's `takenOut`
 *  only the premises written when the write started (card, written key, ledger entries): `takenOut` is what the
 *  action's commits, together, took out (fixer 2b1a r1).
 *  A decision commit holds the take-out of the written premises its write took out, so an un-reject's merge brings their
 *  card back without their ledger entries (builder 2b1a, R1-1). Their entries are in the `takenOut` of the stack action
 *  whose `commits` hold the un-rejected item's `decline.commit` (read before the action), the action the reducer reads.
 *  Such a premise is in `reapply` when it comes back (its record holds its card and written key again; the runner puts
 *  that entry's ledger entries back), and in `premises.takeOut` when its status keeps it out (its record holds the card
 *  again, so the runner plans that take-out after the merge from the record's card; no ledger entry of it exists). It
 *  was not written when the write started, so step 4 does not record it in `takenOut`: the merge and the take-out
 *  together leave it as it was, and so does their inversion (fixer 2b1a r1). One written again since keeps its record:
 *  the merge of its old take-out changes nothing, or conflicts (refused).
 *  For an Undo, `action` is the undone action (a decision or Show results, builder 2b1a's R1-2): the runner inverts its
 *  `commits`, newest first, and puts its `takenOut` ledger entries back, before any premise write that is due; `reapply`
 *  lists what that brings back, `revert` what must go out again (fixer 2a, V2A-S3). The Undo writes a premise of its
 *  action's `takenOut` again (card and written key back on its record, in `reapply`) only when it restores that
 *  premise's change to a state that keeps it in ws/, in review only when it was in review before the action (a
 *  converted v1 ghost); every other one (changed by a judge since, its Accept kept silently, or returned to review by
 *  the Undo itself) is in `premises.takeOut`, taken out again after the inversion from that entry's card (fixer 2b1a
 *  r1). An Undo whose action made commits always has a write. */
export interface ItemWrite {
  /** The stack action (SessionAction.id) that made it: its commit joins that action's `commits`, so Undo inverts it. */
  action: number;
  /** Items whose content goes (planItemRevert), and items whose rejected version comes back (the inverse merge). */
  revert: string[];
  reapply: string[];
  /** `write`: the Add premise items this action makes due; their premise writes join the queue after this write (§3.8),
   *  and each reads `holdAs` and `rationale` from the item's `accepted` record, never from a default. `takeOut`: the Add
   *  premise items this action gives a status whose content is outside ws/ (in review, declined by Reject or plain, to
   *  be redone and reverted), taken out when they are written as the write starts (§2.6, §3.8, AF2); also those an
   *  un-reject's merge brings back that their status keeps out, from the record's card (R1-1), and for an Undo those of
   *  its action's `takenOut` it does not write again, from that entry's card (fixer 2b1a r1). */
  premises: { write: string[]; takeOut: string[] };
}

/** The reducer's input (§4.6): the records, and what its rules read from the last judged state. The runner calls it only
 *  in a stage: while a step runs, every action is refused before it (D2-62). */
export interface ReviewState {
  items: readonly ItemRecord[];
  /** RV-5 edges by item id, from the stage judgement: the real dependencies, Results included (§4.5). One source only
   *  (builder 2b1a, R1-4): `depsById` of the records and the `deps` of the stage judgement they were reconciled with,
   *  a partial one included (ADV-3), never an older map. */
  deps: Readonly<Record<string, readonly string[]>>;
  /** Both class maps of the stage judgement, by item key; the reducer uses the one in force (§4.7). */
  classes: Readonly<Record<string, ItemClass>>;
  classesBeforeReveal: Readonly<Record<string, ItemClass>>;
  /** Show results' force (`PersistedSession.forced`). */
  forced: SessionForce | null;
  inferences: readonly SessionInference[];
  rejectedArrows: readonly ArrowEnds[];
  /** For every Result item id: the Add arrow items its question selected (a mid-stage Formalize, D2-20). DO-0 on one of
   *  them also takes its source out of that question (D2-59). */
  questionArrows: Readonly<Record<string, readonly string[]>>;
  didNotPass: boolean;
  stack: { done: readonly SessionAction[]; undone: readonly SessionAction[] };
  /** The id the next SessionAction gets (`PersistedSession.nextAction`). */
  nextAction: number;
  /** (builder 2a2) The labels the reducer's texts use: items by id as the view labels them, cards by card id. A missing
   *  one falls back to the kind's label and the key's names. (Builder 2a2's `results?` is gone: an Accept reads a
   *  Result's verdict and Rests on from its record's `judged`, fixer 2a, V2A-S5.) */
  labels?: Readonly<Record<string, string>>;
}
export type ReviewAction =
  | { kind: 'decide'; decisions: readonly ItemDecision[]; own: boolean; confirmed: boolean }
  | { kind: 'reveal'; via: 'show-result' | 'raw-diff' | 'activity' }
  | { kind: 'move'; before: Readonly<Record<string, CanvasPosition | null>>; after: Readonly<Record<string, CanvasPosition>> }
  /** `step`: the SessionAction id the user saw; a different top of the stack gives `conflict`. */
  | { kind: 'undo' | 'redo'; step: number; confirmed: boolean }
  | { kind: 'seal'; by: SealBy };
/** `needs-option` (fixer 2a, V2A-N2): a group's plain decline of an item that is no arrow item. */
export type GroupLeftReason = 'own-accept' | 'depends' | 'hidden-result' | 'blocked' | 'not-in-review' | 'needs-option';
export type ReviewOutcome =
  | { ok: true; items: ItemRecord[]; inferences: SessionInference[]; rejectedArrows: ArrowEnds[];
      /** The force after the action: set by `reveal`, cleared when a statement or belief item became undecided (§4.7). */
      forced: SessionForce | null;
      stack: ReviewState['stack']; nextAction: number; label: string;
      /** ActionOutcome.review's parts; a Result or a Result's part is never named while the results are hidden. */
      taken: string[];
      left: Array<{ item: string; reason: GroupLeftReason }>;
      cascade: CascadeEntry[];
      /** telelean's reports of the action's own effects, D2-23's at a reveal included; never about a hidden item. The
       *  runner numbers and times them (AF7, AF9). */
      events: Array<{ text: string; items: string[] }>;
      /** The ws/ changes, carried out at once through the write queue. */
      write: ItemWrite | null }
  | { ok: false; code: 'needs-confirmation'; cascade: CascadeEntry[]; hiddenResults?: true }
  | { ok: false; code: 'refused' | 'conflict'; error: string; item?: string };
export function reduceReview(state: ReviewState, action: ReviewAction, at: string): ReviewOutcome;

/** RV-8 (§4.6; 2a2), generic so the webview runs it on ItemViews and the host on its records (F12). `blocked`: its
 *  Accept is refused for a reason other than its dependencies ("did not pass", waiting for the results). */
export interface GroupItem { id: string; status: ItemStatus | null; dependsOn: readonly string[]; ownAccept: boolean;
  hidden: boolean; blocked: boolean; arrow: boolean }
export function planGroupAccept(items: readonly GroupItem[], selected: readonly string[]):
  { take: string[]; left: Array<{ item: string; reason: GroupLeftReason }> };
export function planGroupDecline(items: readonly GroupItem[], selected: readonly string[], option: DeclineOption):
  { decisions: Array<{ item: string; option: DeclineOption }>; left: Array<{ item: string; reason: GroupLeftReason }> };

/** §4.2 (2a1). `ended`: the inferences whose step ended; each gets its Result draft, with or without a difference (F9),
 *  marked `asInBase` when it is B's version (AF1), and premise items come only for these (AF10).
 *  `active` (step purposes): the running step, whose declarations new since S₀ have no `created` entry yet; they are
 *  its own, `statements` when its freeze holds them and `proof` otherwise, as its end will record (§3.4). */
export function computeItems(i: { base: ProjectModel; current: ProjectModel; ledger: readonly LedgerEntry[];
  premises: readonly PremiseDraft[]; inferences: readonly SessionInference[]; ended: readonly string[];
  active?: { step: string; target: string; stepStart: ProjectModel; freeze?: FrozenSnapshot } }):
  { drafts: ItemDraft[]; problems: StateJudgement['problems'] };
/** §4.4 (2a2). `withDrafts`: every premise draft's statement in R_stmt (`classes`), or none (`classesBeforeReveal`).
 *  `inferences` give Q's sources for c4's "adds no new basis", which it sets on the arrow item's class (AF8). */
export function classify(i: { base: ProjectModel; current: ProjectModel; drafts: readonly ItemDraft[];
  premises: readonly PremiseDraft[]; inferences: readonly SessionInference[]; withDrafts: boolean }): Record<string, ItemClass>;
/** §4.5 (2a2): RV-5 edges by item key. */
export function itemDeps(i: { base: ProjectModel; current: ProjectModel; drafts: readonly ItemDraft[];
  inferences: Readonly<Record<string, InferenceJudgement>> }): Record<string, string[]>;
/** §4.7 (2a2): the stage reveal. `meaning`: the statement and belief items that are not Results' parts (belief read
 *  from `classesBeforeReveal`, by item key); `waitingFor`: those that are undecided, in review or to be redone with
 *  their content in ws/ (`redo.reverted` false, AF4). */
export function resultsState(i: { items: readonly ItemRecord[]; classesBeforeReveal: Readonly<Record<string, ItemClass>>;
  forced: SessionForce | null }): { shown: boolean; meaning: string[]; waitingFor: string[] };
/** §3.5 (2a2): a stage judgement applied to the records, when a queue ends and in every `judge-apply` write. `runId`
 *  gives new records their ids (§2.2, AF7). `queueSteps`: the steps of the queue this judgement ends, absent at a judge
 *  that a decision started; F5's rule reads only these (§3.5, AF1). */
export function reconcile(i: { runId: string; records: SessionRecords; judgement: StateJudgement;
  queueSteps?: readonly string[]; at: string }):
  { records: SessionRecords;
    /** Never about a hidden item; the runner numbers and times them (AF7, AF9). */
    events: Array<{ text: string; items: string[] }>; problems: string[];
    /** Items the judge makes to be redone and takes out (§3.6), and written premises it returned to review, which are
     *  taken out too (§3.8): the write's ws/ part. */
    reverts: string[] };

/** §4.8 (2b1b, `review/permitted.ts`): B.1 for one inference on one state. `earlier`: the judgements of the inferences
 *  judged before it, sources first; `items` and `ledger` give E(T). judgeState calls it once per inference (AF8). */
export function permittedFor(i: { base: ProjectModel; current: ProjectModel; target: string;
  inferences: readonly SessionInference[]; ledger: readonly LedgerEntry[]; items: readonly ItemRecord[];
  earlier: Readonly<Record<string, InferenceJudgement>> }):
  Pick<InferenceJudgement, 'extra' | 'contrib' | 'permitted' | 'throughResults'>;
/** §4.9 (2b1b, `review/judge.ts`): propose_arrow's refusals, each with its `arrow` token and its text for Claude; []
 *  accepts the arrow (AF8). */
export function proposeArrowProblems(i: { current: ProjectModel; scope: StepScope; inferences: readonly SessionInference[];
  ledger: readonly LedgerEntry[]; rejectedArrows: readonly ArrowEnds[]; source: string; target: string }):
  Array<{ token: string; text: string }>;

/** The RV-6 base mask (§4.7; filled by 2c1): while the results are hidden, every proof as in B. */
export interface BaseMask {
  /** Each target's `.holds` as in B: absent, or B's text. */
  holds: Record<string, { kind: 'absent' } | { kind: 'base'; name: string; text: string }>;
  /** Every declaration created in a proof phase (ledger `created`): lemmas, proof-phase definitions and vocabulary. */
  drop: string[];
  /** Claude's arrows: every ledger `arrow` entry. */
  dropArrows: ArrowEnds[];
  /** Written premise cards (ledger `premise`), with their arrows and mark removals. */
  dropNodes: string[];
  /** (builder 2c1; additive) Those mark removals as data: the cards a ledger `mark-removed` names that B marked. */
  restoreMarks: string[];
}
export function baseMask(i: { base: ProjectModel; inferences: readonly SessionInference[]; ledger: readonly LedgerEntry[] }): BaseMask;
/** The masked facts, field by field (§4.7, AF6). The models give the texts and ranges the rules compare:
 *  - `modules`: the working copy's (states and source hashes), so no file reads stale;
 *  - the masked names (`drop`, the declarations of `dropNodes`, a `.holds` that `holds` makes absent): left out, with
 *    their messages;
 *  - each target's `.holds` under `holds: base`: B's DeclFacts, and B's messages for it, placed at the start of the
 *    target's statement in the working copy, so they attach to the same card and keep their place among the other
 *    diagnostics wherever the step put the `.holds` (fixer 2c1 r1, S-V2C1-S4);
 *  - every other declaration B has with the same text: the working copy's DeclFacts (range, selection range, refs,
 *    module and the rest), with only `axioms` and `usesSorry` taken from B; B's messages for it replace the working
 *    copy's, moved by the line offset between its range in B and in the working copy;
 *  - the rest: the working copy's DeclFacts and messages;
 *  - every other message, one with no position included: dropped;
 *  - no `detail` (the envelope's, `build`'s, `check`'s, `probe`'s): Lean's own words can quote hidden proof material
 *    (fixer 2c1 r1, A-ADV-6). */
export function maskFacts(i: { current: ProjectModel; base: ProjectModel; mask: BaseMask }): LeanFacts;
// (builder 2c1; additive, review/mask.ts, imported by path) The build's form of the mask (`ProjectMask`, project/types.ts:
// `ProjectInput.mask`) and the masked project, which 2c2's buildSessionView builds the hidden view's graph from:
//   export function projectMaskOf(i: { current: ProjectModel; base: ProjectModel; mask: BaseMask }): ProjectMask;
//   export function maskedModel(i: { current: ProjectModel; base: ProjectModel; mask: BaseMask;
//     endorsements?: ProjectInput['endorsements']; lakefile?: ProjectInput['lakefile'] }): ProjectModel;
// (fixer 2c1 r1, S-V2C1-S6; additive) `endorsements` and `lakefile`: the working copy's build inputs, which a
// ProjectModel does not keep; 2c2 passes the ones the working copy's board was built with, so the masked board flags
// what that board flags (an endorsed definition, TL110).

/** What core reads of PersistedSession (§2.6). The runner's PersistedSession is this plus `format`, `version`,
 *  `head`, `inFlight`, `judged` and `viewVersion`, with full PersistedStep records; `toSessionRecords` maps it. */
export interface SessionRecords {
  stage: number;
  phase: SessionView['phase'];
  inferences: SessionInference[];
  steps: Array<{ id: string; kind: StepView['kind']; target: string; stage: number; state: StepState;
    /** The question it asked (its StepScope's). */
    question: StepScope['question'];
    /** Its finish said `no_alternative` (DO-3, §3.5). */
    noAlternative?: boolean;
    retryOf?: string;
    /** (builder 2c2; additive) A12's source, its StepScope's `statementsOnly`: the Result's reason chip, shown with the
     *  results only ("“‹L›” was not proved"). 2d sets it. */
    statementsOnly?: string;
    /** (builder 2c2; additive) The queue it runs in, numbered from 1 in the session (2d sets it at `queue-start`):
     *  StepView's `index` and `of` count within it. */
    queue?: number }>;
  queue: string[];
  retry: string[];
  items: ItemRecord[];
  premises: PremiseDraft[];
  ledger: LedgerEntry[];
  rejectedArrows: ArrowEnds[];
  stack: { done: SessionAction[]; undone: SessionAction[] };
  nextAction: number;
  forced?: SessionForce;
  heading?: SessionView['heading'];
  confirmation?: { checkId: string; filesKey: string; state: 'running' | 'passed' | 'failed';
    failures: EndConfirmationView['check']['failures'];
    /** (builder 2c2; additive) EN-2: the final check reused the last judgement's file checks. 2f sets it. */
    reusedFileChecks?: boolean };
  drift?: { files: string[]; at: string };
  positions?: Record<string, CanvasPosition>;
  events: SessionView['events'];
}

/** buildSessionView's input (2c2). The function is pure; the runner gathers this. */
export interface SessionViewInput {
  runId: string;
  subject: string;
  records: SessionRecords;
  /** The stage judgement (`PersistedSession.judged`), computed again after a reload (D2-72); null until the first
   *  queue ends. */
  judgement: StateJudgement | null;
  /** B, with the base facts: the base mask takes proofs from them (§4.7). */
  base: ProjectModel;
  /** The stage judgement's working copy (its commit's files, `judged-facts.json`), unmasked: buildSessionView masks it
   *  while the results are hidden. Never ws/ while a queue runs. Before the first stage judgement (`judgement` null, the
   *  session's first queue) B: buildSessionView shows B then whatever is passed (fixer 2c2 r1, C-V2C2-C6). */
  current: ProjectModel;
  /** Lean's pretty and fully explicit renderings, by content key (§3.12). */
  renderings: Readonly<Record<string, { pretty: string; explicit: string }>>;
  /** Claude's words per step; buildSessionView shows them only while the results are shown (D2-10). */
  words: Readonly<Record<string, { summary?: string; gap?: string; proposedNothing?: string;
    assumedWithoutAsking?: Array<{ text: string; items: string[] }> }>>;
  judging: boolean;
  /** `PersistedSession.viewVersion`: the masked graph's `version` (F17). */
  viewVersion: number;
  /** (builder 2c2; additive) The working copy's build inputs, which a ProjectModel does not keep: `maskedModel` builds
   *  the hidden board with them (the note under `maskedModel` above). */
  endorsements?: ProjectInput['endorsements'];
  lakefile?: ProjectInput['lakefile'];
  /** (fixer 2c2 r1, S-STAGE-PROBLEMS-NO-PATH; additive) The runner's own problems of the stage, which neither the
   *  records nor the judgement hold: a premise write that failed (§3.8; 2f passes them), each with the ids of the items
   *  it names; while the results are hidden, one that names a hidden item is left out (its text names it). */
  problems?: ReadonlyArray<{ text: string; items: readonly string[] }>;
}
/** 2c2 (`review/view.ts`): the one builder of SessionView (§2.3, §4.7), pure (AF8). */
export function buildSessionView(input: SessionViewInput): SessionView;
// (builder 2c2; additive, in review/view.ts) `itemLabel(item)`, an item's full label; `sessionLabels(view)`, the
// reducer's `ReviewState.labels`; `reviewStateOf(records, judgement, labels?)`, the reducer's input as the view reads
// it (2e and the host's early answers use it). In review/reducer.ts: `itemGates(state)`, every item's own Accept,
// decline and back-to-review gates on one Work (`acceptGate`'s rules); (fixer 2c2 r1) `decidedBy(action)`, the items
// a decide action carried out, which the view reads to offer no Undo or Redo of a decision on an item hidden now.

/** The backstop (§4.10; filled by 2b2). */
export interface BackstopInput {
  base: ProjectModel; final: ProjectModel; items: readonly ItemRecord[]; ledger: readonly LedgerEntry[];
  inferences: readonly SessionInference[]; judgement: StateJudgement;
}
export interface BackstopRefusal {
  code: 'facts' | 'unowned' | 'not-accepted' | 'not-written' | 'own-accept' | 'content-changed' | 'class' | 'arrow' | 'mark'
    | 'b2' | 'cycle' | 'kind' | 'scc';
  text: string; name?: string; arrow?: ArrowEnds; item?: string;
}
export function applyBackstop(i: BackstopInput): { ok: boolean; refusals: BackstopRefusal[] };

/** §4.11 (2b2, `review/revert.ts`): B's version of the given items' content, as whole-file changes of `current`.
 *  `drafts`: the items' drafts on `current` (their `provides`); `ledger`: a premise's completion, and which declarations
 *  enclosing lines hold (AF2, AF8). */
export function planItemRevert(i: { base: ProjectModel; current: ProjectModel; drafts: readonly ItemDraft[];
  ledger: readonly LedgerEntry[] }): FileChange[];

/** Submit's plan (§3.7; filled by 2b2). Submit is open only while the results are shown, so the plan reads every item's
 *  real status and dependencies. */
export interface SubmitPlan {
  /** Nothing Shaky, nothing to be redone: the end confirmation, with no Claude step (D2-54). */
  confirm: boolean;
  /** The affected inferences' targets, in the order their steps run (D2-57). */
  steps: string[];
  /** Item ids whose kept content is taken out before the queue starts (D2-57). */
  takeOut: string[];
  counts: { shaky: number; redo: number };
  /** (builder 2b2; additive) RV-5 cycles of items (SCCs of two or more) with an accepted member that are not wholly
   *  accepted, as item ids: Submit to the end confirmation is refused while one exists (§3.7, §4.5). */
  partlyAccepted: string[][];
}
export function planSubmit(i: { records: SessionRecords; judgement: StateJudgement }): SubmitPlan;

/** What formalizeStartProblems reads of a session (§4.12; 2b2; F12). The host builds it from SessionView, which holds all
 *  of it while the results are shown, the only time a mid-stage Formalize is allowed (D2-65). The runner builds it from
 *  its records and runs the full check itself, so the host's check only answers early (before consent, for a start). */
export interface FormalizeSession {
  subject: string;
  resultsShown: boolean;
  /** The session's targets. */
  targets: string[];
  /** Claude's arrow items that are not declined. */
  arrows: Array<{ item: string; source: string; target: string; status: ItemStatus }>;
  /** Targets that have a Shaky item (D2-53). */
  shakyTargets: string[];
  /** Each target's Result status. */
  results: Record<string, ItemStatus>;
  /** (builder 2b2; additive) Targets whose Result is declined Shaky, which `results` cannot tell from a Reject (check 5).
   *  Without it, a declined Result of a target in `shakyTargets` counts as Shaky. */
  shakyResults?: string[];
}
export interface StartProblem { check: 1 | 2 | 3 | 4 | 5 | 6; text: string; card?: string; arrow?: ArrowEnds }
export function formalizeStartProblems(board: TlGraph, inferences: ReadonlyArray<{ target: string; premises: readonly string[] }>,
  session?: FormalizeSession): StartProblem[];
export function formalizeOrder(board: TlGraph, inferences: ReadonlyArray<{ target: string; premises: readonly string[] }>): string[];

// ---- runner gate/types.ts (2b3)

/** What a session adds to CheckContext (`session?: SessionCheckContext`). With it, check, freeze and gate call
 *  judgeState instead of evaluateRules, and GateReport gains `judgement?: StateJudgement`. They decide on the
 *  judgement's `stepFindings` with §2.1's failed-probe rule (an `environment` outcome with `probeFailure`'s sentence when
 *  they are empty or only `source-only`), never on `ok` alone (2b3b, AP30-3). G0 runs before all of it: when it finds
 *  anything they return its findings, counted, with no judgement and no Lean job (§1.1's 2b3b, AP30-1 r2). */
export interface SessionCheckContext {
  inferences: readonly SessionInference[];
  ledger: readonly LedgerEntry[];
  /** The session's records: they do not change while a queue runs (D2-62), so a step and its Resume read the same. */
  items: readonly ItemRecord[];
  premises: readonly PremiseDraft[];
  ended: readonly string[];
  rejectedArrows: readonly ArrowEnds[];
  /** Step purposes: the step's limits and its S₀ commit. */
  scope?: StepScope;
  stepStartCommit?: string;
  noAlternative?: boolean;
}
// For `judge` and `finalCheck` (purposes `stage` and `final`), CheckContext's single-target `selection`, `stage` and
// `round` are the active step's, or else the first inference's, so `validateContext` passes unchanged; judgeState
// ignores them, and JudgeInput.stage is passed as `prove` and ignored for these purposes.
// Each method below runs G0 first, before any Lean job (§1.1's 2b3b, AP30-1 r2). When it finds anything, nothing is
// synced, built, probed, rendered or challenged: `judge` and `finalCheck` judge the files without facts, G0's findings
// in `global` (so `ok` is false), and `writePremise` and `complete` answer `{ ok: false }` with G0's first message.
// LeanCheckEngine gains:
//   /** RV-11: builds the head (reusing the facts when the files key is unchanged), judges every inference, and checks
//    *  again the premise drafts that need it (§3.8). */
//   judge(ctx: CheckContext): Promise<{ judgement: StateJudgement; report: CheckReport }>;
//   /** §3.10 step 2, on exactly F; `reuse` holds what EN-2 lets it reuse. */
//   finalCheck(ctx: CheckContext, reuse?: { judgement: StateJudgement;
//     comparator: Record<string, { filesKey: string; permitted: string[] }> }): Promise<FinalCheckReport>;
//   /** §3.8 (F11): normalises the premise write the caller made, builds, renders P's fully explicit form where it was
//    *  written, and judges the state; the write's step 4 takes the written item's key from that judgement. A judgement
//    *  whose probe failed answers `{ ok: false, error, environment: probeFailure's sentence }`, so step 4 never reads a
//    *  partial judgement (AP30-4). */
//   writePremise(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<PremiseWriteReport>;
//   /** §3.8 (F11): normalises the completion the caller wrote, freezes again from the `adopt` commit (after
//    *  `statement-changed` passes against T's last freeze snapshot), gates it as `gate-proved` with that freeze's
//    *  challenge, and commits `completion` when it passes. */
//   complete(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<CompletionReport>;
export interface FinalCheckReport {
  passed: boolean;
  environment?: string;
  reusedFileChecks: boolean;
  judgement: StateJudgement;
  failures: Array<{ rule: FinalCheckRule; text: string; items?: string[]; declaration?: string }>;
  backstop: BackstopRefusal[];
}
export type PremiseWriteReport =
  | { ok: true; meaningMatches: boolean; explicit: string; judgement: StateJudgement }
  | { ok: false; error: string; environment?: string };
export type CompletionReport =
  | { ok: true; commit: ShadowCommit; judgement: StateJudgement }
  | { ok: false; error: string; environment?: string };
// (builder 2b3b; additive, §8) CheckReport.judgement? (check and freeze carry it as the gate does); GateReport.freeze?:
// the FreezeRecord a proved finish exported again (D2-19), which 2d records as the step's newest freeze;
// FinalCheckReport.comparator?: the comparator's passes of the check (run or reused) by target, for 2f to record;
// GhostCheckInput.leanName? and, in a session, GhostCheck.explicit? (PremiseDraft.explicit: the value of the
// statement's explicit #print) and .facts? (PremiseDraft.facts); writePremise commits the files it built as `adopt`
// (step 3) and judges that commit, with no commit on a failure; complete's judgement is judgeState('stage') of the
// `completion` commit. Shadow: ShadowWorkspace.lastCommitSince(since, kinds) and syncMirror(files?). Proposals:
// ProposalService.planApply(ApplyRequest { shadow, readReal, finalState?, targets, nodes, realFiles? }).
// (fixer 2b3b r1, §8) ApplyRequest.finalState is required (the files of the commit the passed final check judged; a
// request without it is a TypeError); in a session GhostCheckInput.leanName is required (TypeError); `judge`'s
// premiseChecks lists every draft judged on the state, a draft whose reliance did not change with its last check's
// outcome again (no Lean job), and leaves out a check telelean could not run or judge; `complete` freezes again from the
// state the completion is written on (the shadow's newest commit: the adopt commit, or a later one after recover()'s
// revert or when the completion becomes due after a decision), which must hold the written premise (ledger entry, card)
// with T not proved, `ctx.freeze` being T's own; `finalCheck` refuses (environment) unless ws/ equals the newest commit.

// ---- runner run/types.ts (2d)

/** A write to ws/ that `recover()` can run again (§2.6's write order); all of a session's writes run in one queue. */
export type SessionWrite =
  | { kind: 'decide'; action: ReviewAction }
  /** Reads `holdAs` and `rationale` from the item's `accepted` record. Its Lean job is `engine.writePremise`; its step 4
   *  sets the record's `fingerprint` and `accepted.fingerprint` to the written item's content key (§3.8). `premise` and
   *  `completion` are due writes: the action that makes one due enqueues it, `recover()` enqueues every one still due,
   *  and each does nothing when, at its step 1, it is no longer due (§3.8, AF2). */
  | { kind: 'premise'; item: string }
  | { kind: 'completion'; item: string }
  /** The judge's whole outcome: planned inside the queue on the current records, dropped when the head is no longer
   *  `judged` (§2.6, F8). `queueSteps`: the steps of the queue it ends, if it ends one (reconcile's input, AF1). */
  | { kind: 'judge-apply'; judged: string; queueSteps?: string[] }
  /** Submit's take-out before its queue starts (§3.7, D2-57). */
  | { kind: 'submit-take-out'; items: string[] }
  /** The start of a queue of Claude steps in a stage (a mid-stage Formalize, Submit review, Retry step): its seal, its
   *  steps queued, and its first step's `step-start` commit and StepScope. It is the write queue's last write; after a
   *  crash the queue waits for Resume or Cancel step, as between two steps (§3.3, §3.11, AF3). */
  | { kind: 'queue-start'; by: SealBy; steps: string[] };
```

## 3. The session engine (runner; 2d–2f)

### 3.1 Invariants
- **One session is one run** (Appendix B): one run directory, one shadow, one Claude conversation (resumed with `--resume` after a reload; D2-22), one transcript.
  - RunState is unchanged: stages and the end confirmation are `review`; Apply ends in `accepted`, Exit in `discarded`.
  - So `runLocksBoard` and the host's ES-9 lock keep working as they are.
- **The base never moves (ES-7).**
  - The shadow's `base` commit is made once.
  - Nothing writes the user's files into the shadow: the D-21 rebase and `accept-base` go in 2f.
  - Every item is computed from B to the working copy.
- **The working copy (W).** Outside a running step, the head of ws/ is a state telelean judged, or `judging` is true (a judge, or a write in the session's queue, AF3).
  - When nothing is judging, ws/ = B + the content of every item that is in review (Add premise drafts excepted), accepted, declined Shaky, or to be redone without revert.
  - An Add premise enters ws/ only by its premise write, after its Accept (§3.8). A premise in review is always outside ws/, so every action that returns a written one to review takes it out; the one exception is an adopted ghost of a converted v1 run, written while in review (§3.11, AF12).
  - Rejected and plain-declined content is out, and so is what it took down.
  - So at the end, ws/ = B + the accepted items = F.
- **One inference per step (S).** A step proves one target, with its own statements fixed, its own gate and its own comparator run. Its gate judges every inference; RV-11's effect on the items comes when the queue ends (§3.5).
- **A queue runs to its end (Q, D2-63).** The start, a mid-stage Formalize, Submit review and Retry step each queue Claude steps. The stage opens when the last of them ends, or when a Cancel step or a failure drops the rest ("not run"). Until then the item records, the stage judgement (`judged`) and the view stay as they were when the queue started; the view is built from the judged commit's files and `judged-facts.json`, never from ws/ while a queue runs.
- **Decisions are the user's (D).** Statuses change in only two ways:
  - by the user's actions in a stage, with the cascades shown to them (a hidden Result's change shows when the results are shown, D2-64);
  - by the reconcile rules of §3.5 (telelean's changes, reported as events).

  While a step runs, the session takes no action (D2-62): the list is read-only, and Cancel step, answering Claude, Exit and looking stay. So telelean writes nothing into ws/ while Claude works except the step's own normalise and commits, and a rollback never goes behind its step's `step-start` commit, which comes after every decision and every session write: a queue starts as the write queue's last write (§2.6, AF3).
- **The baseline is B.** G0, new-axiom and "footprint since base" compare with B. Claude's content never counts as the user's.
- **Files change only at Apply.** Steps, decisions, judging, Submit and Exit never call `applyChanges`, `perform` or `invalidate`.

### 3.2 Starting a session, and Formalize during a stage
- **Start** (no session active):
  1. The host checks the request (core `formalizeStartProblems`, §4.12), asks egress consent, then calls `formalize`.
  2. The runner does preflight, the shadow and its `base` commit, the backend and the conversation, as today.
  3. It orders the inferences (`formalizeOrder`) and queues one `formalize` step per target, in that order.
  4. It sends the first turn, then runs the queue (§3.3). The first stage opens when the queue ends (§3.5).
- **During a stage (RV-9):**
  - Allowed only in phase `stage`, with no step running or queued, nothing being judged (no judge, and no write in the session's queue, AF3), and the results shown (D2-65): "The results are not shown yet: decide the statements, or show the results, first." So nothing the request is checked against, and nothing its steps start from, can show a hidden outcome.
  - The targets must be in the session's subject. The same start check runs, on the session's working copy: Claude's accepted arrows count as drawn, and arrows still in review are refused (D2-20). In a session it also refuses (§4.12):
    - a target with a Shaky item, and a source whose Result is Shaky or to be redone (D2-53);
    - a new target that is the source of Claude's arrow (not declined) into another target, unless the same request selects that arrow (D2-50). Selected, the arrow joins that target's question in a re-ask (below), and a later decline of it follows D2-59.
  - The runner runs the full check on its own records; the host's check only answers early. In one `queue-start` write (§2.6, AF3), it seals the session stack, adds the new inferences, queues one step per target (sources first), and drops `retry` (D2-44). The queue runs to its end, then its items join the current stage (D2-63).
  - **A re-asked target** (one already in the session; D2-46). The step carries the new question in its StepScope.
    - **It passed, gave up, or ran statements only (§3.3).** Its statement-phase content stays in ws/, as items, whatever the outcome.
      - With a proof, T's question is replaced and its Result gets a new version.
      - Without one, T.holds, the step's proof material, its arrows and its premise drafts go back to S₀ (a `revert` commit, ES-2), with their ledger entries (§3.4). T's old question and Result stay on the record, with their statuses.
      - While the results are hidden, T's InferenceView shows the question this step asked, and its Result is a neutral row, in both cases (§4.7). Once they are shown, the view shows the new version, or the old question and Result with the stage report's note "The new question for “‹T›” was not proved: your earlier result stands."
    - **It was cancelled or failed:** ws/ goes back to S₀ at once (D2-29). The old question and Result stand, and the step is in `retry`.
    - A target whose step never ended has no Result, and is asked as new.
  - No consent question: it continues the consented session.

### 3.3 A step
1. **Its start.** The head is a judged state: a queue in a stage starts only when no judge runs and the write queue is empty, and its seal and first `step-start` commit are themselves the write queue's last write (`queue-start`, §2.6, AF3); each step ends on a state its gate judged (§3.4).
2. Commit `step-start` (S₀) and record the step's StepScope on it (PersistedStep, §2.6), in the same run.json write:
   - a `formalize` step:
     - `fuzzyStatements`: the cards at either end of a selected arrow whose Lean statement is empty at S₀;
     - `openProof`: true;
     - `openArrows`: true, unless the question is the mark;
     - `openItems`: empty;
   - a `submit` step: as a formalize step for its inference, but:
     - `openItems` holds the keys of its Shaky and to-be-redone items (after Submit's take-out, §3.7);
     - `openProof` is true only if its Result is Shaky or to be redone.
3. **A12: statements only (D2-4).** A source of the question may be an earlier target of the same queue that has no `.holds` at S₀. The step still runs, but only formalises (`scope.statementsOnly`: that source):
   - its turn starts `Step <i> of <n>: formalize the statements of “<target id>” (no proof: “<source id>” was not proved)`, and asks Claude to formalise the statements, call freeze_statements, and finish not_proved naming that source, with no proof attempt;
   - `openProof` and `openArrows` are false, so the gate-other rules hold (T.holds stays as at S₀). propose_arrow and propose_assumption answer "This step only formalises the statements: “‹L›” was not proved.";
   - its Result reads not proved, "“‹L›” was not proved";
   - an ended statements-only step is not retried: to try the target again once L is proved, Formalize it again (★D7, A12). A cancelled or failed one goes to `retry` like any step, and Retry step decides its mode again at its new S₀ (F3).

   So the statement items exist whether or not L was proved, and only the step's duration differs (§4.7's residuals). The mode is never in a view.
4. **The round.** Send the step turn; today's round runs inside the step:
   - Claude works with check_lean, freeze_statements (the step's target only), propose_arrow, propose_assumption and finish;
   - normalise: pins for the scope's cards, and this step's ledger arrows written into the target's `premises:`;
   - the gate: `judgeState` with the step's purpose, scope and S₀, with up to `maxGateAttempts` attempts.
5. **At the gate,** B.1's permitted set is recomputed on the gated state, with E(T). If it differs from the freeze's, the engine exports a new challenge before the comparator: a new FreezeRecord in the same step, with the statements still fixed (D2-19).
   - The new challenge is built from the step's freeze commit (its `frozen/<n>` copy, whose sources are kept; only its `.lake` is rebuilt), changing only `permittedAxioms`. It is never built from `build/`, which holds the gated state: a challenge exported from that state would already contain a definition changed after the freeze, and G4's `comparator-definition-mismatch` could no longer catch it.
6. **Every inference** is judged at the gate. Findings about other inferences never count against Claude; their effect on the items comes once, when the queue ends (§3.5).

### 3.4 How a step ends

| Outcome | When | Working copy | Its Result | Queue |
|---|---|---|---|---|
| passed | the gate passed (proved, not proved, insufficient, inconsistent) | the gate-pass commit | from the working copy | next step |
| gave up | 3 failed gate attempts, or no finish twice | rolled back to `lastCommitSince(S₀, [gate-pass, freeze, step-start])`, then normalised and judged | not proved: "Claude's step did not finish" | next step |
| statements only | A12 (§3.3); it ends `passed` (or gave up, as above) | the gate-pass commit, with statements only | not proved: "“‹L›” was not proved" | next step |
| cancelled / failed | Cancel step (of a running or an interrupted step); a turn, check or time cap; an environment or backend failure | back to S₀ (a `revert` commit) (D2-29); the step's premise drafts are dropped (AF10) | none for this step | ends: the rest of the queue becomes `not-run`; this step and those go to `retry` (in either mode); the stage opens |
| interrupted | a reload or crash during the step | as it was | — | waits for Resume or Cancel step (D2-55) |

A re-asked target (§3.2) differs: a step that ends without a proof keeps its statement-phase content, takes its proof material, arrows and premise drafts back to S₀, and leaves the old question and Result standing on the record. The view shows neither outcome while the results are hidden.

- **When a step ends** (passed or gave up), the run.json write that records it adds ledger `created` entries for every declaration new since S₀ that is still in ws/: `statements` if it is in the step's freeze commit, `proof` otherwise (D2-43). They fix each declaration's owner for the session (§4.2). It also sets `head` to the step's last commit. A card's statement, its `.holds` and its pins stay that card's content whatever their entry says (§4.2, §4.7), and the gate refuses a finish that leaves a card's statement using what its step wrote while that reads `proof`: without a freeze, the step must call `freeze_statements` first (§4.9, fixer 2c1 r2, R1-1).
- **The ledger follows every rollback:** a give-up, Cancel step, a cap, a failure, and a re-ask that ends without a proof. The run.json write that records the rollback also drops the step's ledger `arrow` and `created` entries for the content it takes out: for a rollback to a commit, those made after that commit. So B.3 (§4.9) never meets a ledger arrow that is no longer in ws/. The take-back happens before reconcile (§3.5), so what it removed never becomes an item.
- **So do the step's premise drafts** (AF10). When a step is cancelled or fails (Cancel step, a cap, a failure, a re-ask's included), the run.json write that records its rollback also drops every premise draft the step proposed; a re-ask that ends without a proof drops them too (§3.2). A give-up keeps them: the step ended, and its drafts belong to its Result. And computeItems makes a premise item only for a draft whose target is in `ended` (§4.2), so no premise item can belong to a Result that does not exist.
- **The queue's end** (D2-63). When the last step ends, or a Cancel step or a failure ends the queue, the head is judged and reconciled (§3.5), and the stage opens.
- **"Did not pass" (ES-4).** The heading "Claude's step did not pass: ‹reason›" appears when a step fails and no passing state at or after the latest decision exists: S₀ itself did not pass its judgement. Accept is then disabled until a later step passes; Decline, Formalize and Exit stay.
- **Cancelled or failed.** The stage is headed "Step cancelled" or "Step failed: ‹reason›", with Retry step; the steps the queue did not run read "not run". The session's first step leaves an empty stage with Retry step and Exit session. A step never ends the session.
- **Retry step** (enabled in phase `stage` when `retry` is not empty and nothing is being judged, a write in the queue included, AF3) seals the stack and moves `retry` back to `queue` in one `queue-start` write, so the queue runs again from the cancelled or failed step, with fresh caps; each step decides its mode at its own S₀. Each step has the full caps, as each round has today. The queue runs to its end, and its items join the stage.
- **An inference whose step never ended** has no Result item. Submit review drops it, and the end confirmation lists it as "not run" (D2-44).
- **A step that proposes nothing** (RV-13) passes with no new items. Its report line, "Claude's step proposed nothing: ‹Claude's reason›", is shown with the results.

### 3.5 Reconcile: when a queue ends, and after every judge
`reconcile` (core, §2.9) applies a stage judgement to the records. It runs inside the write queue as the `judge-apply` write (§2.6): once when a queue ends, and after every judge that a decision started (§3.6).
1. **The judgement.** `engine.judge` builds the head and runs `judgeState('stage')` over every inference; when a queue ends, the last gate's facts are reused if nothing changed ws/ since. It also checks again the premise drafts that need it (§3.8).
2. **The records** are reconciled with the judgement's drafts (`computeItems`, §4.2), which include a Result for every inference whose step ended (F9):
   - **Premise items** come from `PersistedSession.premises`, by the key `premise:<T>:<leanName>`, like the other drafts; a draft's content key is §4.3's draft key. Once a premise is accepted and written, its item is computed from ws/ (its card, arrow and mark removal, through the ledger), and its draft stays as its record's content. The ledger's `premise` entry names the item by its key, so the key stays the draft's whatever Lean name and card id adoption chose. Its content key is then the written item's, which the premise write recorded as accepted (§3.8), so reconcile finds no change. When a later step for T ends with a new Result version, T's drafts from earlier steps that are not accepted are withdrawn (D2-17).
     - A draft stays in `premises` while its item exists, written or not; it leaves only when its item is withdrawn, or when its step is rolled back (§3.4, AF10).
     - When a written premise is taken out (§3.8), its item is computed from its draft again, and the take-out has set the record's key back to the draft's, so reconcile finds no change there either (AF1).
   - **a new key:** a new record, in review, rev 1, with its id from the run id and the key (§2.2, AF7), and `origin` and `partOf` from its draft, never changed later (§4.2);
   - **a Shaky or to-be-redone item with a draft, in an inference whose Submit step ended in the queue that just ended** (F5; `queueSteps`, so only when a queue ends, never at a judge that a decision started, which would undo a later Reject or revert, AF1): back to in review, with `redo` cleared (so no longer reverted) and its decline dropped. It is marked "updated" only when its content key changed (the old version goes into `versions`, rev + 1), and "no alternative found" when that step's finish said `no_alternative`. This rule comes before the rules below, so a set that came back unchanged can be accepted, and the next Submit review does not ask Claude about it again;
   - **a declined or reverted record whose draft is B's version** (AF1): a record declined by Reject or a plain decline, or to be redone with `redo.reverted`, keeps its status, key and rev when its draft is marked `asInBase` (§4.2). Such a draft exists only because its step ended (F9); the decline or the revert put B's version back, which is no new proposal. So the changed-key and RV-11 rules below never apply to it: a rejected Result stays rejected and can still be un-rejected, and a Result taken out to be redone (by a Reject or DO-0 cascade, or by the judge) stays so until its Submit step reworks it (the rule above). A draft that differs from B's version is a new proposal, and the changed-key rule applies (DO-1's reworded repeat; the rejected version stays under "Rejected in this session"). *(Fixer 2a, V2A-C2: only when a queue ends, and never for an exact repeat of a rejected version; otherwise the record keeps its decision and the write takes the content out again, §8.)*;
   - **the same key and content key:** unchanged, but for its content, which reconcile refreshes from the draft (fixer 2a, V2A-C1: a premise a later step proposed again, a declaration whose text changed only in whitespace; §8);
   - **a changed content key:**
     - the old version goes into `versions`; rev + 1; the item is in review again, marked "updated";
     - if it was accepted, it leaves accepted together with its accepted dependents (RV-5), each marked "updated". There is no confirmation, because the change is not the user's; an event says so, naming no Result or Result's part while the results are hidden;
   - **a Result whose verdict, "rests on" or dependencies changed** (RV-11): the same as a changed content key; compared with the record's `judged`, for a Result in review or accepted (fixer 2a, V2A-S1);
   - **a record with no draft:**
     - expected when it is declined (Reject, plain) or to be redone with its content removed;
     - `withdrawn` when it was Shaky or to be redone and a Submit step removed its content (D2-17);
     - otherwise the stage gets the problem "“‹item›” disappeared, and no decision removed it", and Apply is disabled (fail closed). A Result always has a draft once its step ended (§4.2), so this never applies to a Result that was not proved;
   - **RV-3:** a new or updated item in review that depends on an item that is Shaky or to be redone becomes to be redone at once, not reverted, as if that decision had just been made (A1);
   - **RV-7:** the classes in force are recomputed (§4.1: `classes` while the results are shown, `classesBeforeReveal` while they are hidden). An accepted item whose badges grew returns to in review with the new badge, together with its accepted dependents (D2-23);
   - **RV-5, defensively:** an accepted item with a dependency outside its SCC that is not accepted returns to in review;
   - **premise re-checks** (§3.8): a draft that no longer closes the gap becomes to be redone, marked "no longer closes the gap", and its facts are replaced;
   - **a state that does not build, or an inference that fails** B.1, B.2 or its footprint: the items the judge makes to be redone and takes out (§3.6) are `reverts`, the write's ws/ part.
3. **The reveal** (§4.7). A statement or belief item that became undecided here (§4.7: new, or back in review, or to be redone with its content in ws/ after a decided status, AF4) ends Show results' force, and so does a Result that RV-11 returned to review ("with its result hidden again"). Every queue's end ends it too, the user's force and telelean's `decided` one alike, whatever changed (fixer 2c2 r1, C-V2C2-C1: otherwise a re-ask that proves its target, whose new Result version ends the force, would hide the stage, and one that does not would leave it shown, before the meaning items are decided); ADV-1's `decided` rule then applies as at any judge. While the results are forced and a statement or belief item is undecided, every Result gets the seen-early marker.
4. **Publish.** When a queue ended, the phase becomes `stage`: the stage number rises by one when the queue came from the start or from Submit review; a mid-stage Formalize or a Retry keeps it. `viewVersion` rises whenever the visible view changed (F17).

### 3.6 Decisions on the working copy, and judging
- **Only in a stage** (D2-62). While a step runs or is interrupted, decisions, Show results, Undo, Redo, moves, Submit review and Retry step are refused: "Claude's step is running: you can review when it ends." This departs slightly from RV-3 ("at any time") and from RV-6's Show result. Cancel step, answering Claude's questions, Exit and looking stay.
- **Reject and plain decline** (D2-28):
  - the reducer's outcome lists the item and every item that depends on it, transitively, that is in review, to be redone, or declined Shaky (a Shaky dependent's content rests on what goes);
  - `planItemRevert` (§4.11) restores B's version of all their content;
  - telelean writes the files into the shadow, as one `decision` commit per user action;
  - the dependents become to be redone, with `reverted: true`.

  The dependencies are the real ones (§4.5), Results included, also while the results are hidden. A hidden Result changes silently, and its new status shows when the results are shown (D2-64).
- **Shaky:** nothing leaves ws/. Dependents in review become to be redone, transitively, with `reverted: false`. A Shaky Result, like one to be redone without revert, still counts for the inferences that use it (B.1, §4.8), so nothing downstream fails because of the decline (D2-48).
- **Accepted dependents** (RV-5): first `needs-confirmation`, with the list. Sending again with `confirmed` applies the change; Cancel sends nothing. The dialog says what happens to them:
  - Reject or a plain decline: "These accepted items lose their Accept and are taken out to be redone: …";
  - Shaky: "These accepted items lose their Accept and will be redone: …";
  - back to review: "These accepted items return to review with it: …".

  **While the results are hidden** (D2-64), no Result is listed. Instead, every action that takes an Accept away, from a decided item or from a listed dependent, asks first, even with nothing to list, and the dialog adds: "The results are hidden now: a result you accepted that rests on these loses its Accept too. You will see it when the results are shown." The trigger reads only listed statuses, so it tells nothing about a Result.
- **Judging (RV-11):**
  - after every decision commit, `engine.judge` builds the head and runs `judgeState('stage')`; its outcome is applied by a `judge-apply` write (§2.6, §3.5);
  - one judge at a time (`runExclusive`, with the memory guard), coalesced: decisions made meanwhile run it again on the newest head;
  - **judging** means that a judge runs or is due, or that the session's write queue holds a write, queued or running: a decision's, a take-out, a premise write or a completion (AF3). While judging, Submit review, Apply (and its confirmation), Formalize and Retry wait, showing "Re-checking the working copy…". Accept, Decline, back to review, Undo, Redo and Show results stay allowed (D2-27): their writes join the session's one write queue (§2.6), never beside another write.
- **A judged state that does not build:**
  - the errors are mapped to the items owning the failing declarations; those items become to be redone (reverted, marked "no longer builds"), and the state is judged again, at most once per item. The reverts are the `judge-apply` write's ws/ part; the write is dropped when a decision moved the head since the judged commit, and the judge then runs again (§2.6);
  - a judged inference that fails B.1, B.2 or its footprint makes its Result to be redone (reverted), the same way. A Result that is Shaky, or to be redone without revert, is left as it is: its Submit step reworks it (D2-48);
  - if B plus the accepted items still fail, the stage gets the "did not pass" heading (Accept disabled; Exit allowed).
- **Un-reject:** the decision commit's inverse patch is merged onto the head (`proposal/files.ts mergeFile`). The item's current key leaves `rejectedFingerprints`, an arrow item's arrow leaves `rejectedArrows`, and the stack action records both (F4). The dependents that commit took out come back with it, as to be redone without revert (D2-60); what the merge brings back that must stay out is taken out again after it (`ItemWrite.revert`, fixer 2a, V2A-C2). Un-reject of an Add premise merges nothing: in review, a premise is outside ws/ (§3.1), so only its status and its key in `rejectedFingerprints` change, and the dependents its decline took out stay to be redone, since their content needs the written premise (AF2). It is refused in three cases:
  - Claude has proposed a newer version: "Claude proposed a newer version: review that one.";
  - the merge conflicts: "This version can't be restored any more: ‹file›.";
  - a Result or a Result's part while the results are hidden: "The results are not shown yet: show them first." Such items are not listed then (F10).
- **Undo and Redo** (UN-4–UN-6), each the same as doing the action by hand, under the same rules (D2-73):
  - Undo is the inverse action, through the same reducer and the same commits, so it gets the same RV-5 list. It restores every effect its action recorded (§2.2): statuses, declines and Accepts (with `holdAs` and Why), rejected keys and versions, `rejectedArrows`, question changes (D2-59), a force the action ended, and the written premises its write took out (their card, key and ledger entries, AF2). The reducer first checks the restored statuses against the current state (RV-5's dependencies, RV-7's own Accept, D2-8, the "did not pass" heading): when a judge has changed what they rest on since, the Undo is refused with the rule's text (AF13).
  - Redo sends the action's recorded request again through `reduceReview`, on the current state, never a recorded state: a decision that the rules now refuse refuses the Redo with the rule's text, and an item whose rev changed gives `conflict` (AF13).
  - Undo of an Add premise's Accept is a back to review by hand: a written premise is taken out (§3.8). Its Redo accepts it again, and its premise write runs again.
  - Any new action, a seal included, clears Redo (`undone`), so a Redo never crosses Claude's step (AF13).
  - A seal stops Undo: "Undo stops at Claude's step: it has already acted on what came before. To change an earlier decision, set the item's status directly."
  - `sessionUndo` and `sessionRedo` name the id of the action they expect (SessionAction.id); a different top of the stack gives `conflict`.

### 3.7 Submit review (RV-12)
- **Enabled** when no listed item is in review, the results are shown, no step runs or is queued, and nothing is being judged (no judge, and no write in the session's queue, AF3). Every Result is then listed with its real status.
  - A statement or belief item to be redone with its content kept is undecided, so it keeps the results hidden (§4.7, AF4), though it does not block Submit itself (RV-3). Submit's gate then reads "The results are not shown yet: decide these statements to be redone (declined as Shaky, Claude redoes them), or show the results, first.", with those items as `missing`.
- **The plan** is core's `planSubmit` (§2.9), which the view's `submit` counts use too.
- **Every item accepted or rejected** (nothing Shaky, nothing to be redone): phase `confirming` (§3.10), with no Claude step and no seal (D2-54).
  - Here Submit's gate also refuses a cycle whose members are partly accepted (an SCC with an accepted member must be wholly accepted, §4.5): "Accept or reject all of ‹items› together."
- **Otherwise** (D2-2): Submit seals the stack (UN-5) and drops `retry` (D2-44), in the `queue-start` write that follows its take-out (§2.6, AF3). The affected inferences are the origins of the Shaky and to-be-redone items, plus the targets of Shaky or to-be-redone Results.
  - **Take-out first** (D2-57). A Shaky or to-be-redone item whose content is still in ws/ may depend, directly or transitively, on an item that another step of the queue opens (RV-5). That other step may change what the item rests on, but its limits keep the item fixed, so the item would stop building there, counted against Claude. So, before the queue starts, Submit takes every such item out, in one `decision` commit (a `submit-take-out` write, §2.6):
    - it becomes to be redone, reverted, and the feedback turn says which item's rework took it out;
    - a Shaky one keeps its decline and note: it is still quoted under SHAKY, and still counts in its inference's DO-3 set;
    - its own step proposes it again.
  - One `submit` step per affected inference, in the same conversation. A step whose open items others depend on runs before those others (RV-5 order over the open items); then sources first, ties by reading order.
  - The queue runs to its end (D2-63), and the stage number rises when it ends.
- **The feedback turn** is generated from the statuses, with the items' labels and Lean texts:
  - ACCEPTED: keep them exactly as they are;
  - REJECTED: they were removed; never propose these exact versions again;
  - SHAKY: propose a different arrangement for these together, with the person's notes; any single item may come back unchanged, but not the whole set; if there is none, finish with `no_alternative: true`;
  - TO BE REDONE: what each relied on;
  - STEPS PLANNED: the targets in order.
- **At each Submit step's gate:**
  - an exact repeat of a rejected version is `rejected-repeat` (`rejected`);
  - a Shaky set of this inference that comes back identical (kinds, sentences, Lean statements and arrows, with whitespace collapsed) is `rejected-repeat` (`shaky-identical`), unless the finish says `no_alternative`. Reconcile then returns the set to review, marked "no alternative found" (§3.5).
- **A Shaky step re-proposes content only:** no new cards, no splits, no merges (D2-15).

### 3.8 Add premise items (RV-1; 2f)
- **Proposing.** `propose_assumption` runs after the statements are fixed, as today, with three changes to its check:
  - it uses B.1's permitted set with E(T);
  - B.2's allowed set is the sources of Q(T) ∪ E(T), T's written premises included, plus the suggestion;
  - it also renders the statement's fully explicit form.

  An exact repeat of a rejected premise (the same draft key, §4.3) is refused. The draft becomes item `premise:<T>:<leanName>`, part of T's Result, hidden while the results are (§4.7). Its scratch facts are kept on the draft (`PremiseDraft.facts`), so its statement's reach and its item's dependencies survive a reload (F12).
- **Checked again** (RV-1: "re-checks whenever something it relies on changes"). `engine.judge` checks again, in the scratch file, each draft not written yet, under the same rules (E(T) and B.2 included), when something changed in its footprint, its statement's closure or T's statement (`StateJudgement.premiseChecks`). *(Fixer 2b3b r1, §8: also in what its gap proof uses and what all of these reach; a draft nothing of which changed gets its last check's outcome again, and a check telelean could not run or judge leaves the draft out, never "no longer closes the gap".)*
  - If it no longer closes the gap, reconcile makes it to be redone, marked "no longer closes the gap", and replaces its facts (§3.5).
  - While the results are hidden, the change shows only when they are shown.
- **Accept** is the item's own Accept (a belief item), possible only while the results are shown. It asks how the user holds the premise (`holdAs`), with an optional one-line Why. Both are kept in the record's `accepted` (§2.2), so the write and its replay after a crash read them there, never a default; a Redo sends them again from its recorded request (AF13):
  - as an axiom: an AXIOM card;
  - as a proposition pending proof: a PROPOSITION card with `axiom P.holds`, never green (A26).

  telelean writes it right after the Accept, through the write queue (a `premise` write, §2.6; due writes, below). Core `planGhostAdoption`, extended with `holdAs`, writes the card in Claude's words, its arrow into T, and the removal of T's "follows from nothing" mark. That is an `adopt` commit, with ledger entries `premise` (and `mark-removed`).

  An Add premise that is already written when it is accepted (an adopted ghost of a converted v1 run, §3.11) is accepted only as an axiom, since its card is an AXIOM card, and nothing is written again; `holdAs: 'pending'` is refused with "“‹sentence›” is already written as an axiom card: accept it as an axiom, or decline it." (AF12).
- **Meaning in place, and the written item's key** (F11). The write's Lean job is `engine.writePremise` (§2.9): it normalises, builds, renders P's fully explicit form where it was written, and judges the state.
  - On a mismatch, the write is taken back out (ws/ returns to the write's parent), and the item returns to review, marked "meaning differs in place".
  - When the judgement's facts have a failed probe (§2.1), the write fails like a Lean environment failure (AP30-4): it is taken back out (ws/ returns to the write's parent), the item stays accepted and its write due, and the stage gets the problem of a write that could not be made (below), its ‹error› `probeFailure`'s sentence without its final period; once what caused it is declined, a reload runs the due write again. So step 4 never reads a partial judgement: a `factsMissing` draft's key lacks the constants (§4.3), and recording it as accepted would make the premise read as changed once the probe works again.
  - When it matches, the write's step 4 sets the record's `fingerprint` and `accepted.fingerprint` to the written item's content key from that judgement, keeps the draft's key in `versions` (same rev, no "updated" marker), and stores the judgement as `judged`. The written block carries more than the draft did (`asserted`, `session`, the Why, the card id and Lean name adoption chose), so its key differs from the draft's (§4.3). This is safe: telelean wrote exactly the accepted draft, and the render checked it. So reconcile sees no change, the item stays accepted, and the backstop compares F with what was written.
- **Completion** (no Claude), when T is not proved. It is a `completion` write, never a step (F15):
  - telelean writes `theorem T.holds : T := (<checked gap proof>) P.holds`;
  - `engine.complete` normalises it, freezes again from the `adopt` commit (after `statement-changed` passes against T's last freeze snapshot; fixer 2b3b r1, §8: from the state the completion is written on, which holds the written premise, the `adopt` commit or a later one after a crash replay or a decision), and gates it as `gate-proved` with that new freeze's challenge: build, footprint, statements fixed, B.2, comparator (F11). The old freeze's challenge would lack P.holds, which is now an export target. It is recorded as a `completion` commit and ledger entry;
  - passed: T's Result returns to in review, marked "updated";
  - failed: the completion is taken back out (ws/ returns to the write's parent, the head the completion was written on: the `adopt` commit when it runs right after its premise write; as a `revert` commit; builder 2d, carry-over R1-2), so the head is again a state that passes. The premise stays accepted. The Result is marked "completion not checked", with Lean's message, and Retry step is offered: a `submit` step for T with `openProof`, put in `retry` (D2-56). It never reads as proved.
- **A second accepted premise** for an already proved T is written and marked "unused premise".
- **Due writes, and recovery** (D2-71). The Accept is a records-only write, and the premise write and the completion follow it in the write queue, each with its own `inFlight`. So both follow from the records:
  - a premise write is due for an accepted Add premise with no ledger `premise` entry;
  - a completion is due for an accepted, written premise whose target is not proved in the stage judgement, with no ledger `completion` entry for it and no "completion not checked" marker on T's Result.

  The action that makes one due enqueues it: an Accept (or an Undo or Redo that accepts a premise again) its premise write, and the premise write's step 4 its completion, next in the queue, ahead of any write queued meanwhile, so that the completion this step 4 enqueues starts from the `adopt` commit (one that becomes due later, after a decision or a crash replay, starts from the head it is written on: §2.9's note; builder 2d, carry-over R1-2). `recover()` enqueues every one still due, before anything else and completions first, once it has finished `inFlight` and computed the stage judgement (§3.11), so a crash between the Accept, the write and the completion loses nothing. Each due write checks at its step 1 that it is still due, and otherwise does nothing (a premise declined or already written meanwhile, a T proved meanwhile). A write that fails for another reason than a meaning mismatch (a Lean environment failure, a failed run.json write) leaves the stage the problem "“‹item›” was accepted, but telelean could not write it: ‹error›. Reload the window to try again, or decline it." In every case, the final check and the backstop refuse an accepted Add premise that is not written in F (§3.10, §4.10).
- **Taking a written premise out** (D2-71). A written premise stays in ws/ while it is accepted, declined Shaky, or to be redone without revert. Every action that gives it another status (a Reject, a cascade, back to review, the Undo of its Accept) takes it out in its own write, planned when that write starts (§2.6); so does the `judge-apply` write when reconcile returns it to review (reconcile lists it in `reverts`). In that write:
  - `planItemRevert` removes the card, its arrow and the mark removal, and the completion with them (§4.11);
  - the ledger's `premise`, `mark-removed` and `completion` entries for its key are dropped, so B.3 and ownership expect none of it; the stack action records them, with the card and the written key, so Undo puts them back with the files (§2.2);
  - (fixer 2b2 r1) when another written premise's arrow into the same card stays, `planItemRevert` leaves the mark removed, so the write moves the dropped `mark-removed` to that premise (the first written of them, in ledger order) instead, and Undo restores both; otherwise the follows_from removal would read as unowned;
  - the record's `card` is cleared and its `fingerprint` is the draft key again, so reconcile computes the item from its draft and finds no change (§3.5, AF1).

  A decline also makes T's Result to be redone, since it depends on the premise (RV-5), and takes it out with the rest (§3.6). Back to review returns T's accepted Result to review with it (RV-5's list); without the completion, the Result is then marked "updated". Un-reject of a premise merges nothing (§3.6).

### 3.9 Drift (ES-7; 2f)
- The session layer watches for changes:
  - it subscribes to `ModelWorkspace.onDidChange` (typing, saves, file-watcher and git events), debounced by 300 ms;
  - it also checks once after recovery, and right before Apply.

  Each time, it computes `baseDrift`, with open buffers first, so unsaved edits count.
- A change is persisted, with the time it was first seen (`drift.at`, AF9), and published. While drift is not empty:
  - Apply is disabled, with the drift text (§5.8);
  - steps go on;
  - nothing is merged, and the base commit is never rewritten.

### 3.10 The end (EN-1–EN-4; 2f)
1. **Opening.** Submit review with every item decided gives phase `confirming`, with the check `running`. `checkId` is a hash of F's files key and the item statuses.
2. **`engine.finalCheck(F)`:**
   - drift: listed, and it blocks Apply;
   - facts of exactly F: the judged facts when `judged.filesKey` equals F's and `judged.ok`; otherwise a fresh build;
   - `judgeState('final')` over every inference, plus B.2 for every proposition whose `.holds` or Dependencies differ between B and F;
   - the comparator for every proved inference on F's permitted set. A recorded pass is reused only for the same files key and the same permitted set (EN-2);
   - the items recomputed on F equal the accepted records (content key = accepted key; for a Result, also its verdict and Rests on), and nothing else differs;
   - every accepted Add premise is written in F: a ledger `premise` entry for its key, and its card in F. An unwritten draft keeps its draft key, which equals its accepted key, so the rule above alone would not see it (AF2);
   - the backstop (§4.10).
3. **After the check:**
   - passed: Apply is enabled, unless there is drift;
   - failed: the failures are listed, and Apply stays disabled.

   Back to review returns to the submitted stage, unsubmitted, with the session stack as it was before Submit (EN-2: "with nothing changed"; D2-54).
4. **Apply** (`endSession apply`, with the check id):
   - the check passed for the same id: no status or ws/ change since;
   - drift is checked again, and the backstop runs again (pure, never reused);
   - `planApply` is planAccept's no-merge path: exactly F (fixer 2b3b r1: the files of the commit the passed final check judged, which the caller passes). Real files that differ from B are refused, with `plan.drift` authoritative;
   - `apply` with M2's history kind `accept-proposal` (D2-67) and the label "Apply: Formalize for dependencies → ‹targets›" makes one history entry and one Undo step (UN-2). It includes `endorsements.json` and the layout positions of the cards moved on the Proposed view, which `applyChanges` accepts as the subject's two sidecars (§2.6);
   - the attempt records are written, with resolution accepted. **Provenance (§14 item 2 bullet 1: "History records where they came from"; coverage audit G1, AP-29):** the accepted-resolution record gains an optional `arrows?: { source: string; target: string; step: string; kind: 'arrow' | 'premise' }[]`, one entry for each accepted Add arrow and each accepted Add premise's arrow, with the step that proposed it. The attempt records live in the model folder's telelean data, so they outlive the run directory, which `pruneRunDirs` deletes. History's entry for the Apply shows them under "Arrows from Claude" (a line each: "‹source› → ‹target› (step ‹n›)"). An old record without `arrows` reads as none;
   - the run ends `accepted`, the stack is discarded, and the board unlocks.
5. **Nothing accepted:** no file changes, no history entry, no Undo step; the records are still written (D2-39).
6. **Exit**, after the board's confirmation (D2-36):
   - it stops a running step;
   - it writes the attempt records, with resolution discarded;
   - it ends the run `discarded`.

   The files are untouched, and decisions.json keeps the answers (EN-4).
7. **A reload during Apply:** the real files are compared with F (then it finishes as applied) and with B (then it goes back to confirming). Anything else gives a notice and drift. Nothing is re-applied blindly.

### 3.11 Reload (ES-6) and old runs
- **`recover()` reads run.json v2:**
  - outside a running step, it first finishes the write in flight: ws/ back to `head`, then `inFlight` again (§2.6);
  - it then computes the stage judgement again (below) and, in a stage, enqueues the premise writes and completions that are due (§3.8, AF2);
  - a step that was working or at the gate becomes interrupted. Resume uses `--resume` and the resume turn, never starts by itself, and the queue goes on after it. Cancel step ends it as cancelled: back to its S₀, the rest of the queue not run, and the stage opens (D2-55);
  - a queue found between two steps (a crash after one step ended), or right after its `queue-start` write (AF3), waits the same way: Resume starts the next step, and Cancel step drops the rest and opens the stage;
  - a judge that was running runs again;
  - a confirmation comes back, and its check runs again if it was running.
- **The stage judgement is not persisted** (D2-72, AF9). `recover()` computes it again, in every phase that has one, with `judgeState('stage')`, which is pure, on the judged commit's files with `judged-facts.json`, B and the records; that needs no Lean job. In a stage it then applies it through a `judge-apply` write, which changes nothing when nothing differs. During a queue and in `confirming` the records stay as they are (D2-63), and the judgement only feeds the view. When `judged-facts.json` does not match `judged.filesKey` (a crash between their writes), or, in a stage, the head has moved past `judged.commit` (a decision whose judge had not ended), the judge runs instead, with a build.
- **A v1 run in review is converted** (D2-16) into a session with one passed step:
  - its selection becomes the inference;
  - the ledger is written from the v1 run: `created` for every declaration new since B (its phase taken from the v1 freeze commit), and `premise` and `mark-removed` for adopted ghosts;
  - items are computed from its B to its ws/. Its pending ghosts become Add premise drafts, checked again as drafts (with E(T) and B.2), which gives them their facts;
  - an adopted ghost ("I hold this") becomes an Add premise item that is already written: its draft rebuilt from the v1 ghost, its `card` set, and its key the written item's, from the fresh judge. It is the one item in review whose content is in ws/ (§3.1). Its Accept offers only "as an axiom", since v1 wrote an AXIOM card, and writes nothing again; a decline takes it out, and so does back to review after its Accept (§3.8). It is not converted as accepted: its statement may rest on vocabulary still in review, and RV-5's defensive rule would send it back at once (D2-16, AF12);
  - a fresh judge runs, so the facts gain `typeConsts`;
  - everything else is in review, at stage 1, and its proposal is not used again.

  If the conversion fails, only Exit is offered.

### 3.12 The RunView of a session (2d)
- The runner sets `session`, `inferences` and `step` (with `statementsFixed`).
- `inferences`, `target` and `premises` follow the InferenceView's question rule (§2.3): while the results are hidden, each target's premises are the sources of the question its latest ended step asked, whether or not that step proved it. The runner fills them from the SessionView's InferenceViews, so the two never differ (AF5).
- `verdict` is never a proof outcome.
- `activity` and `notices` are empty arrays (M2's validator requires both), and gate attempts are left out, while a step runs and while the results are hidden (D2-10, AF9).
- `ghosts` stays empty. `frozen` is left out: its permitted summary lists what each source contributes, which tells earlier outcomes; `step.statementsFixed` says what the panel needs (D2-68).
- While a step runs, the run panel shows only telelean's progress ("Claude is working on “‹T›” (step 2 of 3): 14 tool calls · 3 checks") and Claude's questions. Progress ticks reach the webview through `run` only; `session` is posted only when the session changes (§2.4).
- **Renderings** (the pretty and fully explicit forms of statements) run as one scratch Lean job after each queue and each judge. They cover only the statement items whose content key is new, and are cached by content key in `renderings.json`. Results need none.

### 3.13 States
```
formalize ──▶ queue of steps ──(the last step ends)──▶ stage ──decide / reveal / undo──▶ stage   (decision commit → judging → stage)
step: working ⇄ waiting-for-answer ⇄ gate → passed (statements only too) | gave up (rollback ≥ S₀) ──▶ the queue's next step
step ──Cancel step / cap / failure──▶ stage (back to S₀; the rest of the queue not run; heading; Retry)
stage ──formalize (RV-9; results shown)──▶ queue ──▶ the same stage
stage ──Retry step──▶ queue ──▶ the same stage
stage ──submitReview──▶ every item accepted or rejected ? confirming : queue of Submit steps ──▶ stage + 1
confirming ──finalCheck──▶ passed ──Apply──▶ applying ──▶ ended (accepted)
confirming ──Back to review──▶ stage
any phase ──Exit (confirmed)──▶ ended (discarded)
step ──reload──▶ interrupted ──Resume──▶ step (the queue goes on)
interrupted ──Cancel step──▶ stage (step cancelled, back to S₀; the rest not run; Retry)
```

## 4. Items, statuses and checks (core; 2a1–2c2)

### 4.1 Elaborated closures (2a1)
- **`constsOf(f, mode)`:**
  - `meaning` (statement closures):
    - a theorem, a Prop-valued declaration, an axiom or an opaque: its typeConsts;
    - a def, abbrev, data instance or other: typeConsts ∪ valueConsts;
    - an inductive, structure or class: typeConsts, constructors included;
  - `uses` (item dependencies, proofs): typeConsts ∪ valueConsts, for every kind;
  - undefined when an array is missing.
- **`reach(model, start, mode, stopAt?)`** gives `{ names, complete, missing }`: a breadth-first walk from several sources, memoised per model.
- **`statementReach(model, drafts)` = R_stmt:** the meaning closure of every card statement of every subject.
  - It goes through other statements, definitions, lemma types and instances; a `.holds` counts by its type only.
  - It may also include the statements of Add premise drafts, from their facts (`PremiseDraft.facts`). `by` records which cards' statements, and which drafts, reach each name.
  - **Two class maps** (D2-42), both computed on every judged state: `classes`, with every premise draft in R_stmt, in force while the results are shown; and `classesBeforeReveal`, with none, in force while they are hidden. A draft is part of its Result, so it never changes a listed item while the results are hidden. The reveal rule reads only `classesBeforeReveal`, so showing the results never changes what they wait for (§4.7). When the results are shown, `classes` takes over, and D2-23 returns any accepted item whose badge grew; the action that shows them does this itself (§4.6), since an Accept starts no judge. Such an item is not a statement item, and is not a belief item without the drafts, so its return never hides the results again (F1). *(Fixer 2a, ADV-1: its accepted RV-5 dependents can be meaning items; when only these returns would hide the results again, telelean's `decided` force keeps them shown, §4.6, §8.)*

### 4.2 Ownership: `computeItems` (2a1)
One total, deterministic map from every difference between B and the judged state to one item key. A declaration counts as changed when its text differs, or its facts' kind, type, value, valueConsts or typeConsts differ. Names that only Lean reports (fields, constructors) follow their parent.

"Every difference" includes text outside declarations, such as commands, and it is unowned (§4.9's `stray-command`). An `open … in` before a declaration is such text: core's declaration scanner reads a declaration's header as its docstring, attributes and modifiers only (D2-52).

**Enclosing lines** (D2-52, F13): the `namespace`/`section`/`mutual` and `end` lines that enclose only new declarations are owned jointly by the items whose declarations they enclose, one item or several. They are never unowned while every enclosed declaration is new; they go with the last of those declarations that is taken out (§4.11); and the backstop accepts them when every enclosed declaration belongs to an accepted item (§4.10).
- **A card's statement:** its abbrev, its docstring mirror, its `lean:` pin and id write-back → `card:<c>`, Formalize when B had no statement, Change otherwise. An AXIOM card's `.holds` goes with it.
- **A PROPOSITION's `.holds`:**
  - a theorem → `proof:<c>`, when c is an inference's target (the completion's term included, ledger `completion`);
  - an axiom written for a pending premise (ledger `premise`) → that premise item;
  - anything else → unowned.
- **Block fields:**
  - `premises:` additions → `arrow:<s>><t>` (ledger `arrow`), or the `premise:` item (ledger `premise`);
  - a `follows_from:` removal → the premise item (ledger `mark-removed`);
  - any other block change → unowned.
- **A new block** → the `premise:` item that wrote it (ledger); any other → unowned.
- **New declarations that no card owns.** Their owner is fixed when they are created, by the ledger's `created` entry (the step, its target and the phase, D2-43), and never re-derived from what reaches them later (F7). A new declaration with no `created` entry and no other ledger owner is unowned.
  - created in a statement phase:
    - a sort, predicate, constant or function passing the shape rule → `vocab:<name>`;
    - a presupposition with its helper instance → `decl:<name>` (presupposition);
    - a def, abbrev, structure, inductive, class, opaque, instance or coercion → `decl:<name>`;
  - created in a proof phase, vocabulary included (a `noncomputable opaque` too): proof material, owned by `proof:<T>`, T the target of the step that created it. The one exception is a definition that a premise draft of the same step reaches: a `decl:<name>` item that is part of T's Result (D2-42). Either way, `other-result` (§4.9) keeps every statement and statement-phase declaration from mentioning it, so no later reach can arise;
  - a theorem is proof material.
- **A changed existing vocabulary item** → `decl:<name>` (vocabulary change).
- **Unowned differences** cannot pass the gate: a Prop axiom bound to no card (D2-40), a `type:` change, a proof of a card that is not a target. If one appears anyway, the stage reports it and Apply is disabled.
- **A Result for every inference whose step ended** (F9). `computeItems` takes those inferences (`ended`) and always emits `proof:<T>` for each, even when T.holds is as in B and no proof material exists (a first step not proved, a give-up, a statements-only step). Its content is T.holds as it is in the state, or absent, plus its proof material. So a Result that was not proved has a stable key, and RV-1's "one per inference, always present" holds.
  - A Result draft whose T.holds is as in B (the same text, or absent in both), with no proof material, is marked `asInBase`. It is B's version, the one a Reject or a revert puts back, so reconcile never reads it as a new proposal (§3.5, AF1).
- **Premise items** (AF10): one per draft in `premises` whose target is in `ended`, made from the draft while no ledger `premise` entry names its key, and from ws/ once one does (§3.5). A draft of a step that never ended is dropped with its rollback (§3.4), and this rule keeps any other out.
- **Each draft carries** (`ItemDraft`, §2.9):
  - `provides`: its declaration names, arrows and cards;
  - `mentions`: its declarations' `uses` constants;
  - `partOfResult`: the target, for arrow items into a target, premise items for it, and the `decl:` items of the exception above, read from the ledger. A declaration created in a statement phase is never part of a Result;
  - its content key.

### 4.3 Content keys (2a1)
- **The key** is the sha256 of canonical JSON holding:
  - the owned names, sorted; for each, its text with whitespace collapsed, its kind, its normalised type and value, and its sorted valueConsts and typeConsts;
  - the owned fields: all of a new block's; in an existing block, only the entries the item adds or removes, never the whole line. A `premises:` addition contributes only its own entry (the source id), so a later arrow into the same target changes no other item's key; a `follows_from:` removal contributes the removed mark (AF9);
  - the arrow.

  Positions never count.
- **A premise draft's key**, while it is outside ws/: the sha256 of canonical JSON holding its sentence, its Lean statement with whitespace collapsed, and its target. DO-1's rejected premises use this key too, so an exact repeat is refused whether the rejected premise was ever written or not. Once written, the item's key is computed from ws/ like any other, and the premise write records it as accepted (§3.8).
- **One key serves three uses:** the accepted record (Apply checks it), DO-1's exact repeats, and DO-3's identical sets (kinds, sentences, Lean statements and arrows).
- **Residual:** two terms that print the same and use the same constants are not told apart; only the comparator compares terms. S13 already says reworded repeats are harmless.

### 4.4 RV-7 classes (2a2)
**belief** if any of:
- b1: an Add of an AXIOM card; any Add premise;
- b2: a Formalize or Change of an AXIOM card (its sentence, statement or `.holds`);
- b3: a Lean axiom that is new (no axiom of B with the same name and normalised type) or changed. This covers presuppositions, pending claims, axiom `.holds` and unmarked axioms. A shape-passing sort, predicate, constant or function is the exception;
- b4, except the cards' statement abbrevs and their docstring mirrors (statement items are classed by b2 and c1–c3):
  - a new or changed definition, instance, coercion, structure, inductive, class, opaque or abbrev in R_stmt: the judged state's, and also B's for an existing name;
  - any vocabulary change in either R_stmt;
- b5: a "meaning changed" item of an axiom (slice 3).

**changes what is proved** if any of:
- c1: a card statement or a `.holds` theorem of B is changed or removed (Change, Delete, a Result that replaces your proof). Turning `axiom T.holds` into `theorem T.holds` is not c1, because pending counts as no proof;
- c2: a Result whose target's statement exists in B and differs ("proves a statement changed in this session"). A statement first written in this session is not changed;
- c3: a changed sentence on a card with Lean ("sentence and Lean may disagree");
- c4: every Add arrow into a proposition, used or not. It is marked "adds no new basis" when basis(source) ⊆ ⋃ basis(Q's sources), where basis(u) is {u} for an axiom or pending card, and otherwise u's footprint cards and presuppositions. `classify` computes this on the judged state, from the inferences it is given, and sets `ItemClass.addsNoNewBasis`; the view takes the marker and the detail's flag from the class in force (AF8).

**Not RV-7:** Remove arrow, a Result that proves an unproved or pending target, Formalize of a proposition, plain vocabulary, definitions outside R_stmt.

Classes are recomputed on every judged state, as the two maps of §4.1 (with and without the premise drafts); `complete: false` counts as belief (D2-25).

### 4.5 RV-5 item dependencies (2a2)
**Edges** I → J, on the judged state:
1. **mentions:** a walk over `constsOf(·, 'uses')` from I's declarations, through declarations no item owns and through I's own, stopping at a declaration that J ≠ I owns. It is memoised per declaration;
2. **Results:**
   - Result(T) → Result(u), for every source u whose session proof the inference counts (B.1's `throughResults`);
   - Result(T) → the Add arrow or Add premise item of every arrow s → T with s in direct(T);
3. an arrow item → the item adding the card at either end (none in slice 2);
4. A17: an Add arrow → every Remove arrow whose arrow lies on a cycle through it (none in slice 2);
5. **mentioned before:** a Change or Delete → every J whose version in B mentions a name it changes or removes.

**Cycles** are Tarjan SCCs (D2-26):
- Accept is enabled when every dependency outside the item's SCC is accepted.
- SCC members are accepted one by one, each with its own Accept where RV-7 asks, and say "accepted together with …".
- Apply requires an SCC with an accepted member to be wholly accepted.

**Hidden items.** While the results are hidden, Results and their parts never appear in a listed item's blockers or "depends on N". A listed item with such a dependency says "waits for the results to be shown", and its Accept waits for them. Such a dependency never depends on a hidden outcome: listed items may not mention proof material or a target's `.holds` (§4.9), so the only part they can rest on is a written premise card, which was accepted while the results were shown.

### 4.6 Statuses: the reducer (2a2)
`reduceReview(state, action, at) → outcome` (the types are in §2.9). The runner calls it only in a stage: while a step runs, every action is refused before it (D2-62). The actions are:
- decide: accept, decline (option, note), back to review, un-reject. `own` marks the item's own Accept, and is never inferred from the number of items (D2-32);
- reveal (Show results), move, undo, redo, seal.

| From | To | Rule |
|---|---|---|
| in review | accepted | Every dependency outside its SCC is accepted. An RV-7 item only by its own Accept (`own`). A Result or a Result's part only while the results are shown (D2-8). Never under the "did not pass" heading |
| in review | declined | Reject or plain decline: its content goes, with the cascade (§3.6), Shaky dependents included. Shaky: its content stays, and dependents become to be redone, transitively. Transform is refused until slice 4. A Result or a Result's part only while the results are shown (D2-8) |
| accepted | in review, or declined | `needs-confirmation` first, listing the accepted dependents and what happens to them (§3.6, RV-5). While the results are hidden, always, with `hiddenResults` (D2-64) |
| declined (Reject, plain) | in review | Un-reject: the content is re-applied and its key leaves `rejectedFingerprints` (§3.6); the dependents its commit took out come back as to be redone without revert (D2-60). An Add premise's un-reject re-applies nothing: in review, it is outside ws/ (§3.6, AF2) |
| declined (Shaky) | in review | By the user, before Submit review (the content was never touched); by reconcile, when its inference's Submit step ended in the queue that just ended (§3.5) |
| to be redone | in review (updated) | A step proposes it again; reconcile, when its inference's Submit step ended in the queue that just ended, marks it updated only if its key changed (§3.5). A later judge never does: a reverted Result whose draft is B's version stays to be redone (AF1) |
| to be redone | in review | The user sets it back, only when its content is still in ws/ (not reverted). A reverted one is refused: "Its content was taken out: un-reject what took it out, or let Claude redo it at Submit review." (D2-60) |
| to be redone | declined | The user declines it; Reject keeps B's version |
| withdrawn | in review | A later proposal of the same key |

- **Cascades follow the real dependencies** (§4.5), Results included, also while the results are hidden. A hidden Result changes silently: it is never in `cascade`, a `left` reason, a label or an event, and its change shows with the results (D2-64).
- **An action that shows the results** (Show results, or a decision that leaves no meaning item undecided, §4.7) switches the classes in force to `classes` and applies D2-23 in the same action: an accepted item whose badges grew returns to in review, with its accepted dependents, reported as events. When only those returns would hide the results again, telelean's `decided` force keeps them shown, marking nothing seen early; a decision records it (`startedForce`), so its Undo removes it (fixer 2a, ADV-1). An action that hides them switches back to `classesBeforeReveal`, which changes no status.
- **DO-0.** An arrow item has only the plain decline:
  - the arrow goes at once;
  - every Result whose proof uses it becomes to be redone (reverted);
  - a question that selected the arrow (a mid-stage Formalize, D2-20; `questionArrows`) loses its source: the reducer makes that Result to be redone (reverted only if its proof uses the arrow), and takes the source out of the inference's `question` in the same action, which records the change (D2-59). The stage report's note says "“‹L›” left the question for “‹T›”: you declined its arrow.";
  - a card Claude added at its ends is declined with its items (none in slice 2);
  - the arrow is never proposed again in this session (`rejectedArrows`).

  An Add premise declines its own arrow with it.
- **Groups (RV-8):**
  - `planGroupAccept(items, selected)` works on `GroupItem`s (§2.9), so the webview runs it on ItemViews and the host on its records (F12). It takes the greatest fixpoint of the selected in-review items that are not RV-7 items, not hidden and not blocked, and whose dependencies are accepted or taken by the same Accept. It returns `left`, with reasons `own-accept`, `depends`, `hidden-result`, `blocked` or `not-in-review`.
  - `planGroupDecline(items, selected, option)` gives arrow items `plain`, and leaves out hidden Results ("results not shown").
- **The stack:** each user action, with its cascade and commits, is one step, with a new `id` from `nextAction`. It records every effect of the action (§2.2's SessionAction): statuses, declines and Accepts, rejected keys and versions, `rejectedArrows`, question changes, a force it ended, the written premises its write took out (AF2), and the request itself. Undo restores those effects once the reducer has checked the restored statuses against the current state; Redo sends the request again through the reducer's checks. Either is refused with the rule's text when the rules now refuse it, or with `conflict` when an item's rev changed (UN-4, D2-73): a listed item's; a hidden item that a judge changed since, or whose restored Accept the rules refuse, keeps its state silently (fixer 2a, V2A-S2). An Undo or a Redo names that id, never a depth, so a stale request can never hit a newer action at the same depth.
  - Show results is one step, "Show results". Undoing it removes the force, so the results are hidden again unless no statement or belief item is undecided (§4.7); the seen-early markers stay (UN-4). It records D2-23's returns (`changes`), which its Undo restores through the same checks as a decision's (fixer 2a, V2A-S4).
  - A move on the Proposed view is one step (D2-33).
  - Seals: Submit review when it queues Claude steps (D2-54), a mid-stage Formalize, and Retry step. Every queue after the session's first starts with exactly one, in its `queue-start` write; the session's first queue has none, since nothing precedes it on the stack (fixer 2b3a r1, C-V2B3A-C1: the view's D2-59 removals count a decision made after k seals against queues 1 to k + 1, §4.7). Nothing is decided while a queue runs (D2-62, D2-63), so answering Claude's question during it needs no seal of its own. Undo stops at the newest seal.
  - Every new action, a seal included, clears `undone`, so nothing can be redone across Claude's step (AF13).
  - The stack is discarded when the session ends, and Exit cannot be undone.
- **Properties** (tested): after any sequence of actions, Undos and Redos included, every accepted item's dependencies outside its SCC are accepted, and no decision, Redo included, named a Result or a Result's part while the results were hidden (cascades still reach them, D2-64); no answer's cascade or events names one while the results are hidden when the action is asked or after it, Show results' own answer excepted (fixer 2b1a r1); with every write of an Add premise carried out as §2.9's ItemWrite says (merges, take-outs, step 4, Undo's inversions, judges' take-outs), its record holds exactly the card in ws/, with its written key and ledger entries, and only while its status keeps it there (fixer 2b1a r1; builder 2b1b, R1-F1: requests that mix an un-reject with a Reject included, and an accepted premise always written once its write is carried out, R1-F3; fixer 2b1b r1, S-F5: a later un-reject of an item that such a mixed request declined is refused, since inverting that request's whole commit would take the other item's content out again, and its Undo undoes both); and undoing every action of a sequence gives back the records it started from (F4).

### 4.7 Meaning before proof: one reveal per stage (the rule in 2a2; the mask in 2c1; the view in 2c2)
- **The rule** (D2-61). The results of a stage are shown or hidden together:
  - **shown** when no meaning item is undecided, or when Show results forced them;
  - **hidden** otherwise.

  A **meaning item** is a statement item (Formalize, Change, Add) or a belief item, that is neither a Result nor a Result's part. Its belief class here is always `classesBeforeReveal` (§4.1), which no Result's part affects. So showing the results never changes what they wait for, and the rule needs no fixpoint (F1).

  A meaning item is **undecided** while it is in review, or to be redone with its content still in ws/ (`redo.reverted` false). RV-6 asks for "decided (accepted or declined)", and three things make an item to be redone without the user deciding it: a Shaky decline's cascade, RV-3 at a queue's end (a new item that depends on a Shaky or to-be-redone one), and the dependents that un-reject brings back (D2-60). Counting them keeps the results hidden until the user has judged those statements, which they could otherwise set back to review knowing the results (AF4). An item **becomes undecided** when it appears as a new item, or enters either state from accepted, declined, withdrawn, or to be redone with its content taken out. Plain vocabulary, definitions outside R_stmt, and items declined, withdrawn, or to be redone with their content taken out never keep the results hidden.
- **Show results** (RV-6's Show result; also Raw Lean diff… and "Show Claude's activity") shows every Result of the stage at once, after a dialog: "Show the results now? You have not decided ‹N› statement and belief items. The results will be marked as seen early." It is not available while a step runs (D2-62).
  - **The force** (`PersistedSession.forced`) lasts until a meaning item next becomes undecided (a queue's new or updated item, back to review, un-reject and the dependents it brings back, an Undo, a class change), until RV-11 returns a Result to review ("with its result hidden again"), or until a queue of Claude steps ends, whatever it changed (fixer 2c2 r1, C-V2C2-C1: whether the force survived a re-ask queue would tell its outcome; §3.5 step 3). Then the results are hidden again, unless no meaning item is undecided. A queue that starts under the force runs with the stage shown as it was (D2-63).
  - **Seen early:** while the force holds and a meaning item is undecided, every Result gets the seen-early marker, which stays.
  - It is one stack step: Undo removes the force; the markers stay (UN-4).
- **Hidden again** when a meaning item becomes undecided while none was, as RV-6 says ("hidden again if any of those items returns to in review"). So each queue's results usually start hidden: they show at once only when the queue added or changed no statement or belief item.
- **What is withheld while the results are hidden** (`buildSessionView`, on the host, D2-5):
  - **every Result:** its status, rev, verdict, proof, band, flags, classes and dependencies. It is a neutral row, "result after the review", with only the seen-early marker. It cannot be decided (D2-8), and is never counted, in a cascade list, a group's reasons, an event or an Undo label;
  - **every Result's parts:** Add arrow and Add premise items, written or not, and the `decl:` items of proof phases (§4.2). They are left out of the list, the counts, the board, "Rejected in this session" and the report's withdrawn list (F10);
  - **the stage report's results:** verdicts, bands, Rests on, "not needed", missing lists, step outcomes and telelean's notes on questions; Claude's summary, gap, "Assumed without asking" and "proposed nothing"; Claude's activity, gate attempts and notices (D2-10);
  - **the inferences:** each InferenceView shows the question its latest ended step asked (§3.2), less the sources the user's declines took out of it once that step's queue had started (D2-59; builder 2b3a, R1-1: a source declined earlier, un-rejected and accepted can be asked again), and each ended step reads `ended`. While a step runs, a target whose step ended in the running queue shows that step's question too, even with the results shown: a proved re-ask puts its question on the record when it ends (fixer 2c2 r1, A-V2C2-ADV-1, A-V2C2-ADV-6).
- **The base mask** (D2-61). While the results are hidden, the board's graph is the stage judgement's working copy under `baseMask` (§2.9): every proof-derived datum as in B, statements and vocabulary from the working copy.
  - each target's `.holds`: B's text and facts, or absent when B had none;
  - dropped: every declaration created in a proof phase (ledger `created`): lemmas, proof-phase definitions and vocabulary, but a declaration a card of the working copy binds (its statement, an AXIOM card's `.holds`, a pin), which is that card's visible content as computeItems owns it (`card:<c>`; a step that formalised statements and ended without a freeze records them as `proof`, D2-43; fixer 2c1 r1, A-ADV-1), and so are the definitions such a statement uses: a card's statement is statement content whatever phase wrote it, so the gate refuses a finish that leaves it using what its step wrote, until the step freezes (`other-result`, §4.9; fixer 2c1 r2, R1-1); with each, the comment lines attached to it and the enclosing lines around such declarations only (`compareTexts`' rule); Claude's arrows (ledger `arrow`); written premise cards (ledger `premise`), with their arrows and mark removals, so the marks show as in B;
  - every other declaration that B has with the same text keeps the working copy's facts, with only the proof-derived ones taken from B: `axioms` and `usesSorry` (AF6). In slice 2 such a declaration keeps its meaning (the step limits keep it), so nothing else can differ. Its range, selection range, refs and module stay the working copy's, because the build places everything by position: it matches anonymous instances by their start line (`project/factsIndex.ts`), attaches messages to cards by range, and keeps only the refs inside each piece of a card's code. B's positions would lose or misplace them by however many hidden lines sit above, which would also show in the visible JSON;
  - the rest, the statement content new in the session, keeps the working copy's facts. Statements may not mention proof material or a target's `.holds` (`other-result`, §4.9), so none of it reaches what the mask replaced or dropped;
  - the module entries (states and source hashes) stay the working copy's, so no file reads stale (AF6);
  - Lean messages follow their declarations (AF6): the working copy's for the statement content new in the session; for a declaration B has with the same text, B's messages for it, moved by the line offset between its range in B and in the working copy (the text is the same, so they land on the same lines of it); for a target's `.holds` under `base`, B's messages for B's `.holds`, placed at the start of the target's statement in the working copy, so they attach to the same card and keep their order among the other diagnostics wherever the step put the `.holds` (fixer 2c1 r1, S-V2C1-S4); none for a dropped declaration. Every other message, one with no position included, is dropped;
  - `buildProject` gets a `mask` input (`absent`; `codeOverride` for the base `.holds` texts, each with B's range, against which the build counts that piece's lines and places its refs, so the card's code-relative refs are B's (AF6), and B's keyword, which the build reads wherever facts do not decide the `.holds`' kind; `codeLayout`, B's layout of every other card the working copy has with B's statement and `.holds` texts; `lines`, the comment and enclosing lines that go with a dropped declaration or with a target's `.holds` shown as B's (a proof's comment is its Result's); `drop`; `dropArrows`; `dropNodes`), so no hidden proof text reaches a graph. A card the session formalised (no `codeOverride`, no `codeLayout`) whose statement and `.holds` are one stretch once what is left out between them, and a target's `.holds` the step put there, is taken out, reads that stretch without its blank lines (comment lines kept), whether or not anything was taken out, so its code is the same whatever the step wrote between them (fixer 2c1 r2, R1-3). The build reads each block's binding, and the parser's TL013 and TL014 hints, as the parser reads the file without what the mask leaves out (fixer 2c1 r1) and without each target's `.holds` under `codeOverride`, in every file that holds one: the not-proved twin has B's `.holds` beside its statement, where no block reads it, so no block reads the `.holds` where the step put it either (fixer 2c1 r2, R1-2);
  - `buildSessionView` strips source positions (every node's `loc` and `lean.codeLoc`, every vocabulary item's `loc`, every diagnostic's `range`); leaves out `semantic.checkedAt`, `semantic.durationMs`, `semantic.detail` and `semantic.staleFiles`; recounts `semantic.errorCount` from the masked messages; and sets `version` from `viewVersion`, which only a visible change raises (F17). The nodes keep reading order in the array, so nothing needs positions to order cards, and the Proposed view never opens ws/ (§5.10);
  - the board is published only from a converged judgement: while a `judge-apply`'s reverts make the judge run again, the previous board stays, with `judging: true` (F17);
  - every derived datum the board shows comes from this one build: glows, chips, bands, Rests on, Used by, solid arrows, stub counts, the AXIOMS header counts, the vocabulary listing;
  - once the results are shown, the board is the stage judgement's working copy, unmasked.

  Slice 3, where existing declarations can change (Change items, the whole model open), revisits the third bullet.
- **Why this hides enough (RV-6).** RV-6 keeps each Result neutral until the statement and belief items it depends on are decided. The stage rule waits for every such item, those to be redone with their content kept included (AF4), not only those a Result depends on, and it hides every proof-derived datum, not only a target's. That is a superset of what RV-6 requires, and what a hidden Result depends on never needs computing, so no list or cascade can show it.
- **Hidden Results' statuses** (D2-64). Decisions on listed items cascade into Results by their real dependencies (§4.5), silently: the change is recorded, and shows when the results are shown. Before an action takes an Accept away, the confirmation says so without naming a Result (§3.6); its trigger reads only listed statuses. The judge's changes to Results (RV-11, "no longer builds", premise re-checks) are recorded and shown the same way, marked "updated" where their content changed.
- **What is part of a Result:** its proof material (inside the Result item); the Add arrow items into T, and the Add premise items for T; the `decl:` items created in its proof phases that its premise drafts reach (§4.2). It is fixed when the record is made (`ItemRecord.partOf`).
- **Mid-stage Formalize waits for the results** (D2-65), so no start check, step mode or question can depend on a hidden outcome (§3.2, §4.12).
- **Non-interference** (tested in 2c2 and 2e). Fixed pairs of working copies that differ only in Results' outcomes: a proof or none, with a premise draft reaching a proof-phase definition, Claude's arrow, a lemma placed before other cards, a linter warning in a lemma, a re-ask proved or not, a chain X → L → T with L proved or not (T's step statements only), and a Retry queue run while the results are hidden, after an earlier step proved its target or not, with an arrow item and a premise draft when it did (AF7). While the results are hidden, each pair gives byte-identical `SessionView` JSON, item ids included, and so does every sequence of Accept, Reject, Shaky, DO-0 and Undo on listed items, with its ActionOutcomes. So does the session's RunView, with its progress counts, usage and times left out (the accepted residuals below; AF5). "Outcome" means a proof or none, everything the base mask replaces or drops, and Claude's words.
- **Residual channels, accepted:**
  - a step's duration and progress counts (a statements-only step makes no proof attempt, so it usually ends sooner), and how long judging takes (a hidden Result taken out after a decision makes the judge run again);
  - Claude's questions during a step;
  - one conversation runs every step, and Claude knows the earlier outcomes, so the visible content of a later step of the same queue (its statements, their wording) may differ with them. The paired tests script both runs alike, so they do not cover this (D2-69);
  - hidden declarations occupy Lean names: a later step's visible declaration whose name clashes with a hidden lemma fails in one outcome only, and Claude renames it there (D2-69);
  - a step that gives up before fixing its statements adds no statement items, which shows that it proved nothing. Likewise a step that finishes not proved without `freeze_statements` records what it wrote as proof material (D2-43, §3.4): its card statements stay listed (the cards' content, fixer 2c1 r1, A-ADV-1), and the gate refuses the finish while one of them uses something the step wrote (fixer 2c1 r2, R1-1), but a definition or vocabulary item that no card statement uses stays hidden with its Result, where a frozen step lists it;
  - (builder 2c2, carry-over R2-1) the opposite case, in the not-proved branch only: the freeze that R1-1's refusal asks for at the end of a not-proved attempt holds everything the step wrote but proofs (`proof-before-freeze` refuses only a proof or a carrier), so what the step wrote for its failed attempt that is not a proof (a helper definition or vocabulary) is recorded `statements` (D2-43) and listed as a visible `decl:` or vocabulary item while the results are hidden, where a step frozen before its attempt (every proved step) records the same helper as `proof`, hidden with its Result. The refusal's message asks Claude to remove what it wrote only for the proof attempt before it freezes, so the late freeze holds statement content only when Claude follows it; a helper left in is listed. Like the channels above, it depends on what Claude writes and when it freezes;
  - (removed by fixer 2c1 r2, R1-3: around a hidden lemma inside the code of a card new in the session, the blank lines it left were shown; that card's code now drops every blank line between its statement and its `.holds`, so it reads the same in both outcomes.)
  - a comment the step wrote with its statements directly above a card's `.holds` goes with a lemma the proof phase writes between them (computeItems attaches a comment to the new declaration directly below it), so it is hidden with the Result in that outcome and shown with the card in the other; a placement of Claude's, like the channels above (fixer 2c1 r2);
  - (fixer 2c2 r1, S-HIDDEN-SUMMARY-ENVELOPE, C-V2C2-C7) a judge's build or check that times out, runs out of memory, is cancelled or cannot start (the facts' sandbox statuses, which come with no declarations) can depend on hidden content, like a step's duration: the hidden board's summary maps that status as the runner does ("failed", "paused-low-memory", …), and every Accept of an item whose facts are missing is refused, never with Lean's words while the results are hidden;
  - whether a judged state's probe fails (§2.1) can depend on hidden content (its output's size, an error the walk meets in a hidden declaration): the stage's `facts` problem and the Accept refusals show that it failed and its cause, never Lean's error while the results are hidden (the problem's text never carries it, and `classesBeforeReveal` gives the sentence without it; fixer 2b2 r1, A-V2B2-ADV-7). The detail shows once the results are shown, in the Accept refusals (`classes`), and in the backstop at Apply.

### 4.8 B.1 per inference (2b1b)
**The permitted set:** permitted(T) = the standard axioms ∪ the signature axioms ∪ the presuppositions of T's and the sources' statements ∪ ⋃ contrib(u), for u in sources(Q(T) ∪ E(T)) with u ≠ T. T.holds and sorryAx are excluded.

**Q(T)'s sources count only while their arrow exists** in the state judged (D2-59), here, in B.2 and in the backstop. Your own arrows always do (no one can remove them during a session, ES-9). Claude's arrow that a mid-stage Formalize selected can be declined; its source then leaves the question (DO-0, §4.6), so a proof can never use it with no arrow in ws/ (§14.7).

**E(T)** = the ledger arrows into T whose item is not declined and that the judged state draws (the active step's own count before its normalise draws them; fixer 2b1b r1, A-ADV-1: a cascade's revert takes an arrow out of ws/ but leaves its ledger entry, so an undrawn entry counted would let a proof use its source with no arrow), plus T's written premises (the ledger's `premise` entries for T). Arrows in review count, and the Result then depends on them. So does a written premise whatever its status: it is in ws/ only while accepted, declined Shaky, to be redone without revert, or, after a v1 conversion, in review (§3.8, §3.11); every other status takes it out with its entries. Reading the ledger, not the Accept, keeps E(T) equal to what ws/ holds, between an Accept and its write too (AF2, AF12). Their sources are never targets of the session: a target uses another target only through a selected arrow (ES-2, D2-50). The one exception is check 3's (§4.12): a new target at the source of Claude's arrow into T, which the same request selected, re-asking T. If that re-ask ends without a proof, T's old question stands, and the source stays in E(T), contributing as a session proof.

**contrib(u):**
- **claim:** an axiom `.holds` without TL114, on an axiom card or a pending one (the Result then "rests on pending");
- **own proof:** `footprintSinceBase`, the user's own unchanged proof from B, as today;
- **session proof:** u is a target of this session whose `.holds` in this state is a theorem that differs from B's, and u's inference passes in this same state. So it counts while u's Result's content is in ws/: accepted, in review, declined Shaky, or to be redone without revert (D2-48); a rejected or reverted Result has B's `.holds` back, which contributes what it did in B. It gives its footprint here, and u joins `throughResults` (an RV-5 edge). The test reads the state, never the records, so it holds inside a queue too (D2-63);
- **nothing otherwise,** with a reason: `no-holds`, `conditional`, `mismatch`, `circular`, `not-passing` or `unchecked`.

**Why this is safe.** Inferences are judged sources first, so u's judgement exists before T's. A footprint enters permitted(T) only in two ways:
- from the user's own unchanged proof;
- from a session proof that passes its own inference in the same state.

So no Claude proof widens the set it is judged against: M2's P2 fix, generalised. Counting a Shaky Result changes nothing at Apply, where every item must be accepted or rejected (EN-1).

### 4.9 Judging a state: `judgeState` (2b1b)
**Global rules**, for every purpose of a session:
- **G0 and G1** against B; `sorry` and `example`; the vocabulary shape rule, for new and changed items.
- **Step limits** (step purposes):
  - every declaration and block field of S₀ keeps its text and its meaning (printed type and value, valueConsts and typeConsts sets: D2-41), unless the scope opens it;
  - the code is `existing-changed`, with the new token `session` for content proposed earlier in this session (D2-41);
  - exempt: the target's `.holds` under `openProof`, fills of `fuzzyStatements`, and `openItems`; (fixer 2b1b r1, C-V2B1B-C2) under `openProof`, the proof material of the target's Result too (its Proof is open), but at gate-other, where a finish without a proof leaves the Result as it was (ES-2); (S-F2) the comment and enclosing lines of opened content, as computeItems attached them when they came (B → S₀);
  - (fixer 2b1b r1) the tokens `closed-proof` and `text` (§2.7); session content that no item of S₀ provides gets a neutral message (A-ADV-3), and (fixer 2b1b r2, R1-3) its own token `uncovered`, so the board does not say the person reviews it;
  - (fixer 2b1b r1, A-ADV-3) a step its rules pass may still leave a difference no review item can hold; each one computeItems reports that it did not report on S₀ is then a step finding (`existing-changed`, `unowned`). Only when no other rule spoke: those name the same differences more precisely.
  - (fixer 2b2 r1, A-V2B2-ADV-4) ES-2's preset as reconcile reads it: every item of S₀ that the scope does not open (its `openItems`, and under `openProof` the target's Result) keeps its content key, or it is a step finding (`existing-changed`, token `session`, naming its declarations; `CLAUDE_SESSION_TEXTS.frozenItemChanged`). This catches what the rules above do not name, chiefly a comment S₀ already had that now goes with another declaration because the step wrote a declaration next to it or removed the one it described. Not for an item whose facts are missing in either state (its key cannot be compared), nor when S₀'s and the judged state's facts come from different probes (one with §2.1's marker, one without: the keys would differ by the facts alone), nor for a premise draft that is not written (no ledger `premise` entry names its key; fixer 2b2 r2, R1-1): its content is outside ws/, and a later step may propose it again under the same key, reworded (S13: "a reworded repeat passes"; §3.5), which reconcile records as its newer version. A written premise is content in ws/ and stays frozen. Only when no other rule spoke, after the `unowned` rule.
- **G5 (markup),** against S₀ (B at `final`):
  - Claude changes no field; the exceptions are telelean's ledger writes and the scope cards' pins (at a step, only the step's own ledger arrows: an earlier step's arrow missing from S₀ was taken out by a decision; fixer 2b1b r1, A-ADV-5). A ledger arrow whose item the person declined, drawn again, is B.3's `declined` alone (one finding per problem; fixer 2b1b r2, R1-4);
  - a block's other lines stay as written and in order (computeItems' F1 rule; token `lines`, fixer 2b1b r1, A-ADV-3);
  - `type:` never changes;
  - `follows_from:` changes only through `mark-removed`;
  - new blocks only for ledger premises.
- **B.3 `arrow`:**
  - the `premises:` differences are exactly the arrows of the ledger's `arrow` and `premise` entries whose item is not declined (a rollback drops its step's entries, §3.4, and taking a written premise out drops its entries, §3.8);
  - each arrow the active step added goes into the step's target, a proposition whose question is not its mark, from a card of the subject with a `.holds` that is not another target of the session, and was not declined before. An earlier step's arrow is not checked again for `other-target`: check 3's exception (§4.12) may later make its source a target;
  - the drawn and solid arrows of the state are acyclic. A cycle already in B is never counted (AP-13).
- **B.4 `holds-kind`:** no `.holds` changes kind, except the scope target's change from axiom to theorem with the identical type. A theorem never becomes an axiom, and Claude never writes a Lean axiom `.holds` for a proposition. (Fixer 2b1b r1, S-F1, A-ADV-2, C-V2B1B-C3: ES-2's "the Proofs of non-targets stay closed" too. A theorem `.holds` on any card but the step's target, or at a stage and the end any session target, is refused: `axiom-to-theorem` from an axiom of the reference, `not-target` when new or rewritten. At a step, S₀'s `.holds` that the scope did not open is the step limits', so each change is reported once.)
- **`new-axiom`,** against B, by name and type. Allowed are:
  1. B's axioms with the same name and type;
  2. shape-passing vocabulary, before the step's freeze;
  3. presuppositions of a sort, before the step's freeze;
  4. the `.holds` of an AXIOM card whose statement is new in this session and states exactly that statement;
  5. the `.holds` of ledger premises.

  A reused name gets the token `type-changed`.
- **footprint:** each new or changed declaration lies within the permitted set of the inference whose step created it (ledger `created`). (Fixer 2b1b r1, C-V2B1B-C2: in a re-ask, what earlier steps made for the target is judged with the question on the record until the step claims its new one: at a proved finish, and by check_lean once T.holds changed; `other-result` likewise, for what T.holds itself mentions too (fixer 2b1b r2), so a not-proved finish keeping an old proof that uses a dropped source's proof material passes, as §3.2 says. The target's `.holds` counts as changed when its text or its meaning differs, A-ADV-4; one Lean reported nothing about fails closed, `no-facts`, C-V2B1B-C4.)
- **`proof-before-freeze`** with R = S₀; **`status-mismatch`** at gate-other: T.holds byte-identical to S₀, a removal included.
- **`stray-command`** (D2-52). G0 lets these through, so this rule refuses a new top-level command that is not a declaration, a docstring or a comment: `open`, `variable`, `universe`, `omit`, `include`, `export`, `attribute […] …`, `#check`, `#print`, and the like.
  - The exception is `namespace`/`section`/`mutual` and `end` lines that enclose only new declarations, of one item or several (§4.2).
  - `open … in` before a declaration, on its line or the line above, is a stray command too: core's declaration scanner (`markup/decls.ts`, `parseHeader`) reads only a docstring, attributes and modifiers before the keyword, and `open` is a command word. Attributes written on a declaration (`@[simp] theorem …`) are part of its text, and so of its content key. An `open … in` inside a proof, indented, is part of the declaration and passes.
  - **A new comment that no new or changed declaration is next to** is refused too (orchestrator decision after fixer 2a1, AP-26). The attachment rule is computeItems' (`compareTexts`, §8 fixer 2a1): a new comment line goes with the new or changed declaration directly below it (only blank lines and comments between), else with the one directly above it. A comment with neither is a stray command, with the message: "‹file›:‹line›: this comment is not next to a declaration this step wrote or changed: put it directly above the declaration it describes, or remove it." So a stray comment is caught at the step, where Claude can remove it, and never reaches the end as unowned text that disables Apply. (Fixer 2b1b r2, R1-1: at a step, a declaration the scope opens that is session content, new or rewritten since B, counts as changed here: its comment is part of its content, which the step may change, so the step may reword it. A comment next to the person's own declaration stays stray, opened or not: no item holds it at the stage. Builder 2b2, R2-1: at a step a comment is also judged by the stage's attachment, B → W: one that would go there with a declaration the step may not change, in S₀, unchanged and not opened, is refused, naming it ("‹file›:‹line›: this comment would go with ‹name›, which existed when this step started and which this step may not change: put it directly above a declaration this step wrote or changed, or remove it."), and one that would go with nothing is a stray comment.)
  - The message for Claude: "‹file›:‹line›: `‹command›` stands outside any declaration: in a session, write only declarations, with fully qualified names instead of `open` (e.g. `Classical.em`), and `@[…]` on the declaration itself; remove it."
- **Proof material stays with its Result** (`undeclared-premise`, token `other-result`, D2-50). Every declaration created in a proof phase belongs to that step's Result (§4.2), the definitions its premise drafts reach included (F7). Such a declaration of Result(u) may be mentioned only by u's own proof, proof material and premise drafts, and by T's proof and proof material when u is a source of Q(T) (a premise draft's gap proof included). Card statements, other targets' premise drafts' statements, and anything created in a statement phase never may mention it, nor a target's `.holds` while its Result's content is in ws/. So no listed item depends on a Result or its proof material (§4.5). The card telelean wrote for an accepted premise (ledger `premise`) is that target's premise draft, written: it may mention its own target's proof material, as its draft did (fixer 2b1b r1, C-V2B1B-C1). The messages: "‹lemma› belongs to the proof of “‹u›”, which is not a premise of “‹T›”: prove what you need here." and, for a statement, "‹name› was written for the proof of “‹u›”: a statement may not use it; define what you need before fixing the statements."
  - (Fixer 2c1 r2, R1-1.) A declaration a card of the judged state binds (its statement, its `.holds`, a pin) is that card's content whatever phase created it (computeItems' `card:<c>`, the base mask's A-ADV-1): it is never proof material, and a card's statement or pin is judged as a statement even when its creator's phase is `proof` (a step that finishes without `freeze_statements` records everything it wrote as `proof`, D2-43; so does a card formalised after the freeze). So a not-proved finish without the freeze whose new statement uses a definition the step wrote is refused, and asks for the freeze, which records both as statement content, as a proved finish (always frozen) does: "‹name› was written in this step, which has not called freeze_statements: until it does, everything the step wrote counts as material for its proof, and a statement may not use that. Remove what you wrote only for the proof attempt, call freeze_statements, then finish again." (`CLAUDE_SESSION_TEXTS.otherResultNotFrozen`; builder 2c2, carry-over R2-1: its "Remove what you wrote only for the proof attempt" keeps the late freeze to statement content, §4.7's residuals, used when the step that wrote ‹name› has no freeze; otherwise the statement message above).

**Step purposes only:**
- **`rejected-repeat`** (D2-66), for content the step created or changed since S₀:
  - an item whose content key equals one of its rejected keys;
  - a rejected premise;
  - a declined arrow;
  - DO-3's identical Shaky set, unless `noAlternative`.

  Content the user brought back (Undo, un-reject) was not made by the step, so no stage or final judgement refuses it (F4).

**Per inference,** sources first:
- footprint(T.holds) ⊆ permitted(T);
- B.2 `undeclared-premise`, with allowed = sources(Q(T) ∪ E(T)), T's written premises included, a source of Q(T) only while its arrow exists in the state (§4.8, D2-59); tokens `unselected`, `unseen`, `source-only`; never the `.ilean` fallback;
- `not-proved` at gate-proved, for the active step;
- `statement-changed`, against the active step's freeze;
- the comparator, for the active step (in the engine).

**`stepFindings`** = the global findings plus the active inference's, plus the step-purpose rules. Other inferences feed RV-11 only.

**`proposeArrowProblems`** (its signature is in §2.9), with these texts:
- "You may add arrows only into “‹target›” in this step."
- "“‹card›” is an axiom: an arrow into it would make it a proposition, which only the person decides."
- "The person marked “‹target›” as following from nothing: propose a missing premise with propose_assumption instead."
- "“‹card›” has no proof and no claim: the proof cannot use it."
- "The person declined “‹source›” → “‹target›” in this session: do not propose it again."
- "“‹source›” is another target of this session: “‹target›” may use it only through an arrow the person selected." (`other-target`, D2-50)
- and 1b's texts for a cycle, another subject, vocabulary, a self-arrow and an arrow drawn already.

**Messages for Claude:**
- B.2's message adds "propose the arrow with propose_arrow (it becomes an item for the person), or prove the target without it".
- The step-limit message: "‹name› existed when this step started and was changed: in this step only the target's proof, the empty Lean statements at the selected arrows and new arrows into the target may change; restore it."

### 4.10 The backstop (written in 2b2; run by 2f on every Apply, never reused)
`applyBackstop({ base, final, items, ledger, inferences, judgement })` refuses Apply, naming the declaration, arrow or item, on any of these codes:
- **`facts`:** F's facts lack valueConsts or typeConsts where R_stmt or the B.2 walks need them: "telelean could not see what the final statements rely on". When F's probe failed (§2.1, D2-75), the text is `probeFailure`'s sentence, which names the cause.
- **`unowned`:** ownership is re-derived from B, F and the ledger (telelean's own record, kept outside ws/), independently of the item records, and a difference has no owner, stray command text included: "‹decl› changed, but no review item covers it." Enclosing lines pass when every declaration they enclose belongs to an accepted item (§4.2).
- **`not-accepted`:** an owner that is not accepted, including a declined item's leftovers: "‹decl› belongs to ‹item›, which is not accepted." This is stricter than Appendix B (D2-24).
- **`not-written`:** an accepted Add premise with no ledger `premise` entry for its key, or whose card is not in F: "“‹item›” was accepted, but telelean has not written it: reload the window to write it, or decline it." Its draft keeps the key it was accepted with, so `content-changed` alone would not see it (AF2).
- **`own-accept`** (Appendix B (a)–(c)), accepted only by a group:
  - a new or type-changed Lean axiom other than shape-passing vocabulary;
  - a definition, instance or coercion in R_stmt(F), except the cards' statement abbrevs and their docstring mirrors;
  - an existing name whose kind, type or value changed.

  Exempt: a presupposition's helper instance, and the axiom → theorem change of a `.holds` that an accepted Result proves.
- **`content-changed`:** F's content key of an accepted item differs from its accepted key, or an accepted Result's verdict or Rests on differs on F from the accepted one: "‹item› changed after you accepted it."
- **`class`:** an item that is RV-7 on F but was accepted by a group.
- **`arrow` / `mark`:**
  - an added arrow without an accepted Add arrow or Add premise owner;
  - a removed arrow without an accepted Remove arrow or Delete;
  - a `follows_from` change outside a ledger `mark-removed` of an accepted premise;
  - an arrow into an AXIOM card.
- **`b2`, `cycle`, `kind`:** B.2, B.3 and B.4, restated on F, so the backstop stands alone. A source of Q(T) counts for B.2 only while its arrow is in F (D2-59): a proof that uses a card with no arrow into T is refused, never applied (§14.7).
- **`scc`:** an SCC with an accepted member that is not wholly accepted.
- **Slice 3 hook:** frozen and held declarations still elaborate to their frozen terms.

### 4.11 Taking content out: `planItemRevert` (2b2)
`planItemRevert` (its signature is in §2.9) restores B's version of each item's content, from the items' drafts on the current state. It uses core's markup primitives (`EditSession`), plus a new LeanOp, `replace-decl { name, text }`, which puts back B's text of a declaration (no LeanOp today can):
- **a card's statement:** B's statement, or none (the card is code-less again, its pin and docstring mirror removed), with an AXIOM's `.holds`;
- **a Result:** T.holds as in B (a theorem, a pending axiom, or none), with its proof material removed;
- **an arrow:** the id is removed from `premises:`; the line goes when it is empty;
- **a premise:** the block, statement, `.holds` and arrow are removed, and the mark is restored when no arrow into the card stays (fixer 2b2 r1: a second written premise's arrow keeps it removed, since a card cannot both follow from nothing and have arrows, TL023; its take-out write moves the ledger's `mark-removed` to that premise, §3.8). A completion it made (ledger `completion` for its key) goes with it: T.holds as in B, the only text it can have had before, since a completion is written only when T is not proved (§3.8, AF2), as long as T.holds still rests on the premise (its `uses` closure reaches a declaration the premise provides; without complete facts, its text names one). A T.holds a later step reworked without the premise is its Result's own and stays (fixer 2b2 r1);
- **vocabulary and declarations:** removed; an existing vocabulary item gets B's text back;
- **a declaration B has that the state moved or lacks** (the step limits let a step move the target's `.holds` under `openProof`, e.g. a pending claim proved below a source declared after it): it goes from where it is, and B's text goes back in B's place, next to the nearest unit around it that stayed in place, with B's spacing (fixer 2b2 r1); several that go back next to the same unit (two pending claims adjacent in B, each proved below later content by its own step, taken out together by a cascade) go in B's order, each right after the one before it, where the previous one's own text ends (B's declaration text, its trailing spaces included), on either side of the unit (fixer 2b2 r2, R1-2; builder 2c1, R2-1);
- **enclosing lines:** the `namespace`/`section`/`mutual` and `end` lines go with the last declaration they enclose, whichever item it belongs to (§4.2).

Tested: reverting and then re-applying gives the same text, and the result parses with the expected blocks. The result is checked before it is returned (fail closed): every declaration that goes is gone, every one put back reads as in B and stands in B's place with nothing else moved, every reverted card is bound as in B, and no card the revert edits both follows from nothing and has arrows.

### 4.12 Several targets (2b2)
**`formalizeStartProblems(board, inferences, session?)`** (§2.9's `FormalizeSession`) checks, in this order:
1. Every target is in one subject: the session's, for a mid-stage Formalize.
2. In a session, the results must be shown: "The results are not shown yet: decide the statements, or show the results, first." (D2-65). This comes before anything that could tell whether a proof exists.
3. Each target is a proposition, and its premises are the sources of arrows drawn into it:
   - in a session, Claude's accepted arrows count too; an arrow in review gives "Accept this arrow first.";
   - an empty question needs the mark;
   - in a session, a target with a Shaky item: "“‹T›” has items you declined as Shaky: Claude reworks them at Submit review." RV-9 counts such cards as frozen, which would leave the target's proof closed (D2-53);
   - in a session, a new target L that is the source of Claude's arrow (not declined) into another target T, unless that arrow is selected in the same request: "“‹L›” is the source of Claude's arrow into “‹T›”: select that arrow too, or decline it first." (D2-50). Selected, it re-asks T with that arrow in its question (§3.2).
4. A proposition source without a `.holds` that is not a target of the same request:
   - outside a session: "“‹L›” is not proved: mark it pending first.";
   - in a session: "“‹L›” is not proved: select the arrows into “‹L›” too." No pending mark during a session (AR-8).
5. In a session, a source whose Result is declined Shaky or to be redone (D2-53):
   - Shaky: "“‹L›”'s result is Shaky: Claude reworks it at Submit review; set it back to review to use it now.";
   - to be redone: "“‹L›”'s result is to be redone: select the arrows into “‹L›” too, or Submit review first."
6. Cycles over drawn and solid arrows (AP-13): **any** cycle of drawn and solid arrows in the subject blocks Formalize, not only one through the question's own cards, and the refusal names the cycle (AR-3, §14 item 9; coverage audit G2, AP-29). 2b2 changes slice 1's start check the same way: `formalizeCycleProblem` in core/formalize.ts is today called with only [target, ...sources], and the webview's `formalizeState` (board/contextActions.ts) uses it, so the board's Formalize is disabled with the same reason. As a consequence, no session starts over a cycle already in B, and B.3 and the backstop keep counting only new arrows. A proposition that lists itself in `premises:` (TL015) is a cycle of one arrow (fixer 2b2 r1).

The runner runs the full check on its own records when `formalize` arrives; the host's check, on the SessionView, only answers early.

**`formalizeOrder(board, inferences)`:** a target that is a source of another target's question comes first; ties by reading order.

## 5. The review UI (webview; 2g, 2h)

### 5.1 Principles
- **The host owns the session:** items, statuses, classes, dependencies, the reveal state, the stack, the drift and the confirmation.
  - The webview renders `session` and turns gestures into messages.
  - Where it previews a rule (group Accept, Submit review, Formalize), it calls the same core function the host enforces with.
- **RV-6 by construction:** the webview receives only the masked view (D2-5). Its own hiding is the neutral Result rows and the neutral chip on the targets.
- **Read-only while Claude works** (D2-62): in phases step and interrupted, every review control is disabled with "Claude's step is running: you can review when it ends." The list, the details and the board stay browsable.
- **Each request carries what the user saw:** `rev`, `stage`, the Undo `step`, the check id. A mismatch is refused with "“‹item›” changed since you looked at it: look again."
- **Decisions are not optimistic.** The item shows a spinner until `actionResult`, and the next `session` message is the truth.
- **One message per user action.** Cascades come back as `needs-confirmation`, with the list.

### 5.2 State (2g)
- **The slice** (`state/session.ts`, with a small wiring diff in `store.ts`):
  - `session`;
  - `review { runId, current, filter ('all' | 'in-review'), pane, explicit, seenEvent, lastGroup }`;
  - `selectedItems` and `sessionBusy`.
- **Dialogs:** `cascade` (with the hidden-results sentence when `hiddenResults`, §3.6), `reveal { via }` (Show results, Raw Lean diff… and Show Claude's activity share it), `hold-as { item, next }`, `exit-session { accepted, inReview, stepRunning }`. 2h adds the `formalize` modes `in-session` and `results-hidden`.
- **When a `session` message arrives:**
  - a new runId resets the review UI;
  - a new stage keeps `current` if that item still exists, else moves to the first item in review;
  - selections that no longer exist are dropped;
  - the first stage switches the board to Proposed, as today;
  - `session: null` clears it.

### 5.3 The panel
RunPanel in session mode (aria-label "Edit session") shows, top to bottom:
1. the status line;
2. **Inferences:** "Formalize for dependencies", with one line per target ("“T” ← 2 arrows" or "“T” ← follows from nothing") and its step chip: queued, running, ended, cancelled, failed or not run. Never a verdict;
3. Claude's pending questions, and the notices shown up front;
4. the stage report (§5.4);
5. **the events box:** "Since your last action: …", with links to the items;
6. the list with the detail (§5.5–5.6);
7. "Rejected in this session";
8. folded: answered questions; Claude's activity, withheld while a step runs and while the results are hidden ("Show Claude's activity" opens the reveal dialog, D2-10); the backend.

### 5.4 The stage report (RV-10)
A `<details open>` block, summarised "Stage N · K targets · results shown · consistency unchecked", or, while the results are hidden, "Stage N · K targets · results after the review (M items to decide) · consistency unchecked" with Show results. It holds:
- **each target, while the results are shown:** the verdict line, the band (`bandsOf` on the shown graph, with Claude's arrows marked by their status), and Rests on, including "through ‹L›'s proof (this session)". While they are hidden, each target reads "result after the review";
- **"Not needed"** and **"What is missing"** (results shown): the gap in Claude's words, plus `missingArrowHints`; their "select ‹card› → ‹target› too" gets a "Select these arrows" button;
- **"Consistency unchecked",** always;
- **each step's words, while the results are shown** (D2-10): Claude's summary, and "Assumed without asking" with **Ask me instead** (D2-13). That opens the decline menu on the step's statement items, set to Shaky with the note "Ask me about: ‹choice›" prefilled; the user confirms;
- RV-13's "proposed nothing", the step outcomes in telelean's words and telelean's notes on questions (§3.2, D2-59), while the results are shown; and the withdrawn items, leaving out Results' parts while the results are hidden (F10).

### 5.5 The list (RV-2)
- **Order** (`reviewRows(items, inferences, nodes, filter)`). Groups:
  1. the source cards that are not targets, in board order;
  2. Vocabulary (N): its terms, with "k of N accepted";
  3. Definitions: the declaration items;
  4. the targets, in inference order;
  5. other cards;
  6. cards not on the board.

  Within a card: its fields item, then its Add arrow and Add premise items, then its Result. Every item's listed dependencies come before it (tested).
- **Header:**
  - the counts: "3 in review · 5 accepted · 1 declined", plus "· 1 to be redone";
  - the "Only in review" filter and "Select all in review";
  - group buttons "Accept N" (previewing `planGroupAccept`, e.g. "Accept 4 of 6") and "Decline…". They send `own: false`, even for one item (D2-32).

  After a group Accept, a note lists what was left: "Left 2: ‹item› needs its own Accept (belief) · ‹item› depends on ‹item› (in review)".
- **Rows:**
  - a checkbox;
  - the status as glyph and word, never colour alone: ● in review, ✓ accepted, ✗ declined (Reject, Shaky or declined), ↻ to be redone, – withdrawn. A Result while the results are hidden reads ◌ "result after the review", with no status;
  - the label, with card names in UserText or AgentText;
  - the badges belief, changes what is proved and depends on N; the markers;
  - a spinner while a decision is on its way.
- **Keyboard** (D2-37), outside text fields:
  - ↑/↓ Back/Next; Home/End;
  - Space selects;
  - A accepts the current item, as its own Accept (`own: true`); Shift+A is Accept & next;
  - D declines: at once for an arrow item, otherwise it opens the menu (R Reject, S Shaky; T disabled);
  - Enter opens the detail on a narrow panel; Esc closes a menu, then clears the selection;
  - Ctrl+Z / Ctrl+Shift+Z act on the session stack.

  There is no key for Show results: seen early is permanent. While a step runs, the keys that decide do nothing (D2-62).
- **Accessibility:** a listbox, `aria-multiselectable`, one group per card, `aria-activedescendant` for `current`.
- **Narrow panel:** the list and the detail sit side by side from 640 px; below that, the detail replaces the list ("◀ All items").

### 5.6 The item detail
- **Header:** the label, status, badges and markers; "4 of 12" with Back/Next; "Show on board".
- **Body, by kind:**
  - **formalize:** the sentence above its Lean, the Fully explicit toggle, and "What the Lean uses";
  - **change:** field by field, before → after; "sentence and Lean may disagree"; Mentioned by;
  - **add:** every field;
  - **add-premise:** Claude's sentence and why it is needed, the Lean, "closes the gap (checked)", "may simply restate the target", "replaces follows from nothing", and "completion not checked" or "meaning differs where it was written";
  - **add-arrow / remove-arrow:** both cards' sentences, Claude's why, "adds no new basis";
  - **delete;**
  - **vocabulary term;**
  - **declaration:** the code, the gloss, "Your statements rely on it: …", and the code before a change;
  - **a hidden Result:** "The results are shown once you have decided every statement and belief item: ‹items›." Show results is a secondary button; its dialog says that every result of the stage is shown and noted as seen early;
  - **a shown Result:**
    - the verdict, with its reason chips;
    - the flags: proved from nothing ("check what the statement says"), "proves a statement changed in this session", and "replaces your proof" with the previous proof;
    - "you saw this result early";
    - the band, Rests on, Not needed, and the cards whose basis changes;
    - the proof (collapsible);
    - for not proved: the gap and the hints, and "consistency unchecked";
  - **proof-broken:** Accept is disabled, with "Re-prove it with Formalize for dependencies".
- **"updated"** opens "Previous proposal".
- **Footer:**
  - in review: Accept and Accept & next (both the item's own Accept, `own: true`), Decline ▾;
  - decided: "✓ Accepted · Back to review", or "✗ Declined (Reject) · Back to review";
  - a disabled Accept shows the gate's reason, with "Select them" for missing dependencies;
  - Accept on a not-proved Result has the tooltip "Accept the outcome: “T” stays as it was";
  - while a step runs: "Claude's step is running: you can review when it ends." in place of the buttons.
- **Hold-as dialog** (Accept on an Add premise): "How do you hold “‹sentence›”?", with "As an axiom (you hold it)" and "As a proposition, pending proof (assumed until proved; never green)", plus an optional one-line Why. For an Add premise that is already written (an adopted ghost of a converted v1 run), only "As an axiom (you hold it)" is offered (AF12).

### 5.7 The decline menu and group decisions (§10)
- **Arrow items:** one "Decline" (DO-0), described as "The arrow is taken away at once; results that use it are redone."
- **Results:**
  - Reject: "keeps the previous proof; Claude may not offer this exact proof again";
  - Shaky: "Claude tries again at Submit review".
- **Other kinds:**
  - Reject;
  - Shaky, with a "Note for Claude (optional)" field;
  - "Transform…", disabled: "The transform window comes with a later slice: use Reject, or Shaky to let Claude try something else." (D2-14). Transform is never offered on Results or arrow items.
- **Hidden Results:** no menu; Show results first.
- **Rejected in this session:** current rejects, with Un-reject; superseded rejected versions, view only. Results and their parts are left out while the results are hidden (F10).
- **Group decisions:** the list's buttons, and the Context Menu section in 2h ("N review items", Accept / Decline…), send one `decideItems` with `own: false`. So a group never gives an RV-7 item its own Accept, even when it holds a single item. A group Decline applies one option, and the plain decline to arrow items.

### 5.8 The session bar (CM-6; replaces ProposalBanner)
- **Left side:** "Edit session · Formalize for dependencies: “T”" (or "· 3 targets"), "Stage N", and the phase text:
  - step: "Claude's step for “T” (2 of 3): working · formalising", "waiting for your answer", or "checking Claude's result", then "The review waits until the last step ends.";
  - stage: "Review: 3 in review · 5 accepted", plus "· results after the review" while they are hidden;
  - confirming: "Confirm the end of the session";
  - interrupted: "Interrupted: the window reloaded while Claude was working".
- **The Current | Proposed switch.**
- **Right side:**
  - Cancel step (phases step and interrupted) and Resume (interrupted); Retry step (from the heading). With steps left in the queue, Cancel step's tooltip says "Cancels this step and the N after it; Retry step runs them later.";
  - Raw Lean diff… (phase stage): while the results are hidden, the reveal dialog comes first: "The raw diff shows Claude's proofs: opening it shows the results (noted as seen early).";
  - Submit review, the primary button:
    - disabled: the reason from `submit.gate`, with "Go to the first one";
    - enabled: the tooltip "Leads to the end confirmation: every item is accepted or rejected (no Claude step)" or "Starts Claude's next steps for N Shaky items and M to be redone; accepted items carry over";
  - Exit session…;
  - "Review (N)", when the panel is hidden.
- **Second lines:**
  - the ES-4 heading: "Claude's step did not pass: ‹text›. You can decline, formalize again or exit; nothing can be accepted until a later step passes.", "Step cancelled", or "Step failed: ‹text›", with Retry step;
  - ES-7 drift: "Your files changed since the session started: ‹files›. Apply stays disabled until they match again (undo those edits in the editor), or until you exit the session.";
  - judging: "Re-checking the working copy…";
  - (fixer 2c2 r1) the stage's problems (`SessionView.problems`), each with its text and a link to the items it names.
- **RunBadge**, never a verdict: "Edit session: Claude working · Spyro · 3/25 checks", "Edit session: review · Spyro".
- **RunElsewhere:** "An edit session is active on ‹subject›: the boards of this folder are read-only until it ends. [Show it]".

### 5.9 The end confirmation and Exit
- **Phase confirming:** EndConfirmation replaces the list. It is not modal, so its links work. It holds:
  - Changes (N), each a link;
  - Rejected, not applied (M), folded; "not run" for dropped inferences;
  - "Definitions and presuppositions you endorse";
  - **Final check:**
    - running: build · checks · backstop;
    - passed ✓: "every check passed on exactly this state; every new assumption, definition and instance was accepted individually", plus "file checks reused the last result" when they were;
    - failed ✗: the failures, each with its rule label, text, and links to the item and declaration;
  - **buttons:**
    - [Apply]: enabled only when the check passed and there is no drift; it sends the check id. Tooltip: "Writes the changes as one history entry and one Undo step", or "Records the outcome: nothing in your files changes";
    - [Back to review];
    - [Exit session…].

  There is no freeze list and no keep tick in slice 2.
- **Exit:** a modal, "Exit the edit session? This discards N accepted items and M items in review[, and stops Claude's step]. Your files are not changed; your answers to Claude's questions stay recorded. Exit cannot be undone.", with [Exit session] and [Back].
- **After Apply:** "Applied: the session's changes are in your files. One Undo takes the whole session back."

### 5.10 The Proposed view in a session (2h)
- **The overlay.** `sessionOverlay(board, current)` builds it from `SessionView.board` only: no GraphDiff and no `resultSignature` in session mode. This also ends slice 1's leaks (§7.3).
- **Card marks:** ItemMark replaces DiffBadge.
  - Glyph, word and status: "+ new · in review", "~ Formalize · accepted ✓"; a click focuses the item.
  - While the results are hidden, every target gets RESULT_HIDDEN_CHIP, and every card shows the base-masked data (§4.7), downstream cards with no chip.
- **Claude's arrows** (BD-5, S15, D2-34): `EdgeSpec.proposed { item, change, status }`, drawn only while the results are shown.
  - **An Add in review:** translucent (opacity .45), with a "+" badge at its midpoint; thin when unused, solid once the proof uses it; never round dots.
  - **An accepted Add:** dotted, still with the "+" badge, and the tooltip "Claude's arrow, accepted: written to your files at Apply".
  - **A Remove in review:** the base arrow, translucent and dotted, with a "−" badge.
  - **An accepted Remove, and a declined Add:** not drawn.
  - **High contrast:** no opacity; a dashed outline and the badge.
  - The EdgeEngine gets `setBadges`, which FZ-13's lock badges will share later.
  - Hit role `proposed`: a click focuses the item; a right click offers Accept, Decline…, Show its review item, Show “source”, Show “target”. Never selectable for Formalize until accepted.
- **Add premise drafts** (D2-35): translucent "Claude suggests" cards at the top of the AXIOMS column, with a "+" arrow into the target and a "Review it" button, only while the results are shown. They are decided only in the list.
- **Selection** (RV-9, CM-2): during a session, the Proposed view allows selecting cards, drawn arrows, accepted Claude arrows, marks and items, by click or rectangle. Drawing stays off. Moving a card is a session step (`moveProposed`), refused while a step runs (D2-62).
- **Menus:**
  - Formalize (mid-stage), the card's item entries, Select incoming arrows, Show on board;
  - editing entries stay disabled, with 1f's and 1c2's reasons;
  - "Open in editor" gets the tooltip "Opens your file; Claude's version is in the raw diff". It opens the card's place in the Current graph, since the masked graph carries no positions (§4.7); for a card that exists only in the session it is disabled, with "Claude's version is in the raw diff".
- **Legend:** an entry `proposed` ("proposed by Claude: + adds, − removes"), listed only during a session.

### 5.11 Formalize (2h)
- **`formalizeState`** returns `{ disabled, inferences (ordered), title, mode: 'start' | 'mid-stage' }`. The "several targets" reason goes. Formalize is disabled:
  - during a step: "Claude's step is running: Formalize again when it ends.";
  - while the results are hidden: "The results are not shown yet: decide the statements, or show the results, first.", with Show results (D2-65);
  - while confirming: "Back to review first.";
  - in the Current view during a session: "During a session, Formalize asks about the Proposed view: switch to Proposed.";
  - while judging, during another subject's session, on a provisional card, and on a cycle.
- **The AR-8 questions,** for each source that is not a target of the same request, in this order:
  1. in a session: "“‹L›” is not proved; during a session it can't be marked pending." [Select the arrows into “‹L›” too] [Cancel];
  2. outside a session: as in 1e (mark pending);
  3. no statement: [Select the arrows into “‹L›” too] (when it has arrows or the mark) [Cancel].

  "Select … too" adds L's drawn arrows (or its mark) to the selection and evaluates again.
- **Posting:** `formalize { inferences }`, or `formalize { runId, stage, inferences }` for a mid-stage Formalize.

### 5.12 Session Undo (2h; D2-38)
- **Steps,** by the host's label: "Accept: ‹label›", "Accept N items", "Decline: ‹label› (Reject)", "Back to review: ‹label›", "Accept: Add premise ‹card› (as an axiom)", "Show results", "Move: ‹card›".
- **Not steps:** navigation, selection, the filter, the explicit toggle, panes, opening details, Exit, Apply.
- **Routing** (`undoScope({ session, proposedOnScreen, focusInSession })`):
  - `session` when a session exists and either the Proposed view is on screen or the focus is inside `data-undo-scope="session"` (the panel, the session dialogs);
  - otherwise `board`, which stays locked during a session, with "Your files can't change during an edit session; Undo in the Proposed view undoes your review steps."
- **When sealed:** disabled, with the UN-5 text. **While a step runs:** disabled, with D2-62's text.
- `sessionUndo` sends the top action's id (`SessionView.undo.step`). A cascade opens the dialog, worded as §3.6 words the inverse action. For example, undoing an Accept: "Undoing it also returns these accepted items to review: …".

### 5.13 Phases and what they allow

| Phase | List | Accept | Decline | Submit | Formalize | Controls | Undo |
|---|---|---|---|---|---|---|---|
| step | the stage as the queue found it, read-only (D2-62) | no | no | off | off | Cancel step (with the rest of the queue), Exit | no |
| interrupted | as in step | no | no | off | off | Resume, Cancel step, Exit | no |
| stage | shown | yes; none under "did not pass"; a Result or a Result's part only while the results are shown | yes, with the same exception for hidden Results | its gate | Proposed view only, with the results shown | Retry (with a heading), Exit, Raw diff, Show results | yes |
| confirming | replaced by the confirmation | — | — | — | off | Apply, Back, Exit | after Back |
| applying | — | — | — | — | off | none | — |

While judging (a judge, or a write in the session's queue: a decision's, a take-out, a premise write or a completion; AF3): Submit, Apply, Formalize and Retry wait.

### 5.14 Removed in 2h
- `run/Review.tsx`'s stepper, `ReviewUi`, `reviewSteps`, `pastStatements`, `definitionsApproved`, `acceptSelection`, `answerDefinition`, and the Feedback composer;
- `run/ProposalBanner.tsx`;
- GhostSuggestion's "I hold this" / "No": Add premise items replace ghosts;
- the store's `acceptProposal`, `sendFeedback`, `adoptGhost`, `rejectGhost`, `discardProposal`, `openProposalDiff`, and `PROPOSED_NO_UNDO`;
- the legacy `proposal` path, and the old messages (§2.4).

Their tests are deleted, and each deletion is listed in the report.

## 6. Tests

No test calls real Claude: FakeBackend scripts, recorded streams and the fake engine, with `TELELEAN_NO_REAL_CLAUDE=1`. The quota tripwire tests stay. Real Lean runs only in the capped engine and probe tests, one file at a time, above the 12 GB rule.

### 6.1 Per sub-slice

**2a1** (core; Spyro facts and edited copies, built with fakeFacts):
- **closure:** meaning vs uses; through other statements; a `.holds` by its type; a Prop instance by its type; `complete: false` without the arrays.
- **items:**
  - keys stay stable across two working copies;
  - content keys ignore whitespace and positions, and change with valueConsts and typeConsts;
  - every ownership rule of §4.2, and the unowned cases, text outside declarations included (an `open … in` line above a declaration among them); proof-phase vocabulary is proof material; a proof-phase definition that a premise draft reaches is part of its Result, and a statement-phase one is its own item;
  - ownership is fixed at creation: a proof-phase definition stays part of its Result when a later state has a statement reach it (F7);
  - a Result draft for every inference whose step ended, also with no difference from B (a first step not proved, a give-up, a statements-only step), with a stable key (F9); it is marked `asInBase` exactly when T.holds is B's (or absent in both) and no proof material exists (AF1);
  - enclosing lines: two new declarations of different items inside one new `namespace`, and a `mutual` pair, are owned jointly and never unowned (F13);
  - premise items from drafts, by key, with §4.3's draft key; a written premise keeps its key through the ledger when adoption chose another Lean name; a draft whose target is not in `ended` makes no item (AF10);
  - a `premises:` addition's content key covers only its own entry: a later arrow into the same target leaves every accepted arrow's and premise's key as it was (AF9).

**2a2** (core, as 2a1):
- **reconcile:**
  - new, unchanged, updated, accepted leaving with its dependents, withdrawn, vanished (a problem); earlier drafts withdrawn when a new Result version comes; a written premise whose record holds the written key stays accepted;
  - after a Submit step: a Shaky set that came back unchanged, or with `no_alternative`, returns to review, marked as §3.5 says; a reverted to-be-redone item re-added identically returns to review, no longer reverted (F5);
  - a first step not proved gives its Result a record (F9);
  - a statement or belief item that enters review ends the force, and so does a Result that RV-11 returns to review; while forced, Results get the seen-early marker;
  - B's version is no new proposal (AF1): a rejected proved Result, judged again with B's T.holds back, stays declined with its key and rev, and can still be un-rejected; a Result made to be redone and reverted by a Reject cascade, by DO-0 or by the judge stays so until its Submit step ends, and then returns to review; a reworded repeat of a rejected Result comes back in review, "updated", with the rejected version superseded; a written premise taken out, whose record holds the draft key again, is unchanged; a Result reworked by a Submit step and rejected in the next stage stays rejected at the next judge, since F5's rule reads only `queueSteps`;
  - ids (AF7): a new record's id depends only on the run id and its key, so the listed items get the same ids whether or not hidden parts were created before them; no event is made for a change that touches only hidden items.
- **classify:**
  - b1–b4 and c1–c4, including a definition reached through a class field (typeConsts) and through a coercion;
  - a pending target proved is not c1; a statement first written in the session is not c2; "adds no new basis", set on the arrow item's class (AF8);
  - recomputation when a later statement starts to reach a definition;
  - a card's statement abbrev is never b4;
  - the two maps: a definition that only a premise draft reaches is a belief in `classes`, and not in `classesBeforeReveal`.
- **deps:**
  - Result → Formalize through T.holds's type; Result → Result; Result → arrow item only for sources in direct(T);
  - mentioned before; an SCC of two Results;
  - while the results are hidden, Results and their parts are absent from listed items' blockers, and a statement that mentions a written premise card waits for the results.
- **reveal** (`resultsState`):
  - shown when no statement or belief item is undecided; hidden as soon as one enters review; Results' parts, plain vocabulary, and items to be redone whose content was taken out never count;
  - a statement item to be redone with its content kept keeps the results hidden, from each source (AF4): a Shaky decline's cascade; RV-3 at a queue's end (a new statement that uses a vocabulary item declined as Shaky); and un-reject, whose returning dependents also end a force;
  - forced by Show results until a statement or belief item becomes undecided; Undo of Show results hides them again and keeps the seen-early markers;
  - F1's case: a statement-phase definition D, reached only by T's premise draft, in review with nothing else: the results are shown, `classes` makes D a belief, and they stay shown.
- **reducer:**
  - Accept refused until the dependencies are accepted; RV-7 items never taken by a group, even a one-item group (`own: false`);
  - a Result and its parts neither accepted nor declined while the results are hidden;
  - cascades follow the real dependencies into hidden Results, which never appear in `cascade`, `left` or labels; while the results are hidden, taking an Accept away always gives `needs-confirmation` with `hiddenResults`; the outcomes are the same for a proved and a not-proved copy;
  - the Accept that leaves no meaning item undecided shows the results and, in the same action, returns to review a group-accepted definition that only a premise draft reaches (D2-23 with `classes`);
  - `needs-confirmation` with the list and its wording, and nothing changes without `confirmed`;
  - Reject → dependents to be redone and reverted, transitively, Shaky dependents included; Shaky → not reverted; DO-0;
  - un-reject, whose taken-out dependents come back as to be redone without revert, and whose key leaves `rejectedFingerprints`;
  - Undo restores every recorded effect: Undo of a Reject leaves no rejected key behind; Undo of a DO-0 on an arrow a question selected puts the arrow and the source back (F4); Undo of a Reject that took a written premise out puts its card, key and ledger entries back (AF2); Undo of a premise Accept and its Redo restore `holdAs`; every seal;
  - Redo goes through the rules (AF13): after an Undo, a judge that makes an item RV-7 or leaves a dependency unaccepted makes the Redo of its group Accept refused with the rule's text; a changed rev gives `conflict`; a Redo never names a Result while the results are hidden; an Undo whose restored Accept would break RV-5 is refused; a seal, or any new action, clears Redo;
  - action ids: after an Undo and a new action, a stale `undo` naming the old id gives `conflict`;
  - to be redone → in review: allowed when not reverted; refused with its text when reverted;
  - DO-0 on an arrow a question selected takes its source out of that question and makes the Result to be redone;
  - the properties of §4.6 on random sequences.

**2b1a** (core gate, refactor only):
- every existing gate test passes unchanged after each helper is taken out of `evaluate()`;
- `evaluateRules` gives identical findings on the M2, 1e and Spyro gate suites before and after the refactor.

**2b1b** (core gate):
- each new rule has a passing and a failing case:
  - step limits: an earlier step's statement changed (`session`); a fuzzy fill passes; a non-fuzzy empty card filled; a meaning change with unchanged text, through an instance (`meaning`);
  - G5 on edited `premises:`;
  - every `arrow` token, `other-target` included, and a cycle already in B not counted;
  - `holds-kind`; `new-axiom` `type-changed`;
  - B.2 with E(T) passing, an unselected card refused, and source-only refused; a question source whose Claude arrow was declined no longer counts;
  - B.3 ignores the ledger arrow of a declined arrow item;
  - B.1's session proofs: an in-review Result counts and records the dependency, and so does a Shaky one; a non-passing source gives nothing; a rejected one gives what B's `.holds` gives; the test reads the state, not the records;
  - every `rejected-repeat` token at a step purpose, and `noAlternative`; content brought back by Undo or un-reject is not refused at `stage` or `final` (F4);
  - `stray-command`: an `attribute [simp]` line, `open Classical`, `#print`, and `open Classical in` on the line above a theorem or before it on the same line, each with the new message; namespace lines around new declarations pass, also when they enclose two items' declarations (F13);
  - `stray-command` for comments (AP-26): a new comment line between two of the person's unchanged declarations is refused with the comment message; a new comment directly above a new lemma (blank lines between allowed), and a trailing comment directly below a changed declaration, pass;
  - what the system prompt tells Claude to write passes (a `@[simp]` lemma with fully qualified names, `Classical.em`), and so does an indented `open Classical in` inside a proof;
  - `other-result`: T2's proof using T1's lemma when T1 is not a source of Q(T2); a statement using it; a statement-phase definition mentioning T1's `.holds`; a later statement mentioning a definition that T1's premise draft reaches (F7);
  - `status-mismatch` (`changed`, `removed`) under `judgeState`;
- **judge:** a three-target chain, judged sources first; other inferences' findings stay out of `stepFindings`; `commit` and `filesKey` pass through; both class maps are filled.

**2b2** (core):
- **backstop:** one refusal per code, from tampered records or final states, a changed accepted verdict or Rests on included, and `not-written` for an accepted Add premise with no ledger entry (AF2); the exemptions pass; a group-accepted Formalize of a proposition is not `own-accept`; two accepted items in one new namespace pass, and so does an accepted `mutual` pair (F13).
- **revert:** round trips through `replace-decl`; a reverted theorem gets B's text back; a written premise with its completion: card, arrow and mark removal go, and T.holds gets B's text back (AF2); enclosing namespace lines go with the last declaration they enclose, also when two items share them; the result parses.
- **formalize:**
  - X→L→A orders L before A; independent targets keep reading order;
  - the start problems in order; in a session with the results hidden, every request gets check 2's text, before anything else (D2-65);
  - a target with a Shaky item; a Shaky source and a to-be-redone one; a new target at the source of Claude's arrow, refused, and then allowed with that arrow selected.
  - check 6 (AP-29, G2): a cycle of drawn arrows elsewhere in the subject, not through the question's cards, refuses Formalize and names the cycle; the slice-1 path (`formalizeCycleProblem` and the webview's `formalizeState`) gives the same refusal; a subject without cycles is unaffected; removing one arrow of the cycle lifts it.
- **submit:** `planSubmit` takes out a kept Shaky or to-be-redone item that depends on an item another step opens, and orders the step that opens it first.
- **adoption:** `holdAs` as an axiom and as pending; anything else refused.
- **failed probe** (§2.1, D2-75): `judgeState('stage')` on facts whose `probe` is `cut` or `failed`: every draft with a declaration `factsMissing`, the `facts` problem with `probeFailure`'s sentence, `ok` false; reconcile then keeps every record and reverts nothing but no-longer-builds (a proved Result is not made to be redone by B.2's `source-only`); `judgeState('final')` not ok; the backstop's `facts` names the cause; `probeFailure` for each status (a sentence for `cut` and `failed`, undefined for `ok` and the sandbox's four) and without the marker; facts without the marker (an old recording), and B's facts with a failed probe, refuse nothing and compare by printed type and value (D2-41); the reducer refuses the Accept of a declaration item in a stage whose probe failed with `probeFailure`'s sentence and "Decline what caused it, or Exit." (`blocked` in a group), while one whose module did not build keeps ADV-3's text (AP30-5).
- **G0's `init` attribute** (§2.1, AP30-1): `@[init] def x : IO Unit := …`, `@[init f] opaque y : T`, `@[simp, init]`, `@[local init]`, `@[scoped init]`, `@[«init»]`, `attribute [init] x`, `attribute [simp, init] x`, `attribute [local init] x`, `attribute [builtin_init] x` (AP30-1 r2) and `@[builtin_init]` are refused as `metaprogramming`, with G0's message; `foldl (init := 0)`, `fun init => init`, `simp [init]`, a declaration named `init` and `attribute [simp] init` pass G0; a line B already has is not judged, except inside an attribute list one of whose lines is Claude's (AP30-1 r3). **Hygienic names (AP30-1 r3):** refused: `@[init.«_@».x._hyg] def x : IO Unit := pure ()`, `@[simp, «init».«_@».M._hyg]`, `attribute [local builtin_init.«_@».a._hyg] x`, `@[macro.«_@».x._hyg Lean.Parser.Command.check] def m : Lean.Macro := fun s => pure s`, and any other identifier with a `«_@»` component or a last `_hyg` component; passing: `x_hyg`, a binder named `hyg`, `a.b`; mutation: dropping the hygienic-name rule lets the first one through.

**2c1** (core):
- **mask:**
  - a proved pending target, under the base mask, gives every card the derived data of B's proofs, with the working copy's statements;
  - Used by of a source names neither T nor a lemma; the target's `lean.code` holds B's text, or none;
  - Claude's arrows, written premise cards, proof-phase definitions and proof-phase vocabulary are dropped;
  - without typeConsts, every declaration unchanged since B still takes B's proof-derived facts;
  - a Lean message inside a lemma or a premise card is dropped, and a target's `.holds` shows B's messages, on its card;
  - positions (AF6): a hidden lemma placed above a B card that has refs, a Lean warning and an anonymous instance (`instance : Nonempty Character`) gives the same masked graph, positions stripped as `buildSessionView` strips them, as the same working copy without the lemma: the refs, the warning's card and the instance all survive; a target's overridden `.holds` gets B's code-relative refs; the module hashes are the working copy's, so no file reads stale;
  - (fixer 2c1 r1) each against the not-proved twin, positions stripped: a source and a code-less target formalised at a not-proved finish without a freeze (`created … proof`) stay formalised; a hidden lemma or anonymous instance right below a pinned card's block (the target, another card) leaves it pinned, with no vocabulary item or TL104 of its own; no TL013 or TL014 names or describes a hidden declaration (a lemma after a blank line, an anonymous instance or a `mutual` right below a code-less card), and B's own hint comes back (also with a namespace around the hidden lemma); another card's code with a hidden lemma between its statement and `.holds` (tight, spaced, a comment above or below, a namespace around) is B's, and so with a target's `.holds` moved there (into a card new in the session too, with its comment); a card formalised in the session loses the comment that goes with a hidden lemma, and keeps its own note below a hidden `mutual`; where facts do not decide the target's kind (no facts, B without facts, its module failed, its file stale) its `.holds` reads pending; B's messages for a moved `.holds` keep the twin's order; a derived id written back reads as derived again with or without a hidden write left; endorsements and the lakefile reach the masked build; no `detail` reaches the masked facts; failing safe when the file without what is left out does not parse alike.
  - (fixer 2c1 r2) each against the not-proved twin, positions stripped: a target's `.holds` the step moved below a code-less card after a blank line gives no hint naming it (also with a visible declaration after it, whose hint B had: B's hint again), and none reads B's `.holds` where B had it below a code-less card, in place or moved; failing safe, a block whose gap or adjacent declaration is an overridden `.holds` loses its hint; a card formalised in the session, its statement and `.holds` tight or spaced, a hidden lemma between them tight or spaced (also two blank lines), reads the same code without blank lines, refs placed by it; comment lines stay (a line comment, a block comment with a blank line inside, a line comment holding `/-`), with LF and CRLF; a card B has keeps B's layout; frozen, a card formalised with a new definition gives the same items but the Result, and the same board, proved or not.
  - (fixer 2c1 r2, `judgeState`) a not-proved finish without `freeze_statements` whose new card statement uses a definition the step wrote is refused (`undeclared-premise`, token `other-result`, `CLAUDE_SESSION_TEXTS.otherResultNotFrozen`), and passes with the freeze, or when the statement uses only B's names; check_lean while formalising says nothing; a card formalised after the freeze may not use a definition written after it (the statement message); a card's statement may use another card's statement written by the same unfrozen step.
- **build:** endorsements drop `definitional-choice` only for a matching `endorsementHash`.
- **protocol:**
  - every message round-trips;
  - each malformed case of §2.4 is refused, `own` with two decisions and `declined` without an option included;
  - no unknown field survives;
  - the `session` light check.

**2c2** (core and host):
- **view:**
  - while the results are hidden: each Result a neutral row (rev 0, status null, classes null, only the seen-early marker); Results left out of the board's `marks` (AF9); Results' parts left out of the list, the counts, the board, "Rejected in this session" and the withdrawn list (F10); each InferenceView with its latest step's question; Claude's words absent;
  - with a statement to be redone and its content kept, the results hidden and Submit's gate text for it (AF4);
  - the hidden view's graph has no `loc`, `codeLoc`, vocabulary `loc` or diagnostic `range`, no `semantic.checkedAt`, `durationMs`, `detail` or `staleFiles`, and its `version` is `viewVersion` (F17);
  - once shown: the Results with their real statuses, a re-ask's note, and the unmasked board;
  - `submit.work` comes from `planSubmit`;
  - every gate text, D2-62's and D2-65's included.
- **non-interference:** the fixed pairs of §4.7 give byte-identical `SessionView` JSON while the results are hidden, and so does every sequence of decisions on listed items run through `reduceReview` (Accept, Reject, Shaky, DO-0, Undo), with its outcomes.
- (fixer 2c2 r1) the re-ask pair built through `judgeState` and `reconcile` after the user's Show results with the Formalize undecided (both hidden at the queue's end); seeded random sequences (own and group Accept, Reject, Shaky with a note, back to review and un-reject, Undo and Redo, with and without `confirmed`) on three pairs; while a step runs with the results shown, a re-ask twin that differs only in the record's question, and no words, chip or note though the records hold them; Un-reject closed outside a stage; a rejected Result left out while hidden; no Undo or Redo of a decision on an item hidden now; a taken-out Result reads the stage judgement, with no proof; the reason chip and words of the standing step; a question less D2-59's removals while hidden; stale files only once shown; the stage's problems; at stage 0, B whatever working copy is passed.
- **host:** a valid message it does not route yet gets `not-yet`.

**2b3a** (runner; real Lean only in the probe tests, capped, one file at a time, with the RAM gate):
- **`importModules`, first:** the probe job loads the Spyro fixture's built modules with `Lean.importModules` on the pinned toolchain, and its `valueConsts` equal those of the recorded 1d facts, name for name.
- **isolation, the cheat (real Lean):** the new overlay `probe-forge` is the Spyro fixture plus a statement that elaborates through an instance placed before it, `instance (priority := high) : ToString String` that rewrites that instance's name in any printed line, and `instance (priority := high) : ForIn m Lean.Loop Unit` that ends every `while` loop at once. The isolated probe's `valueConsts` and `typeConsts` are the true ones: equal to those of the same overlay without the two instances, but for their own entries. The control: `valueProbeLines`' in-file `#eval` (still the ghost check's) on the same model prints the forged lists, so the cheat is real and §2.1's residual is pinned.
- **no `[init]` in the probe job (real Lean; AP30-1):** the new overlay `probe-init` is the Spyro fixture plus a module whose own `@[init] def` prints a forged probe message (a JSON line in Lean's message format, with the probe's key and wrong lists), built by hand since G0 would refuse it in Claude's text. The probe job's status is `ok` and its constants are the true ones (those of the Spyro recordings): `importModules` with `loadExts := false` runs no `[init]`. The control: the check job, which imports the model through the frontend, does print that line. A second module uses the hygienic spelling `@[init.«_@».x._hyg]` (AP30-1 r3): the check job prints its forged line too, which pins the bypass as real on the pinned toolchain, and G0 refuses it in Claude's text.
- **the clash model** (1d's, which declares `Lean.Expr.getUsedConstants`): one check and one probe job, status `ok`, every declaration with its constants; no second check runs (AP-21's run is gone).
- **probe:** `checkFile`, `refresh` and `valueProbe`, with real Lean and the RAM gate:
  - a class field type, inductive constructor types, an instance's class, and a coercion in a statement;
  - parsing with and without the type key;
  - the check file has no `#eval` and imports only the model's modules;
  - RSS and time of the check, the probe job and the refresh reported against 1d's, and the probe message's size per declaration with the model size at which it would reach the 32 MB cap (§2.1's Cost, AP30-2); the core suite passes on core's regenerated Spyro facts, with `typeConsts` and the marker.
- **fail closed** (§2.1):
  - parsing each failure: `cut` (stdout over the cap), and `failed` (an error in the `#eval` or its imports, no line, an unreadable line, the wrong number of entries). Each gives facts whose build and check parts are kept, with no constants, a check problem naming the cause (`check-errors`), and the marker; a sandbox failure of the probe job ends the refresh with its status, as the check's does;
  - at the gate (fake `refreshFacts`): check, freeze, gate-proved and gate-not-proved (where B.2 is often not judged and the rules find nothing; AP30-3) on facts whose probe failed give an `environment` outcome with `probeFailure`'s sentence when the rules find nothing or only `source-only`, and the rules' findings otherwise; nothing passes, and no attempt is counted for the probe;
  - at the start (AP30-2): `checkBase` on base facts whose probe failed (fake `refreshFacts`) answers `environment` with `probeFailure`'s sentence and "Claude's work on this model cannot be checked.", and still writes base-facts.json; a start on such a base fails with that notice, and the FakeBackend receives no turn.
  - (fixer 2b3a r1, S-V2B3A-S1) a probe job that ran out of memory (fake `refreshFacts`): an `environment` outcome at check, freeze, both gates, the ghost check and `checkBase` (no base facts kept), never a budget finding; the build's or the check's own `oom` (no marker) and the probe's `timeout` stay budget;
  - (fixer 2b3a r1, S-V2B3A-S2; real Lean through `RefreshHooks.runLean`) the probe job's cap is `spawnMemoryMax` of the memory read right before it, not the check's; it runs after the check's imports failed, its marker kept and both causes in the detail; no probe job and no marker when the check file probed nothing;
  - (fixer 2b3a r1, C-V2B3A-C3) the reading fails on a message with the probe's key anywhere but as an information message at the `#eval`'s line, alone or beside the real line;
- **recordings:** regenerated (§2.1's Recordings), the new `probe-spyro.lean` and `probe-spyro.jsonl` among them.

**2b3b** (runner):
- **engine** (fake `refreshFacts`):
  - the scope reaches the rules, and `judgeState` runs with the session's records;
  - `judge` and `finalCheck` on facts whose probe failed: a partial stage judgement with `probeFailure`'s sentence, and a final check that fails with it, never an `environment` outcome (§2.1);
  - with `CheckContext.session`, on facts whose probe failed (AP30-3): a session check, freeze_statements, a proved finish and a not-proved finish each give an `environment` outcome with `probeFailure`'s sentence when `stepFindings` are empty or only `source-only`, never a pass, and the rules' findings otherwise; an attempt never fails on `ok` alone, without a finding;
  - `writePremise` on a judgement whose probe failed answers `{ ok: false }` with `probeFailure`'s sentence as `environment`, and no written key (AP30-4);
  - **G0 first (AP30-1 r2)**, with the fake `refreshFacts` as a spy, `renderStatements` spied, and a spy on the shadow's `syncMirror`: ws/ holding `@[init] def x : IO Unit := pure ()` at check, freeze, gate-proved and gate-not-proved (each with `CheckContext.session`), the ghost check, `judge`, `finalCheck`, `writePremise` and `complete` gives G0's `metaprogramming` finding (as `problems`, counted, with no judgement, at the step purposes and the ghost check; in `global`, with the `facts` problem and `ok` false, from `judge` and `finalCheck`; as `{ ok: false }` with G0's message from `writePremise` and `complete`), and `refreshFacts`, `renderStatements` and `syncMirror` are never called;
  - `judge` and `finalCheck` with a session context pass `validateContext` (selection, stage and round of the active step or the first inference); `judge` fills `premiseChecks` for a draft whose footprint changed;
  - `lastCommitSince` never returns a commit older than `step-start`;
  - a re-exported challenge when E(T) grows after the freeze, built from the freeze commit's copy (real Lean once, RAM-gated); a definition changed after the freeze still fails G4 (`comparator-definition-mismatch`) after the re-export;
  - `finalCheck` refuses a footprint outside the recomputed set;
  - `writePremise` renders P where it was written, reports a mismatch, and returns the written item's key (F11);
  - `complete` freezes again from the `adopt` commit and passes a good completion (real Lean once, F11);
  - `planApply` refuses when real ≠ B, and changes nothing.

**2d** (FakeBackend and the fake engine, no Lean):
- a three-target chain: the order, one step each, each step turn's first line naming its target, items stable across stages; until the last step ends, the posted SessionView keeps the stage the queue found, read-only (D2-63);
- A12, statements only: the step's first turn line names L; propose_arrow and propose_assumption get the refusal text; the step ends not proved after freeze_statements; while the results are hidden, its SessionView equals the one in which L was proved (both scripted alike), apart from progress counts; a Cancel step or an injected failure during it puts it in `retry`, as in that other run (F3);
- give-up rolls back no further than S₀, and never undoes an earlier step;
- Cancel during step 2 of 3:
  - step 1's items are kept, step 3 reads "not run", the heading shows, and Retry runs steps 2 and 3;
  - Cancel of the first step gives an empty stage with Retry and Exit;
  - the caps apply per step;
- while a step runs, `decideItems`, `revealResult`, `sessionUndo`, `sessionRedo`, `moveProposed`, `submitReview`, `retryStep`, `openSessionDiff`, a mid-stage `formalize`, and `endSession` apply or back are refused with D2-62's text; `answerQuestions`, `cancelRun` and `endSession` exit are not;
- a mid-stage Formalize seals the stack, and its items join the stage when its queue ends; it is refused while a step runs, and while the results are hidden (D2-65);
- **seals and queue numbers** (fixer 2b3a r1, C-V2B3A-C1, A-F1; §4.6): the session's first queue writes no seal, and its steps get queue number 1; each later `queue-start` (Submit review that queues steps, a mid-stage Formalize, Retry step, a Retry's steps included) writes exactly one seal and gives its steps the next number, in the same write. So after any sequence of queues, the done stack's seals number one less than the newest queue, and a decision made after k seals was made while queues 1 to k + 1 had started, as `buildSessionView`'s D2-59 removals count it (R1-1);
- re-asking a target with fewer arrows, its Result accepted (with the results shown):
  - a Cancel leaves ws/ at S₀, with the old question and the accepted Result standing and shown;
  - a give-up and a step that ends not proved keep the step's statement items and take the rest back to S₀; while the results are hidden, the InferenceView shows the question asked and the Result is a neutral row; once shown, the old question, the accepted Result and the note;
  - a proof replaces both, shown with the results;
  - while the results are hidden, the SessionView is the same in the three ended cases, and so are the RunView's `inferences`, `target` and `premises`, T being the first inference (AF5);
- `propose_arrow`: an accepted proposal is written at normalise; the refusal texts; its ledger entry is dropped after a give-up rollback, a Cancel step and a failure, and later judged states pass B.3;
- `propose_assumption` before a Cancel step, a cap or an injected failure: the step's draft is dropped in the rollback's write, and no premise item appears; after a give-up it stays (AF10);
- reload:
  - during step 2: interrupted, and Resume sends the resume turn and the queue goes on; Cancel step on it goes back to S₀, opens the stage, and step 3 reads "not run";
  - between two steps, and right after a `queue-start` write: the queue waits for Resume or Cancel step (AF3);
  - during a stage: the statuses, versions, stack and force come back, and the stage judgement is computed again from `judged-facts.json` with no Lean build, giving the same view (D2-72);
  - a crash injected after each of the four writes of a `judge-apply` with a revert recovers it, either not made or fully made, and Apply stays reachable;
  - `dispose()` called between a decision write's steps 2 and 4: after recovery, the write is either not made or fully made, never records ahead of `head` (AF11);
  - `isPersistedRun` reads version 2;
- the v1 conversion, with its ledger entries and a fresh judge; a v1 run with one adopted and one pending ghost: the adopted one is a written Add premise item in review, whose Accept offers only "as an axiom" and writes no second card, the converted proof that uses it still passes the first judge (E(T) reads written premises), and the pending one is a draft (AF12);
- while the results are hidden, the posted SessionView and RunView never contain a Result's verdict, proof text, lemma names, arrow or premise items, or Claude's words (serialise and search); a session's RunView has no `frozen` (D2-68), and its `activity` and `notices` are empty arrays that `parseHostToWebview` accepts (AF9);
- the write queue: a failing `writeStateChecked` at step 1 refuses the action and changes nothing;
- when calls resolve (AF14): Claude asks a question during step 2 of a Retry queue, and during the first step of a mid-stage Formalize, and both are answered (`retry` and `formalize` resolved once the first step was working); `decide` resolves before the judge it starts ends;
- the StepRunner extraction keeps the existing manager tests' intent: the Accept, Feedback and ghost tests are marked as moving (§0) to 2e and 2f, or go with the retirement in 2h;
- (fixer 2d r1) each with a test that fails without its fix:
  - RV-13: a step that proposes nothing shows "Claude's step proposed nothing: ‹reason›" with the results; a step whose only proposal is a premise draft does not;
  - a target whose only step was cancelled is asked as new by a mid-stage Formalize (its question replaced, its proof judged with it); a re-ask that ends without a proof takes back a definition its premise draft reaches;
  - fail closed: a SessionView that cannot be built shows nothing stale (no session view, Claude's work withheld, one telelean notice, a mid-stage Formalize refused, the RunView's questions the ones asked, the same for a proved and a not-proved re-ask); a judge that throws at a later queue's end leaves no judgement, in memory or in `judged`;
  - Cancel step of a queued step that never ran records its state only (no attempt); the gave-up notice names the step's own rollback state; a Claude process that dies mid-turn posts the interrupted session; a failed `--resume` at a step's start answers why, and Resume sends that step's own turn;
  - a reload between two judge rounds of a queue's end judges it as the queue's end without the queue-end rules a second time; a converted run's written premise keeps its card across a reload during its first judge, a judge that takes it out drops its ledger entries and card, and its pending ghosts take their explicit form from their first re-check (never replacing a draft's own);
  - a replayed Retry queue-start keeps its steps' kinds and scopes, and one whose steps cannot be rebuilt is not made; Retry and a mid-stage Formalize wait for a running or a queued judge; propose_arrow after a passing finish is refused; Cancel step clears a waiting question;
  - the A12 twins compare their whole SessionView and RunView (counts, usage and times left out), and a statements-only step that fails goes to `retry`;
- **host:**
  - a start runs the check before consent; a mid-stage Formalize asks no consent;
  - `cancelRun` is Cancel step and is not queued; a mid-stage `formalize` is not refused by `busyRefusal`; an `answerQuestions` sent while a `retryStep` or a mid-stage `formalize` waited in the host's run queue reaches the manager once that call resolves (AF14);
  - `session` is posted on change and on ready;
  - the ES-9 lock refuses board edits and lets session messages through.

**2e:**
- Reject makes one decision commit that removes exactly the item and its transitive dependents; the judge runs; A1's cascades;
- `needs-confirmation` for accepted dependents; Cancel changes nothing; while the results are hidden, taking an Accept away always asks, with the hidden-results sentence, and a hidden accepted Result that rests on the item loses its Accept, which shows with the results (D2-64);
- DO-0 makes the Results using the arrow to be redone (reverted), and the arrow is refused if proposed again;
- decisions survive the judge (AF1): Reject a proved Result, and after the judge it stays declined and can be un-rejected; Reject the source of a proved Result, and the Result stays to be redone (reverted) through the judge, and a Submit step reworks it; DO-0 on its arrow, the same;
- a Shaky decline of D makes its dependents P1 and P2 to be redone with their content kept: the results stay hidden, Submit's gate names P1 and P2, and once both are declined as Shaky the results show and Submit runs (AF4);
- Undo, then a judge that changes a class or a dependency, then Redo: refused with the rule's text, and nothing changes (AF13);
- an Accept made while a judge runs, whose outcome changes another item, keeps both changes; a Reject made while a judge runs, whose revert would take out an item: the `judge-apply` is dropped, the judge runs again on the new head, and nothing is lost (F8);
- Undo of a Reject, then a Submit queue, then Apply: all pass (F4); Undo of a DO-0 on an arrow a question selected puts its source back in the question;
- for the fixed pairs of §4.7, every sequence of Accept, Reject, Shaky, DO-0 and Undo on listed items gives byte-identical SessionView and ActionOutcome JSON while the results are hidden, and byte-identical RunView JSON with its progress counts, usage and times left out (AF5); the Retry pair too: step 1 of 2 proved T1 or not (with an arrow item and a premise draft when it did), step 2 was cancelled, and Retry step runs it while the results are hidden, with the same item ids (AF7);
- Show results shows every Result and marks them seen early; setting a statement item back to review hides them again; Undo of Show results hides them and keeps the markers; the raw diff while hidden needs `confirmed` and then counts as Show results; so does "Show Claude's activity";
- Claude's accepted arrow L → T, with the results shown; then Formalize X → L together with L → T: after the queue, the results are hidden, and the views are identical whether L was proved or not, also when T's re-ask is cancelled or ends without a proof;
- a mid-stage Formalize selects Claude's accepted arrow L → T and T is proved; declining the arrow item takes L out of T's question, makes the Result to be redone, and the report says so; a Submit step for T that uses L with no arrow fails B.2;
- a Shaky Result's dependents stay in ws/ and still pass; Reject of their source takes them out too;
- two targets share a source whose Formalize item came from the first target's step and is declined as Shaky: Submit takes the second target's Result out first, runs the first target's step first, the rework changes the source's statement, and both targets are proved again;
- a crash injected after each of the four writes of a decision (§2.6) recovers it, either not made or fully made;
- un-reject; refused after a newer version;
- Shaky with a note, then Submit: one step per affected inference, sources first; the feedback turn matches a golden file; the stage number rises when the queue ends;
- an identical Shaky set gives `rejected-repeat` (a counted attempt); with `no_alternative`, the set returns to review marked "no alternative found", can be accepted, and the next Submit does not ask Claude about it again (F5);
- an exact repeat gives `rejected-repeat`;
- Undo stops at the Submit seal; a Submit that leads to the end confirmation does not seal; a stale step gives `conflict`;
- Submit refuses a partly accepted cycle, with its text;
- a revert that breaks the build converges; if B plus the accepted items fail, the "did not pass" heading;
- judging coalesces; Submit waits while judging, and also while a decision's write is still in the queue (AF3); Accept does not.

**2f:**
- **Provenance (AP-29, G1):** an Apply with two accepted Claude arrows and one accepted Add premise writes an attempt record whose `arrows` lists the three, with their steps; a declined arrow is not listed; nothing accepted writes none; History's entry shows "Arrows from Claude"; an old record without `arrows` still loads.
- **Add premise:**
  - as an axiom: the card, the arrow and the mark removal are written at once, `writePremise`'s key is recorded as the accepted one, the completion passes, and the Result is updated;
  - as pending: a PROPOSITION with `axiom P.holds`; its own Accept is required;
  - a failed completion is taken back out (ws/ returns to the write's parent, the head the completion was written on: the adopt commit when it runs right after its premise write, as a `revert` commit), with the marker, and Retry step runs a `submit` step for T with `openProof` (F15); a meaning mismatch sends it back to review, with the write removed; a premise write whose judgement's probe failed (fake engine) is taken back out, the item stays accepted with its draft key in `fingerprint` and `accepted.fingerprint`, the stage problem names the probe's cause, and once the probe works again a reload's due write records the written key, with no "updated" item and no dependent back in review (AP30-4);
  - a second premise is unused; declining an accepted premise takes everything out, and the Result becomes to be redone;
  - hidden while the results are;
  - accepted as pending, with a crash injected before the write: after recovery the write gives a PROPOSITION card with `axiom P.holds`, and the Why the user gave;
  - due writes (AF2): a crash after the Accept's run.json write, before the premise write's step 1, and a crash after the premise write's step 4, before the completion's step 1: after recovery the write and the completion run; an Accept undone while its premise write still waits in the queue writes nothing;
  - taking out (AF2): Undo of a written premise's Accept, and back to review after it, take out the card, the arrow, the mark removal and the completion, drop their ledger entries, and leave the item in review with its draft key; later judged states pass B.3; Redo writes it again; Undo of a Reject that took a written premise out puts it back, ledger entries included;
  - the final check and the backstop refuse an accepted Add premise whose write never ran (AF2);
  - gates (AF3): a mid-stage Formalize, Submit review and Retry step wait while a premise write or its completion is queued or running, and a queue started after them begins at their last commit;
  - an accepted premise stays accepted after its write and its completion, and Apply passes the backstop's `content-changed`;
  - a draft that no longer closes the gap after a source's Formalize is rejected becomes to be redone, with its marker.
- **Apply:**
  - a spy shows `applyChanges` called exactly once, at Apply, with exactly F's files and the two sidecars, across the session, review and apply tests;
  - one history entry, of kind `accept-proposal` with the Apply label (D2-67), and one Undo step; Undo restores B, removes the endorsements and puts the moved cards back;
  - `applyChanges` still refuses any other file that is not a model file;
  - Back to review leaves the session stack as it was before Submit.
- **Drift:**
  - a hand edit sets drift at once, and undoing it clears it; Apply is refused meanwhile;
  - files changing between the check and Apply: refused, nothing applied;
  - the base commit id stays the same through the session.
- **Final check and backstop:**
  - a stale checkId is refused;
  - a tampered ws/ is refused by the backstop although the file checks were reused;
  - the backstop runs on every Apply (spy);
  - the comparator is reused only for identical files and permitted set.
- **Exit and records:**
  - Exit writes no model file;
  - attempt records are written only at the end: `graph.attempts` carries no verdict of an open session.
- **Endorsements:** written in the Apply's history entry with `endorsementHash`; ModelWorkspace reads them, so core stops flagging; a changed text flags again; Undo of the Apply makes the flag return.
- An empty Apply only records; an interrupted Apply on reload compares with F and B.
- **Host routing:** `endSession` and `moveProposed`; `endSession` with `exit` reaches the manager, and stops the step, while another run message waits in the host's run queue (AF14).

**2g** (webview unit tests):
- **the list:** `reviewRows`' order, and the dependency-first invariant on every fixture; counts, filter, navigation; hidden Results as neutral rows;
- **decisions:**
  - Accept posts exactly one `decideItems` with `rev`, `stage` and `own: true`; Accept & next moves on, and moves back on a refusal; "Select all in review" then Accept, with one item, sends `own: false`;
  - an Add premise opens hold-as and sends `holdAs` and `rationale`, with only "As an axiom" for one already written (AF12); arrow items decline plain;
  - `needs-confirmation` opens the cascade dialog, with the hidden-results sentence when `hiddenResults`; Continue sends `confirmed`; Cancel sends nothing;
  - a group sends one message and shows what was left;
- **messages:**
  - `revealResult` sends `via` after the reveal dialog;
  - submit, end, exit, retry and diff carry the right fields (the diff sends `confirmed` after the dialog); busy blocks a second request;
- **read-only while a step runs:** every review control is disabled with D2-62's text, and the keys that decide do nothing;
- **session changes:** a new stage keeps `current`; the persisted UI is used only for the same runId;
- **the session bar:**
  - its state for every phase and heading; the Submit texts; Cancel step's tooltip with the steps left;
  - drift disables Apply; Apply is disabled while the check runs and after it fails;
  - the Exit dialog counts listed items only;
  - badges never say proved or not proved in a session;
- `reviewKey` (no reveal key), `paneModeFor`, provenance (AgentText / UserText);
- the fixture pair (proved and not proved, results hidden) gives equal rows, counts and panel text.

**2h:**
- `sessionOverlay` uses only SessionView data; the fixture pair gives equal overlays; while the results are hidden, no Claude arrow or premise card is drawn, and every target has the chip;
- the arrow looks of §5.10, high contrast included; a click on a proposed arrow focuses its item, and it is never selected for Formalize;
- selection in the Proposed view during a session, with drawing off and its reason; the Context Menu's Accept and Decline… with `planGroupAccept`'s reasons;
- **Formalize:**
  - a chain gives sources first;
  - while the results are hidden, the dialog offers Show results and never says proved or not;
  - Mark pending never in a session; "Select the arrows too";
  - a mid-stage Formalize posts `runId` and `stage`; the disabled reasons;
- **Undo:**
  - Ctrl+Z in the Proposed view or the panel posts `sessionUndo` with the top step;
  - in the Current view during a session it posts nothing, and the button shows the locked reason;
  - the sealed text, and D2-62's text while a step runs; the cascade dialog;
  - moves post `moveProposed`, never `moveCards`;
- the retired messages are refused by the validators.

**2i:**
- **card-only Delete gone:** the delete dialog offers no "Delete card only, keep Lean"; `planDelete` always removes the card's Lean; the protocol validator refuses `keepLean: true` with "Deleting a card always deletes its Lean."; "Delete anyway" with dependents still works; a mutation that re-allows keepLean fails a test.
- **an old axiom's premises named:** an AXIOM card with `premises: [a, b]` shows both cards' sentences in its chip tooltip and details row; TL122's message names them; a card with none shows no chip.
- **docs:** the guide's placement and Delete paragraphs match the code (checked by reading).

### 6.2 Cheat scenarios
Each is a FakeBackend script in `packages/runner/test/run/fixtures/sessions/`, and the same state is built by hand in `core/test/review/cheats.test.ts`.
- **S1:**
  - the step rewrites the target to `¬ GoodAddition cynder newSpyro ∨ True` and proves it by `Or.inr trivial` → `existing-changed` (`target`), a counted attempt, rollback;
  - the same with a premise's Lean, and inside a mid-stage Formalize;
  - an instance placed before a fixed statement, whose printed value stays the same but whose constants change → `meaning`.
- **S4:**
  - Formalize(P) and Result(T), where T uses P.holds: the Result's Accept is blocked by Formalize(P);
  - declining Formalize(P) makes the Result to be redone, listing the accepted ones;
  - tampered records (Result accepted, P declined, P's statement left in F) → backstop `not-accepted`, also when the session's records omit P.
- **S5:**
  - `def InGame := GoodAddition`, a premise formalised through it, a one-line proof:
    - `decl:InGame` is a belief, and a group Accept leaves it;
    - the results stay hidden until InGame and the Formalize items are decided;
    - backstop `own-accept` if it was accepted by a group;
  - the class-field variant: a belief through typeConsts; with `noTypeConsts`, conservative, and Apply refused (`facts`);
  - the coercion variant (`def toGame` reached through ↑);
  - `axiom Unicorn.exists : Nonempty Unicorn`: a belief, with its helper instance in the same item.
- **S6:**
  - Claude writes `axiom T.holds : T` → `holds-kind`, or `new-axiom` (`pending`);
  - a theorem made an axiom with the same name → `type-changed` or `holds-kind`;
  - a Prop axiom bound to no card → `new-axiom` (`belief`);
  - an Add premise stays outside ws/ until accepted, then is written by the ledger;
  - an extra axiom in F → backstop `unowned`;
  - T2's proof uses a lemma of T1's proof, and T1 is not a source of Q(T2) → `undeclared-premise` (`other-result`); Claude proposes T1 → T2 → refused (`other-target`);
  - a later step's statement mentions a definition that T1's premise draft reaches → `undeclared-premise` (`other-result`, F7).
- **Stray commands:**
  - `attribute [simp] lemma` or `#print lemma` beside a lemma → `stray-command`, so a later Reject of the lemma can never leave an orphan line behind;
  - `open Classical` or `variable` before a fixed statement → `stray-command`; the same text in F → backstop `unowned`.
- **S14:**
  - an unselected proved card whose basis the question covers → `undeclared-premise` (`unselected`); the same through a `@[simp]` lemma (real Lean once);
  - `propose_arrow` makes it pass: the Result depends on the arrow item, and declining the arrow makes the Result to be redone;
  - facts without valueConsts → `source-only`;
  - at Apply, B.2 for every changed proposition.
- **S15:**
  - Claude edits `premises:` → `markup`;
  - `propose_arrow` into a non-target, into an axiom, into a target questioned by its mark, a declined arrow, or one closing a cycle → each refused with its exact text;
  - an Add arrow is own-Accept, hidden until the results are shown, and gates the Result's Accept.
- **S17:**
  - a source without `.holds` gives nothing; a proof taking it as a hypothesis is not proved;
  - Claude writes `axiom L.holds` → `holds-kind`;
  - a session-proved source counts and creates the dependency; one that does not pass in the current state gives nothing;
  - while the results are hidden, every mid-stage Formalize gets the same start message, whether or not its source was proved (D2-65).
- **S18:**
  - Claude sets or removes `follows_from` → refused;
  - a proof using no card is flagged proved from nothing;
  - an accepted premise removes the mark, only through the ledger.
- **S22:**
  - Apply refuses while the files drift, including a hand edit between the two reads;
  - a stale Undo after a sealing step cannot make Apply write anything that is not keyed and checked again;
  - no `accept-base` commit is ever made.

### 6.3 The integrator, at the slice end
- **Suites:** the full core, webview and extension suites; the runner suite on a snapshot copy with real Lean, when about 20 GB is free (as after 1c2).
- **Recordings:** regenerated (§2.1).
- **Browser and VS Code:** a scratch webview build, and Playwright one spec at a time (the new s2 specs, plus slice 1's outdated specs listed in `docs/slice1-plan.md` §8); the VS Code suite if RAM allows; anything not run is listed.
- **Then,** only if every check passes: the `dist` rebuild (AP-8), the AP entry, and the patch.

## 7. Decisions, conflicts, patches

### 7.1 How the three designs were reconciled

| Topic | Session engine | Review UI | Checks | Resolved |
|---|---|---|---|---|
| How Claude adds an arrow | appends ids to `premises:` itself | — | a `propose_arrow` tool | the tool, written by telelean at normalise (D2-1): no G5 exception, immediate refusals, every arrow attributable |
| Module | `core/src/session*` | `core/src/session.ts` | `core/src/review/` | `core/src/review/`: avoids confusion with `edit/session.ts`'s EditSession |
| Item identity | `id` + `key` | `id` + `rev` | the key as the id | an opaque id, a key, and a rev (D2-31) |
| Vocabulary | a group + sub-items | one item with sub-statuses | one item per term | one item per term, grouped (D2-31) |
| Statuses | an object union | strings | strings + records | a string status with side fields (§2.2) |
| Phases | starting, step, stage, confirming, applying, ended | step, review, ending, interrupted | — | step, interrupted, stage, confirming, applying (§2.3) |
| Messages | setItemStatus, showResult, applySession, exitSession, backToReview … | decideItems, revealResult, endSession { decision } … | — | the UI's set, with the engine's semantics (§2.4) |
| RV-6 mask | graph-level, from base | base-derived data for an outcome-independent set | facts-level, at step start | first the spec's step-start data, facts-level (D2-6), with a reveal closure (D2-9); since AP-24, B's data for every proof while the stage's results are hidden, facts-level, with the UI's indistinguishability test (D2-61) |
| What a hidden Result waits for | RV-5's dependencies | "outcome-independent" (named, not defined) | RV-5's dependencies | first an outcome-independent pre-set per Result (D2-7); since AP-24, every undecided statement and belief item, for all Results at once (D2-61) |
| Claude's activity | — | folded, not counted | must not leak | withheld while the results are hidden; opening it counts as Show results (D2-10) |
| Free text to Claude | a note on Shaky | one note at Submit | — | a note on Shaky; Ask me instead uses it (D2-13) |
| Decisions during a step | all allowed, carried out after | all, except the running step's items | — | first both (D2-3); since AP-24, none: the list is read-only while Claude works (D2-62) |
| Submit | one step per inference | one Claude step | one step with openings | one step per inference (D2-2) |
| Step-start facts | one file, overwritten | — | one per step | first one per step; since AP-24 none: the base mask needs only B's facts (D2-61) |
| Decisions while judging | Accept allowed | — | Accept waits | allowed; Submit and Apply wait (D2-27) |
| Proof-only declarations | owned by reach | — | owned by the creating step | the creating step and phase (D2-43) |
| Step-limit finding | `existing-changed` + token | — | a new code `preset` | `existing-changed` + `session` (D2-41) |
| Comparator at Apply | reused for the same commit and permitted set | — | reused unless the proof's reach changed | the engine's rule: EN-2 allows reuse only on an identical state |
| A cascade's content | removed "when it would not build" | — | not said | always removed on Reject; kept on Shaky (D2-28) |
| Badge growth | group-accepted items only | — | any growth | any growth (D2-23) |
| Drift watcher | the runner subscribes to `onDidChange` | the host calls `filesChanged()` | — | the runner subscribes: no new host API |
| Exit confirmation | a host phase | a dialog in the board | — | a dialog in the board (D2-36) |
| Endorsements | a sidecar | listed | recorded | a sidecar inside the Apply's history entry (D2-18) |
| `typeConsts` | — | — | needed for RV-7 and the backstop | adopted (D2-30) |
| Old runs in review | converted | converted | — | converted (D2-16) |
| Sub-slices | 8 | 9 | 8 | 8, ordered core → runner → webview (§1); 10 after the critic's round 1 split 2b into three, 11 after round 2 split 2a into two, and 13 after AP-24 split 2b1 and 2c into two each (§8) |

### 7.2 Autopilot decisions (for `02_autopilot_decisions.md`)

1. **D2-1** AUTOPILOT DECISION: Claude proposes arrows with a new tool, `propose_arrow { source, target, why }`. telelean validates it at once and writes the arrow into the target's `premises:` at the step's normalise. *Alternative:* Claude appends ids to `premises:` itself, under a G5 exception for the step's target.
2. **D2-2** AUTOPILOT DECISION: Submit review runs one Claude step per affected inference, sources first, in the same conversation; DO-3's "not identical" is checked per inference. Content that another step's rework would break is taken out first (D2-57). *Alternative:* one Claude step for all Shaky and to-be-redone items, as RV-12 words it.
3. **D2-3** withdrawn by AP-24 (2026-11-19): nothing is decided while a step runs (D2-62), so no decision waits for a step's end. *It was:* decisions during a step, those that change the working copy recorded at once and carried out after the step, with the step judged on the records of its start.
4. **D2-4** AUTOPILOT DECISION (A12; revised 2026-11-19, round 2, and by AP-24): a target whose source, an earlier target of the same queue, has no `.holds` when the target's step starts gets a statements-only step. Claude formalises the statements, fixes them, and finishes not proved naming that source, with no proof attempt. Its Result reads "not proved: ‹L› was not proved". Once it ended, the step is not offered to Retry step; formalize the target again once L is proved. A cancelled or failed statements-only step goes to Retry step like any other, and decides its mode again when it runs (F3). So the visible items never depend on L's hidden outcome; only the step's duration does. *Alternative:* run the step normally, letting Claude try and fail. Or (the first version) skip it without contacting Claude: the target's statements were then formalised only when L was proved, which showed L's hidden outcome.
5. **D2-5** AUTOPILOT DECISION (revised by AP-24): RV-6 is enforced on the host. While the results are hidden, the runner sends only a masked view: the base mask (D2-61), each Result as a neutral row, Results' parts left out, and Claude's words withheld. *Alternative:* mask in the webview, as 1d does.
6. **D2-6** withdrawn by AP-24 (2026-11-19): the base mask of D2-61, its former alternative, replaces it. *It was:* each hidden target's `.holds` as at the start of its step, through per-step start facts and footprints recomputed from the type and value constants.
7. **D2-7** withdrawn by AP-24 (2026-11-19): no Result waits for a set of its own; all of them wait for every undecided statement and belief item (D2-61). *It was:* an outcome-independent waiting set per hidden Result.
8. **D2-8** AUTOPILOT DECISION (revised by AP-24): while the results are hidden, a Result or a Result's part can be neither accepted nor declined; Show results first. Group decisions skip them and say so. *Alternative:* allow Decline unseen.
9. **D2-9** withdrawn by AP-24 (2026-11-19): Show results shows every Result of the stage (D2-61), so there is no closure to compute. *It was:* Show result revealed a Result together with the hidden Results it waited for.
10. **D2-10** AUTOPILOT DECISION (revised by AP-24, which folds D2-58 into it): Claude's words (summary, gap, "Assumed without asking", "proposed nothing"), activity, gate attempts and notices are withheld while a step runs and while the results are hidden. "Show Claude's activity" counts as Show results, like Raw Lean diff…. A running step shows only neutral progress counts. *Alternative:* today's D-19 (folded; opening not counted).
11. **D2-11** AUTOPILOT DECISION: a session's attempt records reach attempts.jsonl only when it ends (Apply, Exit, or the recovery of a crashed session). This fixes the M2 leak through the Current board's card details. *Alternative:* records per step.
12. **D2-12** AUTOPILOT DECISION: "Open the whole model" and "Claude may add cards" wait for slice 3, and Formalize's ▾ is not shown. *Alternative:* build them in slice 2 (they need Proof broken, Remove arrow and the card-creation rules).
13. **D2-13** AUTOPILOT DECISION: until slice 4, a Shaky decline takes an optional note, shared by a group decline and quoted in the Submit feedback. "Ask me instead" is a Shaky decline of that step's statement items, with "Ask me about: …" prefilled. *Alternative:* one "note for Claude's next step" at Submit review.
14. **D2-14** AUTOPILOT DECISION: Transform (DO-2) is listed in the decline menu, disabled, with "The transform window comes with a later slice: use Reject, or Shaky to let Claude try something else." *Alternative:* hide it.
15. **D2-15** AUTOPILOT DECISION: a Shaky step re-proposes content only: no new cards, no splits, no merges. *Alternative:* allow splits now, without the transform rules.
16. **D2-16** AUTOPILOT DECISION (revised 2026-11-19 after AP-24's recheck, AF12): a run left in review by slice 1 (v1, e.g. the doorstuck run) is converted on reload into a one-step session, with all its items in review. A ghost it adopted ("I hold this") becomes an Add premise item that is already written: in review, accepted only as an axiom (v1 wrote an AXIOM card), with no second write; a decline takes it out. If the conversion fails, only Exit is offered. *Alternative:* keep the old stepper for old runs. For adopted ghosts: convert them as accepted, as an axiom, since the user said "I hold this"; but RV-5's defensive rule would return one to review whenever its statement uses vocabulary still in review, leaving a written premise in review anyway.
17. **D2-17** AUTOPILOT DECISION: a new status, "withdrawn", for an item whose content Claude removed in a Shaky step. It needs no decision, blocks nothing, and is listed in the stage report. *Alternative:* count it as declined.
18. **D2-18** AUTOPILOT DECISION: endorsements (EN-3) go in `.telelean/subjects/<S>/endorsements.json` as {name, text hash}, written inside Apply's history entry, so Undo of the Apply removes them. *Alternative:* an append-only log outside History, like decisions.json.
19. **D2-19** AUTOPILOT DECISION: when Claude adds an arrow after the statements were fixed, the gate re-exports the challenge with the inference's new permitted set before the comparator; the statements stay fixed. *Alternative:* require a second freeze_statements.
20. **D2-20** AUTOPILOT DECISION: a mid-stage Formalize may select your arrows and Claude's accepted ones (declining such an arrow later takes its source out of the question, D2-59). An arrow in review is not selectable: "Accept this arrow first." *Alternative:* allow arrows in review, so the new inference would depend on an undecided item.
21. **D2-21** AUTOPILOT DECISION: Claude may propose an arrow only from a card that has a `.holds`. An empty statement at the source of Claude's own arrow is not fuzzy. *Alternative:* let Claude formalise E(T)'s sources too.
22. **D2-22** AUTOPILOT DECISION: one Claude conversation per session, with a new turn per step, resumed with `--resume` after a reload; the caps apply per step. *Alternative:* a new conversation per step.
23. **D2-23** AUTOPILOT DECISION: an accepted item returns to "in review" whenever its badges grow, not only when it was accepted by a group. *Alternative:* only group-accepted items.
24. **D2-24** AUTOPILOT DECISION: every change in the final state must belong to an accepted item, including lemmas and definitions that Appendix B exempts from own-Accept. This is stricter than Appendix B. *Alternative:* the exempt ones need no item at all.
25. **D2-25** AUTOPILOT DECISION: facts without type constants (old recordings, a failed probe) make every new or changed definition and instance a belief, and refuse Apply until a fresh build provides them. *Alternative:* fall back to references.
26. **D2-26** AUTOPILOT DECISION: items depending on each other in a cycle (an SCC) are accepted one by one, each blocked only by dependencies outside the cycle; Apply requires such a cycle to be wholly accepted. *Alternative:* refuse cyclic items.
27. **D2-27** AUTOPILOT DECISION (revised 2026-11-19 after AP-24's recheck, AF3): Accept, Decline, back to review, Undo, Redo and Show result stay allowed while telelean re-checks or writes the working copy: while a judge runs, and while any write waits in the session's queue (a decision's, a take-out, a premise write, a completion). Submit, Apply, Formalize and Retry wait until both are done, and a queue of Claude steps then starts as the queue's last write, so no premise write or completion can interleave with Claude's step or with the end confirmation. *Alternative:* block every decision while checking.
28. **D2-28** AUTOPILOT DECISION (revised 2026-11-19): Reject (and a plain decline) also takes out every item that depends on the declined one, transitively, if it is in review, to be redone or declined Shaky; they become "to be redone". Shaky takes nothing out: its dependents become "to be redone" with their content kept (D2-48). *Alternative:* take a dependent out only if it would no longer build.
29. **D2-29** AUTOPILOT DECISION: Cancel step, a cap or an environment failure drops the whole step (back to its start) and keeps the rest of the queue for Retry step. *Alternative:* keep the step's passing part (its fixed statements).
30. **D2-30** AUTOPILOT DECISION: a new facts field, typeConsts, from the existing value probe (since 2b3a its own Lean job, D2-75), so definitions reached through a field, an instance's class or an axiom's type count for RV-7 and the backstop. *Alternative:* valueConsts only, so S5's class-field variant would escape.
31. **D2-31** AUTOPILOT DECISION (its id revised 2026-11-19 after AP-24's recheck, AF7): items have an opaque id, a key (`card:…`, `proof:…`, `arrow:…`, `premise:…`, `vocab:…`, `decl:…`) and a revision. The id is `it` and 16 hex digits of the sha256 of the run id and the key, so no visible id depends on how many hidden items exist. Every vocabulary term is its own item, in one "Vocabulary (N)" group. *Alternative:* one Vocabulary item with sub-statuses. For the id: two counters, one for listed items and one for Results' parts, each numbering new records in key order.
32. **D2-32** AUTOPILOT DECISION (revised 2026-11-19, to the former alternative): `decideItems` carries an explicit `own` flag. Only the detail's Accept and Accept & next, and the A key on the current item, send it; a group action never does, whatever its size. So "Select all in review" with one item never gives an RV-7 item its own Accept. *Alternative:* one decision counts as the item's own Accept (the first version).
33. **D2-33** AUTOPILOT DECISION: moving cards on the Proposed view is a session-stack step; Apply writes the positions in its history entry, and Exit drops them. *Alternative:* defer moves to slice 3.
34. **D2-34** AUTOPILOT DECISION: Claude's arrows in review are translucent with a "+" badge (never dotted). Accepted ones are dotted with the "+" badge until Apply. High contrast uses no opacity, a dashed outline and the badge. *Alternative:* accepted ones stay translucent.
35. **D2-35** AUTOPILOT DECISION: an Add premise not yet accepted shows as a translucent "Claude suggests" card at the top of the AXIOMS column, with a "+" arrow into its target; it is decided only in the list. *Alternative:* on the canvas, next to the target.
36. **D2-36** AUTOPILOT DECISION: Exit's confirmation is a dialog in the board, not persisted. The Apply confirmation is a persisted phase, since it holds the final check. *Alternative:* both persisted.
37. **D2-37** AUTOPILOT DECISION, the review keys: ↑/↓, A Accept, Shift+A Accept & next, D Decline (the menu, with R and S), Space selects. No key for Show result. *Alternative:* a key for Show result.
38. **D2-38** AUTOPILOT DECISION: Undo acts on the session stack in the Proposed view, and also when the focus is in the review panel or a session dialog; in the Current view the board stack stays locked. *Alternative:* route by view only.
39. **D2-39** AUTOPILOT DECISION: Apply with nothing accepted only records the outcome: no file change, no history entry, no Undo step. *Alternative:* refuse Apply and offer Exit.
40. **D2-40** AUTOPILOT DECISION: Claude may not add a Prop axiom bound to no card; new-axiom refuses it, and a missing premise is always an Add premise item. *Alternative:* allow it as a belief item.
41. **D2-41** AUTOPILOT DECISION: the step limits reuse the finding `existing-changed`, now compared with the step's start, with a new token `session`. Meaning is compared by printed type and value plus the sets of value and type constants (from the isolated probe, D2-75; a judged state whose probe failed is refused, §2.1). *Alternative:* a new code `preset`, and printed text only.
42. **D2-42** AUTOPILOT DECISION (revised 2026-11-19, rounds 1 and 2, and by AP-24): RV-7's statement closure includes the statements of Add premise drafts while the results are shown, so a definition they rely on is a belief before the premise can be accepted. Two class maps are kept: with every draft (in force while the results are shown), and with none (in force while they are hidden, and the only one the reveal rule reads), so showing the results never changes what they wait for. A definition created in a proof phase that a draft reaches is part of its Result; one created before the statements were fixed is always its own visible item, so its visibility never depends on whether a draft exists. *Alternative:* written statements only. The premise's Accept would then be undone when its definition turns up as a new belief item.
43. **D2-43** AUTOPILOT DECISION (revised 2026-11-19, and by AP-24): a new declaration (a definition, or vocabulary) is its own item when its step created it before fixing the statements. Otherwise it is proof material, owned by the Result of the step that created it and hidden with it. The owner is fixed when the declaration is created, never re-derived from later reach, and statements may not mention proof-phase declarations (F7). *Alternative:* decide by reach from the proofs only; or give proof-phase vocabulary its own item, which would show at once and so tell the outcome.
44. **D2-44** AUTOPILOT DECISION (clarified by AP-24): an inference whose step never ended (cancelled, failed, or "not run" because a Cancel step or a failure earlier in its queue dropped it) has no Result item; Submit review drops it, and the confirmation lists it as "not run". *Alternative:* a Result item reading "not run", which would need a decision.
45. **D2-45** withdrawn by AP-24 (2026-11-19): every Result's parts are hidden whenever the results are (D2-61), and keep their statuses. *It was:* a Result hidden again took its Add arrow and Add premise items with it.
46. **D2-46** AUTOPILOT DECISION (revised 2026-11-19, round 2, and by AP-24): a target re-asked by a mid-stage Formalize keeps its old question and Result on the record until the new step ends with a proof. A step that ends without one (not proved, gave up, statements only) keeps its statement-phase content, and takes back only the target's proof, its proof material, its arrows and its premise drafts. While the results are hidden, the view shows the question asked and a neutral Result either way, so how the step ended never shows early. Once they are shown, the view shows the new version, or the old question and Result with "The new question for “T” was not proved: your earlier result stands." A cancelled or failed step goes back to its start at once. A re-ask, like any mid-stage Formalize, needs the results shown first (D2-65). *Alternative:* replace the question at once and re-judge the old proof against it; a cancelled step could then take away an accepted Result, against ES-4. Or (the first version) take the whole step back when it ends without a proof, which showed the outcome as soon as the step ended.
47. **D2-47** withdrawn by AP-24 (2026-11-19): nothing is decided while a queue runs (D2-62), so the seal at the queue's start is enough. *It was:* a seal at the start of every queued step after the first.
48. **D2-48** AUTOPILOT DECISION: a Shaky Result, like one to be redone with its content kept, still counts for the inferences that use it (B.1). The judge never reverts such an item because a check fails: its Submit step reworks it. So Shaky takes nothing out of the working copy. *Alternative:* B.1 as worded ("still in review"): Shaky on a Result then reverts every Result that rests on it, and the decline menu says so.
49. **D2-49** withdrawn by AP-24 (2026-11-19), replaced by D2-64: no cascade set and no shown status. *It was:* a hidden Result's status followed an outcome-independent cascade set and showed the status it had when last shown.
50. **D2-50** AUTOPILOT DECISION (revised 2026-11-19, round 2, and by AP-24; ES-2: a target uses another target only through a selected arrow):
    - Claude may not propose an arrow from another target of the session, and may not use a declaration of another target's proof phase unless that target is a source of its question. Statements and statement-phase content may not mention any declaration of a proof phase, the definitions that premise drafts reach included (F7), nor a target's `.holds` while its Result's content is in the working copy, so nothing visible depends on a Result.
    - A mid-stage Formalize refuses a new target that is the source of Claude's arrow into another target, unless the same request selects that arrow, which re-asks that target. The refusals that existed for hidden Results are gone: a mid-stage Formalize waits for the results to be shown (D2-65).

    *Alternative:* allow such arrows and lemmas, and make the Result wait for the other Result.
51. **D2-51** AUTOPILOT DECISION (revised 2026-11-19, round 2, by AP-24, and after AP-24's recheck): a write to the working copy is recorded in run.json as in flight before it starts, and the records name the commit they describe. Recovery reverts to that commit and runs the write again. Every write of a session runs in one queue, so no two interleave: a decision that changes only statuses waits behind a write in progress (a premise write's or a completion's Lean job included), never behind a judge. The judge's whole outcome, its record changes and its reverts, is one write, planned in the queue on the current records and dropped when the working copy moved meanwhile (F8). No session write runs while a step runs (D2-62), and the start of a queue of Claude steps is itself the queue's last write (AF3). The in-memory session changes only when run.json records it, so closing the window during a write saves a state that recovery can finish (AF11). The two run.json writes that bracket a write fail loudly, and a failed first one aborts the write. *Alternative:* rebuild the records from the working copy on recovery, which can lose decisions; or let status-only decisions bypass the queue, with each write merging the records written meanwhile.
52. **D2-52** AUTOPILOT DECISION (revised 2026-11-19, round 2, and by AP-24): in a session, Claude's files may hold only declarations, with attributes written on them, and the `namespace`, `section` and `mutual` lines around new ones. Those lines are owned jointly by the items whose declarations they enclose, go with the last of those declarations, and pass Apply when all of them are accepted (F13). Any other top-level command is refused, `open … in` before a declaration included, since core's declaration scanner does not read it as part of the declaration: Claude writes fully qualified names. *Alternative:* teach the scanner to read `open … in` prefixes as part of a declaration's header (a core parser change that G0, G5, normalisation and EditSession must follow, with its own tests); or attach each such line to the next declaration's item.
53. **D2-53** AUTOPILOT DECISION: a mid-stage Formalize refuses a target with a Shaky item, since RV-9 counts it as frozen and its proof could not change. It also refuses a source whose Result is Shaky or to be redone. *Alternative:* run the step with the target's proof closed, or let the step run and fail.
54. **D2-54** AUTOPILOT DECISION: Submit review seals the stack only when it queues Claude steps. Going to the end confirmation does not seal, and Back to review leaves the stack as it was before Submit (EN-2: "with nothing changed"). *Alternative:* Submit always seals, as UN-5's list says.
55. **D2-55** AUTOPILOT DECISION (revised by AP-24): an interrupted step also offers Cancel step, which ends it as cancelled (back to its start), drops the rest of its queue as "not run", and opens the stage, with Retry step. So the user need neither spend quota on Resume nor lose the session by Exit. *Alternative:* Resume or Exit only.
56. **D2-56** AUTOPILOT DECISION (clarified by AP-24): a premise completion that fails is taken back out of the working copy. The premise stays accepted, and the Result reads "completion not checked", with Lean's message and Retry step, which runs a Claude `submit` step for the target with its proof open. A completion is a write, never a step (F15). *Alternative:* leave the failed completion in place and block Accept until a step fixes it.
57. **D2-57** AUTOPILOT DECISION (2026-11-19, round 2): before Submit review's Claude steps start, telelean takes out every Shaky or to-be-redone item kept in the working copy that depends on an item another step of the queue opens. It becomes "to be redone" (a Shaky one keeps its note and still counts in its DO-3 set), and its own step proposes it again. The step that opens what others depend on runs first. So a Shaky item that another inference's content uses, such as a shared premise's Formalize item, can be reworked; without this, the other inference's proof would break in that step and count against Claude. *Alternative:* one Claude step for every Shaky and to-be-redone item, as RV-12 words it (D2-2's alternative), which needs a step with several targets.
58. **D2-58** withdrawn by AP-24 (2026-11-19): all of Claude's words wait for the stage's results (D2-10, revised). *It was:* a step's words waited for the Results of that step and of every earlier step.
59. **D2-59** AUTOPILOT DECISION (2026-11-19, round 2; Undo clarified by AP-24): a question's sources count for B.1 and B.2 only while their arrow exists in the state judged, at Apply too. Declining Claude's arrow that a mid-stage Formalize selected also takes its source out of that question: the Result becomes "to be redone", and the stage report says so. The decline's stack step records the change, so its Undo puts the arrow and the source back (F4). So Apply can never write a proof that uses a card with no arrow into its target (§14.7). *Alternative:* refuse to decline an arrow while a question selects it.
60. **D2-60** AUTOPILOT DECISION (2026-11-19, round 2): a to-be-redone item whose content was taken out cannot be set back to "in review" by hand: "Its content was taken out: un-reject what took it out, or let Claude redo it at Submit review." One whose content is still in the working copy can be. Un-reject brings back the dependents its commit took out, as "to be redone" with their content in place. *Alternative:* setting a taken-out item back to review re-applies its content by an inverse merge, as un-reject does.
61. **D2-61** AUTOPILOT DECISION (AP-24, 2026-11-19; revised after its recheck, AF4 and AF6): meaning before proof is one reveal for the whole stage. Every Result is neutral while any statement or belief item that is not part of a Result is undecided (belief judged without the premise drafts, so the rule has no fixpoint), or until Show results, which shows them all at once, noted as seen early. Undecided means in review, or to be redone with its content still in the working copy, which RV-6 does not count as decided; a Shaky cascade, RV-3 at a queue's end and un-reject make such items without the user deciding them. They are hidden again when such an item next becomes undecided, which also ends the force. Submit review needs the results shown (D2-64), so a statement to be redone with its content kept is first decided (as Shaky, Claude redoes it), or the results are shown. While they are hidden, the Proposed view shows every proof-derived datum as in the session's base: each target's `.holds` with B's text and facts; proof-phase declarations, Claude's arrows and written premise cards dropped; for every declaration B has with the same text, B's proof-derived facts (axioms, sorry) and B's messages, at the working copy's positions, since the build places refs, messages and anonymous instances by position. Statements and vocabulary come from the working copy. This hides at least what RV-6 requires. *Alternative:* the per-Result reveal of the earlier rounds (a waiting set and a cascade set per Result, a reveal closure, masks from each step's start, a shown status), in which two fix rounds kept finding new leaks. For items to be redone: not counting them, as before the recheck, which showed the results before the user had judged such a statement.
62. **D2-62** AUTOPILOT DECISION (AP-24, 2026-11-19): while any step of the session runs, a queue included, the review list is read-only: no status change, no Show results, no Undo or Redo, no move, no Submit or Retry. The user can still look; Cancel step, answering Claude's questions and Exit stay (freezing comes with slice 3). This departs slightly from RV-3's "at any time". *Alternative:* D2-3, decisions during a step carried out after it, with pending writes, deferred decisions and checks on the step's start records.
63. **D2-63** AUTOPILOT DECISION (AP-24, 2026-11-19): a queue of Claude steps runs to its end before the stage opens. Formalize proves its targets in sequential steps, sources first, each with its own question and permitted set (B.1); a mid-stage Formalize is a new queue whose items join the stage when it ends; Submit review runs one queue, one step per affected inference. Cancel step cancels the running step and drops the rest of the queue, listed as "not run", with Retry step. Until the queue ends, the records and the view stay as they were when it started, and reconcile runs once, at its end. *Alternative:* each step's items join the stage as soon as the step ends.
64. **D2-64** AUTOPILOT DECISION (AP-24, 2026-11-19): while the results are hidden, a Result shows no status at all, and decisions on listed items cascade into Results by their real dependencies, silently; the change shows with the results. Before an action takes an Accept away, the confirmation always comes, with "The results are hidden now: a result you accepted that rests on these loses its Accept too. You will see it when the results are shown.", naming no Result. Submit review needs the results shown, so it always reads real statuses. *Alternative:* D2-49's shown status and outcome-independent cascade set.
65. **D2-65** AUTOPILOT DECISION (AP-24, 2026-11-19): a mid-stage Formalize, a re-ask included, waits for the results to be shown: "The results are not shown yet: decide the statements, or show the results, first." So no start check, step mode or question can depend on a hidden outcome. This narrows RV-9's "at any point". *Alternative:* refuse only the requests that touch a hidden Result (a target with a hidden Result as a source or as a re-ask, or a card a hidden step could have used through Claude's arrow), as the earlier check 2 did.
66. **D2-66** AUTOPILOT DECISION (AP-24, resolving the second recheck's F4): `rejected-repeat` judges only content a step created or changed since its start, and every stack action records all its effects (rejected keys and versions, declined arrows, question changes, a force it ended), so Undo, Redo and un-reject restore them. Content the user brings back is never refused afterwards. *Alternative:* keep `rejected-repeat` for every purpose, and have Undo and un-reject clear the keys and arrows they bring back.
67. **D2-67** AUTOPILOT DECISION (AP-24, resolving the second recheck's F14): Apply records its history entry with M2's kind `accept-proposal`, labelled "Apply: Formalize for dependencies → ‹targets›", so no history kind is added and no exhaustive label map changes. *Alternative:* a new kind `apply-session`, with its entries in runner `workspace/history.ts` and webview `labels.ts`.
68. **D2-68** AUTOPILOT DECISION (AP-24, resolving the second recheck's F19; extended after AP-24's recheck, AF5): a session's RunView leaves `frozen` out, and `step.statementsFixed` tells the panel what it needs. M2's field stays as it is. Its `inferences`, `target` and `premises` follow the InferenceView's question rule, so a re-ask's outcome never shows there while the results are hidden. *Alternative:* make `frozen.permitted` optional, and update the three tests that read it. For the questions: leave `inferences` out of a session's RunView; `target` and `premises` are required fields, so they would still need the rule.
69. **D2-69** AUTOPILOT DECISION (AP-24, resolving the second recheck's F16): two residual channels are accepted and listed rather than closed. Claude, in one conversation, knows the earlier outcomes, so the visible content of a later step of the same queue may differ with them; and hidden declarations occupy Lean names, so a later visible declaration may need another name in one outcome. *Alternative:* put proof-phase declarations under the target's statement namespace, enforced as a new token, and make adoption's name scan ignore hidden declarations.
70. **D2-70** AUTOPILOT DECISION (2026-11-19, the recheck after AP-24, AF1): reconcile keeps a record declined by Reject or a plain decline, or to be redone with its content taken out, as it is when its draft is B's version: a Result whose step ended, with T.holds as in B and no proof material (`asInBase`). Only a draft that differs from B's version is a new proposal, which comes back in review, "updated" (DO-1's reworded repeat). Taking a written premise out sets its record's key back to the draft's in the same write. The rule that returns a Shaky or to-be-redone item to review once its Submit step ended reads only the queue that just ended. So a Reject stays a Reject and can still be un-rejected, and a Result taken out to be redone stays so until its Submit step reworks it. *Alternative:* give a Result no draft while it is as in B, which would undo F9's stable key for a Result that was not proved; or update the record's key at every revert, which loses the rejected version's key that un-reject and DO-1 need.
71. **D2-71** AUTOPILOT DECISION (2026-11-19, the recheck after AP-24, AF2): the writes an accepted Add premise needs follow from the records. With no ledger entry it needs its premise write; written, for a target that is not proved, it needs its completion. The action that makes one due enqueues it (the completion right after its premise write), and `recover()` enqueues every one still due, so a crash between the Accept, the write and the completion loses nothing; each write checks at its start that it is still due. The final check and the backstop (`not-written`) refuse an accepted premise that is not written. Every action that gives a written premise a status whose content is outside the working copy (a Reject, a cascade, back to review, the Undo of its Accept, reconcile's return to review) takes it out in its own write: the card, arrow, mark removal and completion go, their ledger entries are dropped (recorded on the stack, so Undo puts them back), and the key is the draft's again. So a premise in review is always outside the working copy, but for an adopted ghost of a converted v1 run (D2-16). *Alternative:* one write from the Accept to the completion, whose in-flight record lasts until the completion; the Accept would then wait for two Lean jobs, and every message behind it at the host too (D2-74). Or keep a written premise written while it is in review, and change the working-copy invariant and B.3 to match.
72. **D2-72** AUTOPILOT DECISION (2026-11-19, the recheck after AP-24, AF9): the stage judgement is not persisted. After a reload, `recover()` computes it again with `judgeState`, which is pure, from the judged commit's files and `judged-facts.json`, and in a stage applies it as a judge would; only when those facts do not belong to the judged commit, or the head has moved past it, does the judge build again. *Alternative:* persist the StateJudgement in the run directory, written before run.json names it.
73. **D2-73** AUTOPILOT DECISION (2026-11-19, the recheck after AP-24, AF13): Undo and Redo follow the rules of the same action done by hand (UN-4). Undo restores what its action recorded once the reducer has checked the restored statuses against the current state; Redo sends the recorded request again through the reducer, never a recorded state. Either is refused with the rule's text when a judge has changed a class, a dependency or the reveal since, and an item whose rev changed gives `conflict`. Any new action, a seal included, clears Redo. *Alternative:* re-apply recorded states verbatim, and let the backstop catch at Apply what the rules would have refused.
74. **D2-74** AUTOPILOT DECISION (2026-11-19, the recheck after AP-24, AF14): `formalize`, `submit` and `retry` resolve once their queue's first step is working, as `start` does, and `decide`, `reveal`, Undo, Redo and moves once their own write is recorded, never after a judge, a premise write or a completion they start. `endSession` with exit is not queued by the host, as `cancelRun` is not. So an answer to Claude's question never waits behind the call that started the queue, and Exit can always stop a step. *Alternative:* resolve every call at once and report its end in a separate message.
75. **D2-75** AUTOPILOT DECISION (2026-11-20, AP-30; the slice-3 ultra review's S3-1, confirmed by its refuter, moved here from the slice-3 plan's D3-52): the probe that gives `valueConsts` and `typeConsts` runs as its own Lean job (2b3a), from a file that imports only Lean's `Lean.CoreM` and `Lean.Util.FoldConsts` and loads the model's built modules with `Lean.importModules` when it runs. Its code is elaborated without the model, so no instance of the model on Lean's own types can forge the constants that B.2 and the bands, RV-5, RV-7, content keys, D2-41's step limits and the backstop read: not a high-priority `ToString String` that rewrites the printed line, nor a `ForIn m Lean.Loop Unit` that ends the walk at once, both of which G0 allows. That rests on two more things (AP30-1): the probe file calls `Lean.importModules mods {} (loadExts := false) (level := .private)` (4.35's defaults, written out so a toolchain bump cannot change them), so no environment extension and no `[init]` runs in it, and module-system files load whole; and G0 refuses both `initialize` and the `init` attribute (2b2), and runs before any Lean job at every purpose, the engine syncing and building nothing when it finds anything (2b3b; AP30-1 r2), so no earlier Lean job (a downstream module's build, the check job, a scratch file: each runs the `[init]` code of what it imports, with `<shadow>/.lake` writable) runs Claude's IO, which could rewrite the `.lake` artefacts the probe loads or inject Lean messages. This holds for a model whose files import only its own modules (Init is always there; AP30-7): a person's file that imports one of Lean's modules gives Claude's modules Lean's elaborator attributes (`command_elab`, `term_elab`, `tactic`, `delab`) and the `register_*` commands, which run code in later Lean jobs and which G0 does not refuse. This is logged, not closed: the person's model imports nothing but its own modules today, and telelean writes no other import. To close it, `checkBase` (2b3a) would refuse, before anything is sent to Claude, a B whose files import a module outside the project, with the notice "your files import ‹module›: telelean checks Claude's work only on models that import nothing but their own modules". The check file keeps only `#check`, `#print`, `#print axioms` and `type_of%`, and refresh's second run without the probe goes (AP-21): no model name can clash with the probe's imports any more, so such a model keeps its constants, and its bands their ✓. A judged state whose probe failed is refused, naming the cause; B's facts and facts from before 2b3a are compared approximately (§2.1); and a start whose B's probe fails is refused before anything is sent to Claude, since every state of its session would fail the same way (AP30-2). The probe's output is one Lean message under runLean's 32 MB cap, so a model whose message passes it cannot be checked at all: a limit on model size, never a pass, which 2b3a measures (the model size at which the message reaches the cap) and reports; lifting it means writing the lines to a file the runner reads with a larger bound (AP30-2). The ghost check keeps its in-file probe, since its theorem is in no built module; its constants decide only a draft's gap check and its facts before it is written, and everything they decide is judged again with the isolated probe (the residual, §2.1). The cost is one more Lean process per refresh, measured in 2b3a and accepted (AP-33): on the Spyro fixture (median of three) the refresh's peak RSS rises from 567 to 954 MB (1.68×) and its time from 0.97 to 1.48 s (1.53×), since the probe job reads Init's `.olean` parts a second time into anonymous memory (about 390 MB; runLean's cgroup peak of the probe job 469 MiB); *alternative if memory becomes a problem:* read only the model's own modules with `Lean.readModuleData` (560 MB / 0.27 s, which must then also load a module-system file's `.olean.private` part, or refuse such a model). A probe job that runs out of memory is telelean's `environment` outcome, never a budget finding (fixer 2b3a r1, AP-33). The size limit (AP30-2), measured: the probe's message is about 52 bytes per declaration on Spyro (66 estimated on extras) and about 25 bytes per listed constant, so runLean's 32 MB cap is reached near 500,000 to 650,000 such declarations, but near 13,000 declarations that list about 100 constants each. If `importModules` cannot load the model on the pinned toolchain, the integrator takes the constants from the kernel export instead (`lake env leanexport`, which G4 already runs, read by a parser in the runner), or the alternative. *Alternative:* keep the in-file probe and accept the residual. The refuter rated it major, not a blocker: it needs sabotage aimed at telelean's own probe, which Claude cannot see, and the instances still reach the person as items; but Apply's own checks read the same forged line. Refusing instances on Lean's own types instead is evaded by an `abbrev` of a Lean type. *To reverse:* before 2b3a is built, give 2b3 back its single probe bullet (§1.1). Afterwards, put the value probe's `#eval`, with the type walk, back at the end of the check file with its imports, restore refresh's second run without it, and delete `semantic/probeFile.ts`. After the slice-3 plan's 3p, the meaning walk moves with the value probe and is forgeable again: reverse D3-52 too, or keep the probe job for it (AP30-6). G0's `init` rule stays either way: it also keeps Claude's IO out of the builds and the check job. The `probe` marker and §2.1's refusals may stay, set from the in-file probe's outcome (a model whose names clash with the probe's imports then fails every check), or go, so that a failed probe is compared approximately again (S3-2's gap).

### 7.3 Carried in from slice 1 (for the integrator)
- **Leaks the designs found in slice 1's code.** The review-UI and checks designs found that the 1d Proposed view shows the outcome before the reveal:
  1. downstream cards get the "changed" badge and the "result after the review" chip only when the target was proved, and the banner's changed count rises;
  2. the hidden target's expanded card shows `lean.code`, which includes the new proof;
  3. new proof-only lemmas show in the Vocabulary band ("+N new") and in Used by;
  4. Raw Lean diff… opens without counting as Show result.

  The session-engine design found a fifth, since M2:

  5. attempts.jsonl gets the round's verdict at round end, and the Current board's card details list it.

  Slice 2 removes all five (§4.7, §5.10, D2-11).
- **For the slice-1 `dist` build** (AP-8), the integrator decides whether 1g first fixes leaks 1–4 in the webview. The review-UI design proposes a small fix:
  - the hidden set = the target plus the cards downstream of it in the current graph, shown with base statuses;
  - DiffBadge and the counts ignore the proof and status fields of hidden cards;
  - CardDetails shows the current `.holds` text for a hidden target;
  - the proposal's lemmas stay out of "+N new" until revealed;
  - Raw Lean diff asks first, then reveals.

  Recommended: it is webview-only and small.
- **Recorded facts:** regeneration is still pending from 1d, and is done together with `typeConsts`, with the isolated probe, at the end of 2b3a (§2.1, D2-75).
- **FakeBackend fixtures:** their first line `Run: "These suffice"` stays. Renaming it goes with those fixtures (the integrator's call, outside slice 2).

### 7.4 Patches and logs
- After each sub-slice, the integrator saves `verbatim_prompt_log/bundle_21/evidence/patches/after_slice_2x.patch`: every file changed or created since the baseline, excluding `package-lock.json`.
- The builder's report goes in `bundle_21/subagent_reports/`.
- At the slice end:
  - the integrator logs §7.2's decisions in `02_autopilot_decisions.md` (one AP entry, listing D2-1–D2-75, the ones withdrawn by AP-24 marked as such, and how to reverse each). The entry also warns that reversing slice 2 (`git apply -R` of its patches) leaves any open session unrecoverable, since the older build reads only version-1 run.json: Exit open sessions first. It also says, in plain words, that the Lean check's probe now runs as its own job (D2-75), so AP-21's "the check runs again without the probe" is gone, and a model whose names clash with the probe's imports now keeps its constants; that a model whose probe fails (too large, or an error of the walk on its own files) can no longer start a Formalize, with the cause named before anything is sent to Claude; and that Claude may no longer write the `init` attribute, which ran Claude's code in every Lean job that imported it (AP30-1, AP30-2). It adds that this protection assumes the model's files import nothing but their own modules: if the person's files ever import Lean's own modules (`import Lean`), Claude's files get other ways to run code in those jobs, which telelean does not refuse (AP30-7);
  - then a "slice 2 done" entry.

## 8. Change log

- 2026-11-19 (integrator): plan written from the three slice-2 designs (session engine, review UI, checks); conflicts resolved in §7.1, decisions in §7.2.
- 2026-11-19 (plan fixer, critic's round 1). Source: `bundle_21/subagent_reports/slice2_design_workflow/agents/critique_plan.json`, with 1 blocker, 14 major, 17 minor and 2 nit findings. Every finding was fixed; the new and revised decisions are D2-3, D2-7, D2-28, D2-32, D2-42, D2-43 and D2-46–D2-56.
  - **Blocker:**
    - **S1** (an Add premise accepted during a step was undone by the step's rollback): during a step, every decision that changes ws/ waits in `pending`, any Add premise decision included, and is carried out after the rollback. A premise's write and completion run then, with the marker `after-step`. §3.1, §3.6, §3.8, §5.13, D2-3; tests in 2a and 2f.
      - Unlike the critic's text, Shaky takes effect at once: under D2-48 it changes no file.
      - Also added: a step's own checks use the records of its S₀, and Undo of a deferred decision drops its pending write.
  - **Major:**
    - **S2** (queued steps did not seal): a seal `by: 'step'` at every queued step after the first. §2.2, §2.3, §3.3, §4.6, §5.13, D2-47; tests in 2a, 2d and 2e.
    - **S3** (a hidden Result's status leaked its outcome): a hidden Result follows its cascade set cas(R), and the judge's changes to it are recorded but not shown. Its view has rev 0 and only the seen-early marker; it never appears in lists and never blocks Submit. §2.3, §3.5, §3.7, §4.7, D2-49; non-interference over decision sequences in 2c and 2e.
      - This differs from the critic's fix in one point. Cascades run over the narrower cas(R), not over the waiting list pre(R), which S4 widened. Otherwise one decline of an earlier step's statement item would take out every later hidden proof. The critic's version is D2-49's alternative.
      - "Never blocks Submit" is added: without it, a hidden Result waiting for an item to be redone would block Submit, which only Show result could release.
    - **S4** (pre(R) missed what Claude's arrows and lemmas reach): pre(R) is now an outcome-independent superset. §4.7, D2-7; test in 2a.
    - **S5** (D2-42 and proof-phase vocabulary changed visible items before the reveal):
      - drafts count in R_stmt for classes only once revealed;
      - proof-phase declarations, vocabulary included, are proof material;
      - a definition that only drafts reach is part of their Result.

      §4.1, §4.2, D2-42, D2-43; twins in 2c.
    - **S6** (one target's proof could use another target's lemma):
      - proof material stays with its Result (`other-result`);
      - Claude's arrows never come from another target (`other-target`);
      - two mid-stage start checks.

      §2.7, §2.8, §4.8, §4.9, §4.12, D2-50; cheats in §6.2, tests in 2b1 and 2b2. Beyond the critic's fix, which allowed E(T)'s sources: ES-2 forbids a target to use another target through an unselected arrow, and pre(R)'s Results bullet needs this.
    - **S7** (a cancelled re-ask could revert an accepted Result): a re-asked target keeps its old question and Result until a proof. §3.2, §3.4, D2-46; test in 2d.
    - **S8** (no write order between commits and run.json): `head`, `inFlight`, the four-write order and recovery. §2.6, §3.11, D2-51; crash tests in 2d and 2e.
    - **I1** (commands outside declarations belonged to no item):
      - `stray-command`;
      - text outside declarations is unowned;
      - reverts remove the namespace lines.

      §2.7, §2.8, §4.2, §4.9, §4.10, §4.11, D2-52; cheats in §6.2.
    - **I2** (undefined shared types): a new §2.9 defines them:
      - core: InferenceJudgement, StateJudgement, ItemDraft, PendingWrite, ReviewState, ReviewAction, ReviewOutcome, ResultMask, SessionRecords, SessionViewInput, and the backstop's types;
      - runner: SessionCheckContext, `judge`, `finalCheck`, `complete`, and SessionWrite.

      JudgeInput gains `commit`, `filesKey`, `premises` and `revealed`.
    - **I3** (ItemView declared `decline` twice): the current decline is renamed `declined`; 2g's fixtures follow.
    - **I4** (2b was too big, and 2c ran beside it in core): 2b is split into three. The new sub-slices are below.
      - 2b1 judges, with the refactor-first rule.
      - 2b2 holds the backstop, revert with `replace-decl`, the start checks, and `holdAs`, which moved from 2f.
      - 2b3 holds the probe and the runner engine.

      2a writes `review/index.ts` with stubs, and §0 gets a rule: one builder at a time in core. 2c now runs after 2b2, and 2g beside 2b3 and 2d–2f. §0, §1, §1.1, §6.1.
    - **C1** (premise drafts were never checked again): after every judged state; drafts are reconciled by key and withdrawn when superseded. §3.5, §3.8; test in 2f.
    - **C2** (the Shaky rule contradicted B.1): Shaky Results, and to-be-redone ones not reverted, still count in B.1, and the judge never reverts them. This is the critic's first option; the second is D2-48's alternative. §3.6, §4.8, D2-48, D2-28.
    - **I5** (`applyChanges` refused the sidecars): `applyChanges` accepts `layout.json` and `endorsements.json`; `isSubjectSidecarFile` adds `endorsements.json`; 2f lists the workspace files. §1.1, §2.6, §3.10; test in 2f.
  - **Minor:**
    - **S9**: Cancel step on an interrupted step. §2.5, §3.4, §3.11, §3.13, §5.8, §5.13, D2-55.
    - **S10**: an explicit `own` flag. §2.2, §2.4, §2.5, §4.6, §5.5–5.7, D2-32; tests in 2a and 2g.
    - **C3**: the backstop derives ownership from B, F and the ledger; accepted Results keep their verdict and Rests on. §2.2, §3.10, §4.10.
    - **C4**: statement abbrevs are excepted from b4 and from own-accept. §4.4, §4.10.
    - **C5**: Submit seals only when it queues steps, and Back to review restores the stack. §3.7, §3.10, §4.6, D2-54.
    - **C6**: a `retry` list. §2.6, §3.2, §3.3, §3.4, §3.7.
    - **C7**: decisions reach Claude in the next step's first turn, and a step is judged with its S₀ records. §2.8, §3.3, §3.6, §2.7 (`JudgeInput.items`).
    - **C8**: the Reject cascade includes Shaky dependents, and the confirmation is worded per action. §3.6, §4.6, §5.12, D2-28.
    - **I6**: tests that move are marked `it.skip` and listed. §0, §1.1, §6.1.
    - **I7**: when `session` is posted; renderings cached by content key. §2.4, §2.6, §3.12.
    - **I8**: `isPersistedRun` accepts version 2, and the AP entry warns about reversing. §1.1, §2.6, §6.1, §7.4.
    - **C9**: a mid-stage Formalize of a target with a Shaky item is refused. §3.2, §4.12, D2-53.
    - **C10**: `PersistedStep.reveal`, which reconcile copies to the Result. §2.6, §3.5.
    - **C11**: a failed completion is taken back out. §3.8, D2-56.
    - **C12**: start check 5, for Shaky and to-be-redone sources. §4.12, D2-53. It is narrower than the critic's "neither accepted nor in review": a rejected Result puts B's `.holds` back, which contributes as it did in B (§4.8), and check 4 already covers a source left with no `.holds`.
    - **C13**: 2c lists the host files, and 2d's mid-stage `formalize` bypasses `busyRefusal`. §1.1; tests in 2c and 2d.
    - **I9**: the v1 conversion writes the ledger, checks the ghosts again and judges afresh. §3.11.
  - **Nit:**
    - **N1**: `status-mismatch` `removed` is not new; the working-copy invariant excepts drafts. §2.7, §3.1.
    - **N2**: `option` is required with `declined`; `sessionDiff` returns `kind: 'diff'`; Submit refuses a partly accepted cycle. §2.4, §2.5, §3.7.
  - **Also changed, for consistency with the fixes:**
    - RV-3 for new items that depend on Shaky or to-be-redone ones (§3.5);
    - a decision whose cascade would reach the running step's inference is refused (§3.6);
    - the forced reveal ends when a step for T ends, or when a Result in pre(R) is hidden again (§4.7);
    - two new lines in the system prompt (§2.8).
  - **New sub-slice list:**
    - 2a: contracts (§2.9 with stubs) and the item model;
    - 2b1: judging (core);
    - 2b2: backstop, revert, start checks, `holdAs` (core);
    - 2c: mask, session view, protocol;
    - 2b3: probe and runner engine;
    - 2d: sessions and steps;
    - 2e: review actions;
    - 2f: Add premise and the end;
    - 2g: review panel and session bar;
    - 2h: Proposed view in a session, Formalize, Undo, retirement.
- 2026-11-19 (plan fixer, critic's round 2). Source: the critic's round-2 findings, relayed by the workflow: 9 major, 12 minor and 1 nit, no blocker. Every finding was fixed; none was judged wrong. Where the critic offered a choice, the choice is noted. New decisions: D2-57–D2-60; revised: D2-4, D2-42, D2-46, D2-49, D2-50, D2-51, D2-52; D2-6 refined (the mask's start); D2-2, D2-10 and D2-20 now point to D2-57, D2-58 and D2-59.
  - **Major:**
    - **S1-reask-outcome-shown** (a re-ask's end showed whether it proved T): a re-ask step that passes, gives up or runs statements only keeps its statement-phase content in every case; without a proof only T.holds, its proof material, arrows and drafts go back to S₀. The inference gets `asked` until the reveal: the view shows the question asked, pre and cas use both questions' sources, pre's reference step is the latest ended step for T, and the Result shows its `shown` status. The old version and status stay on the record, shown with the report line only at the reveal. Cancel and failure still go back to S₀ at once. §2.2 (`SessionInference.asked`), §2.3, §2.6 (`PersistedStep.startHolds`), §3.2, §3.3, §3.4, §3.5, §4.7, D2-46; twins in 2c and 2e, the 2d re-ask test rewritten.
      - Also, to keep the fix closed: a re-asked target whose Result is hidden is refused (check 2, §4.12); while `asked` is set, a later step for T asks the question asked; and §4.9's `other-result` now also keeps statement-phase content from mentioning a target's `.holds`, so no visible item depends on a Result and a hidden Result's recorded changes reach only hidden items (§4.7, D2-50).
      - Found while fixing S1, and fixed with it: the mask's start (`startHolds`) moved at every step's end, so a Result that stayed hidden through a Submit step for its own target showed its first version's outcome through the mask. It now moves only when T's Result was shown since the step that set it (`shownSinceStart`). §2.2, §3.3, §4.7; twin in 2c.
    - **S2-a12-skip-shows-source-outcome** (A12's skip showed L's outcome): the critic's main fix. The step runs in statements-only mode (`StepScope.statementsOnly`): its turn names L; Claude formalises, freezes and finishes not proved naming L; `openProof` and `openArrows` are false, and propose_arrow and propose_assumption are refused with a text. The step is never put in `retry`, because its mode depends on L's outcome. The `skipped` state is gone. §2.6, §2.7, §2.8, §2.9, §3.3, §3.4, §3.13, §4.7 (residuals), D2-4; chain twins in 2c and 2e, the 2d A12 test rewritten.
    - **S3-mask-keeps-messages-and-positions:** `maskFacts` drops every Lean message located in a hidden declaration, and every message with no position; a hidden `.holds` takes its start messages. `buildSessionView` strips `loc`, `lean.codeLoc`, vocabulary `loc` and diagnostic `range`, leaves out `semantic.durationMs`, and recounts `semantic.errorCount` (beyond the finding: the header shows the error count, and the build's duration would differ in the JSON the twins compare). "Open in editor" in the Proposed view uses the Current graph's place. §4.7, §5.10; mask tests and twin variants (proof lengths, a proof before other cards, a linter warning) in 2c.
    - **S4-hold-as-not-persisted:** `ItemRecord.accepted` gains `holdAs` and `rationale`; StatusSnapshot carries them through Undo and Redo; PendingWrite and SessionWrite `premise` read them from the record; `heldAs` shows from the Accept on. §2.2, §2.3, §2.9, §3.6, §3.8; tests in 2a2 and 2f (a pending Accept during a step, with a crash before the write).
    - **S5-session-writes-not-serialised:** one write queue per session for every write, the judge's reverts included (planned in the queue against the current head, dropped and re-judged when the head moved); records-only actions take the queue briefly; steps 1 and 4 use a new `RunFiles.writeStateChecked`, and a failed step 1 aborts the write. §1.1 (2d), §2.6, §2.9 (`judge-revert` carries the judged commit), §3.6, D2-51; tests in 2d and 2e.
    - **S6-claude-arrow-source-becomes-target:** check 3's exception records the arrow's source in the target's `selectedArrows`, which counts as a question source for pre and cas from the request on, while B.1 and B.2 keep the old question. B.3 no longer re-checks an earlier step's arrow for `other-target`, which the exception would otherwise break on every later state. §2.2, §3.2, §4.7, §4.8, §4.9, §4.12, D2-50; tests in 2a2, 2b2 and 2e.
    - **I1-shaky-rework-across-inferences:** the critic's main fix. Before a Submit queue, `planSubmit` (core, 2b2) takes out every kept Shaky or to-be-redone item that depends on an item another step opens (a hidden Result through its cascade set), in one `submit-take-out` write; it becomes to be redone, reverted, a Shaky one keeping its note and DO-3 set. The step that opens what others depend on runs first. §1, §1.1, §2.9 (`SubmitPlan`), §3.3, §3.7, D2-57; tests in 2b2 and 2e.
    - **I2-premise-key-changes-on-write:** a draft's content key is defined (sentence, collapsed Lean statement, target), and DO-1 uses it for rejected premises. The premise write's step 4 records the written item's key as the record's and the accepted one, keeping the draft's in `versions`. The key stays the draft's through the ledger, whatever Lean name adoption chose. §3.5, §3.8, §4.3, §2.9; tests in 2a1, 2a2 and 2f.
    - **I3-open-in-not-declaration-text:** the critic's option (a), the smaller change: `open … in` before a declaration is a stray command; the system prompt and the message say to write fully qualified names. No parser change. §2.8, §4.2, §4.9, D2-52; tests in 2a1 and 2b1, including what Claude is told to write.
  - **Minor:**
    - **S7-step-start-records-not-persisted:** `PersistedStep.startRecords` and `startHolds`; Resume and `recover()` build SessionCheckContext from them. §2.6, §2.9, §3.3, §3.6, §3.11; the 2d reload test gains a Reject made during the step.
    - **S8-hidden-result-shown-state:** `ItemRecord.shown`, kept by the reducer and shown while hidden; Submit's plan and counts use visible items plus hidden Results by `shown`; RV-5's confirmation lists a hidden accepted Result by its label alone. §2.2, §2.3, §3.7, §4.7, D2-49; tests in 2a2, 2b2 and 2c.
    - **S9-statement-phase-decl-hidden-with-draft:** `partOfResult` and §4.7 cover proof-phase declarations only. §2.9, §4.2, §4.7, D2-42; twin in 2c.
    - **S10-host-sends-hidden-data:** in a session `RunView.frozen` holds only `round` and `at` (`permitted` optional, 2a1); the host answers `openSessionDiff` with `needs-confirmation` unless `reveal` names every hidden Result. §1.1, §2.3, §2.4, §2.5, §3.12; tests in 2d and 2e.
    - **S11-force-survives-new-hidden-source:** a force also ends when a hidden Result joins pre(R). §4.7; test in 2a2.
    - **S12-declined-arrow-left-in-question:** a question's sources count only while their arrow exists, at Apply too; declining Claude's arrow that a question selected takes its source out of the question, and the Result becomes to be redone. `ReviewState.questionArrows` lets the reducer do it. §2.9, §4.6, §4.8, §4.9, §4.10, D2-59; tests in 2a2, 2b1 and 2e.
    - **S13-claude-words-cross-steps:** the critic's first option, the mechanical one: a step's words wait for the Results of that step and every earlier step. §2.3, §2.9, §3.12, §4.7, §5.3, §5.4, D2-58 (D2-10 extended); tests in 2a2, 2c and 2e.
    - **C1-ledger-after-rollback:** one rule for every rollback, and B.3 compares with the ledger arrows whose item is not declined. §3.4, §4.9; tests in 2b1 and 2d.
    - **C2-reexport-source:** the re-export is built from the step's freeze commit, changing only `permittedAxioms`. §3.3; test in 2b3.
    - **I4-reducer-contract-gaps:** `ReviewState.waiting` (pre and cas), `SessionAction.id` with `nextAction` (used by Undo, Redo and PendingWrite), and the table row for "to be redone → in review" (refused when reverted). Un-reject now says what happens to the dependents its commit took out. §2.2, §2.3, §2.4, §2.6, §2.9, §3.6, §4.6, §5.12, D2-60; tests in 2a2.
    - **I5-endorsements-read-and-hash:** 2c exports `endorsementHash`; 2f's ModelWorkspace reads `endorsements.json`. §1.1, §2.6; tests in 2c and 2f, Undo of an Apply included.
    - **I6-2a-size:** 2a is split into 2a1 and 2a2, one after the other. Unlike the critic's grouping, the reconcile rules go to 2a2, since they read classes, dependencies and cascade sets. 2a2 also gets a fallback split point. §0, §1, §1.1, §2, §4, §6.1, §7.1, §9.
  - **Nit:**
    - **N1-check-context-for-session-judges:** for `judge` and `finalCheck`, CheckContext's selection, stage and round are the active step's (or the first inference's), and judgeState ignores them; `validateContext` is unchanged. §2.9; test in 2b3.
  - **New sub-slice list:**
    - 2a1: contracts (§2.9 with stubs), texts, closures, ownership and content keys (core);
    - 2a2: classes, dependencies, reveal rules, reconcile and the reducer (core);
    - 2b1: judging (core);
    - 2b2: backstop, revert, start checks, Submit's plan, `holdAs` (core);
    - 2c: mask, session view, protocol, `endorsementHash` (core and host);
    - 2b3: probe and runner engine;
    - 2d: sessions and steps, with the write queue, statements-only steps and re-asks;
    - 2e: review actions;
    - 2f: Add premise and the end;
    - 2g: review panel and session bar;
    - 2h: Proposed view in a session, Formalize, Undo, retirement.
- 2026-11-19 (integrator on autopilot, AP-24: slice 2 simplified). Two fix rounds kept finding new major problems in the most intricate mechanisms, so the integrator simplified slice 2 and removed the machinery the simplification makes unnecessary. New decisions: D2-61–D2-69. Withdrawn: D2-3, D2-6, D2-7, D2-9, D2-45, D2-47, D2-49, D2-58. Revised: D2-4, D2-5, D2-8, D2-10, D2-42, D2-43, D2-44, D2-46, D2-50, D2-51, D2-52, D2-55, D2-56, D2-59.
  - **The simplifications:**
    - **One reveal per stage** (D2-61, D2-64, D2-65). All Results are neutral while any statement or belief item (not part of a Result) is in review, or until Show results, which shows them all, noted as seen early. They are hidden again when such an item enters review. Meanwhile the Proposed view shows every proof-derived datum as in the session's base, with statements and vocabulary from the working copy. This hides at least what RV-6 requires. A hidden Result shows no status, decisions reach it through its real dependencies, and a mid-stage Formalize waits for the results.
    - **No decisions while a step runs** (D2-62). The list is read-only while any step of the session runs, a queue included: no status change, Show results, Undo, Redo or move. Looking, Cancel step, answering Claude and Exit stay. This departs slightly from RV-3's "at any time".
    - **A queue runs to its end before the stage opens** (D2-63). The start's targets, a mid-stage Formalize, Submit review and Retry step each run one queue, one step per target or affected inference, sources first. The stage opens when the last step ends, or when Cancel step or a failure drops the rest ("not run", with Retry step). The records and the view stay as they were until then, and reconcile runs once, at the end.
    - **Kept,** because they are sound and needed: the items, statuses, RV-5 dependencies, RV-7 classes recomputed on every judged state, the decline options, Apply with the final check and the backstop, Exit, the session stack sealed when every queue starts, crash-safe persistence and the one write queue, arrow items, Add premise items, and the masked view built on the host, now with the simpler rule.
  - **Removed:**
    - the per-Result reveal: the waiting sets pre(R), the cascade sets cas(R), the reference step, `revealClosure`, rule 1 for hidden Results, the per-Result force (`ItemRecord.reveal`) and the shown status (`ItemRecord.shown`);
    - the re-ask's twin questions (`SessionInference.asked`) and `selectedArrows`;
    - the step-start mask: `startHolds`, `shownSinceStart`, the per-step `start-facts.json`, `ResultMask`, `resultMask`, the residual-axioms recomputation, and `SessionViewInput.startFacts`;
    - decisions during a step: `PendingWrite` and `PersistedSession.pending` (an action's ws/ changes, now `ItemWrite`, are carried out at once), the `after-step` marker, `ReviewState.running`, the "Decisions made while you worked" turn, and `PersistedStep.startRecords` (the records cannot change during a queue);
    - the seal at every queued step (`SealBy` `step`) and the seal on answering Claude's question (`answer`: the queue's own seal has the same effect, since nothing is decided during it), and the activity reveal of a running step (`PersistedStep.reveal`, `revealResult`'s `step`);
    - per-step withholding of Claude's words (D2-58), the reveal lists of `revealResult` (`alsoReveal`) and `openSessionDiff` (`reveal`), and `revealed` in JudgeInput and SessionCheckContext;
    - the `completion` step kind (a completion is a write, F15);
    - check 2's three hidden-source refusals (one rule replaces them, D2-65), and the generated twin variants that only the per-Result reveal needed (re-ask questions, `selectedArrows` chains, step-start masks); fixed pairs remain as the non-interference test.
  - **Changed:**
    - §1 and §1.1: 2b1 is split into 2b1a (the refactor) and 2b1b (the new rules), and 2c into 2c1 (the base mask, the build option, the protocol) and 2c2 (the session view); fallback splits for 2a2, 2c2, 2b3, 2d and 2g.
    - §2.2: `SessionAction` records every effect of an action; `ItemRecord.partOf`; `PremiseDraft.facts`; `SessionForce`; `SealBy` without `step` and `answer`.
    - §2.3: `SessionView.results`; a hidden Result's `status` is null; `StepView` gains `not-run` and loses `completion`; `StageReportView.notes`; the RunView's `step.statementsFixed`, and no `frozen` in a session.
    - §2.4 and §2.5: `revealResult { via }`; `openSessionDiff { confirmed }`; every review message refused while a step runs; Cancel step drops the rest of the queue.
    - §2.6: `forced` and `viewVersion`; the `judge-apply` write; no session write while a step runs; Apply's history kind.
    - §2.7 and §2.9: the two class maps; `premiseChecks`; `StepState`; `ItemWrite`; the simpler `ReviewState` and `ReviewOutcome`; `BaseMask`; signatures for `computeItems`, `classify`, `itemDeps`, `resultsState`, `reconcile`, the group planners and the start checks (`FormalizeSession`); `writePremise`.
    - §3: rewritten for queues (§3.1, §3.3–§3.5, §3.13), decisions only in a stage (§3.6), Submit with the results shown (§3.7), premise writes at once (§3.8), reload between steps (§3.11), and the RunView (§3.12).
    - §4.7 is rewritten as the stage reveal and the base mask; §4.1, §4.2, §4.5, §4.6, §4.8, §4.9 and §4.12 follow it.
    - §5: read-only while Claude works; hidden Results as neutral rows; Show results for the whole stage; Formalize disabled while the results are hidden.
    - §6: the tests per new sub-slice; the non-interference test uses fixed pairs; cheats S5, S6, S15 and S17 follow.
  - **The second recheck's findings** (`bundle_21/subagent_reports/slice2_planfix_workflow/agents/recheck_round2.json`, F1–F20: 11 major, 8 minor, 1 nit):
    - **gone with the simplification:** F1 (the reveal rule had no fixpoint: the stage rule reads `classesBeforeReveal` and leaves Results' parts out, so showing the results never changes what they wait for; a 2a2 test keeps it so), F2 (`asked` and its earlier question are gone), F6 (cascades follow the real dependencies, and Submit needs the results shown, so take-out reads real statuses), F20 (no shown status to read);
    - **fixed:**
      - F3: a cancelled or failed step goes to `retry` in either mode, and Retry decides the mode again (§2.6, §3.3, §3.4);
      - F4: every action records all its effects, un-reject clears the key and the arrow, and `rejected-repeat` applies only at step purposes, to content made since S₀ (§2.2, §3.6, §4.6, §4.9, D2-66). Its part (c), the activity reveal, is gone;
      - F5: Shaky and to-be-redone items return to review when their Submit step ended (§3.5);
      - F7: ownership is fixed at creation, and `other-result` covers every proof-phase declaration (§4.2, §4.9, D2-43, D2-50);
      - F8: the judge's whole outcome is one `judge-apply` write, reconciled on the current records (§2.6, §3.5, D2-51);
      - F9: a Result for every inference whose step ended (§4.2);
      - F10: Results and their parts are left out of the Rejected and withdrawn lists while the results are hidden (§2.3, §3.6, §5.4, §5.7);
      - F11: `engine.writePremise`, and a completion that freezes again from the adopt commit (§2.9, §3.8);
      - F12: `PremiseDraft.facts`, the function signatures, `FormalizeSession` (its second point gone with D2-65), and generic group planners (§2.2, §2.9, §4.6, §4.12);
      - F13: enclosing lines owned jointly (§4.2, §4.9, §4.10, §4.11, D2-52);
      - F14: Apply uses M2's `accept-proposal` kind (D2-67);
      - F15: a completion is a write; its Retry is a `submit` step (§2.3, §3.8, D2-56);
      - F16: both channels listed as accepted residuals (§4.7, D2-69);
      - F17: the hidden view drops build times and details, takes `version` from `viewVersion`, and is published only from a converged judgement (§4.7);
      - F18: 2b1 and 2c are split (§1);
      - F19: a session's RunView leaves `frozen` out (D2-68);
    - **still open:** none.
  - **New sub-slice list** (the core ones strictly in this order; 2g beside 2b3 and 2d–2f):
    - 2a1: contracts (§2.9 with stubs), texts, closures, ownership and content keys (core);
    - 2a2: classes, dependencies, the stage reveal rule, reconcile and the reducer (core);
    - 2b1a: the rule helpers taken out of `evaluate()`, behaviour unchanged (core);
    - 2b1b: step limits, B.1–B.4, `judgeState`, the new tokens, `proposeArrowProblems` (core);
    - 2b2: backstop, revert, start checks, Submit's plan, `holdAs` (core);
    - 2c1: base mask, build option, `endorsementHash`, protocol (core);
    - 2c2: `buildSessionView` and the host's `not-yet` (core and host);
    - 2b3: probe and runner engine, `writePremise` included;
    - 2d: sessions, queues and steps, with the write queue, statements-only steps and re-asks;
    - 2e: review actions;
    - 2f: Add premise and the end;
    - 2g: review panel and session bar;
    - 2h: Proposed view in a session, Formalize, Undo, retirement.
- 2026-11-19 (plan fixer, the recheck after AP-24). Source: the recheck's findings, relayed by the workflow: 6 major and 8 minor, no blocker. They are numbered F1–F14 there and cited here as AF1–AF14, since (F1)–(F20) already name the second recheck's. Every finding was fixed; none was judged wrong. The AP-24 simplifications stay as they were: one reveal per stage, nothing decided while a step runs, and every queue runs to its end. New decisions: D2-70–D2-74; revised: D2-16, D2-27, D2-31, D2-51, D2-61, D2-68.
  - **Major:**
    - **AF1** (reconcile read B's version of a rejected or reverted Result as a new proposal, so a Reject was lost, and a Result to be redone became an "updated" one that no Submit step reworked): computeItems marks a Result draft that is B's version `asInBase`, and reconcile keeps a declined or reverted record as it is when its draft is; only a draft that differs is DO-1's reworded repeat. Taking a written premise out sets its key back to the draft's. Beyond the finding: F5's rule (a Shaky or to-be-redone item returns to review once its Submit step ended) now reads only the steps of the queue that just ended (`queueSteps`), since at a later judge it would undo a Reject or a revert the same way. §2.9 (`ItemDraft.asInBase`, `reconcile`'s and `judge-apply`'s `queueSteps`), §3.5, §3.8, §4.2, §4.6, D2-70; tests in 2a1, 2a2 and 2e.
    - **AF2** (an accepted premise's write and completion were lost after a crash, and nothing noticed; back to review and Undo of a written premise were undefined): for (a), the critic's first option: premise writes and completions are due writes, enqueued again by `recover()` and checked again when they start; the final check and a new backstop code `not-written` refuse an accepted premise that is not written. For (c), the critic's first option: every action that gives a written premise a status outside the working copy takes it out in its own write, with its ledger entries recorded on the stack for Undo and its key back to the draft's; un-reject of a premise merges nothing. Beyond the finding, to keep the fix closed: ledger entries name the premise by its key (computeItems has no records to map an id); a take-out is planned when its write starts, so a premise written meanwhile is covered; the completion runs right after its premise write, so it always starts from the `adopt` commit; and reconcile's own return of a written premise to review takes it out too. §2.2 (`LedgerEntry`, `SessionAction.takenOut`), §2.9 (`ItemWrite`, `SessionWrite`, `BackstopRefusal`), §3.1, §3.6, §3.8, §3.10, §3.11, §4.10, §4.11, D2-71; tests in 2a2, 2b2 and 2f.
    - **AF3** (the gates did not wait for a premise write or its completion): `judging` covers every write still in the session's queue, for Submit, Apply, Formalize and Retry, and a queue of Claude steps starts as the write queue's last write (`queue-start`), after which recovery waits as it does between two steps. §2.3, §2.6, §2.9, §3.1–§3.4, §3.6, §3.7, §3.11, §5.13, D2-27, D2-51; tests in 2d, 2e and 2f.
    - **AF4** (a statement to be redone with its content kept did not keep the results hidden): such an item is undecided, and counts in `waitingFor` and for the force like an item in review. Submit's gate names it when it is what keeps the results hidden. No new mechanism. §2.3, §2.9, §3.5, §3.7, §4.6, §4.7, D2-61; tests in 2a2 (each source: a Shaky cascade, RV-3 at a queue's end, un-reject), 2c2 and 2e.
    - **AF5** (RunView's `inferences` and `premises` showed a re-ask's outcome): the critic's first option: they follow the InferenceView's question rule and are filled from the SessionView; the RunView joins the fixed pairs' byte comparisons. §2.3, §3.12, §4.7, D2-68; tests in 2d and 2e.
    - **AF6** (B's facts carried B's positions into the masked build): `maskFacts` is specified field by field: the working copy's DeclFacts and module entries, with only `axioms` and `usesSorry` from B; B's messages moved by the declaration's line offset; an overridden `.holds` placed against B's range. Its signature now takes the two models, since facts hold no texts to compare. §1.1, §2.9, §4.7, D2-61; test in 2c1.
  - **Minor:**
    - **AF7** (one id counter told how many hidden parts exist): item ids are a hash of the run id and the key, so there is no counter (`nextItem` is gone); no event is made about hidden items, so event ids count visible ones only. §2.2, §2.3, §2.6, §2.9, §3.5, D2-31; tests in 2a2 and 2e (a Retry pair).
    - **AF8** (missing signatures): §2.9 gains `permittedFor` (B.1), `proposeArrowProblems`, `planItemRevert` and `buildSessionView`; `reconcile` takes the run id instead of a counter; `classify` takes the inferences and sets `ItemClass.addsNoNewBasis`. §1.1, §2.2, §2.9, §4.4, §4.9, §4.11.
    - **AF9** (contracts that did not type-check): (a) the stage judgement is computed again on load (D2-72, §3.11); (b) a premise write and a completion also replace `judged` (§2.6); (c) `refused` joins `ActionErrorCode` in 2a1; (d) a session's RunView sends `activity` and `notices` as empty arrays; (e) Results are left out of the board's `marks` while hidden; (f) `ReviewOutcome.events`, and reconcile's events, without ids, which the runner gives; (g) drift is persisted as `{ files, at }`; (h) a `premises:` addition's key covers only its own entry (§4.3). Tests in 2a1, 2c2 and 2d.
    - **AF10** (a rolled-back step's premise drafts stayed): every cancelled or failed step drops its drafts in its rollback's write, and premise items exist only for inferences in `ended`. §3.4, §4.2; tests in 2a1 and 2d.
    - **AF11** (closing the window during a write could save records ahead of `head`): the in-memory session changes only at a write's steps 1 and 4. §2.6, D2-51; test in 2d.
    - **AF12** (a converted adopted ghost would be written twice): it converts as a written Add premise in review, accepted only as an axiom with no second write, and its detail says so (`writtenInReview`). The critic's first option, since converting it as accepted would meet RV-5's defensive rule. Beyond the finding: E(T) and B.2 now read T's written premises (the ledger), not its accepted ones, so the converted run's proof that uses the ghost still passes while the ghost is in review, and E(T) always matches what ws/ holds. §2.2, §2.3, §2.9, §3.1, §3.8, §3.11, §4.8, §4.9, §5.6, D2-16; tests in 2d and 2g.
    - **AF13** (Redo re-applied recorded states verbatim): Undo checks the restored statuses against the current state, Redo sends the recorded request again through the reducer, and any new action, a seal included, clears Redo. §2.2 (`SessionAction.request`), §3.6, §4.6, D2-73; tests in 2a2 and 2e.
    - **AF14** (when RunManager calls resolve was not said, so a question asked during a queue could wait forever behind the call that started it): each call's resolution is specified, and `endSession` exit bypasses the host's run queue. §1.1, §2.5, D2-74; tests in 2d and 2f.
  - **Sub-slices:** unchanged, 13. No fix needed a new one, and every core change stays in 2a1–2c2. The core ones run strictly in this order; 2g runs beside 2b3 and 2d–2f:
    - 2a1: contracts (§2.9 with stubs), texts, closures, ownership and content keys (core);
    - 2a2: classes, dependencies, the stage reveal rule, reconcile and the reducer (core);
    - 2b1a: the rule helpers taken out of `evaluate()`, behaviour unchanged (core);
    - 2b1b: step limits, B.1–B.4, `judgeState`, the new tokens, `proposeArrowProblems` (core);
    - 2b2: backstop, revert, start checks, Submit's plan, `holdAs` (core);
    - 2c1: base mask, build option, `endorsementHash`, protocol (core);
    - 2c2: `buildSessionView` and the host's `not-yet` (core and host);
    - 2b3: probe and runner engine, `writePremise` included;
    - 2d: sessions, queues and steps, with the write queue, statements-only steps and re-asks;
    - 2e: review actions;
    - 2f: Add premise and the end;
    - 2g: review panel and session bar;
    - 2h: Proposed view in a session, Formalize, Undo, retirement.
- 2026-11-19 (builder 2a1: review contracts and the item model, part 1). The contracts of §2.2, §2.3 (types), §2.7 (`StepScope`, `JudgeInput`) and §2.9 are written as specified; no contract was changed. Details the plan left open, decided here:
  - **Where things live.** `core/src/review/`: `types.ts` (with `CascadeEntry`, which `actions.ts` imports type-only), `view.ts` (the §2.3 types, a `SessionPhase` alias for `SessionView['phase']`, and the `buildSessionView` stub), `texts.ts`, `keys.ts`, `hash.ts`, `closure.ts`, `items.ts`, and one stub module per later function, named as §1.1 names its sub-slice's file: `classify.ts`, `deps.ts`, `reveal.ts`, `reconcile.ts`, `reducer.ts` (2a2), `permitted.ts`, `judge.ts` (2b1b, `judgeState` included), `backstop.ts`, `revert.ts`, `formalize.ts`, `submit.ts` (2b2), `mask.ts` (2c1). Each stub throws `NotImplementedError` ("‹name› (slice 2x)"); `review/index.ts` re-exports them all, and `core/src/index.ts` gains `export * from './review/index.js'`, so no later sub-slice edits an index file. The slice-1 one-target check keeps its name, `formalizeStartProblem`, in `core/src/formalize.ts`.
  - **Contracts' additive fields.** `DeclFacts.typeConsts?`; `RunView.session?`, `inferences?`, `step?` (`frozen` unchanged, D2-68); `ActionErrorCode` gains `refused`; `ActionOutcome`'s ok branch gains `review?`, and its one error branch (shared by every code, as in M2) gains optional `cascade`, `hiddenResults` and `reveal`.
  - **Hashes.** Core has no crypto, so `hash.ts` holds a pure SHA-256 over UTF-8 (checked against Node's digests in the test), `canonicalJson` (sorted keys, `undefined` dropped) and `reviewItemId(runId, key)` = `it` + the first 16 hex digits of sha256(canonical JSON of `[runId, key]`), for 2a2's reconcile (AF7).
  - **Keys.** `keys.ts` builds and reads the §2.2 keys (`cardKey`, `proofKey`, `premiseKey`, `arrowKey`, `unarrowKey`, `vocabKey`, `declKey`, `parseItemKey`).
  - **Closures** (`closure.ts`). `constsOf` as §4.1 (Prop-valued = `typeSort` is `Prop`; a missing kind counts as a def, the over-approximation). `reach` includes its starts; `stopAt` never stops a start; without `stopAt` each start's closure is memoised per model and mode. `statementReach` returns the model's declarations only, with `by` holding card ids and drafts' item keys (`premise:<T>:<leanName>`); a draft is walked from every entry of `PremiseDraft.facts`, the model's facts winning for a name both have (`draftReach`, exported). `usesOrRefs` gives `refs ∪ valueConsts`, `complete: false`, when an array is missing (D2-25), which `ItemDraft.mentions` uses.
  - **Ownership** (`items.ts`, `computeItems`):
    - facts are compared only where both states have the field (kind, type, value, valueConsts, typeConsts), so B's facts without `typeConsts` never make a declaration "changed"; texts are compared exactly (a whitespace-only change is a difference, but not a new content key). *Amended by fixer 2a1 (F5):* a declaration's children (the names only Lean reports) are compared only where both states have its facts, and a facts-only name with no parent only where both states have facts for its file, so a module that did not build changes nothing by itself. *(V2A1-C4):* a declaration that moved (to another file, or out of its place in its file) is changed too;
    - names only Lean reports follow their parent: the facts' `parent`, else the declaration whose range holds them, else the longest name prefix; a facts-only name with none is compared by name. *Amended by fixer 2a1 (F4):* a `.holds` follows a parent only by the facts' `parent`, never by place or name prefix: it is a declaration of its own, so a T.holds that only Lean reports is present (no Result `asInBase`) and is not a part of T's statement;
    - text outside declarations: ~~per file, a multiset of non-blank lines with comments blanked~~ *replaced by fixer 2a1 (F1, V2A1-C4, C5): see its entry below (`compareTexts`: an ordered comparison of declarations, blocks and lines, comments included).* Everything that is not a named declaration (an anonymous instance counts) or a telelean block stays in it: commands, comments, `example`s, `open … in` lines, and a declaration the scanner did not read (`open X in theorem …` on one line). Enclosing lines: a `namespace`/`section`/`noncomputable section`/`mutual` line and its matching `end`, both added, that enclose only added units, at least one declaration and every declaration new by name, are not reported; drafts carry no field for that joint ownership, which revert and the backstop recompute from the texts (§4.10, §4.11) with `compareTexts`;
    - a card's bound declarations (`ownerOfDecl`) other than a PROPOSITION's `.holds` (so extra pinned names too) are its statement, owned by `card:<c>` whenever one of them, or its `lean:` line, or its binding (the statement it binds, and the binding mode: F3) differs; the content key covers them all. *Amended by fixer 2a1 (V2A1-C1):* the `id:` write-back of a derived id goes with that item only when it has another change; on its own it is no difference. The fields telelean writes into existing blocks (`premises:`, `lean:`, `id:`, `follows_from:`) are compared as entries: `premises:` as a multiset (a reordered or reformatted line, which telelean's own arrow revert can leave, is no difference), `lean:` also by order (its first entry is the statement). *Amended by fixer 2a1 (F1):* every other line of a block (the marker, every other field with its written key, the notes after `---`, malformed lines) is compared as written, whitespace collapsed, in order, and any difference is unowned (`tags:` included, no longer as a multiset);
    - a removed card, a removed existing declaration, a moved card block (fixer 2a1), and a new, removed or moved block that is no card (outside a subject, a duplicate id) are unowned (Delete is slice 3);
    - a presupposition's helper instance is an instance of `Nonempty X` whose value mentions X's presupposition axiom; a coercion is an instance of a `Coe…` class, or a definition with `@[coe]`; any other new non-axiom declaration of a statement phase that is no shape-passing term is `decl:`; a new axiom that is neither a shape-passing term nor a presupposition is unowned, *in either phase (fixer 2a1, F2/V2A1-C2: it was proof material in a proof phase)*;
    - a Result draft is made for every target in `ended`, and also for a target that owns content without having ended (the active step's target);
    - `origin`: `card:` from the `created` entry of its first new declaration (or the active step); an arrow item from its ledger entry, with phase `proof` (the `arrow` entry records no phase); a premise item from its draft, phase `proof`; a Result from its inference's last step, phase `proof`; an item whose creation nothing records (a Change, a vocabulary change) gets `{ step: '', target: '', phase: 'statements' }`;
    - premise drafts: the last draft of each key in `premises` is its current one; a written premise's draft is its `content.premise`;
    - `provides.cards`: the card whose fields a `card:` item changes, and the card a written premise adds; `content.fields`: the item's own card's changed field lines as written, or every field of the block it adds; `content.decls`: its declarations' texts in W (*fixer 2a1:* each with the comment lines W adds that go with it, from the first to the last).
  - **Content keys** (§4.3): canonical JSON of `decls` (each owned name of B or W: `absent`, or its text with whitespace collapsed, its kind (the facts', else the keyword's), its normalised type and value, its sorted valueConsts and typeConsts, its Lean-only children's facts, and (fixer 2a1, C5) the comment lines W adds that go with it), `fields` (the entries an item adds to or removes from an existing block, by card and key), `blocks` (every field entry of a block it adds) and `arrows`. A Result owns T.holds (B's and W's name) even when it is absent. A premise draft's key: canonical JSON of the trimmed sentence, the whitespace-collapsed statement and the target.
  - **Texts** (`texts.ts`): every user-facing text the plan quotes, in `REVIEW_TEXTS`, `ITEM_KIND_LABELS`, `DECL_KIND_LABELS`, `ITEM_STATUS_TEXTS`, `HIDDEN_RESULT_ROW`, `ITEM_MARKER_TEXTS`, `RESULT_FLAG_TEXTS` and `DECLINE_OPTION_TEXTS`; the cascade dialogs' texts are lead-ins ending with ":", followed by the list. The texts the plan quotes for Claude (turn lines, tool refusals, gate messages, the system prompt's new lines) are in `CLAUDE_SESSION_TEXTS`. Builder 2a1's own wording, where the plan quotes none: the subjects of an unowned difference that is no declaration (`unownedCard`, `unownedField`, `unownedArrow`, `unownedText`, `unownedBlock`, inside the plan's "‹…› changed, but no review item covers it."), `leftBlocked`, `leftNotInReview`, the labels of the kinds the plan does not name (Add, Remove arrow, Change, Delete, Proof broken, Instance, Coercion, Presupposition, Vocabulary change), "1 arrow", "working · proving", Undo's "Decline: ‹label›" without brackets for a plain decline and "(Shaky)", and "(pending proof)" for a premise accepted as pending.
  - **Test helper.** `fakeFacts({ typeConsts: true })` gives each declaration the project names in its type: before its `:=`, `where` or `|`, or the whole declaration for an axiom, a bodiless opaque, an inductive, a structure or a class; per-declaration `typeConsts` and `noTypeConsts` override it.
  - **Tests:** `core/test/review/{hash,closure,items,contracts}.test.ts` (40 tests) with `test/review/helpers/session.ts`. No existing test changed, moved or was skipped. Core's full suite: 59 files, 638 tests (55 and 598 before 2a1). *Corrected by fixer 2a1 (F7):* they did not cover every item of §6.1's 2a1 list (no `type:` change, no scope around an existing declaration, no proof-phase Prop axiom, no binding change); the fixer's entry lists the tests added.
- 2026-11-19 (fixer 2a1: the two verifiers' findings on 2a1, F1–F7 and V2A1-C1–C6). Every finding was fixed; no §2.9 signature changed; one additive contract field (below).
  - **Text outside declarations, in order (F1, V2A1-C4, C5).** `items.ts` gains `compareTexts(base, current)` (exported, with `commonSubsequence`, a Myers O(ND) diff after the common start and end; beyond 2,000 edits in one file's middle that middle counts as changed in full, fail closed). For each file whose text differs it compares, in order, the file's units: its named declarations (by name), its blocks (cards by id, other blocks by text) and its non-blank lines outside them, **comments included** (each line whitespace-collapsed). Then:
    - a line of B that W does not keep in place (deleted, edited, moved) is unowned: the person's text stays as it was;
    - a line W adds is unowned, except enclosing lines (as before) and a **comment line**, which goes with the new or changed declaration directly below it (only blank lines and comments in between), else directly above it (a trailing comment), and is then part of that declaration's item: in its content key (D2-24) and in its `content.decls` text, from the first attached comment to the last. A comment with no such declaration next to it is unowned;
    - a declaration of both states whose unit moved (to another file, or out of its place among the units of its file) is changed: the card's Change item when bound, a `decl:` vocabulary change otherwise (V2A1-C4); a card whose block moved is unowned;
    - **decided here:** blank lines, and whitespace inside a line, are no difference. Lean reads them as whitespace, they change neither meaning nor the person's words, and telelean's own writes change them (a block inserted with tidy blank lines, a declaration taken out). The one place a blank line has meaning, a block's binding, is a card change (F3).
  - **For 2b2 (§4.11, §4.10).** `planItemRevert` must take out, with each declaration it removes, the added comment lines `compareTexts` attaches to it (`AddedTextUnit.attachedTo`); otherwise a leftover comment joins a neighbouring item or becomes unowned and disables Apply. The backstop's `unowned`, which re-derives ownership with computeItems, inherits the rule.
  - **For the integrator and 2b1b (§4.9, decision needed).** §4.9's `stray-command` lets every new comment through, but computeItems now reports a new comment that no new or changed declaration is next to as unowned (Apply disabled), as D2-24 asks. Either 2b1b's `stray-command` refuses such a comment at the step (the same rule, through `compareTexts`), so Claude removes it, or the integrator relaxes this rule; until then a stray comment between the person's declarations disables Apply.
  - **Decided (orchestrator, 2026-11-19, AP-26):** the first option. 2b1b's `stray-command` refuses a new comment that no new or changed declaration is next to (§4.9, new sub-bullet), using `compareTexts`' attachment rule; computeItems stays as the fixer left it.
  - **Block lines (F1).** See the amended bullet above: the fields telelean writes are compared as entries; every other line of a block as written and in order, so `kind:` for `type:`, swapped lines and new notes are unowned.
  - **Binding (F3).** A card whose bound statement or binding mode differs (a blank line added below its block, or removed before a TL013 gap declaration) gets its Formalize or Change item.
  - **The id write-back (V2A1-C1).** An `id:` line added to a block whose B block had none, with the card's (derived) id, goes with the card's statement item only when that item has another change; on its own (telelean's arrow or premise write into a derived-id target, or after DO-0) it is no difference, so no statement item appears that a Result's hidden part caused.
  - **Axioms (F2, V2A1-C2).** A new axiom that is neither a shape-passing term nor a presupposition is unowned in either phase; a shape-passing term created in a proof phase stays proof material.
  - **Contract addition (V2A1-C3; additive, no sub-slice uses it yet).** The ledger's `created` entry gains `draft?: string`: for a definition created in a proof phase, the item key of the step's premise draft that reached it when the step ended. **2d sets it** when it writes the `created` entries at a step's end, with the new export `reachingDraft(model, premises, step, name)` (the first draft of that step, by key, whose `draftReach` reaches the name) on the state the step ended on. computeItems reads it instead of the current drafts (D2-42, "read from the ledger, never from later reach"), so the `decl:` item survives the draft's withdrawal at a later Result version, and a draft that reaches a definition only later changes nothing; only the running step, which has no `created` entries yet, is read from its drafts now.
  - **Facts (F4, F5).** T.holds counts as present when only Lean reports it, so its Result is not `asInBase`, and a `.holds` is never a child of its statement; children and facts-only names are compared only where both states have the facts (see the amended bullets).
  - **Draft reach (F6).** `draftReach` is `complete: false`, with the draft's `leanName` first in `missing`, when the draft's facts lack its own statement (none yet, or a failed re-check), so R_stmt fails closed (D2-25).
  - **Exports added** (`review/index.ts`): `compareTexts`, `commonSubsequence`, `reachingDraft`, and the types `TextChanges`, `FileTextChanges`, `TextUnit`, `AddedTextUnit` (named so as not to clash with core's board `Layout`).
  - **Tests** (core 59 files, 652 tests; +14): `items.test.ts` gains the D2-42 ledger exception (C3), the proof-phase Prop axiom (F2), a comment that goes with the declaration below or above it and counts in its key (C5), the person's comments deleted, edited, moved and a changed `end` line, with blank lines no difference (F1), a scope around an existing declaration (F7), moved declarations (C4), a block's other lines (`type:` changed, `kind:` for `type:`, swapped lines, new notes; F1/F7), a binding changed by a blank line both ways (F3), the id write-back with Claude's arrow, after DO-0 and with a written premise (C1), a `.holds` only Lean reports (F4), a module without facts (F5), and `commonSubsequence` against a dynamic-programming LCS and its edit bound; `closure.test.ts` gains F6. Changed: the `open … in` test (its comment above a command is now unowned) and the proof-phase ledger of two tests (Vile's `created` entry names its draft). Run against the builder's `items.ts` and `closure.ts`, every new test fails except the scope around an existing declaration, which F7 asked for as coverage only (that rule already held).
  - **Test runs (V2A1-C6).** vitest 5 keeps a module cache in the repo root's `node_modules/.vitest-cache` (`fsModuleCache`, on by default) besides its results cache; the fixer's runs passed `--no-cache --fsModuleCachePath=<scratch>` so neither was written.
- 2026-11-19 (builder 2a2: the item model, part 2). `classify`, `itemDeps`, `resultsState`, `reconcile`, `reduceReview`, `planGroupAccept` and `planGroupDecline` replace their stubs; `review/index.ts` is unchanged. Helper files: `review/scc.ts` (an iterative Tarjan, sinks first) and `review/records.ts` (what the status rules read of a record: undecided, in ws/, the item state, fallback labels, `depsById`), imported by path, not exported from the index. `reducer.ts` also exports `acceptGate(state, id, own)` (the reducer's own Accept rules, for 2c2's gates and the host's early answers).
  - **Contract additions (additive; no sub-slice uses them yet; 2e must fill the first two):** `ReviewState.results?` (each Result id's verdict and Rests on in the stage judgement: an Accept records them in `accepted.result`, which the backstop compares) and `ReviewState.labels?` (the view's item labels by id, and card names by card id, for the reducer's texts; without one: the kind's label and the key's names, e.g. `Formalize “pg-no-dark-past”`); `SessionAction` (`decide`) `changes[].rev`, the item's rev when the action was made, which Undo compares (D2-73's "an item whose rev changed gives conflict"). *Reason:* the reducer has no judgement to read a verdict from, no model for card sentences, and no other way to see that an item it restores was re-proposed since. *Amended by fixer 2a (V2A-S5, V2A-C6): `ReviewState.results?` is gone, replaced by `ItemRecord.judged`, which reconcile sets, so nothing the runner may forget turns a check off; see the fixer 2a entry below.*
  - **builder 2a2 decided (Undo):** an Undo whose items' rev or decision (status, decline, Accept, redo, rejected keys) differ from what its action left gives `conflict`; what telelean writes afterwards (the decision commit, a premise write's key) and markers added since are not compared, and those markers stay. Then the restored statuses pass the rules or the Undo is refused with the rule's text; an Undo that takes an Accept away gets RV-5's list and the confirmation as by hand; a hidden item that fails them gives `conflict` naming only the action. *(Alternative: restore `before` over whatever is there, relying on the rule checks.)* *Amended by fixer 2a (V2A-S2, ADV-4): only a listed item's changed rev or decision gives `conflict`; a hidden item a judge changed since, or whose restored Accept the rules now refuse, keeps its state silently, so no answer depends on a hidden item; RV-7's check covers own Accepts too.*
  - **builder 2a2 decided (Redo):** Redo re-sends only the decisions its action carried out (what a group left then is not asked for again), as a new action with a new id, and is refused with the rule's text when the rules now leave any of them (AF13). *(Alternative: re-send the whole request, which could take more than the action did; or keep the action's id.)*
  - **builder 2a2 decided (one decide action):** declines and backs to review apply first, in the order sent, all or nothing (the first refusal refuses the action); then the Accepts, an own Accept with its checks or a group with RV-8's partial take. A group Accept that takes nothing changes nothing and makes no stack step (ok, with `left`). Arrow items are always declined `plain` (DO-0: a Reject or Shaky sent for one is read so); `plain` or no option on another item is refused. *(Alternative: refuse mixed or partial decisions outright.)*
  - **builder 2a2 decided (content taken out before a decline):** an item to be redone whose content a cascade or the judge took out keeps `redo` (reverted) when declined, so its content stays out; Back to review (un-reject or un-Shaky) then returns it to be redone, still reverted, not to review (D2-60). Un-reject brings a dependent back only when none of its other takers (`redo.because`) is still declined or taken out. A Shaky dependent that a Reject cascade or the judge takes out keeps its Shaky decline and note (as Submit's take-out, §3.7). *(Alternative: refuse to decline a taken-out item; or bring every dependent back.)* *Amended by fixer 2a (V2A-C2, ADV-2): un-reject reads what the decision commit took out from the action that declined the item; what its merge brings back that must stay out is taken out again (`ItemWrite.revert`, after the merge).*
  - **builder 2a2 decided (DO-0's question change):** the Result made to be redone without revert also passes the Shaky cascade to its dependents, so no accepted item rests on a Result that is not accepted (RV-5). The plan names only the Result. *(Alternative: leave them accepted until the next judge's defensive RV-5.)* DO-0's "a card Claude added at either end is declined with its items" is not built: no slice-2 step adds a card (`add` items come with slice 3).
  - **builder 2a2 decided (classes):** c2 only when the Result proves its target (W's `T.holds` is a theorem: a Result with no proof proves nothing). c1 also for an existing theorem bound to no card that a vocabulary change changes (spec RV-7: "changes a Lean statement or proof that existed when the session started"), and b4 for a vocabulary change in either R_stmt whatever its kind. c4 for every Add arrow item, whatever its target (B.3 refuses one into an axiom anyway). basis(u) for "adds no new basis" counts u's footprint cards and every Prop-valued axiom of the model in it (presuppositions, and any unmarked assumption); an unknown footprint of the arrow's source never says "adds no new basis", and an unknown one of a question source counts as {u}. A key the judgement gave no class counts as every badge (fail closed), in the reveal rule and the reducer. *(Alternative: c2 for any Result of a changed statement; basis from presuppositions only.)* *Amended by fixer 2a (ADV-9): a source whose proof uses `sorry` is its own basis.*
  - **builder 2a2 decided (reconcile):** RV-11 compares an accepted Result's recorded verdict and Rests on (a dependency that changed is left to RV-5's defensive rule); its return bumps the rev and keeps the same content as a version. A record declined by Reject or a plain decline, or reverted, whose draft is neither B's version nor an unchanged Add premise draft (those stay in `premises` by design), is a new proposal even with the same key: its content is in ws/ again, so it is in review. D2-17 withdraws the earlier premise drafts only at a queue's end, when the Result's content key changed; their drafts leave `premises`. RV-3 follows the new or updated items' dependents in review. The force also ends when a Result gets new content or returns to review from a decided status; a new Result alone does not end it. The judge's reverts take their dependents down as a Reject does, with `redo.because: []` on the reverted item. `problems` holds reconcile's own ("disappeared"); the runner adds the judgement's. *(Alternative: persist each Result's dependency set at its Accept, for RV-11.)* *Amended by fixer 2a (V2A-S1, V2A-C1, V2A-C2, ADV-3): RV-11 compares every Result's verdict, Rests on and dependencies with its record's `judged`; a declined or taken-out record is a new proposal only when a queue ends; see the fixer 2a entry below.*
  - **builder 2a2 decided (the written premise in review):** an Add premise in review counts as kept in ws/ only when it never left review (a converted v1 ghost, §3.11); one that comes back to review from another status is taken out (`ItemWrite.premises.takeOut`, reconcile's `reverts`), although its record holds its `card` until that take-out's step 4.
  - **builder 2a2 decided (events and texts):** events are lead-ins with linked items (`items`), never item names in the text; the reducer reports only what the person did not confirm (dependents made to be redone without having been accepted, D2-23's returns). New texts in `REVIEW_TEXTS`, builder 2a2's wording: `acceptNeedsDependencies`, `acceptWaitsForResults`, `acceptDidNotPass`, `leftOwnAcceptProved`, `holdAsMissing`, `plainOnlyArrows`, `declinedAlready`, `withdrawnStays`, `undoDeclineN`, `undoBackToReviewN`, `undoDecideN`, `undoMoveN`, `cascadeWhy`, `cascadeWhyOwnAccept`, and the events `eventRedoneWith`, `eventBadgesGrew`, `eventDependencyNotAccepted`, `eventChanged`, `eventChangedWith`, `eventRedoneAtOnce`, `eventNoLongerBuilds`, `eventNoLongerPasses`, `eventNoLongerClosesGap`, `eventWithdrawn`.
  - **Note on §4.6's last property (F4):** an Undo that makes a meaning item undecided ends Show results' force (§4.7 lists "an Undo"), after which a Result decided under that force can be undone only once the results are shown again (D2-8). So "undoing every action of a sequence gives back the records it started from" holds for sequences without Show results, and the random test checks it there; RV-5 and "no decision names a hidden item" are checked on sequences with it. *Amended by fixer 2a (V2A-S4): Show results now records D2-23's returns, so the random test also checks the property on sequences with Show results in which no Result is decided under a force.*
  - **Tests** (core 64 files, 721 tests; +5 files, +69 tests): `test/review/{classify,deps,reveal,reconcile,reducer}.test.ts`, with `test/review/helpers/records.ts` (synthetic records, review states and judgements). No existing test changed, moved or was skipped.
- 2026-11-19 (fixer 2a, round 1: the review-only pass over 2a1 and 2a2; findings V2A-S1–S6, V2A-N1, V2A-N2, V2A-C1–C7 and ADV-1–ADV-9). Every finding is fixed; none was judged wrong. One is fixed in another way than it suggested (V2A-S2, below).
  - **Contract changes** (no other sub-slice uses them yet; §2.2 and §2.9's code blocks now show them, with 2a1's `created.draft?` and 2a2's `changes[].rev` and `labels?`, V2A-C6):
    - `ItemRecord.judged?` (V2A-S1): a Result's verdict, Rests on and RV-5 dependencies (item keys), each sorted, in the last judgement reconcile applied while its content was in ws/.
    - `ReviewState.results?` is removed (V2A-S5, V2A-C6): an Accept reads a Result's verdict and Rests on from its record's `judged`, which reconcile always sets, so no input the runner might forget turns a check off.
    - `ItemDraft.factsMissing?` and `ItemClass.factsMissing?` (ADV-3).
    - `SessionForce.via` gains `decided`, and the decide `SessionAction` gains `startedForce?` (ADV-1).
    - The reveal `SessionAction` gains `changes` (required), shaped like decide's: D2-23's returns at that show (V2A-S4).
    - `GroupLeftReason` gains `needs-option` (V2A-N2).
    - `ItemWrite`: the runner applies `reapply`'s inverse merges first, then `revert`, then the premise take-outs; for an Undo, see "For 2e" (V2A-C2, V2A-S3).
  - **fixer 2a decided (RV-11, V2A-S1):** reconcile compares every Result in review or accepted with its record's `judged` (and, accepted, with its Accept's `result`); a difference in verdict, Rests on or dependencies is the changed-key rule (rev + 1, back in review, "updated", accepted dependents back) and ends the force; accepted ones are reported with "Checked again with another outcome, so back in review:". A Shaky Result, or one to be redone with its content kept, keeps its status (D2-48) and records the new values; a declined or taken-out Result keeps what it recorded while its content was in ws/, so un-reject brings back the same version without "updated"; a draft without its facts changes nothing (ADV-3). *(Alternative: the builder's, accepted Results only, verdict and Rests on only.)*
  - **fixer 2a decided (fail closed, V2A-S5):** a Result whose record has no `judged` is never accepted, own or by a group (`blocked`): "‹item› has not been checked yet: wait for the check to finish."; reconcile treats an accepted Result with no `accepted.result`, no `judged`, or no inference in the judgement as changed. *(Alternative: keep `ReviewState.results` and make it required.)*
  - **fixer 2a decided (hidden items, V2A-S2):** decide never compares a hidden item's rev: whatever rev a request carries, a hidden item is refused with "show them first" or left as `hidden-result`. Undo checks D2-8 first, naming no item; only a listed item whose rev or decision changed since gives `conflict` (naming it). A hidden item that a judge changed since is not restored, and a hidden item whose restored Accept the rules now refuse (its real dependencies, hidden ones included, RV-7, "did not pass", missing facts, `judged`) keeps the state it had, until nothing restored rests on one that is not accepted; what the inverted commits bring back that stays out is listed in `revert`. So an Undo's answer depends on listed items only, as §4.7's non-interference tests ask of Undo's ActionOutcomes. *(Alternative, the finding's: `conflict` naming only the action, which still tells that a hidden item changed.)* *Corrected by builder 2b1a (carry-over S-V2A-S2): that last claim did not hold. The restored Accepts were checked with the visibility after the Undo, so an Undo asked while the results were hidden, which would show them, refused with a text that named a hidden Result or premise, and whether it refused depended on a judge's change to one. Now an item hidden when the Undo is asked, or after it, takes the silent path; a listed item gets the refusal an Accept by hand would get when the Undo is asked; and the answer (cascade, events) names only items listed both before and after the action, in `decide` too. See builder 2b1a's entry.* *Corrected again by fixer 2b1a r1: a listed item's RV-7 badges (and "blocked") were still read in `classes` for an Undo asked while the results were hidden that would show them, so a hidden premise draft reaching the item refused it, with the results still hidden. They now read the class in force both when the Undo is asked and after it; the show then applies D2-23 with `classes`, as by hand. See fixer 2b1a r1's entry.*
  - **fixer 2a decided (RV-7 at Undo, ADV-4, V2A-C3):** every restored Accept, own or group, is refused with RV-7's text when its recorded badges do not cover its class in force after the Undo (a group Accept also whenever the item is an RV-7 item now). *(Alternative: restore it and return it to review with D2-23's event.)* *Corrected by fixer 2b1a r1: for a listed item, the class in force both when the Undo is asked and after it (`classes` only when the results are shown then and stay shown, else `classesBeforeReveal`); an Undo that shows the results then returns, with D2-23, an item whose badges `classes` grew. A hidden item's silent check still reads the class in force after the Undo; it never changes an answer.*
  - **fixer 2a decided (D2-23 never hides what it was shown with, ADV-1):** when an action (decide, Undo) or reconcile shows the results without the user's force, or with it, and only D2-23's returns, with their RV-5 dependents, would hide them again, telelean sets the force `decided`: the results stay shown, it marks no Result seen early (reconcile skips the marker for it), it ends as any force does, and the decide action records it (`startedForce`) so its Undo removes it. Before it, an accepted meaning item resting on a definition that only a premise draft reaches bounced back with it, hid the results again, named that definition while they were hidden, and looped, since its Accept while hidden recorded `classesBeforeReveal`'s badges. This departs from RV-6's letter ("hidden again if any of those items returns to in review") only for items the person decided before the results were shown and telelean alone returned. *(Alternative: record an own Accept's badges as the union of both maps, which ends the loop for own Accepts only; or hide again, as before.)*
  - **fixer 2a decided (un-reject, V2A-C2, ADV-2):** the reducer reads what the decision commit took out from the newest done action that left the item declined (its changes' before and after): the inverse merge brings all of it back. A dependent comes back to be redone without revert only when the item itself comes back and no other item that took it out is still declined or taken out; everything else the merge brings back that must stay out (declined since, withdrawn, kept out by another taker, another item of the same group decline) goes into `revert`, applied after the merge. Without that action on the stack (unreachable in a session), only the item comes back. Limitation, accepted: a dependent another decline keeps out is taken out again by this un-reject's write, and a later un-reject of that other item does not bring it back (its commit never took it out); Claude redoes it at Submit review. *(Alternative: the runner restores only the listed items' content, never the whole inverse patch, which needs per-item re-application in 2e.)*
  - **fixer 2a decided (reconcile, content back without a step, V2A-C2, ADV-2):** a record declined by Reject or plainly, to be redone and reverted, or withdrawn, whose draft is neither B's version nor its unchanged premise draft, is a new proposal only when a queue ends and the draft is no exact repeat of a rejected version: back in review ("updated" when its key changed), with "Proposed again by Claude's step, so back in review:". Otherwise (a decision's judge, or a repeat) it keeps its decision, and `reverts` takes the content out again, with "Back in the working copy although declined or taken out, so telelean took them out again:" (fail closed). RV-3 also reads the items proposed again. *(Alternative: a stage problem that disables Apply.)*
  - **fixer 2a decided (D2-17, V2A-C1):** a record whose key is unchanged takes its draft's content (on F5's unchanged path too), and D2-17 reads the step of the premise's current draft: a premise the new step proposed again stays in review, and only other steps' drafts of a withdrawn key leave `premises`. The earlier step's draft of a key proposed again stays there; computeItems reads the newest. *(Alternative: drop it too.)*
  - **fixer 2a decided (facts missing, ADV-3):** computeItems marks a draft `factsMissing` when a declaration it provides has no facts because its file's module did not build, and classify marks its class. Reconcile leaves such a record as it was (key, rev, status, content, no event); while any draft lacks facts the judgement is partial, so no RV-11, inference-failure, RV-7 or RV-5 rule reads it, and only its no-longer-builds reverts apply (the judge runs again once those are out). The reducer refuses an Accept of an item whose class lacks facts ("‹item› can't be checked now: its file did not build. Wait for the check to finish."; `blocked` in a group), and skips D2-23 while any class does. *(Alternative: make such an item depend on every other item of its module, which the SCC rule voids when all of them lack facts.)*
  - **fixer 2a decided (smaller points):** Redo keeps an own Accept only when the recorded request was one (`own` with one item), never a group's survivor (ADV-8); basis(u) is {u} for a proof that uses `sorry` (ADV-9, V2A-C5); `acceptGate` checks an own Accept in `reduceReview`'s order (did not pass, facts, judged, dependencies, waiting) and a group's in `planGroupAccept`'s (V2A-N2, V2A-C7); a group's plain decline leaves an item that is no arrow item with `needs-option`; `conflict` for a known item uses its label without extra quotes ("Formalize “T” changed since you looked at it: look again."), and a stale Undo or Redo gets "The review changed since you looked at it: look again." (V2A-N2).
  - **Exports added** (`review/index.ts`, V2A-S6): `acceptGate`, `isMeaningItem`, `isResultOrPart`, `depsById`, `fallbackLabel`.
  - **Texts** (`REVIEW_TEXTS`, fixer 2a's wording): `conflictLabel`, `historyChanged`, `resultNotJudged`, `acceptFactsMissing`, `leftNeedsOption`, `eventResultChanged`, `eventProposedAgain`, `eventTakenOutAgain`. `CLAUDE_SESSION_TEXTS.strayComment` is §4.9's text (AP-26, V2A-N1).
  - **For 2e** (V2A-S3, V2A-S6, V2A-C2):
    - build `ReviewState.deps` with `depsById`, ~~from the last converged stage judgement: never one whose drafts lack facts (ADV-3)~~ *corrected by builder 2b1a (carry-over R1-4): from the stage judgement the records were reconciled with (`PersistedSession.judged`, the same one as `classes`), a partial one included; never an older map, which §2.6 does not keep anyway*; fill `labels`;
    - carry out an `ItemWrite` in this order: `reapply` (for each item in it that an un-reject brings back, the inverse merge of the decision commit that declined it, read from its record's `decline.commit` before the action; the other items in it come back with those merges), then `revert` (`planItemRevert`), then the premise take-outs; an inverse merge that would bring back content a later step changed must be refused as a merge conflict ("This version can't be restored any more: ‹file›.");
    - an Undo's write names the undone action (a decision or, since builder 2b1a's R1-2, Show results, whose write may take premises out too): invert its `commits`, newest first, and put back its `takenOut` ledger entries, before any premise write that is due runs; the reducer has already put the premise's `card` and written key back on its record, so no premise write is due for it and the next judge sees no change (AF2); a premise it lists in `premises.takeOut` is taken out again afterwards, planned from that `takenOut` entry's card (the reducer writes one again only when the Undo restores it to a state that keeps it in ws/, fixer 2b1a r1);
    - after any inverse merge, an item whose status keeps it out is in `revert`; reconcile also takes such content out again at the next judge (fail closed). *Corrected by builder 2b1a (carry-over R1-1): not a written Add premise. A decision commit holds the take-out of the written premises its write took out (`takenOut`), so an un-reject's merge brings their card back without their ledger entries, and computeItems would report that card unowned. The reducer reads the declining action's `takenOut`: a premise that comes back is in `reapply`, its record holding its card and written key again, and the runner puts back that entry's ledger entries; one whose status keeps it out is in `premises.takeOut`, its record holding the card for that take-out, which runs after the merge.* *Fixer 2b1a r1: the declining action is the stack action whose `commits` hold the un-rejected item's `decline.commit` (read before the action); that take-out is planned from the record's card (no ledger entry of it exists), and its step 4 records it in no `takenOut`, since the premise was not written when the write started (§2.9).*
  - **For 2c2:** `SessionView.results.forced` is true only for the user's force (`via` other than `decided`); the host's early answers use `acceptGate`.
  - **Tests** (core's `test/review/`: 9 files, 155 tests, was 123; +32): `reducer.test.ts` (hidden items answer alike for a stale rev and across an Undo after a judge; D2-8 at Undo names nothing; RV-7, "did not pass", RV-5's confirmation, D2-23 at an Undo that shows the results; Show results' recorded returns and their Undo; the `decided` force and its Undo; un-reject with a dependent declined since, with two takers in both orders, and after a group decline; Redo's `own`; `needs-option`; `acceptGate`'s order; a missing class; missing facts; the random properties now also with a judge between actions (reconcile on perturbed classes and dependencies), RV-7's badges after every step, Undo's named items, and the undo-everything property with Show results), `reconcile.test.ts` (RV-11 for a Result in review and accepted, by verdict, Rests on and dependencies, fail closed, D2-48; a premise proposed again; content back without a step at a judge and at a queue's end; a module that did not build, end to end through computeItems, classify and itemDeps; a partial judgement; the `decided` force and its limit; the force ended by RV-5's defensive return; RV-3's chain; a Shaky dependent of a judge's revert; a declined premise's failed re-check; a missing class), `classify.test.ts` (a `sorry` source, an unknown footprint, `factsMissing`), `contracts.test.ts` (the new exports, `strayComment`, `conflictLabel`), and fixture updates (`judged` on Result records, the D2-17 drafts carry their premise, `deps.test.ts`'s inferences, the reveal test's Reject).
- 2026-11-19 (builder 2b1a: judging, part 1, the rules taken out of `evaluate()`; with the open findings of the 2a review). Core only.
  - **The refactor** (`core/src/gate/rules.ts`; behaviour unchanged; no new rule, finding code or token; `gate/index.ts`, and `evaluateRules`' signature and documentation, unchanged):
    - `RuleContext`, built once per evaluation by `ruleContext(input)` from the input alone: the input; the declaration tables of B, S and R; the purpose flags; the target (its card now and in B, its statement and `.holds`, `exempt`, `targetStatements`); the chosen cards and the detached statements; the texts the findings use (`short`, `at`, `loc`, `locOf`, `atOf`, `sentence`, `ownerOf`, `node`); the declaration diff; the names only Lean reports (`factsOnly`, `factsOnlySince`); `footprintOf`; the presuppositions; `targetProofNew` and `undoTargetProof`.
    - One exported helper per rule, each applying only to the purposes it names and returning its findings in the order it finds them: `buildFindings` (G1), `newAxiomFindings`, `existingChangedFindings`, `adoptedGhostFindings` (`existing-changed`, token `ghost`), `notProvedFindings`, `statusMismatchFindings`, `statementChangedFindings`, `footprintFindings(ctx, buildFailed)` (also the report's `footprints`), `undeclaredPremiseFindings`, `sorryAxiomFindings`, `vocabularyShapeFindings`, `markupFindings` (G5, as it was), `readyCards` with `readinessFindings(ctx, ready)`, `malformedBindingFindings(ctx, ready)` (`not-formalised` in every purpose), `proofBeforeFreezeFindings`, `exampleFindings` and `notFrozenFindings`; besides them `flagged`, `formalisedThisRunOf`, and `orderFindings`, the report's order. `evaluate` is their composition, in the order the single function ran its rules.
    - **builder 2b1a decided (the helpers' shape):** a helper takes the context, plus only what one rule hands another, explicitly (`buildFailed`: G1 found something; `ready`: the readiness rules' cards), and returns its findings; `orderFindings` groups them by code. So 2b1b's `judgeState` builds a context per judged inference (a `RuleInput` with that inference's selection) for the per-inference helpers, and runs the global ones once. *(Alternative: helpers that push into one shared map, as the closure did, or that each recompute what they read from the input.)*
    - **builder 2b1a decided (exports):** the helpers are exported from `gate/rules.ts` only, not from `gate/index.ts`, whose exports are M2's frozen contract; `judgeState` is core code and imports them by path. *(Alternative: export them from the gate index, an additive contract change.)*
    - **How it was checked** (§6.1's two 2b1a items). The rules were moved one at a time: the context first, then each rule, then the composition (17 moves). After each move, core's tsc ran, and so did the gate suites, through a differential harness kept in the builder's scratch dir: a vitest setup file whose mock makes every `evaluate` call also run the original function, kept untouched, and fails the test on any byte difference in the report's JSON, keys and order included. All 221 calls of the M2, 1e and Spyro gate suites were identical at every move. At the end, so were the 192 calls of the runner's files that use the real rules with real Lean (`gate/rules.test.ts`, `run/fresh.e2e`, `integration/m2flow`, `run/walkthrough.e2e`). Every code line of the original is kept verbatim except 16 restructured ones: the grouping, the exports, `buildFailed`, `ready`, the example's block, and the final return.
    - **Mutation checks** (31: each rule dropped from the composition, each part of the report, each of the context's derived values). 26 failed the existing gate suites. Five did not: behaviour the single function already had that no test held. `test/gate/ruleHelpers.test.ts` now holds each of them:
      - a declaration of the run without facts in a stale file fails closed when the build found nothing;
      - a ready card bound to something that is not a Prop statement is reported once, never twice;
      - the report is in its order, not the rules' (an example after the freeze before a changed word);
      - an adopted ghost is one of the chosen cards (`formalisedThisRun`);
      - a name only Lean reports inside the person's unchanged declaration, in a changed file, is judged neither by the footprint nor as a carrier.
  - **The open findings of the 2a review** (S-V2A-S2 and R1-1–R1-5, from the re-verifier; each fixed with a test that fails without the fix, mutation-checked, except R1-4, docs only, and R1-5, whose case no test can reach):
    - **builder 2b1a (carry-over S-V2A-S2):**
      - An Undo checks the Accepts it restores with the visibility when it is asked. An item hidden then, or after the Undo, takes the silent path: when its Accept no longer stands, it keeps the state it had. A listed item gets the refusal an Accept by hand would get when the Undo is asked. Its dependencies are read as shown then, so one hidden then reads "waits for the results to be shown" and is never named, whatever a judge did to it. RV-7's badges and "blocked" read the class in force after the Undo. *Corrected by fixer 2b1a r1: both when the Undo is asked and after it.*
      - An answer (`decide`'s and Undo's `cascade` and `events`) names only items listed both when the request came and after the action. So a Result hidden when the request came changes silently, also when the action shows the results (D2-64: "its change shows with the results").
      - Tests: P1 and P1b answer byte for byte alike, whatever a judge did to the hidden Result or written premise; a Reject or Shaky that shows the results answers alike in a proved and a not-proved copy.
      - §8's fixer 2a line on hidden items is corrected.
      - **builder 2b1a decided:** the dependencies are read with the visibility when the Undo is asked (`shown`), not `shown && shownAfter` as the finding proposed. An Undo asked while the results are shown, which hides them, never gets "waits for the results to be shown", and naming a dependency then leaks nothing, since it is shown; a test pins this. *(Alternative: the finding's `shown && shownAfter`.)*
      - **builder 2b1a decided:** the answer rule applies to `decide` too, beyond the finding's Undo. Without it, a Reject that shows the results named the hidden Results its cascade reached, so its answer differed between a proved and a not-proved copy. *(Alternative: Undo only.)*
    - **builder 2b1a (carry-over R1-1):**
      - Un-reject reads the declining action's `takenOut` (`mergedBackBy`). The decision commit holds the take-out of the written premises its write took out, so the inverse merge brings their card back without their ledger entries.
      - A premise that comes back (to be redone without revert, with nothing else keeping it out) is written again. Its record's `card` and written key come back from the entry, as Undo puts them back, and it is in `reapply`; the runner puts back the entry's ledger entries.
      - A premise whose status keeps it out (another taker still out, declined since, proposed again) is in `premises.takeOut`, which runs after the merge. Its record holds the `card` for that take-out, whose step 4 clears it again. *Fixer 2b1a r1: and records it in no `takenOut`: it was not written when the write started.*
      - A premise written again since (its record holds a card) is left as it is. The merge of its old take-out either changes nothing (the same write) or meets the new write's lines: a merge conflict, which refuses the un-reject (§3.6).
      - `ItemWrite`'s comment (§2.9, types.ts) and "For 2e" say so.
      - **builder 2b1a decided:** the finding's main fix, not its alternative (keeping a written premise's take-out out of the decision commit). There is one decision commit per user action (§3.6), and un-reject brings back what its commit took out (D2-60), premises included. *(Alternative: the finding's.)*
    - **builder 2b1a (carry-over R1-2):**
      - The reveal SessionAction gains `takenOut` and `commits`, required, shaped like decide's (§2.2, types.ts). Show results' D2-23 returns can take a written premise out: one resting on a returned definition returns to review with it.
      - Its write fills both fields in its step 4, and Undo inverts the commits and puts the premise back, as for a decision: its card and written key on its record, the premise in `reapply`.
      - An Undo whose action made commits always has a write naming it.
      - The V2A-S4 test is extended with a written premise; `reveal.test.ts`'s action shape gains the two fields.
    - **builder 2b1a (carry-over R1-3):** the eight paths the re-verifier's mutations left untested now have tests, each failing under its mutation:
      - an Undo right after the Accept that set the `decided` force (P3: forced null, results hidden);
      - F5's content refresh, and the proposed-again one;
      - un-reject of an item that stays taken out brings back no dependent;
      - an Undo whose action made commits names it in its write;
      - an Undo whose taken-out premise must stay out lists it in `premises.takeOut`;
      - a Result first seen in a partial judgement records no `judged`;
      - an Undo that keeps a decided item silently leaves it out of `taken`.
    - **builder 2b1a (carry-over R1-4):** `ReviewState.deps` has one source (§2.9, types.ts, "For 2e" corrected): `depsById` of the records and the `deps` of the stage judgement they were reconciled with, a partial one included; never an older map, which §2.6 does not keep anyway.
      - **builder 2b1a decided:** no per-record edges are persisted and unioned in. A partial map lacks only the outgoing edges of the items whose facts are missing, whose Accept is refused meanwhile, and the next judge makes up a cascade it misses (their no-longer-builds reverts, then RV-5's defensive rule). *(Alternative: persist each record's last full-judgement edges and union them in for those items.)*
    - **builder 2b1a (carry-over R1-5):**
      - `leftText` gives `leftNeedsOption` for `needs-option`, so the reason has one text, the one the webview shows for `planGroupDecline`'s left items. A single plain decline of an item that is no arrow item is still refused with `plainOnlyArrows`.
      - §3.5's "the same key and content key" bullet now points to the content refresh.
      - No test reaches the case: the left reasons that `reduceReview` and `acceptGate` turn into text come from `planGroupAccept`, which never gives `needs-option`. Its mutation survives, as expected.
      - **builder 2b1a decided:** keep the text and use it. *(Alternative: delete it.)*
  - **Contract changes** (no later sub-slice uses them yet): the reveal SessionAction's new required `takenOut` and `commits` (§2.2); `ItemWrite`'s comment and `ReviewState.deps`' source (§2.9).
  - **Tests** (core 65 files, 776 tests; was 64 and 753):
    - new `test/gate/ruleHelpers.test.ts` (9): `orderFindings` on no finding, one and many; the helpers' composition equals `evaluateRules` on ten states in six purposes; each helper's purposes; the context; the five gaps above;
    - `test/review/reducer.test.ts`: +11, and the V2A-S4 test extended;
    - `test/review/reconcile.test.ts`: +3;
    - `test/review/reveal.test.ts`: the reveal action's shape.
    - No existing gate test changed, moved or was skipped.
- **orchestrator, 2026-11-19 (AP-29, spec coverage audit):** a read-only audit mapped 873 requirements of spec v4.1 to the code and the slice-1/2/3 plans and confirmed 15 gaps (report: `verbatim_prompt_log/bundle_21/subagent_reports/spec_coverage_audit/coverage_audit.md`). For slice 2: G2 → §4.12 check 6 (any hand-drawn cycle in the subject blocks Formalize; 2b2), G1 → §3.10 step 4 (`arrows?` provenance on the accepted attempt record, shown in History; 2f), and a new sub-slice **2i** (§1, §1.1, §6.1) for built code: the card-only Delete removed (S9), an old axiom's premises named (A19), the guide's placement text corrected. The slice-3 gaps go into the slice-3 plan; G9–G13 are logged as decisions in AP-29.
- 2026-11-19 (fixer 2b1a, round 1: the findings of the 2b1a review). Core and this plan only; the refactor of `gate/rules.ts` is unchanged.
  - **RV-7 at an Undo asked while the results are hidden (C-V2B1A-C1, A-ADV-2b1a-1, S-F2; fixed).** `listedAcceptRefusal` read a listed restored Accept's badges, and "blocked", in the class in force after the Undo. For an Undo asked while the results were hidden that would show them, that was `classes`, which counts every premise draft (a Result's part, hidden). So a hidden draft reaching the item refused the Undo with RV-7's text while the results stayed hidden, against D2-64 and RV-6. By hand the same Accepts go through, and D2-23 returns the item at the show (D2-73). Both now read the class in force when the Undo is asked and after it (`now && after`): `classes` only when the results are shown then and stay shown. An Undo that shows the results then applies D2-23 with `classes` (its existing `showResults`) and returns such an item with its event, as by hand. The Undo of Show results (asked shown, hidden after) still reads `classesBeforeReveal`.
    - **fixer 2b1a r1 decided:** "blocked" reads the same class as RV-7, so one class in force is read. classify never marks missing facts in one map only, so this changes no reachable answer; a test pins the rule. *(Alternative: `now && after` for RV-7's badges only.)*
  - **An Undo wrote a taken-out premise again although it stayed out (C-V2B1A-C2, A-ADV-2b1a-2, S-F1, C-V2B1A-C3; fixed).** Undo's `takenOut` loop asked `inWorkingCopy` of the premise's state after the Undo without the state it came from, so a premise in review counted as written (the converted v1 ghost's rule). Two cases got their card and written key back and were in `reapply`, written in ws/ with no Accept standing (§3.1, §3.8):
    - a premise the Undo kept in review silently (Undo of Show results, or of a back to review, after a judge);
    - a premise it never restores (one an un-reject's merge had brought back and its write took out again).
    "Pending" was then refused as already written, no premise write was due, and Apply was refused. Now a premise of the action's `takenOut` is written again only when the Undo restores its change (not kept by a judge, not kept silently) to a state that keeps it in ws/. That state is read from the one the action changed it from (`inWorkingCopy(kind, r, card, change.before)`), so a premise in review counts only when it was in review before the action (the ghost). Every other one is in `premises.takeOut`, taken out again after the inversion from its entry's card. That covers one the Undo's own RV-5 cascade returns to review, too.
    - **fixer 2b1a r1 decided (S-F1, C-V2B1A-C3, S-F3):** a take-out of a premise whose card only the write's own un-reject merge brought back is not recorded in the action's `takenOut`. The premise was not written when the write started, and the merge and the take-out together leave it as it was, as does their inversion. So `takenOut` is exactly what the action's commits took out, which both its Undo and a later un-reject of another item the same action declined read. The Undo rule above holds too for a runner that records one anyway: it takes the premise out again, which finds nothing. *(Alternatives: record it with no ledger entries, as S-F1 proposed. Then `takenOut` is no longer what the commits took out, and an un-reject that reads that action, possible only when the same request also declined an item, would write the premise again although its merge brings nothing of it back. Or a separate `premises.mergedOut` write field, as C-V2B1A-C3 proposed.)*
    - **fixer 2b1a r1 decided:** a hidden premise a judge changed since keeps that change, its content in ws/ included. The Undo never writes it again (`skipped`), even in a status that would keep a written premise in ws/. A judge reaches that state within a stage through RV-3 (§3.5): an item the taken-out premise rests on gets a new key and rests on a Shaky or to-be-redone item, so reconcile makes it to be redone at once, and the premise, in review and resting on it, with it (`redo.reverted` false, no card); the Undo then leaves the premise unwritten. A test builds that state with reconcile and pins the rule. *(Alternative: decide from its status alone.)* *Corrected by builder 2b1b (carry-over R1-F2): this sentence first said that no judge can leave a taken-out premise so within a stage, which was false (RV-3 runs on `updated` items at every judge), and invited dropping the `skipped` check as dead code.*
  - **ItemWrite's contract (S-F3; fixed, docs).** §2.9 and types.ts now say:
    - what a take-out does: it removes whatever of the premise is in ws/ and drops its ledger entries; step 4 clears the record;
    - that step 4 records only the premises written when the write started;
    - that R1-1's kept-out premises are in `takeOut`, planned from the record's card;
    - where the runner finds the declining action's entries: the stack action whose `commits` hold the un-rejected item's `decline.commit`;
    - the Undo's rule above.
    §2.2's `takenOut`, the corrected §8 lines (fixer 2a's hidden items and RV-7 at Undo, builder 2b1a's S-V2A-S2 and R1-1) and "For 2e" say so too.
  - **Answers while the results are hidden (A-ADV-2b1a-3, S-F4; tests).** The "listed after" half of builder 2b1a's answer rule had no test. Now two hand-built tests cover a decision and an Undo, each asked while the results are shown, that hide them: neither names a Result. The random run checks every action asked while the results are hidden, or that hides them: no cascade or event names a Result or a Result's part. Show results' own answer is the exception, since it is about what it shows. Both halves of the rule, in `decide` and in Undo, now fail tests when broken.
  - **ruleHelpers' purposes test (C-V2B1A-C4; fixed).** It is renamed to the helpers it checks: not proved, not frozen, the readiness cards, status mismatch, proof before the freeze, and statement changed finding nothing without a freeze. The file's header no longer says every helper is checked.
  - **Mixed requests (seen by fixer 2b1a r1; decided and fixed by builder 2b1b, carry-over R1-F1).** One request that un-rejects V and then rejects W wrote again a premise resting on both (R1-1, `reapply`) and then reverted it in the same action, so its card and ledger entries stayed in ws/ with no Accept standing; a declaration resting on both kept the content V's merge brought back while it was reverted (not in `revert`); and a Reject of the premise itself after the un-reject rejected its written key. **builder 2b1b decided:** the reducer decides where what an un-reject's merge brings back goes only once every decline and back to review of the request is applied (`settleMergedBack`, called by `decide` after them): a written premise brought back is written again (`reapply`, its card and written key on its record) only when its final status keeps it in ws/; otherwise its record takes only the card, for the take-out after the merge (`premises.takeOut`), and keeps its pre-merge key; anything else whose final status keeps it out is in `revert`. All orders of one request now write alike. *(Alternatives: 2c1's validator refuses a request that mixes an un-reject with a decline; or the reducer refuses such requests. Builder 2a2 accepted mixed requests, and the fix keeps that.)*
  - **Tests** (core 65 files, 783 tests; was 776):
    - `test/review/reducer.test.ts` +7:
      - the RV-7 pair (own and group Accept, decided by the action or an accepted dependent of it; alike by hand; "blocked" pinned);
      - a decision, and an Undo, asked while shown that hide the results name no Result;
      - Undo of Show results, and of a back to review, whose premise stays in review silently (and one a judge left to be redone, synthetic);
      - the converted v1 ghost written again in review;
      - an Undo whose RV-5 cascade returns the premise whose Accept it restored;
      - Undo of an un-reject in four ways of keeping the premise out, under §2.2 and with the take-out recorded anyway, and its Redo;
      - ws/ and the premise's record agree on random sequences (400, every path of the premise's writes reached).
    - The random run also checks answers while hidden.
    - `test/gate/ruleHelpers.test.ts`: one test renamed.
  - **Mutation checks** (each restored byte for byte, `cmp` identical; the number of failing tests in parentheses):
    - the takenOut loop's old condition (4, the random property among them);
    - the takenOut loop without the change check (1), without `skipped` (1), without `from` (1);
    - RV-7 reading the class `after` (1) or `now` (5);
    - "blocked" reading `after` (1); the class alone reading `after` (1);
    - the answer rule as `listed = shown` in decide (2) and in Undo (4), and as `listed = after` in decide (4) and in Undo (2).
- 2026-11-20 (builder 2b1b: judging, part 2, and the carry-overs of 2b1a's review). Core only. `judgeState`, `permittedFor` and `proposeArrowProblems` replace their stubs; `review/index.ts` is unchanged.
  - **Where things live.** The session's rules are a helper file next to 2b1a's, `gate/sessionRules.ts` (not exported from the gate index, imported by path), built on 2b1a's `RuleContext` and helpers: the step limits, G5 in a session, B.3 (with `arrowProblems`, which `proposeArrowProblems` is), B.4, `new-axiom` against B, `stray-command`, the footprints by creator, B.2 with E(T), `other-result` and `stepWording`. B.1 is `review/permitted.ts`; `review/judge.ts` composes everything with computeItems, both class maps, `itemDeps` and R_stmt's `by`. `evaluateRules` and every slice-1 helper are unchanged; `orderFindings` only learns the new codes, which evaluateRules never reports. Every gate suite, and the runner's `run/manager.gate` and `gate/engine` (real Lean), pass unchanged.
  - **Contracts (additive, all in §2.7 already but one):** `GateFindingCode` gains `arrow`, `holds-kind`, `rejected-repeat`, `stray-command`; `GateFinding.inference`; `stray-command`'s token `comment` for AP-26's stray comment (new). Additive exports outside the indexes: `gate/permitted.ts` `contribution` and `footprintSinceBase`; `review/permitted.ts` `extraSources`, `questionSources`, `isSessionProof`. `CLAUDE_SESSION_TEXTS` gains 1b's arrow texts (`arrowSelf`, `arrowUnknown`, `arrowVocabulary`, `arrowOtherSubject`, `arrowDrawn`, `arrowCycle`), restated for propose_arrow and B.3. `describeFinding` has a sentence for every new code and token; slice 1's sentences are unchanged (G5's `premises` and `follows_from` tokens, the field names, still read "it changed the card …").
  - **builder 2b1b decided (G0):** G0 stays the engine's: judgeState judges ProjectModels, which hold only the Lean files, while G0 judges every file of the root (`checkFileChanges`, as in slice 1); 2b3 adds its findings to the step's. G1, `sorry` and `example` are judgeState's, against B. *(Alternative: scan the models' Lean files with `scanForbidden` inside judgeState, which misses every other file.)* *Amended by fixer 2b1b r1 (S-F6): G0 is a global rule of every purpose (§4.9), so 2b3b merges G0's findings into the judgement's `global` at every purpose, the stage and the final check included, which makes `ok` false and puts them in `stepFindings`; adding them to `stepFindings` alone would leave `ok` true at a stage and at the end (EN-2).*
  - **builder 2b1b decided (when T's proof is judged):** footprint(T.holds) ⊆ permitted(T) and B.2 judge the active step's target as slice 1 judged a run's, against S₀: at a proved finish always (a proof unchanged since S₀ with "the proof of the target as it was when this step started", A11), by check in stage prove and at a not-proved finish only when T.holds changed since S₀, so a re-ask that finishes not proved, keeping its old proof (§3.2), is not refused for it; every other inference, and every inference at a stage or the end, when T.holds is a session proof (a theorem B does not have as it is). The person's own unchanged proof is not judged at a stage (A11; the backstop restates B.2 on F, 2b2). *(Alternative: judge every proved target at every purpose, which reverts a Result that is B's version and refuses a re-ask's not-proved finish.)*
  - **builder 2b1b decided (footprints by creator):** each new or changed declaration is judged against the permitted set of the inference whose step created it (ledger `created`; the active step's new ones are its), and the finding is that inference's: failing proof material fails its Result (RV-11), not the state. A declaration no step recorded (a written premise's statement, an anomaly) is judged against the vocabulary layer (standard axioms, signature, and for a non-proof the presuppositions) as a global finding (fail closed). Before the active step's freeze its declarations get only the fail-closed `no-facts` rule, as slice 1 before a freeze (a carrier is `proof-before-freeze`'s). *(Alternative: every footprint finding global.)*
  - **builder 2b1b decided (the active step's phase):** for `other-result`, the active step's new declarations are `statements` when its freeze holds them and `proof` after it; before a freeze `statements` at check and freeze (it is still formalising) and `proof` at a finish (as its end records, §3.4). *(Alternative: computeItems' rule alone, which would make the step's own new definitions proof material at its freeze.)*
  - **builder 2b1b decided (step limits):** the token is `session` for a declaration of S₀ that B does not have as it is (T.holds and statements included), else `target` for the target's statement (and T.holds while the proof is closed), else `removed`, `changed` or `meaning`. The limits also refuse an S₀ declaration the step moved (computeItems counts a move as a change) and a line of S₀'s text outside declarations the step removed or moved (`removed`), so neither reaches the end as an unowned difference (AP-26's reasoning). D2-41's comparison of the value and type constants is the step limits' only: evaluateRules' `existing-changed` keeps slice 1's (type and value). *(Alternatives: `target` first; leave moves and removed lines to the backstop.)*
  - **builder 2b1b decided (G5 in a session):** a sibling of slice 1's G5 (`sessionMarkupFindings`), against S₀ (B at a stage and at the end): `premises:` is compared as entries; an addition is telelean's when a ledger `arrow` entry into the card (declined or not: B.3 says `declined`) or a ledger `premise` entry explains it, else `markup` (`premises`); no removal. Pins: the scope's fuzzy cards, and its target when it has no statement at S₀ (a target questioned by its mark is at no selected arrow, yet the step formalises it); at a stage and the end, every target and question source. `follows_from:` goes only with a ledger `mark-removed`; new blocks only for ledger premises. *(Alternatives: B.3 for every `premises:` difference; pins for the fuzzy cards only.)*
  - **builder 2b1b decided (tokens the plan does not assign):** propose_arrow in a statements-only step is `not-target` with §3.3's text; a self-arrow `cycle` (1b's text); an unknown card, a vocabulary name or another subject's card `unknown-card` (1b's texts); a declined arrow item's arrow still in `premises:` `declined`; the order of propose_arrow's checks is §4.9's list. *(Alternative: new tokens.)*
  - **builder 2b1b decided (one finding per problem):** `new-axiom` leaves a proposition's axiom `.holds` to B.4 (`axiom-for-proposition`; S6 allows either), and a ledger premise's pending claim passes both. B.4's axiom → theorem exception is the step's target at a step, and any target of the session at a stage or the end. *(Alternative: report both codes.)*
  - **builder 2b1b decided (rejected-repeat):** `shaky-identical` is judged by check and at a finish, never at the freeze (the set's proofs can change only after it); only the step's own premise drafts are judged for `premise`; `rejected-repeat` findings are step findings (in `stepFindings`), not global, so they leave `ok` as it is. *(Alternative: at every step purpose.)*
  - **builder 2b1b decided (the judgement's other fields):** `stepFindings` at a stage and at the end is the global findings; `ok` = built, no `facts` problem, no global finding (an unowned difference is a problem, which disables Apply through the view and the backstop). `problems`: computeItems' `unowned`; one `no-longer-builds` per Lean error inside a declaration an item provides (with its key and the declaration); `facts` for the drafts whose module did not build (their keys), or with no facts at all; no `scc` problem: whether a cycle of items is partly accepted depends on the records, which change without a judge, so planSubmit, the view and the backstop read it. `reasonChip` is left out: a Result's chip depends on how its step ended (REVIEW_TEXTS `sourceNotProved`, `stepDidNotFinish`), which only the records know, so 2c2 sets it. The band: `used` (drawn arrows in direct(T)), `notNeeded` (sources not in direct(T)), `open` (direct(T) without a drawn arrow, a conditional proof's hypotheses), `complete` as BD-7/B.5; `missing`: direct(T) outside sources(Q(T) ∪ E(T)), with whether its arrow is drawn. *(Alternatives: [] for non-step purposes; an `scc` problem; a chip from the target's status.)*
  - **builder 2b1b decided (wording):** slice 1's rules reused against S₀ (not-proved, status-mismatch against S₀, statement-changed, readiness, not-frozen, proof-before-freeze) keep their messages, with "before the run" read "when this step started" and "in this run", "in the run" and "in this round" read "in this step" (`stepWording`). *(Alternative: copies of those helpers with session messages.)*
  - **Carry-overs of 2b1a's review** (each fixed, with tests):
    - **R1-F1 (fixed):** the decision is in fixer 2b1a r1's entry above ("Mixed requests"): `settleMergedBack`, after the request's declines and backs to review. Beyond the finding, the same pass fixes two un-rejects in one request (after a group Reject: the first one's keep-out of an item the second brings back went into `revert`, and a premise the second brought back was taken out). **builder 2b1b decided (seen while fixing R1-F1):** a later un-reject of an item that a mixed request declined, when that request also un-rejected another item, inverse-merges the whole decision commit, so it takes that other item's content out again while its record keeps it in; the next judge then reports it disappeared and Apply stays disabled until an Undo (fail closed). Left as is: no client sends such a request (§5.7), and Redo resends only recorded ones. *(Alternatives: the reducer refuses such an un-reject; or 2c1's validator refuses a `decideItems` that mixes `in-review` with `declined`.)* *Superseded by fixer 2b1b r1 (S-F5): the residual covered more than V (a premise the mixed request wrote again kept its card, written key and ledger entries while the later inverse merge removed its card), so the reducer now refuses such an un-reject, the first alternative, with `REVIEW_TEXTS.unrejectMixed`; the Undo of the mixed request undoes both.*
    - **R1-F2 (fixed):** fixer 2b1a r1's sentence and the test's comment are corrected (RV-3 reaches the state within a stage), and the test builds that state with reconcile.
    - **R1-F3 (fixed):** the property carries out a premise write only when the action's write schedules it (`premises.write`), requires an accepted premise to be written once its step is carried out, and checks that an Undo restoring a taken-out premise's Accept puts that card back (`reapply`, no premise write, AF2). A reducer that never schedules premise writes, or an Undo that lets a fresh write replace the card, now fails per step.
  - **Tests** (core 67 files, 857 tests; was 65 and 783): `test/review/judge.test.ts` (66: the walkthrough, a three-target chain judged sources first, a session proof that does not pass, other inferences out of stepFindings, no inference; the step limits; G5 and B.3 at the gate; propose_arrow's every refusal; B.4 and new-axiom; B.2 with E(T) and D2-59; B.1's contributions; rejected-repeat's four tokens, `no_alternative`, the freeze, content brought back; stray-command and AP-26's comments; other-result and F7; status-mismatch; the active step's slice-1 rules; problems, `ok`, `final`, `reach`; the Result's flags and band; a re-ask's question; footprints by creator; `stepWording`) with `test/review/helpers/judge.ts`; `test/gate/describeSession.test.ts` (4); `test/review/reducer.test.ts` +4 (R1-F1's orders, a merged-back premise the request sets back to review, two un-rejects in one request) and the World property (a mixed request among its actions, the R1-F3 checks, a `mixedOut` path counter), R1-F2's state built with reconcile. No existing test was deleted, skipped or moved.
  - **Mutation checks** (each restored byte for byte, `cmp` identical): 94 on the new rules (step limits 9, G5 9, B.3 4, propose_arrow 11, B.4 4, new-axiom 6, stray-command 5, footprints and B.2 5, other-result 6, B.1 9, judgeState 14, rejected-repeat 8, describe 2, the order 2), every one failing at least one test (one, a draft mentioning its own target's material, only after the test read that target's judgement); the carry-overs: the reducer as it was fails the R1-F1 tests and the World property, and 7 snippet mutations of the final one each fail tests: the post-pass dropped (11), a merged-back premise written again whatever its final status (3), a merged-back item a later decline keeps out left in (5), a merged-back premise left in review counted as kept in (1, once a test sent that request), R1-F2's `skipped` check dropped (1), R1-F3's "no premise write scheduled" (3, the World property per step) and "an Undo never puts the card back" (7). B.1's exclusion of T.holds from the permitted set is defensive (no source can bring it: a circular footprint gives nothing, and the signature leaves out cards' declarations), so no test can reach its mutation.
- **orchestrator, 2026-11-20 (slice-3 ultra review S3-1, AP-30):** the value probe that gives `valueConsts` (1d) and, from 2b3, `typeConsts` ran as an `#eval` inside the check file, which imports the model, so a high-priority `ToString String` or `ForIn` instance in the model could forge what slice 2's own checks read (B.2 and the bands, RV-5, RV-7, content keys, D2-41's step limits, the backstop). Its isolation, planned for slice 3's 3p (D3-52), moves into 2b3, now split into 2b3a (the isolated probe: its own Lean job that imports only `Lean.CoreM` and `Lean.Util.FoldConsts` and loads the model with `Lean.importModules`; its measurement; the regenerated recordings and core's Spyro facts) and 2b3b (the engine, unchanged). A judged state whose probe failed is refused, naming the cause (S3-2's rule: an `environment` outcome at step purposes when the rules find nothing else, a partial stage through ADV-3's `factsMissing`, `facts` at `final` and in the backstop); B's facts and facts from before 2b3a are compared approximately; AP-21's second run goes; the ghost check keeps its in-file probe, a stated residual. The core half (`LeanFacts.probe`, `ProbeRunFacts`, `probeFailure`, `factsMissing` on a failed probe, the cause in the `facts` texts) goes to 2b2, since 2b3 changes no core source (§0). New D2-75; D2-30 and D2-41 annotated. §1, §1.1 (2b2, 2b3a, 2b3b), §2.1, §4.10, §6.1 (2b2, 2b3a, 2b3b), §7.2, §7.3, §7.4.
- 2026-11-20 (fixer 2b1b, round 1: the findings of the 2b1b review). Core and this plan only. Every finding is fixed (C-V2B1B-C2 with one deviation, below); each fix has a test that fails without it.
  - **Proofs of cards that are not the target (S-F1, A-ADV-2, C-V2B1B-C3; fixed).** B.4 judged axiom → theorem only for the step's target, and nothing refused a new theorem `.holds` elsewhere: a step could prove a non-target (an unowned difference no later step could take out), a statements-only step could prove the source it names, a Submit step that opened an axiom card's or a pending premise's item could turn its claim into a proof (the person's "hold as pending" silently became a theorem), and a fuzzy axiom card could be filled with a theorem `.holds`. `holdsKindFindings` now refuses a theorem `.holds` on any card but the step's target (at a stage and the end, any session target): `axiom-to-theorem` when the reference had an axiom, `not-target` when it had none or another text, each with a board sentence.
    - **fixer 2b1b r1 decided:** at a step, a `.holds` of S₀ that the scope did not open is the step limits' alone (they refuse any change of it), so each change gets one finding; B.4 speaks at a step for new `.holds` and opened ones. *(Alternatives: one token for both cases; report both codes.)*
  - **Opened content's lines (S-F2; fixed).** A Submit step could not remove an opened declaration's comment or the `namespace … end` pair around it (the step limits refused every removed S₀ line). Now a removed S₀ line is exempt when computeItems attached it, as it came (B → S₀), to an opened declaration (`attachedTo`), or it encloses only opened declarations (`AddedTextUnit.encloses`, a new field computeItems' comparison now records); the target's `.holds` counts as opened under `openProof` except at gate-other. The person's lines, and lines of content not opened, stay refused.
    - **fixer 2b1b r1 decided:** the attachment is the one recorded when the line came, never re-derived from S₀'s neighbours. *(Alternative: exempt any comment next to opened content in S₀ by position.)*
  - **A step purpose without its scope or S₀ (S-F3; fixed):** judgeState throws `ActionError('invalid')`. *(Alternative: `ok: false` with a global finding.)*
  - **Board sentences for the step limits' new cases (S-F4; fixed):** tokens `closed-proof` (the target's `.holds` while the proof is closed) and `text` (a line of S₀ outside declarations removed or moved), each with a `describeFinding` sentence; `target` and `removed` keep slice 1's meaning. *(Alternative: tell them apart in describe by `names` and `file`.)*
  - **Un-reject after a mixed request (S-F5; fixed):** the reducer refuses an un-reject whose declining decision also un-rejected another item (`REVIEW_TEXTS.unrejectMixed`); builder 2b1b's decision 13 is superseded (its entry says so), and §4.6's property names the refusal. *(Alternative: refuse mixed requests in the reducer or in 2c1's validator.)*
  - **G0's hand-off (S-F6; docs):** the engine merges G0's findings into `global` at every purpose (builder 2b1b's G0 entry is amended, and §1.1's 2b3b entry says so).
  - **One finding per problem (S-F7; fixed):** B.3's re-check of the step's own arrows leaves a declined one to `rejected-repeat` (`arrow`); `rejected` leaves a repeated premise draft to `premise`. *(Alternative: keep B.3's `declined` and drop `rejected-repeat`'s `arrow`.)*
  - **`scc` (S-F8; docs):** §2.9 and types.ts say judgeState does not emit it.
  - **D2-59's test (S-F9; test):** now a real declined Claude arrow (ledger entry and declined record, the source still in the question, the arrow out of `premises:`), with `global` empty, and the same arrow drawn as its pass.
  - **A written premise's card and `other-result` (C-V2B1B-C1; fixed):** the card telelean wrote for an accepted premise (ledger `premise`, no `created` entry) follows its draft's rule: it may mention its own target's proof material (F7's `draft`), never another Result's; findings are that target's. Before, every written premise reaching a proof-phase definition made every later state not `ok`.
  - **Re-asks (C-V2B1B-C2; fixed, with a deviation from the review's fix):** what earlier steps made for the active step's target is judged with the question on the record (B.1's footprint, and `other-result`'s sources) until the step claims its new question: at gate-proved, and by check_lean once T.holds changed. Under `openProof` the proof material of the target's Result is open (its Proof is open, ES-2), except at gate-other (a finish without a proof leaves the Result as it was), so a re-ask may drop a lemma resting on a source it no longer asks for. A footprint finding on such old material says so.
    - **fixer 2b1b r1 decided:** at a proved finish, old material is judged with the new question, which a proved re-ask puts on the record (§3.2): the review's fix judged it with the old question there too, so the gate would pass a lemma that the next stage judgement (on the replaced question) fails, reverting the new Result at once. The finish passes once the lemma is removed or reworked. *(Alternative: the review's, old material always on the recorded question.)*
  - **A target's `.holds` with no facts (C-V2B1B-C4; fixed):** a theorem T.holds Lean reported nothing about is `footprint` / `no-facts` (as slice 1's rule), unless the build failed for its file (G1's).
  - **The `example` message (C-V2B1B-C5; fixed):** in a session it suggests a named lemma, never `#check` (`sessionExampleWording`).
  - **E(T) and Claude's taken-out arrows (A-ADV-1; fixed):** E(T) counts a ledger arrow only while the judged state draws it (the active step's own before its normalise draws them), so a proof can no longer use the source of an arrow a cascade's revert took out; propose_arrow calls an arrow "drawn already" only when it is drawn or this step proposed it, so Claude may propose a taken-out one again.
    - **fixer 2b1b r1 decided:** drawn, read from the state, not the record's status. *(Alternative: drop entries whose record is out of ws/; at the queue-end judgement the records are still the old ones, so that would refuse a re-proposed arrow.)*
  - **Unowned differences at a step (A-ADV-3; fixed):** G5 compares a block's other lines as written and in order (token `lines`, computeItems' F1 rule), only when no field rule spoke for the block; and a step whose rules find nothing else fails on each unowned difference computeItems reports that S₀ did not have (`existing-changed`, token `unowned`, with `CLAUDE_SESSION_TEXTS.unownedChange`). Session content that no item of S₀ provides gets a neutral step-limit message.
    - **fixer 2b1b r1 decided:** the catch-all speaks only when no other step finding exists (the others name the same differences precisely), at step purposes only (at a stage the unowned problem already disables Apply). *(Alternatives: always, which doubles nearly every G5 and step-limit finding; a new code.)*
  - **A `.holds` re-elaborated through new material (A-ADV-4; fixed):** a `.holds` counts as changed when its text or its meaning (D2-41: printed type and value, value and type constants) differs: the active target's against S₀ (judged at gate-other and by check_lean), and `isSessionProof` against B.
    - **fixer 2b1b r1 decided:** status-mismatch keeps slice 1's byte-identical text. *(Alternative: status-mismatch also refuses a meaning change at gate-other.)*
  - **Re-drawn arrows (A-ADV-5; fixed):** at a step, G5 accepts a `premises:` addition only for the step's own ledger arrows and ledger premises; at a stage and the end, any ledger arrow (a declined one is B.3's).
  - **B.2's `unseen` in a session (A-ADV-6; test):** a card in T's footprint that no direct use explains, at a finish and at a stage; used directly and selected, it passes.
  - **Additive changes** (no later sub-slice uses them yet): `AddedTextUnit.encloses`; `otherBlockLines`, `meaningChanged`, `sessionExampleWording` exported; `extraSources(target, ledger, items, current?, activeStep?)` *(`current` required since fixer 2b1b r2, R1-2)*; `permittedFor`'s `activeStep`; `holdsKindFindings`' `openNames`, `stepLimitFindings`' `coveredAtStart`, `targetFootprintFindings`' `buildFailed`, `declarationFootprintFindings`' `hint`; `SessionRuleContext.materialQuestionOf` and `creatorOf(…).active`; `REVIEW_TEXTS.unrejectMixed`, `CLAUDE_SESSION_TEXTS.unownedChange`; the tokens above (§2.7).
  - **Tests** (core 67 files, 887 tests; was 857): `test/review/judge.test.ts` +28 and 6 updated (the new tokens, S-F7's one finding, E(T) drawn), the D2-59 test rebuilt; `test/gate/describeSession.test.ts` +1; `test/review/reducer.test.ts` +1 (S-F5). No test was deleted, skipped or moved.
  - **Mutation checks:** 47, each restored byte for byte (`cmp`), each failing at least one test: B.4 7, S-F2 5, S-F4 5, A-ADV-3 7, A-ADV-1 4, A-ADV-5 1, S-F7 2, C-V2B1B-C4 2, C-V2B1B-C1 2, C-V2B1B-C2 6, A-ADV-4 2, S-F3 1, C-V2B1B-C5 1, S-F5 2.
- **plan fixer, 2026-11-20 (AP-30's review of the isolated probe: AP30-1–AP30-6).** Plan text only; the slice-3 plan gets the matching changes.
  - **AP30-1 (major; fixed):** G0 refused `initialize` but not the `init` attribute it expands to, and on the pinned 4.35 every `lean` process that imports a module runs its `[init]` IO (downstream builds, the check job, the ghost and render scratch files, with `<shadow>/.lake` writable), so Claude's code could rewrite the `.olean` files the probe job loads or inject JSON messages into the check's output; the isolated probe ran no model code only because of `importModules`' defaults. 2b2: G0 refuses an attribute named `init` or `builtin_init` in any attribute list (`metaprogramming`), the identifier `init` staying allowed elsewhere; the probe file writes `(loadExts := false) (level := .private)` out. §1.1 (2b2, 2b3a), §2.1 ("No Claude code runs at import", the outline), §6.1 (2b2; 2b3a's new overlay `probe-init`), §7.4, D2-75.
  - **AP30-2 (minor; fixed):** a probe that fails on B fails every state of its session. `checkBase` now answers `environment` with `probeFailure`'s sentence and "Claude's work on this model cannot be checked." (still writing base-facts.json), so the start refuses before anything is sent to Claude. Adapted: `environment`, not the finding's "problem", because the start's text for problems says "your files have Lean errors … fix or save them", which is wrong for a probe failure, while the environment notice says nothing was sent to Claude. The size cause is logged, not removed: 2b3a measures the model size at which the probe's message reaches the 32 MB cap, and D2-75 states the limit and how to lift it. §1.1 (2b3a), §2.1 (the start sub-bullet, Compared approximately, Cost), §6.1 (2b3a), D2-75.
  - **AP30-3 (minor; fixed):** 2b3b carries §2.1's failed-probe rule onto the session path: check, freeze and gate with `CheckContext.session` decide on `stepFindings` (an `environment` outcome when they are empty or only `source-only`), never on `ok` alone. §1.1 (2b3b), §2.9 (SessionCheckContext), §6.1 (2b3a's gate-not-proved; 2b3b's four session cases).
  - **AP30-4 (minor; fixed, slice-2 half):** a premise write whose judgement's probe failed fails like a Lean environment failure (taken back out, item still accepted and due, the stage problem naming the cause), so step 4 never records a `factsMissing` key. §1.1 (2b3b), §2.9 (`writePremise`), §3.8, §6.1 (2b3b, 2f).
  - **AP30-5 (nit; fixed, slice-2 half):** in a stage whose probe failed, an Accept of a declaration item is refused with `probeFailure`'s sentence and "Decline what caused it, or Exit." (new `ItemClass.probeFailure`, `REVIEW_TEXTS.acceptProbeFailed`, 2b2), not ADV-3's "its file did not build. Wait for the check to finish."; `probeFailure`'s contract says it is undefined for `ok` and the sandbox's four statuses. §1.1 (2b2), §2.1, §2.2, §6.1 (2b2).
  - **AP30-6 (nit; fixed, slice-2 half):** D2-75's reverse names 3p's meaning walk (reverse D3-52 too, or keep the probe job for it); the ghost check's residual is stated as D2-75's own, without the circular pointer to D3-52. §2.1, D2-75.
- 2026-11-20 (fixer 2b1b, round 2: the findings of the review of fixer 2b1b's round 1). Core and this plan only. Every finding is fixed as the review proposed (R1-1 with one refinement, below); each fix has a test that fails without it.
  - **A re-ask's old proof (C-V2B1B-C2, major; fixed):** round 1 judged an earlier step's material of the re-asked target with the question on the record, but `other-result` still judged what T.holds itself mentions with the step's question, at every purpose. So a re-ask that dropped a source whose proof material the old proof used (allowed under the old question, D2-50) could not pass its freeze, check_lean or a not-proved finish: before the freeze T.holds may not change (`proof-before-freeze`), and at gate-other it must stay byte-identical (`status-mismatch`). Now what T.holds mentions is judged with the question its Result's material is judged with (`materialQuestionOf`): the recorded one until the step claims its new question (a proved finish, or check_lean once T.holds changed). The old proof passes the freeze, check_lean and a not-proved finish (§3.2: "your earlier result stands"); a proved finish refuses it (`other-result`) until a new proof replaces it. For any other target the two questions are the same.
  - **A reworded comment of opened content (R1-1, minor; fixed):** a step's new comment attached only to a declaration changed since S₀, so rewording the comment of an opened declaration that stayed as it was read as a stray comment ("not next to a declaration …", though it stood directly above it), while S-F2 already let the old line go. `compareTexts` gains an optional `alsoTouched`; at a step, a declaration the scope opens that is session content counts as changed for the attachment.
    - **fixer 2b1b r2 decided:** only opened declarations that are session content (new or rewritten since B), the ones computeItems also attaches comments to at the stage. *(Alternative: the review's, every opened declaration. A step with `openProof` opens the person's own proof, so a comment above it would pass the stray-comment rule and reach the stage as unowned text, caught at the step only by the A-ADV-3 catch-all, with a vaguer message.)*
    - **Seen by fixer 2b1b r2 while fixing R1-1; decided by builder 2b2 (carry-over R2-1, the fixer's own alternative):** the stray-comment rule attached a step's new comment against S₀ only, while computeItems at the stage attaches it against B. So a new comment directly above session content the step was not given (an earlier step's definition, say), trailing a declaration the step wrote or opened, passed the step, and at the stage went with that content, whose content key then changed against ES-2's preset (an accepted item back in review, "updated"). Now, at a step, each comment line the step added is also judged by the stage's attachment (`compareTexts(B, W)`, the comment matched by its place in the judged file): it is refused (`stray-command`, token `comment`, `CLAUDE_SESSION_TEXTS.strayCommentOwner`, naming the declaration in `names`) when that declaration is one the step may not change (in S₀, unchanged and in place since S₀, and not in `openNames`), and as a plain stray comment when the stage attaches it to nothing. This also closes the older case of a comment trailing a new declaration. *(Alternative: leave it, visible as an "updated" item, as the fixer first did.)* *(Fixer 2b2 r1, A-V2B2-ADV-4: this covers the comment lines a step adds. A comment S₀ already had that goes with another declaration because the step wrote one next to it, or removed the one it described, is caught by the frozen-items rule, §4.9.)*
  - **E(T)'s contract (R1-2, minor; fixed):** `extraSources` requires the judged state (`current`), so no caller can read E(T) from the ledger and the records alone, which would count an arrow a cascade took out (A-ADV-1). §2.9's and `review/types.ts`'s `extra` say "drawn into T in the judged state".
  - **Board sentences (R1-3, nit; fixed):** `closed-proof` reads "it changed the proof of “‹T›”, which this step may not change", since the token stands for any change of the closed proof (added, changed, removed or moved). Session content that no item of S₀ covers has its own token, `uncovered` (§2.7): "it changed ‹name›, which an earlier step wrote", without "you are reviewing".
    - **fixer 2b1b r2 decided:** a new token. *(Alternatives: a flag on the finding; one neutral sentence for `session` and the uncovered case.)*
  - **One finding per problem (R1-4, nit; fixed):** at a step, a declined Claude arrow drawn again by hand got G5's `premises` (A-ADV-5 accepts only the step's own arrows) and B.3's `declined`. G5 now leaves it to B.3, under B.3's own condition (a ledger arrow whose item is declined). A declined record with no ledger arrow, which B.3 does not see, stays G5's.
  - **Tests** (core 67 files, 895 tests; was 887): `test/review/judge.test.ts` +7 (C-V2B1B-C2: the old proof through check, the freeze, check_lean, a not-proved finish and the stage before; a proved finish refusing it, a new proof passing, a reworked proof refused by check_lean, no re-ask passing. R1-1: a reworded comment of an opened lemma at check and both finishes, and the stage; the same next to content not opened; a comment above the person's own proof. R1-2: `extraSources` drawn and not, the running step's, no ledger, and a call without the state refused by the compiler (`@ts-expect-error`) and at run time. R1-4: `declined` alone at a step and at the stage, an arrow in review and a declined record without a ledger arrow G5's), 1 updated (the uncovered case's token); `test/gate/describeSession.test.ts` +1 (`uncovered`, and `closed-proof` for a removal as judgeState reports it), 1 updated (`closed-proof`'s sentence). No test was deleted, skipped or moved.
  - **Mutation checks:** 14, each restored byte for byte (`cmp` and sha256), each failing at least one test: C-V2B1B-C2 3 (T.holds on the step's question again; a proved finish, or check_lean on a changed T.holds, not claiming the new question), R1-1 4 (`alsoTouched` ignored; the person's own declaration counted; the opened names not passed; any session content counted), R1-2 1 (`current` optional again: the run-time test fails, and tsc reports the unused `@ts-expect-error`), R1-3 3, R1-4 3 (no hand-off; any ledger arrow handed off; a declined record without a ledger arrow handed off).
- **plan fixer, 2026-11-20 (the recheck of the AP30 fixes: its AP30-1 again, here AP30-1 r2, AP30-7 and AP30-8).** Plan text only; the slice-3 plan gets the matching changes (AP30-8 is slice 3's alone).
  - **AP30-1 r2 (major; fixed):** the `init` rule and the explicit `importModules` arguments stand, but G0 ran before every Lean job only on slice 1's `runCheck` path (it returns before syncing the mirror, and `buildProposal` renders only when `g0` is empty). Read literally, 2b3b's G0 bullet (merge G0's findings into the judgement's `global` at every purpose) had the session path build, check and probe the very state G0 refuses, so a step's `@[init]` IO would run in the downstream builds and the check job, with `.lake` writable, before the attempt failed, and could leave a rewritten `.olean` (with its trace) in the mirror for every later probe and check job. Now G0 runs first, before any Lean job, at every purpose, and when it finds anything nothing is synced, built, probed, rendered or challenged: step purposes return its findings as today (counted, no judgement); `judge` and `finalCheck` judge the files without facts, G0's findings in `global`, so `ok` is false. **Adapted:** the finding had `writePremise` and `complete` judge the files without facts too; their failure reports carry no judgement and step 4 must never read a partial one (AP30-4), so they judge nothing and answer `{ ok: false }` with G0's first message, failing as a premise write whose probe failed and as a completion that does not pass (§3.8). This sets aside the order that builder 2b1b's G0 entry and fixer 2b1b r1's S-F6 hand-off (above) implied, "merge after judging"; those lines are left as their authors wrote them. The rule's list scope now reads the same for `@[…]` and `attribute […] x` (first in the list, or after a comma, `scoped` or `local`), and 2b2's tests add `attribute [simp, init] x`, `attribute [local init] x` and `attribute [builtin_init] x`. 2b3b's new test: ws/ holding `@[init] def x : IO Unit := pure ()` at every purpose, the ghost check, `writePremise` and `complete` gives G0's finding, with spies showing that `refreshFacts`, `renderStatements` and `syncMirror` are never called. §1.1 (2b2, 2b3b), §2.1 (the probe-file paragraph, "No Claude code runs at import"), §2.9 (`SessionCheckContext`, the engine's methods), §6.1 (2b2, 2b3b), D2-75.
  - **AP30-7 (minor; fixed by logging):** "no Claude code runs at import" holds only for a model whose files import only its own modules. G0 refuses a non-project import only in Claude's lines, and refresh keeps the person's header imports, so a person's `import Lean` would give every downstream module of Claude's Lean's elaborator attributes (`command_elab`, `term_elab`, `tactic`, `delab`, usable on a plain `def` with no token G0 refuses) and the `register_*` commands (which expand to `initialize`), each running Claude's code in later Lean jobs. Taken as the finding's smallest fix: the condition is stated and the residual logged, since the person's model imports nothing but its own modules today and telelean writes no other import. The way to close it (`checkBase` refusing, before anything is sent to Claude, a B whose files import a module outside the project) is named in D2-75 and left to the integrator, since it would refuse every Formalize on such a model. §2.1 (the probe-file paragraph, a new bullet after "No Claude code runs at import"), D2-75, §7.4's AP entry.
  - **AP30-8 (minor):** slice 3's alone: its 3p gives `checkBase` a base-commit mode for the re-check of an older session's base and `recover()`'s upgrade. Nothing changes here: slice 2 runs `checkBase` only at a start, where ws/ is B.
- **orchestrator, 2026-11-20 (AP-30, AP30-1 r3; the amendment workflow's last recheck):** the `init` rule matched attribute names by canonical name, but Lean reads them after `eraseMacroScopes`, so `@[init.«_@».x._hyg]` attaches `init` and passed G0 (the same spelling gets `macro`, `implemented_by` and `csimp` past WORD_CODES). Fixed in the plan (§1.1 2b2, §2.1, §6.1 2b2 and 2b3a): G0 erases macro scopes before comparing, refuses any hand-written hygienic name in Claude's lines, and judges an attribute list as a whole. 2b2's builder started before this line; if 2b2 does not implement it, 2c1 does (its brief has the carry-over).

- 2026-11-20 (builder 2b2: the backstop, taking content out, several targets, Submit's plan, `holdAs`, the failed probe's core half, G0's `init` rule; with the carry-overs of 2b1b's review and AP-29's G2). Core only, plus the webview's Formalize docs and test (check 6), and this plan. `applyBackstop`, `planItemRevert`, `planSubmit`, `formalizeStartProblems` and `formalizeOrder` replace their stubs; `review/index.ts` is unchanged.
  - **Carry-overs of 2b1b's review** (each with tests, mutation-checked):
    - **R2-1 (fixed):** see the replaced fixer 2b1b r2 line above. **builder 2b2 decided:** beyond the brief's case, a comment the stage would attach to nothing (computeItems would report it unowned: e.g. above a declaration the step put back to B's text) is a plain stray comment at the step, as AP-26 asks, instead of being left to A-ADV-3's catch-all, which speaks only when no other rule does. The board sentence names the declaration ("it left a comment that would go with `‹X›`, which it may not change"). *(Alternatives: the brief's case only; keep "next to nothing it wrote" on the board.)*
    - **R2-2 (fixed):** B.3's `declined`, at a step, when the step drew the arrow (S₀ did not draw it), ends with `CLAUDE_SESSION_TEXTS.arrowDrawnByHand`: "You drew it by editing `premises:`: never edit `premises:`; remove it." **builder 2b2 decided:** it replaces "It is still drawn into “T”: it may not be used." in that case (the sentence the review found misleading); the state's wording stays at a stage and when S₀ already drew it. *(Alternative: append the action after the old sentence.)*
  - **Contracts (additive):** `LeanFacts.probe?: ProbeRunFacts`, `ProbeRunFacts` and `probeFailure` (facts.ts, as §2.1); `ItemClass.probeFailure?` (as §2.2); `GhostAdoptionRequest.holdAs?: 'axiom' | 'pending'` (gate/types.ts; absent = `axiom`, M2's adoption); the LeanOp `replace-decl { name, text }`; `EditSession.expectBinding`; `SubmitPlan.partlyAccepted` and `FormalizeSession.shakyResults?` (§2.9 shows both; 2c2 and 2e use them); core's `subjectCycle` and `FORMALIZE_START_TEXTS.subjectCycle`; texts `REVIEW_TEXTS.acceptProbeFailed`, `factsProbeFailed`, `askedTwice`, the backstop's `backstop*` texts, `CLAUDE_SESSION_TEXTS.strayCommentOwner` and `arrowDrawnByHand`. No §2.9 signature changed.
  - **builder 2b2 decided (the failed probe):** `probeFailure` writes the detail on one line (whitespace collapsed, final periods dropped), and "the probe failed." when there is none. The stage's `facts` problem stands whenever the judged state's probe failed (`factsProbeFailed`: the sentence, then "Apply stays disabled until telelean can read it."), with the `factsMissing` drafts as `keys` when there are any, so a state with no draft holding a declaration is not `ok` either. A draft with no declaration in the state (an arrow, a Result as in B, an unwritten premise) is not `factsMissing`. `fakeFacts`' `probe` (a status or a `ProbeRunFacts`): a failed one gives no declaration constants whatever the overrides say, and the facts' status `check-errors` with the cause in `detail` unless `status` is given. *(Alternatives: the detail verbatim; the problem only when a draft lacks facts.)*
  - **builder 2b2 decided (G0's `init` rule):** the finding's token is the attribute in its list's form (`@[init]`, `attribute [init]`, `@[«init»]`), with G0's usual `metaprogramming` advice; any `@` followed by `[` opens an attribute list, glued or not (fail closed: Lean reads no other `@ [`); nested brackets are an attribute's arguments; `attribute [-init] x` (an erasure) is not refused. *(Alternative: report the bare identifier.)*
  - **AP30-1 r3, implemented here** (the orchestrator's line above arrived while 2b2 was being built; **2c1's carry-over for it is done**): `eraseMacroScopes` (exported from `gate/g0.ts`) before the `init` comparison, `isHygienicName` refusing any hand-written hygienic name in Claude's lines (`metaprogramming`, "`‹name›` is a hygienic name, which is not allowed in the model files: rename it (in ‹decl›)."), and an `init` attribute's list judged as a whole against B's lines. **builder 2b2 decided:** one finding per token: a hygienic `init` attribute is the attribute's finding (`@[init.«_@».x._hyg]`), not a second, hygienic-name one; the erasure cuts at the last `_@` (Lean's walk from the end), and a `_hyg` name without `_@` erases to nothing, so it names no attribute (the hygienic-name rule still refuses it); the whole-list rule covers the `init` attributes only, as written, and every other token keeps the line rule. Since the erased comparison also refuses `@[init.«_@».x._hyg]`, §6.1's mutation "dropping the hygienic-name rule lets the first one through" is caught by the `macro.«_@».x._hyg` case instead, and dropping the erasure by the first case's token. *(Alternatives: report both findings; the whole-list rule for every token.)*
  - **builder 2b2 decided (`holdAs`):** optional, `axiom` when absent, so M2's `adoptGhost` writes as before until 2h; any other value is refused (`invalid`: "A premise is held as an axiom or as a proposition pending proof, not "‹x›"."). Pending writes the same block and declarations with `type: PROPOSITION`. *(Alternative: required, which breaks M2's caller until 2h.)*
  - **builder 2b2 decided (`replace-decl` and `planItemRevert`):**
    - `replace-decl` replaces the declaration's span (from its docstring) with the text in the file's line breaks; it archives nothing, and refuses an empty text, one with an unterminated comment or a telelean block, a declaration holding a block or ending unclearly; EditSession checks Lean's range for it as for `remove-decl`.
    - The revert plans every change before writing: declarations first in each file (LeanOps), then a `.holds` the state lacks put back right after its statement, then the comment and enclosing lines that go with what goes (mapped through the earlier edits; lines separated only by whitespace in one deletion), then premise blocks, then fields: a source leaves `premises:` (the line when empty), `follows_from: nothing` comes back when B had it and the ledger's `mark-removed` names the item, and a card's `lean:` line is B's again, with `expectBinding` holding the card to B's binding (a blank line keeps a code-less card code-less). An `id:` write-back stays (no difference on its own). Anonymous instances go by their span (no LeanOp finds them). Refused, fail closed: a moved declaration (`unsafe`), a changed anonymous instance, a declaration B bound to a card that the state lacks (a proposition's `.holds` excepted: it is its Result's, which puts it back), a draft naming a card the state lacks, and the kinds no slice-2 step makes (`invalid`). The result is checked (every declaration gone or with B's text, premise cards gone, statements bound as in B) and nothing is returned otherwise. *(Alternative: put back whole block texts from B, which would also undo other items' field changes in the same block.)*
  - **builder 2b2 decided (Submit's plan):** `partlyAccepted` (above) is computed in `planSubmit`, the one place §2.9 says the records' SCC check lives, so the view's gate and the runner share it. The affected inferences are the session's inferences of the Shaky and to-be-redone items; an item of no recorded inference (an origin `''`) counts but gets no step. Take-out follows RV-5 transitively through any item; the step order is Kahn's over the RV-5 edges between steps, then question sources first, ties and any cycle by the inferences' `order`. *(Alternatives: leave the SCC check to each caller; order by `order` alone.)*
  - **builder 2b2 decided (the start checks):**
    - `formalizeStartProblems` returns every problem, check by check, in the request's order within a check (so the list is in check order without sorting). After check 1 fails, nothing else is checked; with the results hidden, the answer is check 1's problems (which read only the board's cards) then check 2's. Check 1 also refuses a target asked twice (`askedTwice`), an empty request (slice 1's "Select arrows into one card."), and a board of another subject during a session (`runElsewhere`). Check 3 keeps slice 1's texts for an axiom target, an unknown premise, a premise that is the target, an undrawn arrow and an empty question without the mark. Check 5 reads `shakyResults`; without it, a declined Result of a target with a Shaky item counts as Shaky. *(Alternative: the first problem only, as slice 1's check.)*
    - Check 6 (AP-29, G2) in both paths: a cycle through the question's cards keeps slice 1's text ("This card is on a cycle of arrows (…): remove one arrow first."); any other gets `FORMALIZE_START_TEXTS.subjectCycle`, "The arrows of this subject form a cycle (‹names›): remove one arrow first.", the cycle through the first card in the board's order that lies on one (`subjectCycle`, Tarjan's SCCs, then slice 1's shortest cycle). `formalizeCycleProblem` does both, so the host's `formalizeStartProblem` and the webview's `formalizeState` change with it (the webview's docs only). *(Alternative: one text for both.)*
    - `formalizeOrder`: Kahn's order, choosing among the targets whose sources in the request are placed the first in the board's order (unknown cards last, by id); a cycle among the targets (which check 6 refuses) is broken by that order. *(Alternative: a stable sort of reading order with sources moved before their dependents.)*
  - **builder 2b2 decided (the backstop):** ownership is computeItems on B and F with the ledger, no premise draft (F holds written premises only) and every inference's target `ended`. Its checks are independent, so one problem may be named by two codes (an arrow nobody accepted: `unowned` or `not-accepted`, and `arrow`); only these are merged: `class` is skipped for an item already refused `own-accept`, `content-changed` for a premise refused `not-written` and for an item whose facts are missing, and per-name `facts` refusals when F's probe failed (one refusal, the cause). B.2's `source-only` is a `facts` refusal; B.2's allowed set is a session target's question sources drawn in F plus E(T), and any other changed proposition's drawn arrows. (a) compares an existing axiom's type where both facts have it, else its text; (c)'s exemption needs the card's Result accepted, own or by a group. A refusal's `item` is the record's id, and is absent for an owner with no record. *(Alternative: merge every code's refusals about one subject.)*
  - **Tests** (core 72 files, 980 tests; was 67 and 895): new `test/review/backstop.test.ts` (18), `revert.test.ts` (18), `formalize.test.ts` (10), `submit.test.ts` (7), `probe.test.ts` (10); `test/review/judge.test.ts` +7 and 1 updated (R1-4's message, now R2-2's), `test/gate/g0.test.ts` +7 (AP30-1 r3's two among them), `adoption.test.ts` +3, `describeSession.test.ts` 1 extended, `test/markup/leanOps.test.ts` +4, `test/formalize.test.ts` +1; `test/project/helpers/fakeFacts.ts` gains `probe`. Webview `test/unit/contextActions.test.ts` +1 (check 6; 314 tests). No test was deleted, skipped or moved; none moves to a later sub-slice.
  - **Mutation checks:** 105, each restored byte for byte (`cmp`); 103 fail at least one test, and two are equivalent: `fixedForStep`'s membership in S₀ (its text comparison implies it) and an emptied `premises:` written as `[]` (`setBlockFields` removes the line for `null` and `[]` alike). Five first survived and got tests (R2-1 on a changed declaration, `formalizeOrder` with a source read after its target, `planSubmit` with items to be redone only, the backstop's `content-changed` on a state whose probe failed, AP30-1 r3's list closed by Claude's line); a sort of the start problems that was dead code (they are collected in check order) was removed.
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 980, webview 314, extension 203 (`--no-cache`); the runner files the change touches, with real Lean: `workspace/perform` 8, `run/manager.rounds` 4, `run/manager.gate` 8, `integration/m2flow` 5, `gate/rules` 26, `gate/engine` 30, `run/fresh.e2e` 9, `run/walkthrough.e2e` 22, all passed; a scratch webview build, and Playwright's `s1-formalize` (6 passed) against it.

- 2026-11-20 (fixer 2b2 r1: the review of builder 2b2). Core, the extension's and core's doc comments for check 6, the user guide's two Formalize lines, and this plan.
  - **A Result whose T.holds moved could not be taken out (S-V2B2-S1, C-V2B2-C1, A-V2B2-ADV-2, major; fixed in the revert):** the step limits open the target's `.holds` under `openProof`, its place included, so a step may rewrite B's `axiom T.holds` (or the person's proof) below a later declaration; computeItems gives the moved T.holds to the Result, and `planItemRevert` refused every moved declaration (`unsafe`), so a Reject, a cascade, the judge's reverts and Submit's take-out of that Result all failed. Now a declaration B has that the state moved goes from where it is and B's text goes back in B's place (`baseDeclPlace`, items.ts: right after the nearest unit before it in B that the comparison keeps in place, else right before the nearest kept unit after it, replacing the whitespace there with B's own around it); a `.holds` the state lacks goes back the same way (it went right after its statement, which need not be B's place). The check refuses a result in which what went back is not in B's place or anything else moved; an anonymous instance that moved is still refused. This replaces builder 2b2's "a moved declaration (`unsafe`)" and "a `.holds` the state lacks put back right after its statement". (Fixer 2b2 r2, R1-2: two that go back next to the same unit were still refused; see that entry below.)
    - **fixer 2b2 r1 decided:** the revert handles the move, rather than the step limits refusing it. Lean needs a source's `.holds` declared before a proof uses it, so a pending target placed above a source declared later can only be proved below that source; slice 1 allows it, the plan's step limits open the `.holds`'s place, and §4.11 asks the take-out for "T.holds as in B" whatever the step did. *(Alternative: the reviews' preferred fix, the move check applied to the target's `.holds` under `openProof` too, which would make such a Formalize fail.)*
  - **The mark with two written premises (C-V2B2-C2, minor; A-V2B2-ADV-3, major; fixed):** taking out the written premise whose ledger `mark-removed` removed T's mark put `follows_from: nothing` back while a second written premise's arrow into T stayed (TL023, which the parser resolves by dropping the mark). Now the mark comes back only when no arrow into the card stays, and the revert's check refuses a card it edits that ends with both the mark and arrows (read from the lines, since the parser drops such a mark). **fixer 2b2 r1 decided:** the take-out write then moves the dropped `mark-removed` to the remaining written premise (§3.8, for 2f), so the removal stays owned. *(Alternative: computeItems and the backstop count a `follows_from` removal as owned by any written ledger premise of the card.)*
  - **A completion taken out after a rework (A-V2B2-ADV-1, major; fixed):** a premise's take-out put T.holds back as in B whenever the ledger had its `completion`, also after a later step reworked T.holds without the premise, silently removing a proof that did not depend on it (and the person's Accept with it). **fixer 2b2 r1 decided:** T.holds goes with the premise only while it still rests on it: its `uses` closure reaches a declaration the premise provides, or, without complete facts, its text names one (the completion's term names the premise's `.holds`); a card with no `.holds` gets B's back as before. The ledger entry's lifetime is unchanged. *(Alternatives: record the completion's text on the ledger entry and compare; drop the `completion` entry when a later step changes T.holds, which would make a completion due again once that rework is taken out.)*
  - **S₀'s comments re-attached by a step (A-V2B2-ADV-4, minor; fixed):** R2-1 judged only the comment lines a step adds, so a lemma written between an earlier step's comment and the definition it describes, a lemma written below such a definition's trailing comment, or a Submit step that removed its opened lemma and left the lemma's comment changed a frozen item's content key unseen (an accepted item back in review, "updated", with its accepted dependents). **fixer 2b2 r1 decided:** a general rule rather than a comment rule: at step purposes, when no other rule spoke (after the `unowned` rule), every item of S₀ the scope does not open (its `openItems`; under `openProof` the target's Result, its own rules') keeps its content key, or it is a finding `existing-changed`, token `session` (the board's sentence: "it changed ‹names›, which an earlier step proposed and you are reviewing"), naming its declarations, with `CLAUDE_SESSION_TEXTS.frozenItemChanged` for Claude; skipped for an item whose facts are missing in either state (a failed probe stays the engine's `environment` outcome, §2.1), and altogether when S₀'s facts and the judged state's come from different probes (one with the marker, one without), whose keys differ by the facts alone. The R2-1 line above is annotated. *(Alternative: compare only the S₀ comments' attachments, with token `comment`.)* (Fixer 2b2 r2, R1-1: not for a premise draft that is not written, whose item is the draft itself; see that entry below.)
  - **The probe's detail while the results are hidden (A-V2B2-ADV-7, minor; fixed):** Lean's error in a failed probe's detail can name or quote hidden proof material, and it reached the Accept refusals of listed items and the stage's `facts` problem. `probeFailure` gains `{ detail: false }` (additive): "the probe failed." without the error. **fixer 2b2 r1 decided:** the stage's `facts` problem never carries the detail (the judge cannot tell whether the results are shown), and `classesBeforeReveal`, the map in force while they are hidden, gives the sentence without it, so the reducer's Accept refusal says the cause only; `classes` (shown) and the backstop at Apply keep the detail. Whether the probe fails at all can depend on hidden content: added to §4.7's accepted residuals. *(Alternatives: keep the detail in the problem and have 2c2 mask it while hidden; have 2b3a keep declaration names out of the detail.)*
  - **`holdAs`'s default (S-V2B2-S2, minor; fixed by hand-off):** kept optional for M2's `adoptGhost` until 2h retires it; §1.1's 2h entry now makes it required then, with a test, and says 2f's premise write passes the record's `accepted.holdAs`. *(Alternative: a session entry point that requires it now.)*
  - **Check 6 and a self-arrow (S-V2B2-S4, nit; fixed):** `subjectCycle` counts a proposition that lists itself in `premises:` (TL015) as the cycle `[x, x]`, first in the board's order like any other (an old axiom's self-premise is not drawn, A19); slice 1's `arrowCycleThrough` is unchanged. §4.12.
  - **Stale docs (S-V2B2-S3, C-V2B2-C3, nits; fixed):** the user guide's Context Menu line and start-check list name the subject-wide check and its text; the host's `startRun` and the protocol's `StartRunMessage` doc comments say "no cycle of arrows anywhere in the subject".
  - **A test name (C-V2B2-C4, nit; fixed):** "at the stage and the end nothing changes" now judges `final` too.
  - **Tests the reviews asked for (A-V2B2-ADV-5, A-V2B2-ADV-6, minor; fixed):** the backstop passes a rejected Result whose T.holds is B's again beside accepted items (the `asInBase` filter), and refuses (`b2`) a proof that uses a source its recorded question still lists but whose arrow is in neither B nor F (D2-59).
  - **Contracts (additive):** `probeFailure(facts, options?)`; core's `baseDeclPlace` (items.ts) and `CLAUDE_SESSION_TEXTS.frozenItemChanged`. No §2.9 signature changed.
  - **Tests** (core 72 files, 991 tests; was 980): `test/review/revert.test.ts` +4 and 1 replaced (the moved vocabulary declaration, refused before, now goes back in B's place, in the new tests; in its place, an instance without a name that moved is refused): T.holds moved below later content (the person's proof replaced, with a lemma and comments, moved unchanged, a pending claim proved, a `.holds` the state lacks put back away from its statement), B's place before and after (first in its file), two written premises into a marked target, a premise's completion after a rework (by its closure, through a lemma, by its text without facts); `judge.test.ts` +4 (A1, A2, A3 and the closed-proof Result, with an opened item, a failed probe and facts from two probes) and 1 extended (C4); `backstop.test.ts` +2; `formalize.test.ts` +1 (the self-arrow); `probe.test.ts` 3 updated (the detail rule: `probeFailure`'s option, the problem and both class maps, the reducer while hidden and shown). No test was deleted, skipped or moved.
  - **Mutation checks:** 34, each run against the final code and restored byte for byte (`cmp`); 30 fail at least one test. Four are defensive halves that the rules before them make unreachable, so no test can fail without breaking those first: the revert check's "not in B's place" (the placement puts it there) and "both the mark and arrows" (breaking the mark rule instead fails in that very check: "would both follow from nothing and have arrows"); the frozen-items rule's lost item (every reachable loss of a frozen item is another rule's finding first) and its skip of an item whose facts are missing only in the judged state (a module that did not build, which the build rule reports first; a failed probe, which the probe guard skips).

- 2026-11-20 (fixer 2b2 r2: the re-review of fixer 2b2 r1). Core and this plan.
  - **A premise proposed again was refused as a frozen item (R1-1, major; fixed):** fixer 2b2 r1's frozen-items rule compared every item of S₀, unwritten premise drafts included (`premise:‹T›:‹leanName›`, whose content key is the draft's key, §4.3). S₀'s items leave out the running step's drafts and the judged state's read the newest, so a step that proposed a premise again under its key, reworded (the Submit re-ask after a Reject, a not-proved finish that proposes the missing premise again), was refused at check, gate-proved and gate-other (`existing-changed`, token `session`, in `frozenItemChanged`'s words about comments, which Claude could not act on), each refusal a gate attempt. Before that rule these steps passed, and reconcile recorded the newer version. **fixer 2b2 r2 decided:** the rule skips an item of S₀ of kind `add-premise` whose key no ledger `premise` entry names, the test computeItems itself uses to make the item from the draft (content outside ws/). So a reworded repeat passes, as S13 and §3.5 say, whatever the record's status (an accepted premise whose write is still due included: reconcile returns it to review "updated", as before that rule). A written premise is content in ws/ and stays frozen, and the exact repeat of a rejected premise stays `rejected-repeat/premise` alone. §4.9 amended. *(Alternative: the review's test, an `add-premise` draft whose `provides` are all empty, as `planItemRevert` reads "not written"; it agrees on every state a step can reach, but would also skip a written premise whose card, declarations and arrow are gone while its mark removal stays.)*
  - **Two declarations going back after the same unit (R1-2, minor; fixed):** when two declarations that `planItemRevert` puts back in B's place (`baseDeclPlace`) have the same nearest kept unit before them (adjacent in B: two pending claims, each proved below later content by its own step, taken out together by a Reject's cascade or Submit's take-out, RV-5), the first one's edit starts at that unit's end, so `mapOffset` could not place the second and the take-out was refused (`unsafe`: fail closed, nothing written). **fixer 2b2 r2 decided:** in B's order, a declaration that goes back after the same unit (same file, same offset) as the one just put back starts where that one's own text ends (B's declaration text, its trailing spaces included; *builder 2c1, carry-over R2-1: it read "its trailing whitespace excluded", which put the run's end inside the previous declaration's text when its last line ended in spaces*), and its B lead replaces the whitespace after it, the same stretch of B's text; any number in a row go the same way. Places before a unit (first in their file) already map past the previous one and are unchanged, as is the revert's check. §4.11 amended. *(Alternative: put a run of adjacent declarations back as one slice of B's text.)*
  - **Contracts:** none changed (`frozenItemFindings` is internal and now takes the ledger; no §2.9 signature changed).
  - **Tests** (core 72 files, 997 tests; was 991): `test/review/judge.test.ts` +4: a reworded repeat of a rejected premise at a Submit step (check and gate-proved, the item reading the newer draft) and at a not-proved finish (gate-other); a premise in review proposed again reworded by a step that opens no item; the exact repeat, `rejected-repeat/premise` alone; a written premise stays frozen (a lemma written below the comment after its `.holds` takes the comment, at check and gate-other). `test/review/revert.test.ts` +2: two pending claims adjacent in B, each proved below later content by its own step that passes its gate, both Results out at once give B byte for byte, and each alone goes back to its place; three after the same unit, two after different units, one in each of two files after units that end at the same offset, and two first in their file before the same unit, each giving B byte for byte. No test was deleted, skipped or moved.
  - **Mutation checks:** 9, each restored byte for byte (`cmp`), all failing at least one test: the unwritten-premise skip dropped; every premise item skipped; the written set read from the ledger entries' cards, or from no ledger; a later place never following the one before it (the old path); the run's end taken after the trailing whitespace; the run ignoring its unit, applying before a unit too, or ignoring its file.
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 997, webview 314, extension 203 (`--no-cache`). No runner file changed and no runner source uses `judgeState` or `planItemRevert`, so no runner test file is touched; one runner smoke file, `test/gate/pure.test.ts`, passed (14).

- 2026-11-20 (builder 2c1: the base mask, the build's mask option and endorsements, `endorsementHash`, the protocol messages; with the carry-overs AP30-1 r3 and 2b2's review R2-1). Core, one `default` of the extension host with its routing test (the host decision below), and this plan. `baseMask` and `maskFacts` replace their stubs; `review/index.ts` is unchanged.
  - **AP30-1 r3 (carry-over): found done** by builder 2b2 (its entry above: `eraseMacroScopes`, `isHygienicName`, the `init` list judged as a whole; §6.1's hygienic-name tests in `test/gate/g0.test.ts`). Mutations run again here, each failing a test: the hygienic-name rule dropped (the `macro.«_@».x._hyg` case), the comparison without `eraseMacroScopes` (the `init.«_@».x._hyg` cases), the list judged line by line (the whole-list test), a `«_@»` component alone not hygienic (the `a.«_@».b` cases).
  - **R2-1 of 2b2's review (minor; fixed as the brief says):** `planItemRevert` step 2 ends a run where B's declaration text ends in what went in (`newText.indexOf` of B's `DeclEntry.text` in the file's line breaks, its trailing spaces included; `trimEnd()` only as a fallback), for both sides; `follows` requires the same side, path and offset; after a unit the next place starts at the run's end as before, and before a unit it starts at the run's end instead of walking back over whitespace (which ate the previous declaration's trailing spaces). §4.11 and fixer 2b2 r2's entry reworded. Tests (`revert.test.ts` +3): both layouts with trailing spaces, tabs and both, each also alone; CRLF; three in a row; R1-2's two pending claims with the first ending in spaces. Mutations: the file as before the fix, the run's end at `trimEnd()`, and the walk back restored each fail them; dropping the side from `follows` is equivalent (an `after` offset is a kept unit's end and a `before` one the first kept unit's start, and every `before` place of a file precedes every `after` one in B's order, so the two never meet at one offset).
  - **Where things live.** `review/mask.ts`: `baseMask`, `maskFacts`, and (additive, imported by path, §2.9's note) `projectMaskOf` (the build's form, `ProjectMask`) and `maskedModel` (the masked project 2c2's `buildSessionView` builds the hidden graph from). `project/types.ts`: `ProjectMask`, `ProjectInput.mask`, `ProjectInput.endorsements`. `project/build.ts`: `maskFiles`, `maskedCode`, and `codeJoint` (exported: B's joined stretch). `paths.ts`: `endorsementsPath`, `Endorsement`, `EndorsementsFile`, `endorsementHash`, `parseEndorsements`, `serializeEndorsements`. `protocol.ts`: `SessionMessage`, the ten messages, `SESSION_MESSAGE_TYPES` (RUN_MESSAGE_TYPES ends with it), the new LIMITS.
  - **Contracts (additive):** `BaseMask.restoreMarks` (§2.9 shows it): `dropNodes`' "mark removals" as data, since the build cannot read the ledger. `ProjectMask` holds the plan's `absent`, `codeOverride`, `drop`, `dropArrows`, `dropNodes`, plus `restoreMarks`, `derivedIds` and `codeOverride.joined` (the decisions on a target's code and on derived ids, below). No §2.9 signature changed.
  - **builder 2c1 decided (the build's form of the mask):** the build reads the working copy's texts and positions: a left-out declaration (`drop`, `absent`) is removed from the build's view of its file (no binding, vocabulary item, code piece, users text scan or markup diagnostic of it; a `mutual` whose named declarations all go, with them), a written premise card's block before ids are assigned, Claude's and the written premises' arrows from `premises:`; `maskFacts`' facts are the input's. *(Alternative: rewrite the texts, the hidden declarations out and B's `.holds` in, and re-position the facts.)*
  - **builder 2c1 decided (a target's code):** composed as B's: the working copy's statement (B's, the step limits keep it), B's `.holds` text, joined as B joined them (`codeOverride.joined`: B's text between them when B's code held both as one stretch; else two pieces); its refs from B's DeclFacts, which `maskFacts` keeps at B's positions (in the working copy's file) and the build places against B's range; B's messages for it at the start of the working copy's declaration. So a lemma written between the target's statement and its `.holds`, or a `.holds` moved, never shows in the code. *(Alternative: the working copy's layout around B's text, which shows where proof material was written.)* *Amended by fixer 2c1 r1 (S-V2C1-S2, S-V2C1-S4): the `.holds` also reads with B's keyword, and B's messages for it go to the start of the target's statement.*
  - **builder 2c1 decided (other cards' code):** a card whose statement and `.holds` would be one stretch but for left-out declarations or blocks between them is one stretch without them, as LeanOps' removal (`deletionEdit`) leaves the text, its `.holds` refs moved up by the lines removed. *(Alternative: the working copy's two pieces, which tell that something hidden sits there.)* *Superseded by fixer 2c1 r1 (C-V2C1-C3): a card with B's statement and `.holds` texts is composed in B's layout (`codeLayout`); only a card new in the session is composed this way, its hidden declarations taken out with the lines that go with them, merged (C5).*
  - **builder 2c1 decided (`baseMask`'s lists):** `drop` reads each name's first `created` entry and never takes a name B has; `dropArrows` leaves out an arrow B draws; `dropNodes` a card B has; `restoreMarks` takes only cards B marked; each sorted, once each; `holds` without a prototype. A target's B `.holds` always wins over `drop` (`maskedNames`). *(Alternative: every ledger entry as it is.)*
  - **builder 2c1 decided (a written premise card's declarations):** what the card owns (`ownerOfDecl`: its statement, `.holds` and any other pin). *(Alternative: its statement's and `.holds`' names, which would hide another card's statement a premise card were bound to (TL017).)*
  - **builder 2c1 decided (`maskFacts`' details):** a name only Lean reports goes with its parent (the facts' `parent`, else the declaration whose range holds it, else the longest name prefix: computeItems' rule); a message is a declaration's when its start lies in the declaration's syntactic range; B's messages of a same-text declaration move by the line offset (and the first line's column), into the working copy's file; the working copy's envelope stays, `check.probed` counts the masked declarations; a state without facts is refused (`invalid`), and `maskedModel` builds it without facts, masked. *(Alternatives: keep the working copy's count; return empty facts.)*
  - **builder 2c1 decided (derived ids):** a card into which only hidden writes went (Claude's arrow, a written premise, its mark removal) and whose `id:` line telelean wrote back over B's derived id reads as derived again, with the parser's TL112 (`ProjectMask.derivedIds`), unless its `lean:` pins changed too (a visible write). *(Alternative: show the written id, so a hidden arrow into a derived-id card removes its TL112.)* *Amended by fixer 2c1 r1 (S-V2C1-S5): every card whose id was written back over B's derived id while its pins stayed B's, a hidden write current or taken out.*
  - **builder 2c1 decided (a new file of proof material):** a file B lacks, with no block, all of whose declarations the mask leaves out, is left out of the masked build whole (its TL118 would tell). *(Alternative: keep it, empty.)*
  - **builder 2c1 decided (freshness):** `maskedModel` keeps the working copy's: a fresh file gets its module's hash, any other one that differs (a module the facts call `stale` whose file still hashes the same would lose message attachment; no judged state is like that). *(Alternative: a file-hashes input.)*
  - **builder 2c1 decided (a block next to a left-out declaration):** bound adjacently to one, it is code-less; its gap declaration is re-indexed, or dropped when left out; the parser's TL013 hint that B had is not re-derived (the working copy changed a card's binding: a card change the step limits refuse, so no stage holds it). *(Alternative: re-parse.)* *Superseded by fixer 2c1 r1 (S-V2C1-S1, C-V2C1-C2): the alternative, re-parse; a pinned block was unbound and hints about hidden declarations stayed.*
  - **builder 2c1 decided (endorsements):** `endorsementHash(text)` is SHA-256 of the declaration's source text as core's scanner spans it (`VocabItem.code`, `DeclEntry.text`: docstring and attributes, no comment line around it), whitespace collapsed, as content keys compare texts; the build takes each subject's entries (`{ name, textHash }`) and counts a definition endorsed only by its own subject's; a card needs endorsement while any definition it uses does; `parseEndorsements` (lenient, failing closed) and `serializeEndorsements` (sorted by name and hash) sit in `paths.ts`, since 2f changes no core file. *(Alternatives: the exact text; one list for all subjects.)*
  - **builder 2c1 decided (protocol details):** `requestId` optional on each, as on every message; `stage` 0 to LIMITS.stages; a decision's `rev` and an Undo's or Redo's `step` 0 to LIMITS.revision; item ids and the check id are host tokens (RUN_TOKEN_PATTERN); `note` kept as typed unless blank; `rationale` trimmed, one line, dropped when blank; `endSession` `back` refuses a check and `exit` a stage or a check; `revealResult` refuses `raw-diff` (the diff's own `confirmed` counts as it). *(Alternative: a required `requestId`.)*
  - **builder 2c1 decided (the host, pulled forward from 2c2):** with the session messages in RUN_MESSAGE_TYPES the host's `dispatchRun` was no longer exhaustive (tsc TS2366), so it gains a `default` answering `not-yet` with `REVIEW_TEXTS.notBuiltYet` ("Not built yet (slice 2)"), §1.1's 2c2 answer (*fixer 2c1 r1, C-V2C1-C6: ten explicit case labels instead of the `default`, so the switch stays exhaustive*); the extension's routing test covers it (each session message answered `not-yet`, no RunManager call). 2c2's host bullet keeps what remains. *(Alternative: keep the session messages out of RUN_MESSAGE_TYPES until 2c2, against §2.4.)*
  - **Tests:** new `test/review/mask.test.ts` (28: baseMask's lists and boundaries; the proved and not-proved outcomes alike under the mask; Used by and the target's code, B's or none; Claude's arrows, proof-phase definitions, vocabulary and an unmarked axiom dropped; a written premise card with its arrow, mark and messages, as an axiom and pending, and one with two pins; old facts without typeConsts; messages; AF6's positions with a hidden lemma above a card and an anonymous instance, and a working-copy message B did not have; a lemma inside another card's code, tight and spaced; two pieces, an indented `.holds`, a stray ref; derived ids; a new file of lemmas and a `mutual`; an empty mask; maskFacts without facts, B without facts, its order, facts-only children, a changed declaration, freshness; a hidden lemma next to a block; a mark the arrows outweigh), `test/project/endorsements.test.ts` (7), `test/protocol.session.test.ts` (15); `test/review/revert.test.ts` +3 (R2-1); `test/protocol.m2.test.ts` updated (RUN_MESSAGE_TYPES has 21 entries, M2's eleven first); extension `test/unit/runRouting.test.ts` updated (the routed set plus SESSION_MESSAGE_TYPES) and +1 (`not-yet`). No test was deleted, skipped or moved.
  - **Mutation checks:** 8 on the carry-overs (7 fail tests, R2-1's side condition is equivalent, above) and 98 on 2c1's rules, each restored byte for byte (`cmp`), all failing at least one test. The first run's six survivors were fixed: two redundant paths to a premise card's declarations (one kept: what it owns), a working-copy message identical to B's that the build de-duplicates (a test with one B did not have), a mark guard the node rule repeats (removed), refs outside their declaration (a test), and endorsement format cases with empty lists (a test with entries).
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1050 (75 files; was 997), webview 314, extension 204 (`--no-cache`); the runner files the core change reaches, with real Lean: `workspace/arrows` 7, `scan` 7, `realcore` 4, `refresh` 13, `perform` 8, `integration/fixes` 5, `session` 8, `m2flow` 5, `semantic/valueProbe` 2, `run/manager.gate` 8, `gate/engine` 30, all passed. No webview file changed, so no scratch build and no Playwright.

- 2026-11-20 (fixer 2c1 r1: the review of 2c1, three reviewers, findings S-V2C1-S1 to S6, C-V2C1-C1 to C6, A-ADV-1 to 6; all fixed). Core (`review/mask.ts`, `project/build.ts`, `project/types.ts`), the host's `dispatchRun`, `test/review/mask.test.ts`, and this plan (§2.9, §4.7, §6.1, the builder's entry above).
  - **A card's statement is never hidden (A-ADV-1, blocker; fixed).** A step that formalised statements and ended not proved without `freeze_statements` records its new declarations as `proof` (D2-43), so the mask hid the statement of a card computeItems lists as a visible Formalize item (`card:<c>`), and the board told the outcome. **fixer 2c1 r1 decided:** `maskedNames` leaves a name of `BaseMask.drop` out only when no card of the working copy binds it (its statement, an AXIOM card's `.holds`, a pin: `ownerOfDecl`); a written premise card's names still go with it, and a target's `.holds` stays covered by `holds`. `baseMask` is unchanged. *(Alternative: amend D2-43 for 2d so that a name bound to a card is always recorded as `statements`; the mask would still have to agree with computeItems' ownership.)* *Completed by fixer 2c1 r2 (R1-1): the definitions such a statement uses are kept too, since the gate now judges a card's statement as a statement whatever phase wrote it.*
  - **Bindings and hints read as the parser reads the file without what is left out (S-V2C1-S1, C-V2C1-C1, A-ADV-2, blockers; C-V2C1-C2, A-ADV-3, majors; fixed).** A hidden lemma right below a pinned card's block unbound the card (the build reset every binding whose adjacent declaration was left out, pinned ones included): the target or a source showed informal, its statement and `.holds` became vocabulary, the `.holds` a hidden assumption (TL104) whose code was the proof. And TL013/TL014, which sit on a block's marker, kept naming or describing a hidden declaration. **fixer 2c1 r1 decided:** `maskFiles` re-parses each file that loses anything (`withoutSpans`: LeanOps' removal of each left-out declaration, block and line, merged) and takes each kept block's binding and its TL013/TL014 hints from that parse, so a pinned block stays pinned, an adjacent one reads what follows it then, and B's own hint comes back; when that text does not read as the same blocks and declarations, it fails safe: indices re-indexed, an adjacent binding to a left-out declaration code-less, a pinned one kept, and every hint about a left-out declaration dropped. The builder's decision "a block next to a left-out declaration" is superseded (its entry says so). *(Alternative: only the fail-safe path, which drops a hint about a hidden declaration but cannot bring back the hint B had about the visible one after it.)* *Amended by fixer 2c1 r2 (R1-2): the twin text also leaves out each target's `.holds` under `codeOverride`, and is read in every file that holds one.*
  - **Another card's code is B's (C-V2C1-C3, S-V2C1-S3, A-ADV-4, majors; C-V2C1-C5, minor; fixed).** Composing another card's code without the hidden declarations alone kept the comment written with a hidden lemma, extra blank lines, and a namespace around it (two pieces where B had one); a hidden `mutual`'s stale span also deleted the person's own text after it. **fixer 2c1 r1 decided:** `projectMaskOf` records B's layout (`ProjectMask.codeLayout`, B's joint or two pieces) for every other card the working copy has with B's statement and `.holds` texts, and the build composes such a card from the working copy's texts in that layout, whatever lies between them in the working copy (a hidden lemma, its comment or blank lines, a target's `.holds` moved there, or a blank line the step added, which no item owns); a card new in the session is composed from the working copy's text with its left-out declarations, and a target's `.holds` the step put there, taken out together with the lines that go with them (`ProjectMask.lines`: the comment lines attached to a left-out declaration or to a target's `.holds` shown as B's, whose comment is its Result's, and the enclosing lines around such declarations only, by `compareTexts`), merged (`mergeSpans`: overlapping spans and spans apart by whitespace only are one deletion, as planItemRevert's step 3 takes lines out). Residual (accepted, §4.7's kind): around a hidden lemma inside the code of a card new in the session, the working copy's text cannot tell which blank lines came with the lemma (the same text arises from a tight statement with a spaced lemma and from a spaced statement with a tight one), so they stay as LeanOps' removal leaves them; B cannot say either, since the card is new. *(Superseded by fixer 2c1 r2, R1-3: such a card's code drops every blank line between its statement and its `.holds`, so the residual is gone.)* A composed piece's refs now move by the column where it starts (`CodeDecl.column`), which equals B's own build for joined, apart and indented `.holds`. The builder's decision "other cards' code" is superseded. *(Alternative: B's layout only when something hidden sits between the statement and the `.holds`.)*
  - **A target's `.holds` keeps B's kind (S-V2C1-S2, major; fixed).** The build fell back to the working copy's keyword (`theorem`) wherever facts did not decide the `.holds`' kind (no facts, B without facts, an unchecked module, a stale file through `kindsAgree`), so the hidden board showed the target `not-checked` with a theorem instead of pending. **fixer 2c1 r1 decided:** `codeOverride` carries B's keyword, and `maskFiles` reads the overridden declaration with it, so `holdsKind`'s fallback and the facts index's stale match read B's kind. *(Alternative: give the build B's kind through the facts only, which cannot cover a state without facts.)*
  - **B's messages for a target's `.holds` go to its statement (S-V2C1-S4, minor; fixed):** at the start of the target's statement in the working copy (the `.holds`' start if the working copy lacks that statement), so they attach to the same card and keep the twin's order among the other diagnostics wherever the step moved the `.holds`. §2.9's `maskFacts` bullet and §4.7 amended. *(Alternative: B's position moved by the line offset of the statement.)*
  - **Derived ids (S-V2C1-S5, minor; fixed):** `derivedIds` restores B's derived id for every card whose block wrote an id over B's derived id while its `lean:` pins stayed B's, not only for the cards a current hidden write touches: a premise written and taken out leaves the written id (the revert restores the fields it wrote, not the id), and only a hidden write, current or taken out, writes such an id in slice 2. The builder's decision on derived ids is amended. *(Alternative: also restore the id when a written premise is taken out, in planItemRevert.)*
  - **The masked board's other inputs (S-V2C1-S6, C-V2C1-C4, A-ADV-5, minors; fixed):** `maskedModel` takes optional `endorsements` and `lakefile` and passes them to the build, since a ProjectModel keeps neither; 2c2 passes the ones the working copy's board was built with (§2.9's note). *(Alternative: keep them on ProjectModel.)*
  - **No `detail` in the masked facts (A-ADV-6, nit; fixed):** `maskFacts` drops the envelope's, `build`'s, `check`'s and `probe`'s `detail` (Lean's own words, which can quote hidden proof material; `probeFailure` of masked facts gives the sentence without it). *(Alternative: keep only `probe.status`.)*
  - **The host's `not-yet` (C-V2C1-C6, nit; fixed):** `dispatchRun` names the ten SESSION_MESSAGE_TYPES as case labels instead of a `default`, so a run message nobody routes fails to compile again (TS2366, checked by removing one label); 2d–2f take their labels out as they route them. *(Alternative: keep the `default`.)*
  - **Contracts (additive):** `ProjectMask.codeLayout`, `ProjectMask.lines`, `codeOverride[name].keyword` (required, since `projectMaskOf` is its only maker); `maskedModel`'s optional `endorsements` and `lakefile`. No §2.9 signature of `baseMask` or `maskFacts` changed.
  - **Tests** (`test/review/mask.test.ts`, 28 → 41): new: a source and a code-less target formalised without a freeze; a hidden lemma or anonymous instance below a pinned card's block (the target, another card); hints below a code-less card (a lemma after a blank line, an anonymous instance, a `mutual`; B's hint back, also around a namespace); failing safe on a hand-made mask whose text does not parse alike; B's layout only for B's texts; a target's `.holds` moved into another card's code, B's or new in the session; a card new in the session (a comment with and without a blank line, a hidden `mutual` before its own note), and a hidden `mutual` before the person's own note in a card B has; the target's kind in four states without deciding facts; B's message order for a moved `.holds`; derived ids with a hidden write left or taken out; endorsements and lakefile; no `detail`. Rewritten: a hidden lemma inside another card's code (oracle: the not-proved twin, five layouts), the empty mask (the new fields, B's layout composed byte for byte, apart and indented too), and the adjacent block (now a hand-made mask, since a card's own statement is never dropped). No test was deleted, skipped or moved.
  - **Mutation checks:** 34 on the fixes, each restored byte for byte (`cmp`), each failing at least one test (the list: the fixer's report), and one compile check (a session label removed fails the extension's tsc with TS2366).
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1063 (75 files; was 1050), webview 314, extension 204 (`--no-cache`). No runner file changed and no runner source reaches the masked build (`ProjectInput.mask`), so no runner test file is touched; the runner's `test/gate/pure.test.ts` and `test/gate/rules.test.ts` passed as a smoke run (40).

- 2026-11-20 (fixer 2c1 r2: the second review of 2c1, findings R1-1 and R1-2 (major) and R1-3 (minor); all fixed). Core (`gate/sessionRules.ts`, `review/texts.ts`, `project/build.ts`), `test/review/judge.test.ts`, `test/review/mask.test.ts`, and this plan (§3.4, §4.7, §4.9, §6.1, and the fixer 2c1 r1 entry above).
  - **A card's statement may not use what its unfrozen step wrote (R1-1, major; fixed in the gate).** A-ADV-1's fix kept a formalised card's statement visible when its step finished not proved without `freeze_statements`, but that finish records the definitions the statement uses as `proof` too (D2-43), so they were hidden with the Result: the masked vocabulary lacked them, the card's `uses` and its `definitional-choice` flag differed from the proved (always frozen) outcome, and computeItems listed no `decl:` item for them, while the listed Formalize item depended on a hidden one. The gate allowed it because `other-result` judged the card's statement by its creator's phase (`proof`), as material of the same Result. **fixer 2c1 r2 decided:** §4.9's rule as written ("card statements … never may mention it"): in `otherResultFindings`, a declaration a card of the judged state binds (statement, `.holds`, pin) is never proof material, and a card's statement or pin is judged as a statement whatever its creator's phase. So such a finish is refused at the step (fail closed), with a message that asks for the freeze when the step that wrote the used name has none (`CLAUDE_SESSION_TEXTS.otherResultNotFrozen`); frozen, the statement and its definitions read `statements`, as in the proved outcome. It also refuses a card formalised after the freeze that uses a definition written after it (the statement message), and lets a card's statement use another card's statement the same step wrote (both are the cards' content). D2-43 and `baseMask` are unchanged; 2d needs nothing new (a gate finding like any other). Residual (accepted, §4.7): a not-proved finish without a freeze still records a definition or vocabulary item that no card statement uses as proof material, hidden, where a frozen step lists it, as a step that gives up before fixing its statements adds no statement items. *(Alternatives: (a) refuse every not-proved finish without a freeze that keeps any new declaration: a freeze forced at the end would make a failed proof attempt's helper definitions statement content, where a proved step (frozen before its proof) records them as proof material, a new difference; *corrected by builder 2c2 (carry-over R2-1): that difference is not peculiar to (a): the chosen fix produces it too, in the cases it refuses, since its refusal asks for that same late freeze (now listed in §4.7's residuals, with the message asking Claude to remove what it wrote only for the proof attempt first). What sets (a) apart is its reach: it would force the late freeze on every not-proved finish without a freeze that keeps a new declaration, where the chosen fix forces it only when a card statement uses what the step wrote;* (b) amend D2-43 so that a step ending without a freeze records as `statements` what a card statement reaches: 2d's ledger rule and both core mirrors (computeItems' `active`, `creatorOf`) would change, and a proved step's card formalised after its freeze would still use proof material.)*
  - **No block reads a target's `.holds` where the step put it (R1-2, major; fixed).** The re-parse removed only what the mask leaves out, and ran only in a file that lost something, while a target's overridden `.holds` stays in the masked file where the step wrote it (only its code is B's). A proof moved to the end of the file, after a blank line below a code-less card, kept the working copy's TL013 ("… `cynder_not_good.holds` follows after a blank line …") on the hidden board, which the not-proved twin lacks. **fixer 2c1 r2 decided:** `maskFiles` builds the twin text without each `.holds` under `codeOverride` as well, re-parses every file that loses anything or holds such a `.holds`, compares the twin's declarations with the kept ones minus the overridden, and maps `adjacentDecl`/`gapDecl` back to the masked indices (the overridden `.holds` stays a masked declaration); failing safe, an overridden `.holds` counts as left out (an adjacent one leaves the block code-less unless pinned; its hint goes). So no hint reads a target's `.holds` in either outcome, and B's hint about what follows comes back. *(Alternative: put B's `.holds` text back in B's place in the twin text (planItemRevert's placing), which would keep a hint B had about it; it needs that placing in the build, and such a hint (attach a target's `.holds` to another card) is never right advice.)*
  - **A card formalised in the session reads the same code in both outcomes (R1-3, minor; fixed).** The residual fixer 2c1 r1 accepted was avoidable: a card formalised tight, with a hidden lemma written between its statement and `.holds` with blank lines around it, kept a blank line in the proved outcome only (LeanOps' removal keeps one). **fixer 2c1 r2 decided:** `maskedCode` composes every card without `codeOverride` or `codeLayout` whose statement and `.holds` are one stretch once what is left out (and a target's `.holds` the step put there) is taken out, whether or not anything was, from that stretch without its blank lines (`withoutBlankLines`: the statement's last line, every comment line and every line inside a block comment, and the `.holds`' indentation stay, with their line breaks as written; `--` comments and strings never open a block comment), and `compose` places the refs by the composed text. A spaced card thus reads tight while the results are hidden (in both outcomes); B's cards keep B's layout. The §4.7 residual is removed. *(Alternative: keep the working copy's blank lines and the residual.)*
  - **Found while testing, accepted as a residual (§4.7's kind; not in the findings):** a comment the step wrote with its statements directly above a card's `.holds` goes, by computeItems' attachment rule, with a lemma the proof phase writes between it and that `.holds` (the new declaration directly below it), so the proved outcome lists and hides it with the Result while the not-proved one shows it with the card. The frozen-item rule (fixer 2b2 r1) covers S₀'s items only. **fixer 2c1 r2 decided:** recorded as a residual channel of Claude's placement, like the others in §4.7. *(Alternative: a step rule that a comment the freeze commit attached to statement content keeps that attachment, which needs the freeze commit's texts in judgeState.)*
  - **Tests:** `test/review/judge.test.ts` +3 (R1-1: the unfrozen finish refused and the freeze or B's names passing, check_lean silent; a card formalised after the freeze; a statement using another card's statement of the same step); `test/review/mask.test.ts` +6 (R1-2: a `.holds` moved below a code-less card, with B's hint about what follows; B's `.holds` below a code-less card, in place or moved; failing safe; R1-3: tight or spaced statement and lemma, two blank lines too; comment lines, a block comment with a blank line inside, a line comment holding `/-`, LF and CRLF, B's layout kept; R1-1: the frozen twin's items and board). Against the files as they were before this round, 7 of the 9 fail (the other two guard the fix: another card's statement stays usable; the frozen twin agrees). No test was deleted, skipped or moved.
  - **Mutation checks:** 13, each restored byte for byte (`cmp`): 12 fail at least one test; one is equivalent (counting a card's `.holds` as card content too: a `.holds` mentions only its statement, or is a session proof, judged before).
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1072 (75 files; was 1063), webview 314, extension 204 (`--no-cache`). No runner file changed, and no runner source reaches the changed code (`judgeState` and the masked build are core's only), so no runner test file is touched; the runner's `test/gate/pure.test.ts` passed as a smoke run (14).

- 2026-11-20 (builder 2c2: the session view, `buildSessionView`, and the host's `not-yet` answers; with the carry-over R2-1 of 2c1's review). Core (`review/view.ts`, `review/reducer.ts`, `review/texts.ts`, `review/types.ts`), the extension's routing test, and this plan (§4.7, §4.9 and the fixer 2c1 r2 entry, for R2-1). `buildSessionView` replaces its stub; `review/index.ts` is unchanged (view.ts's new exports go through its `export *`).
  - **R2-1 of 2c1's review (minor; fixed):** the R1-1 refusal's late freeze holds everything the step wrote but proofs, so a helper definition or vocabulary written for a failed proof attempt is listed as statement content in the not-proved branch only, where a step frozen before its attempt hides it with the Result. §4.7's residuals now list the channel; the fixer 2c1 r2 entry's reason for rejecting (a) is corrected (the chosen fix produces that difference too, in the cases it refuses; what sets (a) apart is its reach); and `CLAUDE_SESSION_TEXTS.otherResultNotFrozen` now ends "Remove what you wrote only for the proof attempt, call freeze_statements, then finish again.", so the late freeze holds statement content only when Claude follows it (§4.9's quote and `judge.test.ts`'s `toContain` follow).
  - **Where things live.** `review/view.ts`: `buildSessionView`, and (additive, exported through the index's `export *`) `itemLabel(item)` (an item's full label), `sessionLabels(view)` (the reducer's `ReviewState.labels`, as builder 2a2 asked: "items by id, as the view labels them, and cards by card id"), `reviewStateOf(records, judgement, labels?)` (the reducer's input as the view reads it, for 2e and the host's early answers). `review/reducer.ts`: `itemGates(state)` (every item's own Accept, decline and back-to-review gates on one Work; `acceptGate` now runs on the same internal `acceptGateIn`, behaviour unchanged). `review/texts.ts`: builder 2c2's wording below.
  - **Contracts (additive; no §2.9 signature changed):**
    - `SessionRecords.steps[].statementsOnly?` (A12's source, from the step's StepScope; read only while the results are shown, for the Result's reason chip "“‹L›” was not proved", which builder 2b1b left to 2c2 "from the records": SessionRecords had no field for it) and `.queue?` (the queue a step runs in, numbered from 1 in the session; StepView's `index` and `of` count within it). **2d sets both** in `toSessionRecords` (the first from `PersistedStep.scope.statementsOnly`, the second at each `queue-start`).
    - `SessionRecords.confirmation.reusedFileChecks?` (EndConfirmationView's `reusedFileChecks`, which the records could not give); **2f sets it** with the final check.
    - `SessionViewInput.endorsements?` and `.lakefile?` (§2.9's note: "2c2 passes the ones the working copy's board was built with", but the input had no field for them); **2d/2f pass** the ModelWorkspace's.
  - **builder 2c2 decided (the board):** the graph has no source position (every node's `loc` and `lean.codeLoc`, every vocabulary item's `loc`, every diagnostic's `range`) and its `version` is `viewVersion`, whether the results are hidden or shown, since its positions are those of the judged commit's files, which the Proposed view never opens (§5.10). While hidden, the semantic summary has no time, duration, detail or stale files, its error count is the masked facts' (build errors plus declarations whose probe failed), and its state reads only the masked facts: `failed` when that count is not zero or the state's probe failed (§4.7's accepted residual), else `fresh`, never the envelope's status, which a hidden lemma's build error would set. Shown, it is the working copy's summary as the runner's `summarize` reads it (time, duration, detail, stale files). *(Alternatives: strip only while hidden; the envelope's status while hidden.)* *Corrected by fixer 2c2 r1 (S-HIDDEN-SUMMARY-ENVELOPE, C-V2C2-C7): "never the envelope's status" holds for its `build-errors` and `check-errors`; the sandbox statuses, which come with no declarations (timeout, oom, cancelled, low-memory, could-not-start, unsupported-*), still map as the runner maps them, which is better than "fresh" for a check that did not run; that they can depend on hidden content is now among §4.7's accepted residuals.*
  - **builder 2c2 decided (labels):** `ItemView.label` is the kind's label only (§2.3). Texts that name an item (the rejected list, the confirmation, the withdrawn list, the reducer's gate texts and stack labels through `sessionLabels`) use `itemLabel`: the kind's label and its card's sentence (cut to 60 characters, quoted), an arrow's two cards, a premise's sentence, or a declaration's Lean name. The view's own labels apply the same rule to the records (one helper), so `sessionLabels(view)` gives exactly the labels the view's texts use, even for a key that does not parse. *(Alternative: card ids, as the reducer's fallbacks.)*
  - **builder 2c2 decided (the list order, §5.5):** the groups in §5.5's order (sources that are no target in board order, Vocabulary, Definitions, the targets in inference order, other cards in board order, cards off the board), within a card its fields item, its Add arrow items, its Add premise items, its Result, within a group the records' order; then a walk from that order puts every item's listed dependencies before it, in their own order, a cycle as the walk meets it. So the "every item's listed dependencies come before it" invariant holds on `SessionView.items` itself (a source's Formalize that uses a new vocabulary term comes after that term, which leaves its group). The sources are those of the questions the view shows (while hidden, the latest ended steps'), so the order never reads a hidden outcome. *(Alternative: the groups only, the invariant left to 2g's `reviewRows`.)*
  - **builder 2c2 decided (gates):** the item gates are the reducer's own rules (`itemGates`): `accept` is the item's own Accept (the detail's, `own: true`), `decline` closes only for what refuses a decline whatever its option (hidden, declined already, withdrawn; Transform's and the plain decline's refusals are the menu's, `options`), `review` closes in review (`inReviewAlready`: nothing to go back to), withdrawn, taken out (D2-60) and for S-F5's mixed un-reject. A phase closes every action first: while a step runs D2-62's text (a mid-stage Formalize: "Claude's step is running: Formalize again when it ends."), in `confirming` "Back to review first.", in `applying` `applyingNow`. Submit: in review (`submitInReview`, the items as `missing`), then hidden (AF4's text, `waitingFor` as `missing`), then judging, then a partly accepted cycle (its items in list order, those not accepted as `missing`); its `next` and `work` (from `planSubmit`) only while the results are shown, in a stage, with a judgement. Formalize: running, the phase, hidden (D2-65), judging. Retry (the heading's): the phase, nothing to retry (`nothingToRetry`), judging. Apply: applying, judging, the check running, failed, drift. Undo and Redo only in a stage (null while a step runs and in a confirmation); `sealed` whenever the top action is a seal. *(Alternatives: `acceptGate` per item, O(n²); judging before the item rules.)*
  - **builder 2c2 decided (what a hidden Result's row holds):** rev 0, status null, classes null, the seen-early marker only, no dependency or dependent, every gate closed with "show them first", the decline options of a Result, its origin, and its detail's question (the target's latest ended step's). A listed item never names a hidden one: its `dependsOn`, `dependents` (accepted listed items only), `redo.because` and an event's items are filtered to listed items (an event left with none is dropped: the runner should make none, defence in depth). *(Alternative: trust the runner's events.)*
  - **builder 2c2 decided (cards):** a CardRef is the board's node, else B's, else (while shown only) the working copy's, else a bare reference (`sentence` its id, `wordedBy: 'agent'`), so a written premise card the mask drops is never named while hidden. *(Alternative: the working copy's always.)*
  - **builder 2c2 decided (the report and the outcomes):** while the results are shown and no step runs (D2-10: "withheld while a step runs and while the results are hidden"): each ended step's `outcome` (`stepPassed`, `stepDidNotFinish`, `stepStatementsOnlyOutcome`), its activity `shown`, its words in the report and in its target's Result detail, the Result's `reasonChip` (only for a not-proved verdict, from the target's latest ended step: gave up `stepDidNotFinish`, statements only `sourceNotProved`; a proved-but-not-established Result's BD-6 reason is its card's own chip on the shown board), and the notes: a re-ask not proved (the latest ended step's question, less the sources D2-59's declines took out, differs from the record's) and D2-59's "left the question" from the done stack's decide actions. The report lists every ended step of the session, and every inference (a verdict only when its Result exists); its `missing` are the judgement's (drawn: "select ‹card› → ‹target› too" with `select`; not drawn: `drawTooHint`), the gap's own hints staying the webview's (`missingArrowHints` on `gap`). *(Alternatives: the report's steps of the current stage only; BD-6's reason in core.)*
  - **builder 2c2 decided (details):** a Result whose content is out of ws/ (declined, taken out) shows the version its record holds: verdict and Rests on from `judged`, its proof from its content, no band, flag or missing arrow (the stage judgement judged B's version). `basisChanged`: the cards downstream of T through the shown board's verified edges whose proof footprint differs from B's. `previous` ("updated"): the newest earlier version, for Formalize, vocabulary terms, declarations and Add premises (a Result's earlier version has no judgement to show). `endorsed`: the accepted `decl:` items but vocabulary changes (EN-3's "each definition and presupposition", instances and coercions being D-4's definitions). `marks`: card and Result items on their card, a written premise on its own card; arrow and unwritten premise items are `arrows` and `premises`. `premises`: every unwritten Add premise but a withdrawn one. A withdrawn item's `at` is the newest event that reported it withdrawn, else ''; a superseded rejected version's `at` is '' (the records keep no time for either). *(Alternatives: the stage judgement for a declined Result; time fields on the records.)*
  - **builder 2c2 decided (problems):** SessionView has no field for the stage's problems (§2.3); they reach the person through the gates (a failed probe's `facts` problem in every Accept's refusal), the events (no longer builds) and the final check's failures (unowned, disappeared, not written), as the plan has it. *(Alternative: a `problems` field.)* *Superseded by fixer 2c2 r1 (S-STAGE-PROBLEMS-NO-PATH): the alternative, `SessionView.problems`.*
  - **builder 2c2 decided (no judgement yet):** at stage 0 (the first queue) every class is unknown (fail closed), there is no plan, and the board is the given working copy unmasked (nothing is waiting, so the results count as shown; the runner passes B). *Changed by fixer 2c2 r1 (C-V2C2-C6, A-V2C2-ADV-4): the board is B whatever is passed (fail closed), and no report target reads revealed.*
  - **The host (§1.1's 2c2 bullet):** builder 2c1 already answers every session message `not-yet` (fixer 2c1 r1's ten case labels); 2c2 adds a test that the answer stays `not-yet` while a run is active (never the ES-9 lock's or busy refusal) and is a warning toast without a request id.
  - **Texts** (`REVIEW_TEXTS`, builder 2c2's wording): `inReviewAlready`, `submitInReview`, `nothingToRetry`, `applyingNow`, `applyWaitsForCheck`, `applyCheckFailed`, `stepPassed`, `stepStatementsOnlyOutcome`, `drawTooHint`, `classIncomplete`; `CLASS_REASON_TEXTS` (one line per RV-7 reason, §4.4).
  - **Seen while testing, not fixed here (2a2's reconcile, outside 2c2's entry; for the orchestrator):** a user's Show results force that is still on when a queue starts (a mid-stage Formalize needs the results shown, and a force shows them) ends at the queue's end only when a meaning item became undecided or a Result changed (§3.5 step 3, reconcile's `endsForce`). So with a meaning item still undecided, a re-ask that proves its target (a new Result version) hides the results, and one that does not leaves them shown: whether the stage is hidden tells the re-ask's outcome before that item is decided. The fixed pairs of §4.7 compare two hidden views and do not see it. The smallest fix: reconcile ends the user's force at every queue's end (then both outcomes are hidden while a meaning item is undecided). *(Builder 2c2 decided: reported, not fixed, since it changes §4.7's force rule and 2a2's reconcile; alternative: list it in §4.7's accepted residuals.)* *Fixed by fixer 2c2 r1 (C-V2C2-C1, A-V2C2-ADV-3, S-F1-confirmed): every queue's end ends every force.*
  - **Tests** (core 76 files, 1115 tests; was 75 and 1072): new `test/review/view.test.ts` (43): the hidden Result's neutral row; Results' parts left out of the list, the counts, the board, the rejected and withdrawn lists, and named by no listed item; the InferenceView's question rule; Claude's words, outcomes, chips and activity withheld; AF4 and Submit's gate; the hidden board (no position, time, duration, detail or stale file; `viewVersion`; the masked error count); the class map in force and `dependents`; card references while hidden; once shown (real statuses, the unmasked board, verdicts, words, the `decided` force); `submit.work` from `planSubmit` and the partly accepted cycle; every gate text (D2-62, D2-65, D2-27, the reducer's, Submit's, Formalize's, Retry's, the confirmation's); the confirmation; the list order and the step numbers; the details of every kind and `previous`; D2-59's notes, `reviewStateOf`, endorsements and the lakefile; what only the results show; `itemGates` against `acceptGate` and `reduceReview`; no judgement yet, a rebuild from persisted records (a reload), events, moves; and the non-interference pairs (a proof or none; a premise draft reaching a proof-phase definition; Claude's arrow; a lemma before the other cards with a linter warning; a re-ask; a chain with a statements-only step; a Retry queue, with the same item ids; sequences of Accept, Reject, Shaky, a group Accept and Undo on listed items, the answers compared too). DO-0 is in no hidden sequence: an arrow item is a Result's part, never listed while the results are hidden. `test/review/judge.test.ts`: R2-1's `toContain` updated. Extension `test/unit/runRouting.test.ts` +1 (205 tests). No test was deleted, skipped or moved; none moves to a later sub-slice.
  - **Mutation checks:** 104 on the final code, each restored byte for byte (`cmp`), every one failing at least one test: 91 on the view, 12 on `itemGates` and `acceptGateIn`, 1 on R2-1's text. On a first run (101, before the labels shared one rule) 6 survived: the board's arrows and premises while hidden for items no Result holds, `dependents` only accepted, no chip on a proved verdict, `heldAs` only once accepted, a declined Result's own version; 4 tests and one assertion were added for them.
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1115 (76 files), webview 314, extension 205 (`--no-cache`). No runner file changed and no runner source or test uses what changed (`buildSessionView`, `itemGates`, the new `SessionRecords` and `SessionViewInput` fields, `otherResultNotFrozen`), so no runner test file is touched; `test/gate/pure.test.ts` passed as a smoke run (14). No webview file changed, so no scratch build and no Playwright.

- 2026-11-20 (fixer 2c2 r1: the review of 2c2; findings S-F1-confirmed, S-TEST-REASK-PAIR, S-STAGE-PROBLEMS-NO-PATH, S-PERSIST-NEW-RECORD-FIELDS, S-STALEFILES-VACUOUS, S-HIDDEN-SUMMARY-ENVELOPE, C-V2C2-C1–C7, A-V2C2-ADV-1–9; 5 major, 14 minor, 3 nit, every one fixed, none judged wrong). Core (`review/reconcile.ts`, `review/view.ts`, `review/reducer.ts`, `review/texts.ts`, `review/types.ts`), the core tests (`test/review/view.test.ts`, `test/review/reconcile.test.ts`), and this plan (§2.3, §2.6, §2.9, §3.5, §4.7, §5.8, §6.1, and the builder 2c2 entry above).
  - **A force that survived a re-ask queue in one outcome (the builder's F1; C-V2C2-C1, A-V2C2-ADV-3, S-F1-confirmed; major; fixed in 2a2's reconcile).** Show results' force ended at a queue's end only when a meaning item became undecided or a Result changed, so with a meaning item undecided a re-ask that proved its target (new Result content) hid the stage and one that did not left it shown, and marked every Result seen early in that outcome only. **fixer 2c2 r1 decided:** every queue's end (`queueSteps` given) ends every force, the user's and telelean's `decided` one, before RV-7, and ADV-1's `decided` rule then applies as at any judge; §3.5 step 3 and §4.7's force rule say so. Both outcomes are hidden while a meaning item is undecided, and shown when none is; a queue that starts under the force still runs with the stage shown as it was (D2-63). *(Alternatives: only the user's force (A-V2C2-ADV-3's wording), which leaves the same channel through a `decided` force whose returned items are still undecided; list it among §4.7's residuals.)* Tests: a reconcile case (both forces end at a queue's end, a judge a decision started keeps them, nothing waiting stays shown), and view.test.ts's pipeline pair (S-TEST-REASK-PAIR): stage 1 judged and reconciled, Show results and the seal through `reduceReview`, each twin's own working copy judged (the record's question the re-ask's when it proved T, the old one when not) and reconciled with `queueSteps`, byte-identical views, also with a definition the re-ask wrote before its freeze (listed in both). The hand-made pair stays, renamed, for the record-level question rule.
  - **The question while a step runs (A-V2C2-ADV-1, major; fixed).** A proved re-ask puts its question on the record when it ends, mid-queue (D2-46, fixer 2b1b r1), so with the results shown at the queue's start the InferenceView, the Result detail's question and the list order showed the new question during the queue's next step only if the re-ask proved T. **fixer 2c2 r1 decided:** while a step runs, a target whose latest ended step belongs to the running queue (the newest `queue` number; a step without one counts as in it) shows that step's asked question, as while hidden; every other target keeps the record's, which no step of the running queue changed, so the view stays as it was when the queue started for them. **For 2d:** the session's RunView follows this rule too (§2.3's AF5 line). *(Alternative: the review's, the asked question for every target while a step runs, which flips a target with an earlier re-ask not proved from the record's question to the asked one when the queue starts.)*
  - **D2-59's removals while hidden (A-V2C2-ADV-6, minor; fixed):** a question asked is shown less the sources the user's declines took out of it (the done stack's question changes), the rule the re-ask note already used. ~~A source declined this way can never come back into a later question (its arrow is in `rejectedArrows`), so the subtraction never takes out a source a later step asked.~~ *Corrected by builder 2b3a (carry-over R1-1): it can come back. Un-reject takes the declined arrow out of `rejectedArrows`, the arrow can be accepted again, and check 3 then lets a later mid-stage Formalize re-ask the target with that source. So a decline is now subtracted only from the questions of steps whose queue had started when it was made (queue q ≥ 2 starts at the (q−1)-th seal of the done stack; queue 1, and a step without a queue number, take every decline), and its "left the question" note shows only while the source is out of the question on record.*
  - **A Result telelean took out (A-V2C2-ADV-2, major; fixed).** Its detail read verdict and Rests on from `judged`, which reconcile sets from the very judgement that takes it out (a failing inference's verdict is still "established"), with its proof, beside "No longer pass their checks". **fixer 2c2 r1 decided:** `judged` and the proof only for a Result the user declined with its content in (status declined, no `redo.reverted`: the version they declined); a Result to be redone with its content taken out, and one declined after such a take-out (the decline keeps `redo`, D2-60), read the stage judgement's inference for the target (what ws/ holds now, B's version) and show no proof. *(Alternative: the earlier version's proof shown as such; ItemDetailView has no field for it.)*
  - **Words while a step runs (C-V2C2-C2, major; test).** The running case now has every outcome-like datum in its records (a gave-up step and its words, D2-59's decline, a re-ask of another question that gave up in the running queue, a declined item), and asserts no words, chip, note or outcome; the same records once the queue ended show each. Each consumer's guard broken alone (`outcomes` read as `shown`) fails it.
  - **The reason chip and words of a Result (A-V2C2-ADV-5, minor; fixed):** from the step whose version stands: the latest ended step that asked the question on record, less D2-59's removals, else the latest ended step (a re-ask of the same question that did not prove T is that step; the records cannot tell it from the earlier one). Claude's gap and summary on the Result follow the same step.
  - **Undo and Redo labels (C-V2C2-C4, minor; fixed):** while an action that decided an item hidden now (made while the results were shown) is on top, Undo (or Redo) is null: the reducer refuses it (D2-8), and its label names the item. `reducer.ts` exports `decidedBy` (additive) so the view reads the reducer's rule.
  - **Previous proposal (C-V2C2-C5, minor; fixed):** the newest version with an earlier rev; a premise write's same-rev draft key is never a previous proposal.
  - **Stage 0 (C-V2C2-C6, A-V2C2-ADV-4, minor; fixed):** with no judgement the board is B whatever working copy is passed (a card only that working copy has is never named), and no report target reads revealed; §2.9's `current` says so.
  - **A rejected Result while hidden; Un-reject outside a stage (C-V2C2-C3, A-V2C2-ADV-8, minor; tests).**
  - **Random sequences (A-V2C2-ADV-7, minor; test):** 40 seeds of up to 12 actions on each of three pairs (a proof or none, Claude's arrow, each with a statement-phase definition, so two meaning items wait; the Retry pair): own and group Accept, Reject, Shaky with a note, back to review and un-reject, Undo and Redo, each with or without `confirmed`, chosen from twin A's listed items; equal answers at every action, equal views before each while either twin is hidden; every kind of action is carried out somewhere, and some are refused, stale or asked to confirm.
  - **The stage's problems (S-STAGE-PROBLEMS-NO-PATH, minor; fixed).** The plan has the stage report problems (§2.1's `facts`, §3.5's "disappeared", §3.8's failed premise write, §4.2's unowned difference), but the view had no field. **fixer 2c2 r1 decided:** `SessionView.problems` (additive, §2.3): the judgement's `facts` and `unowned` problems (no Lean detail, no position), the items that disappeared (§3.5's rule on the records and the judgement's drafts, not while judging, when an un-reject's merge puts records ahead of the judgement), and the runner's own through `SessionViewInput.problems` (additive, §2.9; **2f passes** a failed premise write, with its item). While the results are hidden, a judgement's problem that names only hidden items, and a runner's that names one, is left out, and hidden items are never named. `no-longer-builds` problems are not repeated (reconcile's event and the marker name those items; their text holds Lean's message and positions that hidden lines move). §5.8's second lines show them (2g). Apply's gate is unchanged: the final check refuses each of them. *(Alternative: name a channel per text (events, notices); events are only "since the user's last action", and §3.8's "Reload the window to try again" would be lost.)*
  - **Persistence (S-PERSIST-NEW-RECORD-FIELDS, minor; docs):** §2.6 gains `PersistedStep.queue?` and `PersistedSession.confirmation.reusedFileChecks?`. **2d persists** `queue` at each `queue-start` (and the session's first queue), **2f** `reusedFileChecks`; `toSessionRecords` maps both, so step numbers and "file checks reused" read the same after a reload.
  - **Stale files (S-STALEFILES-VACUOUS, minor; test):** a working copy with a stale module: no `staleFiles` and state "fresh" while hidden, `staleFiles` and "stale" once shown.
  - **The hidden summary's status (S-HIDDEN-SUMMARY-ENVELOPE, C-V2C2-C7, nits; docs):** the builder's entry is corrected (the sandbox statuses map from the envelope while hidden), and §4.7's residuals list a judge build that times out or runs out of memory on hidden content.
  - **"Claude's step passed its checks" (A-V2C2-ADV-9, nit; fixed):** `REVIEW_TEXTS.stepPassed` now reads "Claude's step finished", which no reader takes for a verdict (the Result's verdict says whether it proved).
  - **Tests:** core 76 files, 1127 tests (was 1115): view.test.ts 54 (was 43), reconcile.test.ts 33 (was 32). **Mutation checks:** 40 on the fixes, each restored byte for byte (`cmp`), every one failing at least one test (among them each of the review's surviving mutations M41–M48 and ADV-8's). **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1127 (76 files), webview 314, extension 205 (`--no-cache`); no runner source or test uses what changed (a pure runner file, 14 tests, as a smoke run).
- 2026-11-20 (builder 2b3a: the isolated probe, its measurement and the regenerated recordings; with the carry-overs R1-1 to R1-5 of 2c2's review). Runner (`semantic/probeFile.ts` new, `semantic/checkFile.ts`, `refresh.ts`, `index.ts`, `types.ts`; `gate/findings.ts`, `engine.ts`, `scratch.ts`, `index.ts`), core (`review/view.ts`, `review/types.ts`; doc comments in `facts.ts` and `project/edges.ts`), the integrator's `test-fixtures/semantic` (two overlays, two new recordings, the two facts recordings regenerated, its README), core's three hand-written Spyro facts, and this plan (§2.1, §2.2, §2.3, §2.6, §4.7, this entry).
  - **`importModules` first (§2.1):** confirmed with real Lean on the pinned 4.35, so D2-75's fallback (the kernel export) is not needed. The probe job loads the Spyro fixture's built modules, and its `valueConsts` equal 1d's name for name (and those of both 1g recordings, spyro 16/16 and extras 42/42: the regenerated recordings differ from them only by `typeConsts` and the marker).
  - **The cost (§2.1, AP30-2): above 1.5 times 1d's, so the integrator decides** (the plan reserves it; nothing was changed to lower it). `/usr/bin/time` under `capped.sh` on the Spyro fixture, median of three: check file alone 477 MB / 0.21 s; 1d's check file with its in-file probe, measured again, 567 MB / 0.31 s; the probe job 954 MB / 0.61 s; `lake build` 483 MB / 0.66 s (109 MB / 0.15 s when nothing changed). A refresh's peak RSS (its jobs run one after another) goes from 567 to 954 MB (1.68×), its time from 0.97 to 1.48 s (1.53×; 2.1× when the build has nothing to do). runLean's cgroup peaks in the same run: build 103 MiB, check 84 MiB, probe 469 MiB. Cause: the frontend that elaborates the probe file has already mapped Init's `.olean` parts at their base addresses, so `importModules (level := .private)` reads them again into anonymous memory (RssAnon +390 MB; Init's `.olean.private` alone is 258 MB). `import Lean.Environment` instead of `Lean.CoreM` saves only about 25 MB. *Alternative measured for the integrator:* read only the library's own modules with `Lean.readModuleData` (no Init at all): 560 MB / 0.27 s, about 1d's; but a module-system model file keeps part of its data in `.olean.private`, which that reading would have to load too (or refuse such a model, fail closed), where `importModules` loads it whole. The probe's message: 52 bytes per declaration on Spyro (826 bytes, measured), about 66 on extras (estimated from its facts); runLean's 32 MiB cap is reached near 500,000 to 650,000 such declarations, or near 13,000 for declarations listing about 100 constants each (about 25 bytes per listed constant).
  - **The check file** (`generateCheckFile(imports, decls)`): only the model's modules and the four probes per declaration; `CheckFileOptions`, `CheckFile.valueProbe`, `.probeImports`, `CheckOutput.valueProblems` and `ProbeResult.valueConsts` are gone, and so is refresh's second check without the probe (AP-21). The recorded `check-spyro.*` and `check-extras.*` are already in this shape; run again today they are byte-identical, so they are not rewritten.
  - **`valueProbeLines(names, library, { followMain?, modules? })`:** the type walk (an inductive's constructor types too; an unprobed library constant replaced by its type and value constants), both keys on the line, and with `modules` the isolated form (`#eval show IO Unit`, `Lean.importModules mods {} (loadExts := false) (level := .private)`). **builder 2b3a decided:** `followMain` with `modules`, or an empty `modules`, is a TypeError; the walk is one `walk` helper for both walks, which gives 1d's value lists unchanged (checked); an inductive's own name is in its `typeConsts` when its constructors' types name it (the rule as written, not special-cased). *(Alternative: drop a declaration's own name from its lists.)*
  - **`parseValueProbe` (signature changed: `ProbeConsts | string`, `{ valueConsts, typeConsts? }`):** a line without the type key gives no `typeConsts` (old lines parse); a malformed type key fails the whole line, values included (fail closed). Its callers are the probe file's reading and the ghost check's (`GhostScratchResult.typeConsts`, additive, voided with the values).
  - **The probe file and its reading (`semantic/probeFile.ts`): builder 2b3a decided** (beyond §2.1's list, all fail closed): `cut` whenever stdout passed the cap, before anything else but the sandbox's statuses; `failed` also for a run that failed with no error message (its stderr's last lines), for more than one line with the key at the `#eval`'s line, for a line with the key at any other line (a forged placement), and for a line without the type key (this job always prints both). The marker carries `detail` only for `failed` (the contract), and the measured duration and peak always. *(Alternative: take the first line, as 1d's in-file reading did.)*
  - **refresh: builder 2b3a decided:** the probe runs whenever the check file probed a declaration, also after the check's imports failed (another job, its own cause); none, and no marker, when nothing was probed. A failed probe's check problem is `probeFailure`'s sentence without its final period. Low memory right before the probe gives `low-memory` facts with the build's and the check's parts, no declarations ("… after the check, …, so the probe did not run"), and no marker; a sandbox status of the probe job ends the refresh with that status, the marker kept, as the check's does (`probe: ‹detail›`). No new `onPhase` value (the probe is part of "checking"). Test seam: `refresh(request, readMem, hooks)` with `RefreshHooks.runLean` (internal; the frozen `RefreshRequest` is unchanged). *(Alternatives: skip the probe after the check's import errors; a phase `probe`.)*
  - **The engine (2b3a's part of §2.1's rule): builder 2b3a decided:** `probeFailedEnvironment` (findings.ts) runs in `runCheck` after the build-error findings, so it covers check, freeze, both gates and the ghost check's check of ws/; its environment report keeps the diagnostics, build, rules, model, base and facts. `checkBase`: Lean errors (or a budget finding) first, as today, keeping no base facts; otherwise the base facts are saved, then a failed probe refuses the start with `baseProbeEnvironment`'s text (`probeFailure`'s sentence and `BASE_PROBE_FAILED`, "Claude's work on this model cannot be checked.", a runner text in `gate/findings.ts`, not core's). The manager's start already turns it into "telelean could not run Lean on your files (…); nothing was sent to Claude". *(Alternative: refuse the start before saving the base facts.)* **For 2b3b:** `probeFailedEnvironment` is what §2.1 asks for on a session step's `stepFindings` (AP30-3).
  - **Regenerated** (the orchestrator gave 2b3a the integrator's regeneration; real Lean, capped, one job at a time): `test-fixtures/semantic/recorded/spyro-facts.json` and `extras-facts.json` (`UPDATE_SEMANTIC_RECORDINGS=1`, `refresh.test.ts`): every declaration gains `typeConsts` right after `valueConsts`, the facts the marker `"probe": { "status": "ok", "durationMs": 0 }`, nothing else changes; new `probe-spyro.lean` and `probe-spyro.jsonl` (`probe.test.ts`, which checks both on every run); core's `spyro-facts.json`, `spyro-proved-facts.json` and `spyro-derived-facts.json` (`integration/session.test.ts`, which now also checks every declaration's value and type constants against Lean's, name for name, and writes them with the variable): `typeConsts` and the marker `{ "status": "ok", "durationMs": 600 }` (a hand-written time), nothing else. The core suite passes on them (1131).
  - **Carry-overs of 2c2's review** (each with a test that fails without the fix, mutation-checked):
    - **R1-1 (fixed as proposed):** `askedBy` subtracts a D2-59 decline only from steps whose queue had started when it was made: the decline's action has k seals before it in the done stack, so it counts against queues 1 to k + 1 (queue q ≥ 2 starts at the (q−1)-th seal), and a step without a queue number takes every decline. The §8 sentence is corrected (above). **builder 2b3a decided:** a "left the question" note shows only while the source is out of the question on record (a later re-ask that asked it again and proved its target put it back; one that did not prove it leaves the note beside its own), and once per source and target. **For 2d:** this reads §4.6's sealing actions (Submit review that queues steps, a mid-stage Formalize, Retry step): the session's first queue has no seal, and every later queue exactly one, at its start. *(Alternative: the review's wording, the note dropped once a later step of that target asked the source again, proved or not.)*
    - **R1-2 (fixed as proposed):** while a step runs, the view's details read the ledger without the `arrow` and `created` entries of steps of the running queue (`inRunningQueue` by step id; an entry naming no recorded step counts as the running queue's, so its reason is withheld then); `premise`, `mark-removed` and `completion` entries name no step and are never written or dropped during a queue, so the completion check reads them all. **builder 2b3a decided:** the base mask keeps reading the whole ledger (filtering it would keep a proof-phase declaration on the hidden board when no step has a queue number).
    - **R1-4 (test):** an ADV-1-style running twin with no queue numbers, D2-46's question replacement in one twin: byte-identical views and the asked question.
    - **R1-3 (docs):** §2.2's `SessionForce`, §2.6's `forced?` and core's `SessionForce` doc now name RV-11's Result returns and the end of any queue.
    - **R1-5 (fixed as proposed):** a Result whose content telelean or a cascade took out shows no `summary` or `gap` (`!inWs && !declinedVersion`), as no proof; the stage report keeps what that step said.
  - **Tests.** Core `view.test.ts` 58 (was 54): R1-1 twice, R1-2, R1-4, and ADV-2's extended for R1-5 (the words absent after a take-out and after a decline that followed it, present with the content in and for the declined version). Runner: new `test/semantic/probeFile.test.ts` (6, pure), new `test/semantic/probe.test.ts` (5, real Lean: importModules and the recording, isolation with its control, no `[init]` with its control and the hygienic spelling, the type walk, fail closed at refresh); `checkFile.test.ts` (the three 1d probe tests replaced by six: the check file without the probe, `valueProbeLines` in both forms and its refusals, `parseValueProbe` with and without the type key and every deviation); `refresh.test.ts` (AT3.1 the type constants and the marker, AT3.2, AT3.3 and the odd name the probe's constants, the recordings must carry both); `valueProbe.test.ts` (the clash model: one check and one probe job, `ok`, every constant; the simp model's type constants); `gate/pure.test.ts` +1 (the ghost file's type walk); `gate/engine.test.ts` +2 (a failed probe at check, freeze, both gates and the ghost check; at `checkBase`); `run/manager.start.test.ts` +1 (the start refused with the notice, no session); `integration/session.test.ts` (the hand-written facts' constants against Lean's). No test was deleted, skipped or moved; none moves to a later sub-slice.
  - **Mutation checks:** 46, each restored byte for byte (`cmp`), every one failing at least one test: 12 on the carry-overs (view.ts), 18 on the probe's reading, parsing, the walk's text and the ghost reading (pure), 7 on the engine's failed-probe rules (fake facts), 7 on refresh's probe job (real Lean), and 2 on the isolation itself with real Lean: the probe file made in-file again (the cheat test fails: forged lists) and `loadExts := true` (the `[init]` test fails: 4.35 then refuses the import, "`enableInitializersExecution` must be run before calling `importModules (loadExts := true)`", so the probe fails closed).
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1131 (76 files), webview 314, extension 205 (`--no-cache`); the runner files the change touches, with real Lean, each passed: `semantic/checkFile` + `probeFile` + `gate/pure` 34, `semantic/probe` 5, `semantic/refresh` 9, `semantic/valueProbe` + `guards` (with `gate/pure`) 25, `gate/engine` 32, `gate/rules` 26, `run/manager.start` 16, `integration/session` 8, `integration/m2flow` 5, `integration/escapes` 1, `integration/fixes` 5, `proposal/build` 7, `shadow/seed` 8, `workspace/m2members` 9, `workspace/perform` 8, `workspace/historySafety` 5, `run/fresh.e2e` 9, `run/walkthrough.e2e` 22. No webview file changed, so no scratch build and no Playwright.
- 2026-11-20 (fixer 2b3a, round 1: the review of builder 2b3a, findings S-V2B3A-S1–S5, C-V2B3A-C1–C4 and A-F1–A-F3, some of them the same defect found twice). Runner (`gate/findings.ts`, `gate/index.ts`, `gate/engine.ts`, the docs of `gate/types.ts`, `semantic/probeFile.ts`, `semantic/checkFile.ts`, `proposal/service.ts`), core (`facts.ts`: `leanDurationMs`, additive; `review/view.ts`; the docs of `review/types.ts` and `review/reducer.ts`), and this plan (the summary, §2.1, §2.2, §4.6, §6.1's 2b3a and 2d lists, D2-75, this entry).
  - **A probe job that runs out of memory (S-V2B3A-S1, minor; fixed in code, a change to the engine's classification):** AP-33 says such a probe fails closed and "a Formalize step reports that telelean could not read the Lean. It retries fine once memory frees up", but refresh ended with `oom` (as §2.1's contract says) and `classifyFacts` made that a counted budget finding that blames the proof ("Simplify the proof … and check again"), and at the start `checkBase` refused with "your files have Lean errors (Your files took too long or too much memory to build (probe: …))", the text AP30-2 judged wrong for a probe failure. Builder 2b3a's report line "a cut, failed or killed probe gives no constants and a check problem naming the cause" was wrong for the kill too (its §8 entry was right). **fixer 2b3a r1 decided:** AP-33's behaviour is the one wanted: facts whose status and probe marker are both `oom` are an `environment` outcome (`probeOomEnvironment`, `PROBE_OUT_OF_MEMORY`: "telelean's probe ran out of memory, so telelean could not read what the declarations of this state use in Lean (‹detail›)"), at check, freeze, both gates, the ghost check and `checkBase` (no base facts kept), so nothing passes, no attempt is counted, the gate tries again once after 30 s, and the start refuses with the environment notice; §2.1 has the rule. refresh and `ProbeRunFacts` are unchanged; m2-plan 3.6's table gains the row (`findings.ts`' header). The probe's `timeout`, and the build's or the check's own `oom` (no marker), stay a counted budget finding. *(Alternatives: keep the check's budget rule for the probe's kill and correct AP-33's bullet instead; or make the probe's timeout an `environment` outcome as well.)*
  - **refresh's untested probe rules (S-V2B3A-S2, minor; test):** `probe.test.ts` gains a real-Lean test through `RefreshHooks.runLean`: the probe job's cap is `spawnMemoryMax` of the memory read right before it (`2048M` when 3 GiB is free under the default `4G`, while the build and the check keep `4G`); after a (fake) check job whose imports failed, the real probe job still runs, its marker `ok` and the constants kept, the detail naming the imports' failure, and with a failed probe as well the detail names both; a model whose only declaration cannot be written into the check file runs the build and the check only, with no marker.
  - **The probe's reading (S-V2B3A-S3, C-V2B3A-C3, A-F2, nits; fixed in code):** the code now does what builder 2b3a's entry says: a message with the probe's key anywhere but as an information message at the `#eval`'s line fails the reading, alone or beside the real line, before or after it, at another line or with another severity ("Lean printed the probe's key outside its line (‹severity› at ‹line›:‹column›)"); messages without the key are ignored as before. *(Alternative: reword the entry to say that a keyed line elsewhere is ignored.)*
  - **Durations (S-V2B3A-S4, C-V2B3A-C2, A-F3, nits; fixed):** core `leanDurationMs(facts)` is the build's, the check's and the probe job's time; `CheckReport.build.durationMs` at check and at `checkBase`, the proposal board's `last.durationMs` (`proposal/service.ts`) and the session view's shown `semantic.durationMs` use it, so none of them drops the probe job since 2b3a. *(Alternative: the sum written out at each of the four places.)*
  - **The cost and the size limit (S-V2B3A-S5, nit; docs):** D2-75 gains the measured cost (accepted, AP-33), the `readModuleData` alternative, the probe-oom rule, and both size figures (near 500,000 declarations, but near 13,000 that list about 100 constants each); §2.1's Cost note says AP-33 accepted it and gains the 13,000 figure.
  - **The seal convention (C-V2B3A-C1, A-F1, minor; contract text and a 2d test):** R1-1's D2-59 removals count a decision made after k seals against queues 1 to k + 1, which holds only if the session's first queue has no seal, while §2.2's `SealBy` doc, §4.6, core's `SealBy` and the reducer's `seal` said that every queue starts with one; a 2d that sealed the first queue as well would bring R1-1's defect back, and no test would catch it. **fixer 2b3a r1 decided:** the convention is now the contract: every queue after the session's first starts with exactly one seal, in its `queue-start` write, and the first has none (nothing precedes it on the stack); §6.1's 2d list gains the test that pins it, and the plan's summary says so. `buildSessionView` is unchanged. *(Alternative: record the queue number on the seal action, `{ kind: 'seal', by, at, queue }`, and count a decline against the steps whose queue is at most the newest sealed queue before it, or calibrate the offset from the newest queue number; either frees the view from the convention, at the cost of a contract change.)*
  - **`valueProbeLines` with no name (C-V2B3A-C4, nit; fixed):** a TypeError in both forms (Lean splits `""` into one empty name, so the line would list one entry for no declaration; no caller passes none); the test expects the throw.
  - **Comments (A-F3, nit):** the engine's `refresh` names its three jobs; `unseenProofEnvironment` no longer gives the probe's import clash as a cause; `CheckReport`'s `environment`, `findings` and `build.durationMs` docs.
  - **Tests.** Core 76 files, 1133 tests (was 1131): `review/probe.test.ts` +1 (`leanDurationMs`), `review/view.test.ts` +1 (the shown board's time). Runner: `semantic/probe.test.ts` +1 (real Lean, above); `gate/engine.test.ts` +2 (the probe's `oom` at every purpose and at `checkBase`; the durations); `semantic/probeFile.test.ts` (the keyed message outside the line, alone and beside the real line, and messages without the key), `semantic/checkFile.test.ts` (no name refused), `gate/pure.test.ts` (`classifyFacts` and `probeOomEnvironment`) and `proposal/build.test.ts` (the proposal board's time) extended. No test was deleted, skipped or moved.
  - **Mutation checks:** 16, each restored byte for byte (`cmp`), each failing at least one test: the empty-name refusal (checkFile); the stray-key rule dropped, and loosened to the line or to the severity only (probeFile); the probe-oom branch dropped, any `oom` made environment, the facts status unchecked, the probe's timeout made environment (pure and engine); the probe's time left out of `leanDurationMs` (core probe and view, engine), out of the view, out of `runCheck` and out of `checkBase` (engine), out of the proposal board (`proposal/build`, real Lean); and, with real Lean, the probe job under the configured cap, its cap from the check's memory read, no probe after the check's import errors, a probe when nothing was probed (`semantic/probe`).
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1133 (76 files), webview 314 (19), extension 205 (22, `--no-cache`); runner, with real Lean where needed: `semantic/checkFile` + `probeFile` + `gate/pure` 34, `semantic/probe` 6, `gate/engine` 34, `proposal/build` 7, and, since the reading changed, `semantic/refresh` 9 and `semantic/valueProbe` 2. No webview file changed.
- 2026-11-20 (builder 2b3b: the runner engine; with the carry-over R1-1 of 2b3a's review). Runner only (`gate/engine.ts`, `types.ts`, `index.ts`, `scratch.ts`, the new `gate/session.ts`; `shadow/types.ts`, `workspace.ts`; `proposal/service.ts`, `types.ts`), the test fakes that implement those contracts (runner `test/run/helpers/fakeEngine.ts`, `fakeServices.ts`, `fakeShadow.ts`, `test/proposal/helpers.ts`; extension `test/unit/realRuns.test.ts`), and this plan (§2.9's note, this entry). No core source, no webview file.
  - **Contracts (additive; §2.9's note lists them):** `CheckContext.session` and `SessionCheckContext` as written; `CheckReport.judgement?`, `GateReport.judgement?` and `GateReport.freeze?`; `LeanCheckEngine.judge`, `finalCheck`, `writePremise`, `complete` with §2.9's report types, `FinalCheckReport.comparator?` added; `GhostCheckInput.leanName?`, `GhostCheck.explicit?` and `.facts?`; `EngineCore.judgeState` and `applyBackstop` (test hooks); `COMPLETION_STEP`; `ghostDirectProblems(…, allowed?, session?)`; the ghost file's `statementFacts` option and what it reads; `gate/session.ts`'s pure helpers, exported from the gate index. Shadow: the kinds `step-start`, `decision`, `completion`; `lastCommitSince(since, kinds)`, a required member (the plan names it on the shadow; the two test fakes that implement ShadowWorkspace implement it); `syncMirror(files?)`. Proposals: `planApply(ApplyRequest)`, a required member (the test fake implements it). The four new engine methods are required members too: the runner's FakeEngine throws until a test scripts them, the extension's FAKE_ENGINE lists them as unused.
  - **builder 2b3b decided (what a session judges):** `judge` and `finalCheck` judge the shadow's newest commit, from its files (`filesAt`, the mirror synced from them with `syncMirror(files)`), never ws/, so a write between its steps 2 and 3, which may run beside a judge (§2.6), never enters a judgement; G0 judges those files too. `writePremise` and `complete` judge ws/ (the write in progress). *(Alternative: judge ws/ and name the newest commit, which a write in progress can make the wrong one.)*
  - **builder 2b3b decided (one mirror operation at a time per run):** every engine method that uses the mirror (checkBase, check, freeze, gate, checkGhost, renderStatements and the four new ones) waits for the run's earlier one (`locked`, per run directory; Lean jobs stay serialised globally by `runExclusive`), since a judge runs outside the write queue and a premise write's build could otherwise replace the mirror between the judge's build and its premise checks or renders. `normalise` (no mirror) is not locked. *(Alternative: leave it to 2d and 2f never to overlap a judge with a premise write or a render.)*
  - **builder 2b3b decided (S₀'s facts):** a session step's rules compare with S₀ by its facts (D2-41's meaning, the frozen-items rule's same-probe test). The engine keeps the facts of its recent builds by files key (and pins the active step's S₀): S₀'s are those of the judge or gate that built its files; after a reload the first check builds S₀ once, before ws/, and an S₀ that does not build then is an `environment` outcome. *(Alternatives: persist S₀'s facts in the run directory; judge S₀ without facts, text only, which skips D2-41's meaning comparison at the step.)*
  - **builder 2b3b decided (the session step):** a session's check, freeze and gate need `scope` and `stepStartCommit`, with `scope.target` the selection's target (TypeError otherwise); judgeState gets the step's stage, the gate's judged commit (check and freeze: `''`), the step's freeze (none at the freeze itself), and the session's records by reference; the build's Lean errors are added, fail closed, when the rules did not report them. The freeze's permitted set is B.1's for the target (with E(T)), sorted into slice 1's categories over B.1's sources (`sessionPermitted`: a session proof's footprint is a derivation footprint, `unusable` the sources that give nothing). *(Alternative: slice 1's permitted set over the selection, which misses E(T) and session proofs.)*
  - **builder 2b3b decided (D2-19's re-export):** at a proved finish with findings empty, B.1's set on the gated state is compared with the freeze's as sets; when it differs, `frozen/<n>/project` (the freeze's copy) is copied into a new `frozen/<m>`, its challenge built again from scratch and exported with the new set; the new FreezeRecord keeps the freeze commit, round and snapshot (all but `permitted`) and is returned as `GateReport.freeze`; the comparator then judges against it. A re-export that fails is an `environment` outcome (not counted). *(Alternative: re-export into the same directory, losing the first challenge's record.)*
  - **builder 2b3b decided (the ghost check in a session, §3.8):** the permitted set is B.1's for the target on the checked state, B.2's allowed cards B.1's sources (Q(T) ∪ E(T) in that state), "alone entails" read from B.1's `.holds` names; its Claude-facing B.2 wording names the target's sources and propose_arrow. The ghost file also prints the pinned statement under the review's explicit options and probes the statement's own constants in a second in-file probe block: `explicit` is the value of that `#print` (its header `… : Prop :=` cut, whitespace collapsed: `PremiseDraft.explicit`), `facts` the statement abbrev and its `.holds` under `<subject>.<leanName>` (`PremiseDraft.facts`); a session check that cannot read either back refuses the suggestion (fail closed). Slice 1's file and reading are unchanged. *(Alternatives: the freeze's permitted set, stale once E(T) grows; the whole `#print` compared with the name substituted.)*
  - **builder 2b3b decided (judge's premise re-checks):** a draft is checked again when its reliance key changed since this engine last checked it (`relianceKey`: the draft's statement and proof, T's statement and its meaning, B.1's permitted set and sources, and the meaning and `#print axioms` of every name in its footprint and its statement's closure); none recorded (a new draft, a reload) counts as changed. Only drafts with no ledger `premise` entry, of an ended inference, not declined or withdrawn; only on a state whose facts are `ok`, probe fine and with no `facts` problem (a failed probe or a build error is telelean's or another item's, and would fail every draft); a check telelean could not run, or that read nothing back, is left out and tried at the next judge; a failed one keeps the draft's facts. `premiseChecks` is set only when a draft was checked. *(Alternatives: check every draft at every judge, a Lean job each; persist the reliance keys.)*
  - **builder 2b3b decided (writePremise):** normalise the premise's card (when its statement is new since B), G0, build, refuse a failed probe (AP30-4), a state with a Lean error (Lean's first error) and a render that failed, then commit exactly the files built as `adopt` (step 3) and judge that commit (`stage`); a failure leaves no commit. `meaningMatches`: the written statement's explicit value equals the draft's `explicit`. *(Alternatives: the caller commits after writePremise and judges again; commit before the build, which leaves an `adopt` commit on every failure.)*
  - **builder 2b3b decided (complete):** the newest commit must be an `adopt` commit and `ctx.freeze` (T's last freeze) is required; "statement-changed against T's last freeze snapshot" is exactly the `statement-changed` findings of a `check` (stage prove) judgement of the adopt state against it (slice 1's other freeze-relative rules would refuse the premise's own `.holds` as an axiom added after the freeze); a Lean error in the adopt state refuses too. The new freeze is taken on the adopt state (B.1 with E(T): the premise's `.holds` permitted), its challenge from the mirror holding that state; the completion's judgement scope is telelean's own step (`telelean-completion`, the inference's recorded question, the proof open, nothing else); the gate is `gate-proved` with S₀ the adopt state; on a pass the `completion` commit is made and judged as a `stage` (no Lean job). *(Alternatives: the whole freeze purpose against the last freeze; return the gate-proved judgement.)*
  - **builder 2b3b decided (finalCheck):** drift is the caller's (the engine never reads the real files); EN-2's reuse of the facts needs `reuse.judgement` to have judged F's files key and be `ok`, and the mirror last built from them; the comparators run only when nothing else failed (they cannot turn a failure into a pass), for each inference whose `.holds` in F is a proof of this session (its text differs from B's, or its elaborated value does), each on a challenge built from the mirror holding F with that inference's permitted set in F, a recorded pass reused for the same files key and set; failures by rule: `facts` and `items` (unowned) problems, every finding by code (G0 → rules, build or budget → build, footprint → permitted, undeclared-premise → no-hidden-edges, arrow → arrows, holds-kind → kinds, comparator-* → comparator, else rules), the backstop's refusals → backstop (also in `backstop`), identical failures once, `no-longer-builds` left out (the build's findings name them). *(Alternatives: always run the comparators; list the backstop only in `backstop`.)*
  - **builder 2b3b decided (when Lean cannot judge):** judge, finalCheck, writePremise and complete never throw for Lean or sandbox failures: a sandbox status, low memory or a budget judges the files without facts (partial, `ok` false) with the report's `environment` or budget finding (finalCheck: the environment, or a `build` failure; writePremise and complete: `{ ok: false }`, `environment` for the sandbox's). A shadow whose history cannot be read rejects judge and finalCheck (there are no files to judge). *(Alternative: a return type without a judgement.)*
  - **builder 2b3b decided (planApply):** its request is `{ shadow, readReal, finalState?, targets, nodes, realFiles? }`; one read of the real files; any that differs from B (an edit, an unsaved buffer, a file added or deleted) refuses the plan (`conflict`, core `REVIEW_TEXTS.drift`, the files in `files`), "plan.drift authoritative" read as the drift of the plan's own read deciding inside it; otherwise B -> F, `drift` empty, the label `REVIEW_TEXTS.applyLabel(targets)`. *(Alternative: return an ok plan carrying `drift` for the caller to refuse, as planAccept does.)*
  - **Carry-over R1-1 of 2b3a's review (nit; fixed as proposed):** `test/semantic/probe.test.ts`'s comment now says the test checks the check's argv and timeout, and points to the test of the probe job's lowered cap by name rather than by line. A comment: no behaviour, no mutation check.
  - **Tests.** Runner: new `test/gate/session.test.ts` (21: the scope, S₀ and records reaching judgeState; a session step's scope and S₀ required; AP30-3 at check, freeze and both finishes, and never on `ok` alone; judge and finalCheck on a failed probe (real judgeState); writePremise on a failed probe and on a state that does not build; Lean that could not judge; G0 first at every purpose with spies on refreshFacts, renderStatements, syncMirror and the Lean host; the per-run lock; judge's head and EN-2's reuse; the contexts judge and finalCheck take; complete's early refusals; real Lean: the re-export and G4 after it, the session freeze's B.1 set, the final comparator and its reuse, the final check's `permitted`, and the premise flow: the ghost check with E(T), judge's re-checks of two drafts, writePremise and complete) and `test/gate/sessionPure.test.ts` (15); `test/shadow/shadow.test.ts` +3 (the kinds, `lastCommitSince`, `syncMirror(files)`); `test/proposal/accept.test.ts` +2 (`planApply`); `test/semantic/probe.test.ts` (R1-1's comment). No test was deleted, skipped or moved.
  - **Mutation checks:** 49, each restored byte for byte (`cmp`), each failing at least one test: G0 first at a session step, in judge, finalCheck, writePremise and complete (5); the failed-probe rule on a session step, `ok` alone, the build fallback (3); writePremise's probe refusal, its `environment`, a state that does not build, the explicit comparison (4); the re-export, from the freeze's copy, from build/ with the target removed (3); complete's new challenge, statement-changed, the adopt head, the last freeze (4); judge's memo, written drafts, partial facts, a failed re-check, the reliance's footprint (5); the final comparator, its reuse's files key, EN-2's `ok`, each inference's failures, proofs of the session by text, a sandbox status in judge and in finalCheck (7); the head not ws/, the lock, S₀'s facts kept and passed, the gate's freeze passed (5); the ghost's B.1 set and B.2 sources, the session freeze's B.1 set (3); `lastCommitSince`, `syncMirror(files)`, planApply's drift (3); `explicitBody`, `withG0`'s ok, the statement probe's order, `sessionPermitted`'s extras, `completionScope`, the scope target check, judge's session requirement (7). Defensive, unreached by a test: the committed files compared with the files built in writePremise and complete (nothing writes ws/ while the run's lock is held), freeze's "did not judge the target" (judgeState always judges it), runCheck's session without scope (the public methods refuse it first).
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1133 (76 files), webview 314 (19), extension 205 (22, `--no-cache`); runner, with real Lean where needed (capped 3000, one worker): `gate/session` + `sessionPure` + `shadow/shadow` + `proposal/*` 98 (9 files), `gate/engine` + `gate/pure` 49, `gate/rules` + the seven `run/manager.*` 80, `integration/m2flow` + `semantic/probe` 11, `run/fresh.e2e` 9, `run/walkthrough.e2e` 22, all passed. No webview file changed, so no scratch build and no Playwright.
- 2026-11-20 (fixer 2b3b, round 1: the review of builder 2b3b, findings F-FC-1–F-FC-5 and A-V2B3B-ADV-1–ADV-7, two of them the same defect found twice: F-FC-1 = ADV-3, F-FC-4 ⊂ ADV-4). Runner only (`gate/engine.ts`, `gate/session.ts`, `gate/scratch.ts`, `gate/types.ts`, `gate/index.ts`; `proposal/service.ts`, `proposal/types.ts`), its tests (`test/gate/session.test.ts`, `test/gate/sessionPure.test.ts`, `test/proposal/accept.test.ts`), and this plan (§2.9's note, §3.8, §3.10 step 4, this entry). No core source, no webview file. Every finding is fixed; none was judged wrong.
  - **A judge's outcome that was dropped (F-FC-1, ADV-3, major; fixed):** the re-check memo kept only the reliance key, so after a `judge-apply` dropped because a decision moved the head (§2.6), the next judge skipped the draft and its "no longer closes the gap" was never reported. **fixer 2b3b r1 decided:** the memo keeps each draft's outcome (closesGap, facts, and the constants its gap proof used) with the key, and a draft whose key is unchanged gets that outcome again in `premiseChecks` with no Lean job; so `premiseChecks` lists every draft judged on the state (re-checked or not), and is absent when there is none. Reconcile's step 5 is idempotent for a repeat (a draft already to be redone and reverted is skipped, its facts replaced by the same ones). *(Alternative: an engine call that forgets a draft's memo, which 2d would have to make whenever a judge-apply is dropped.)*
  - **What the reliance key misses (ADV-1, major; fixed):** a source's statement reworded under the same constants (its `.holds` is in the footprint, its statement only behind it), a lemma of the gap proof (never in `#print axioms`), a definition only T's statement reaches. **fixer 2b3b r1 decided:** `relianceKey(draft, model, targetStatement, b1, proofConsts)` hashes the meaning (D2-41's parts with `#print axioms`) of every declaration the `uses` closure (core `reach`) reaches from the footprint, the statement's closure, T's statement and `proofConsts`, the check theorem's value and type constants from the draft's last check (kept in the memo; a failed check keeps the previous ones; after a reload every draft is checked again anyway). *(Alternative: the `meaning` closure, which stops at a lemma's type and misses what its proof uses, which B.2's walk of the gap proof reads.)*
  - **A re-check telelean could not judge (ADV-2, major; fixed):** a budget, a run that failed with no message, no `#print axioms` answer and B.2's UNSEEN_PROOF were memoised as "no longer closes the gap", which takes an Accept away. **fixer 2b3b r1 decided:** the scratch check has a new outcome `unchecked` (a run that failed with no message; errors only in telelean's own lines of the ghost file, or any in its header, which every later line fails with: `GhostScratchResult.errorsAt`; no `#print axioms` answer; B.2's UNSEEN_PROOF), and a re-check with a budget, an environment or an `unchecked` outcome leaves the draft out of `premiseChecks`, remembers nothing, and is tried again at the next judge; only Lean errors in the statement or the proof, sorry, a footprint outside the permitted set and B.2's cards make it `closesGap: false`. The ghost check of propose_assumption refuses `unchecked` outcomes with the same problems as before (no change for Claude). *(Alternative: remember an `unchecked` outcome with the reliance key, so that a scratch job that always runs out of time is not tried at every judge; fewer Lean jobs, but a transient memory shortage would then hide a real change until something else changes.)*
  - **The ghost check right after propose_arrow (F-FC-3, major; fixed):** its cached judgement was keyed by the files only, so an arrow the step proposed (a ledger entry, no file changed until the next normalise) was not in E(T). **fixer 2b3b r1 decided:** the clean check's judgement is reused only under the same session records (`sessionContextKey`: inferences, ledger, items, premises, ended, rejectedArrows, scope, stepStartCommit, noAlternative; not the freeze, which B.1 does not read); otherwise the clean check runs again under the current records (a build of the same files). *(Alternative: recompute judgeState, which is pure, on the cached model under the current records, with no build; it needs S₀'s model and B again outside runCheck.)*
  - **`complete` after a crash replay or a later due completion (F-FC-2, major; fixed):** it refused unless the newest commit was an `adopt` commit, so §2.6's replay after recover()'s `revert` commit, and a completion that becomes due after a decision (§3.8, D2-71), always failed. **fixer 2b3b r1 decided:** the completion freezes again from the state it is written on, the shadow's newest commit (the write's parent), checked by content, never by kind: a ledger `premise` entry for the item, the premise's card in that state, and T not proved there (`justificationKind` not `theorem`); everything after is unchanged (statement-changed against T's last freeze, B.1 and the challenge from that state, the gate with that state as S₀ and only T's proof open). §3.8 and §2.9's note say so. *(Alternative: `lastCommit(['adopt'])`, with a newer head accepted only when its files equal that adopt commit's: it covers the crash replay but not a completion that becomes due after a decision.)* **ADV-7 (nit; fixed):** `ctx.freeze` must be T's own (`selection.target`), else refused.
  - **G0 on the other states the engine builds (F-FC-4, ADV-4, minor; fixed):** **fixer 2b3b r1 decided:** S₀ is judged by G0 before it is built or its facts are used (`stepStartModel`); when it finds anything, nothing is synced or built and the step's check, freeze or gate is an `environment` outcome ("telelean could not build the state this step started from: it holds text that is not allowed in the model files (…)"), since Claude cannot change S₀; `complete` runs G0 on the state it starts from as well as on the completion; a premise re-check applies core's `ghostTextProblems` first, and a draft it refuses no longer closes the gap, with no Lean job. *(Alternatives: judge S₀ without facts, which skips D2-41's meaning comparison; leave a refused draft out of the re-check.)*
  - **`leanName` (F-FC-5, minor; fixed):** a session's `checkGhost` throws a TypeError without a non-empty `ghost.leanName`, as `writePremise` does without its draft.
  - **The final state (ADV-6, minor; fixed):** **fixer 2b3b r1 decided:** `finalCheck` returns an `environment` outcome, with nothing built, unless ws/ equals the shadow's newest commit (no write is in flight at the end), so it never passes a state that is not F; `ApplyRequest.finalState` is required (the files of the commit the passed final check judged), a request without it a TypeError, so Apply never writes ws/ by default. *(Alternatives: judge ws/ and commit a checkpoint when the newest commit differs, a side effect in a check; keep `finalState` optional.)*
  - **Missing tests (ADV-5, minor; fixed):** `complete`'s refusal on the gate's step findings (a completion that adds an axiom of its own) and on the comparator (a lenient judgeState, the target's statement weakened after the state it starts from: definition-mismatch), each with no commit; a session ghost check that cannot read the statement's own probe back.
  - **Tests.** Runner `test/gate/session.test.ts` 26 (was 21): new, the re-check outcomes with canned Lean answers (each `unchecked` case and a budget left out and tried again; an error in the proof remembered; reported again after a decision moved the head, with no Lean job), the single-term rule on a re-check, the ghost check right after propose_arrow (real Lean), a reworded source and a lemma taken out (real Lean, with the re-emission), the statement probe that cannot be read back (real Lean); extended, a session ghost check without `leanName`, G0 on S₀ and on the completion's starting state, `complete`'s early refusals (another target's freeze, no ledger entry, no card, T proved; the commit's kind no longer counts), `finalCheck` with ws/ ahead of or behind the newest commit, judge's re-emission with real Lean, and the completion flow (an extra axiom, the comparator's refusal, the replay after recover()'s revert, a second completion refused as already proved). `test/gate/sessionPure.test.ts` 20 (was 15): `relianceKey`'s three missed reliances and the `uses` walk into a lemma's proof, `sessionContextKey`, `errorsAt`. `test/proposal/accept.test.ts`: `planApply` with `finalState` required (a request without it does not compile and is refused before anything is read). No test was deleted, skipped or moved.
  - **Mutation checks:** 30, each restored byte for byte (`cmp`), each failing at least one test: the re-emission (fake answers and real Lean); a budget, an `unchecked` outcome, a run without message, errors only in telelean's lines, no axioms, UNSEEN_PROOF, a header error read as the suggestion's (engine and scratch.ts); the single-term rule on a re-check; G0 on S₀ and on the completion's starting state; the reliance key from its starting names only (pure and real Lean), in `meaning` mode, without the proof's constants (session.ts), the new constants never kept (engine); the ghost check's cache whatever the records, `sessionContextKey` without the ledger; `leanName`; `finalCheck` whatever ws/ holds; `planApply` defaulting to ws/; `complete` with another target's freeze, without the ledger entry, without the card, for a proved target, back to the strict adopt head (real Lean: the replay fails), ignoring the gate's step findings and the comparator's (real Lean); the session ghost check without its statement read back.
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1133 (76 files), webview 314 (19), extension 205 (22, `--no-cache`); runner, with real Lean (capped 3000, one worker): `gate/session` + `sessionPure` + `proposal/*` 86 passed and 7 skipped by `proposal/build`'s own RAM gate (below 12 GiB then), and `proposal/build` alone afterwards 7 passed; `gate/engine` + `gate/pure` 49; `gate/rules` + the seven `run/manager.*` 80; `integration/m2flow` 5; `run/fresh.e2e` 9; `run/walkthrough.e2e` 22; all passed. No webview file changed, so no scratch build and no Playwright.

- 2026-11-20 (builder 2d: sessions, queues and steps; with the carry-overs R1-1, R1-2 and R1-3 of the 2b3b review). Runner: the new `run/step.ts` (the StepRunner: M2's round machinery taken out of `manager.ts`), `run/session.ts` (the session layer) and `run/legacy.ts` (old runs); `run/manager.ts` (now `RunManagerImpl extends SessionRunner extends StepRunner`), `run/types.ts`, `persist.ts`, `prompts.ts`, `systemPrompt.ts`; `llm/types.ts`, `toolSchemas.ts`, `toolServer.ts`, `fake.ts`, `stubToolHost.ts`; their tests and helpers. Extension host: `logic/boardSession.ts`, `logic/runs.ts`, plus the fakes and tests. Docs: `docs/m2-plan.md` (§5.1's system prompt regenerated from the TS, §5.2's OTHER CARDS line, with dated notes) and this plan (§3.8, §6.1, this entry). No core source, no webview file, no `test-fixtures/` file.
  - **Carry-overs, all fixed:**
    - **R1-1:** a real-Lean test of `complete` after a decision (`test/gate/session.test.ts`). After the adopt commit, a decision commit rewords another card's docstring (new-spyro-pg's, not the premise's: corrected by fixer 2d r1, A-F9); `complete` then passes on that head. Mutation-checked: `completeNow`'s narrow adopt-files rule restored makes the test fail.
    - **R1-2:** §3.8's failed-completion bullet and the due-writes paragraph, plus §6.1's 2f line, now say the completion starts from the head it is written on. Right after its premise write, that head is the `adopt` commit; after a decision or a crash replay, it is the head at that time (2b3b fixer's F-FC-2).
    - **R1-3:** `expect(scratch).toHaveBeenCalledTimes(2)` after the `written` judge. Mutation-checked: `relianceKey` without `permitted` or `sources` fails it.
  - **Contracts:**
    - Additive:
      - `SessionWrite` `queue-start` gains `inferences?`: the targets a mid-stage Formalize adds, so a replay after a crash builds them again.
      - `PersistedStep` gains `round?`: the run's round while the step ran; its freezes and gate attempts carry it.
    - Changed: `RunChange.session`, required. Every emitter says whether the session changed. The extension's fakes and its two tests that build a `RunChange` are updated.
    - As §2.5–§2.6 have them:
      - `PersistedRun.version: 1 | 2` and `session?`, `PERSISTED_SESSION_FORMAT`, `FormalizeRequest`;
      - the RunManager's session methods, and `RunFiles.writeStateChecked`;
      - the agent tool `propose_arrow`: `ProposeArrowArgs`, `ArrowProposal`, `AgentToolHost.propose_arrow`, its MCP schema, and the replies "Arrow recorded: …" and "Arrow refused: …";
      - `FinishArgs.no_alternative?`.
  - **builder 2d decided (the extraction):** a class chain, `StepRunner` → `SessionRunner` → `RunManagerImpl`. The StepRunner calls hooks where a round ends or a tool needs the session:
    - abstract hooks: `roundAccepted`, `roundReverted`, `roundEnvironment`, `roundCrashed`, `sessionCheckContext`, `proposeAssumptionInSession`, `toolProposeArrow`;
    - no-op hooks: `onFrozen`, `beforeGate`, `onStateChanged`, `onPersisted`.

    M2's behaviour was moved unchanged first, with the seven manager suites green. *(Alternative: composition, a StepRunner object that the manager calls with the session's callbacks.)*
  - **builder 2d decided (a step is one round):** each step is the run's next M2 round, with fresh caps and counters (D2-22). Its freezes and gate attempts are those of its round. *(Alternative: one round per session, with the counters reset at each step.)*
  - **builder 2d decided (the first turn):** the context bundle comes first, its first line unchanged, so the FakeBackend scripts of `test-fixtures/` still match. Then the FORMALIZE PLAN, then step 1's turn. Each later step is a new turn of the same conversation. *(Alternative: the plan as a turn of its own before step 1.)*
  - **builder 2d decided (Claude's texts):**
    - the OTHER CARDS heading of the bundle now says: propose an arrow for a card with a `.holds`; for a card without one, finish not proved and name it in `gap`;
    - the system prompt gains a "You work in steps" paragraph and the arrow rule (core `CLAUDE_SESSION_TEXTS.arrowRule`);
    - its rules name "the arrows you proposed", and gain the `otherTargets` and `declarationsOnly` lines;
    - the fixture and m2-plan §5.1 were regenerated from the TS.

    *(Alternative: a separate system prompt for sessions beside M2's.)*
  - **builder 2d decided (review methods before 2e and 2f):** `decide`, `reveal`, `undoSession`, `redoSession`, `submit`, `sessionDiff` and `moveProposed` answer D2-62's refusal while a step runs, and `not-yet` "Not built yet (slice 2)" otherwise. `end` answers the same, `exit` included. Until 2f, the stopgap Exit is `discard`: the session ends ("Session ended") and its attempt records are written as discarded (D2-11). *(Alternatives: leave the methods unimplemented, so only the host answers not-yet; refuse `discard` in a session, which would leave no way out until 2f.)*
  - **builder 2d decided (Cancel step):** Cancel step stops the round, closes Claude's process and cancels the run's Lean jobs. It then takes the step back to S₀; the rest of the queue becomes `not-run`, both go to `retry`, and the stage opens. Retry resumes the same conversation with `--resume`. *(Alternative: keep the process alive between steps.)*
  - **builder 2d decided (how a step ends):**
    - "No finish twice" is a give-up.
    - A give-up goes back to the newest `gate-pass`, `freeze` or `step-start` commit since S₀. So with no freeze, it goes back to S₀, and it never goes further back.
    - A give-up keeps its premise drafts (AF10) and the ledger arrows that are still drawn; it drops the arrows its rollback undrew (§3.4).
    - A cap, an environment failure twice, or a crash fails the step (D2-29).

    *(Alternative: no finish twice as a failure, back to S₀ with its drafts dropped.)*
  - **builder 2d decided (the ledger at a step's end, D2-43):** a `created` entry for every declaration name of the end state that is neither in S₀ nor already in the ledger. Its phase is `statements` when the freeze commit had the name, `proof` otherwise. A proof name a premise draft's statement reaches records that draft (`reachingDraft`). A later step that changes the declaration keeps its first creator. *(Alternative: only the names the finish's footprint reaches.)*
  - **builder 2d decided (a re-ask without a proof, D2-46):** core `computeItems` is run over S₀ → the end state with the step's ledger, and its own Result and arrow drafts are reverted with `planItemRevert` into a `revert` commit. If that plan throws, the whole step goes back to S₀, which fails closed. *(Alternative: always the whole step back to S₀, losing the statements it wrote.)*
  - **builder 2d decided (proposed arrows, §2.8):** before each gate attempt, `beforeGate` writes each of the step's ledger arrows that is not drawn yet. It uses core `planAction({ kind: 'add-arrows' })`; `written` records the time. A plan that throws is logged, and B.3 then refuses the undrawn arrow. *(Alternative: write the arrow when it is proposed, which turns a mid-step check into a write.)*
  - **builder 2d decided (judging):**
    - **Phase and state.** The phase stays `step` until the queue-end judge converges. The run's state is `review` from the last step's end.
    - **Judge rounds.** Reverts make the judge run again, up to 8 rounds (`MAX_JUDGE_ROUNDS`). A judge that throws opens the stage without a judgement, so nothing can be accepted. *(Fixer 2d r1, A-F4: only since that round does the previous judgement stop standing in for it; below.)*
    - **A judge-apply that changes nothing writes nothing:** same judged commit and files key, same `ok` and problems, same records, no event or revert, not a queue end, no written cards. No run.json write, no new view version.
    - **Recovery's head.** A write in flight is finished by reverting ws/ to `head`, and that `revert` commit becomes `head`. The judge judges the newest commit, and would otherwise be dropped forever.
    - **Renderings and facts.** Renderings are made after each converged judge and kept in `renderings.json`. The judged facts go to `judged-facts.json` as `{ format: 'telelean-judged-facts', version: 1, commit, filesKey, facts | null }`, written in judge-apply's step 4.
    - **A mid-stage Formalize and Retry** wait for the session to be idle (no judge, no write) before their checks.

    *(Alternatives: write at every judge; keep `head` and compare files keys; render once when the stage opens; keep the facts in run.json; refuse while judging.)*
  - **builder 2d decided (the views):**
    - The RunView withholds `activity` and `notices` only once a step has started, so a start refused before any step ran still shows its reason, such as a base with Lean errors. *(Alternative: withhold them from the start.)*
    - `proposedNothing` is a passed step's summary when its end commit is its start commit. *(Alternative: compare the end and start files instead of the commits.)* *(Replaced by fixer 2d r1, F-V2D-FC-1: a passed step always ends on a new `gate-pass` commit, so the line never showed; it is decided on content now, below.)*
    - ES-4's "did not pass" applies when the queue-end judgement of a queue with a cancelled or failed step is not `ok`. *(Alternative: ES-4's text for every failed or cancelled queue, whatever its judgement.)*
  - **builder 2d decided (old runs, AF12):** a v1 run in review becomes a session with one passed step (`legacy.ts`):
    - ws/ goes back to the proposal's head when it is ahead;
    - `created` entries are made from the v1 freeze;
    - `premise` entries (with `mark-removed`) are made for its adopted ghosts, which become written Add premise items through the judge-apply's `writtenCards`; *(replaced by fixer 2d r1, A-F2: every judge-apply derives the record's `card` from that ledger entry, so a reload during the first judge keeps it)*
    - its pending ghosts become drafts;
    - then a fresh judge runs.

    *(Alternative: end such a run, losing its proposal.)*
  - **builder 2d decided (a reload before Claude had started, as M2):**
    - A session is ended failed with "the editor reloaded before Claude had started" when every step is still `queued` and its state is `starting` or `interrupted`. That covers a crash or a window closing during the base check, and a window closing after Claude's process started but before the first turn.
    - Resuming such a session would start step 1 without the bundle and the plan. No other session has every step queued.

    *(Alternative: keep it interrupted, and persist the first turn's prefix so Resume can send it.)*
  - **builder 2d decided (the start's checks):** the runner does not check a start again (`formalizeStartProblems` runs in the host, as in slice 1e). A mid-stage Formalize is checked by the runner on its own records. *(Alternative: check both again in the runner.)*
  - **builder 2d decided (tests):**
    - The FakeEngine judges with core's `judgeState` over core's `fakeFacts` test helper, imported from core's tests, with real source hashes. *(Alternative: a copy of the helper in the runner.)*
    - The walkthrough's cheating scripts (AT3.15) run as one-step sessions with real Lean; the checks are kept and read from run.json. *(Alternative: move them with the rest.)*
    - The fresh models (all of them end in Accept) and m2flow (a)–(c) move to 2f; m2flow (d) and (e) run as sessions.
  - **Runner texts not in core (reported; no core text added):**
    - user-facing:
      - "Claude resumed the step." and "Claude resumed the session."
      - "You cancelled the step. Its changes were taken back; Retry step runs it again."
      - "The editor reloaded while Claude was working. Resume continues the same session; Cancel step takes the step back."
      - "Changes made after finish were discarded: the step ends on exactly the files the checks passed."
      - "telelean could not check the working copy (…)."
      - "This run was started by an older telelean: it is now an edit session, with every item in review."
      - "This run is an edit session: review its items instead." and "This run is not an edit session."
      - "No step of this session is running." and "No step of this session waits."
      - the step's environment notice ending "…the step stops here: fix the cause, then Retry step."
      - the labels "Session ended", "Step cancelled", "Claude continues" and "Claude is working on “…”"
    - Claude-facing:
      - "The person rejected this premise in this session: do not propose it again."
      - the `propose_arrow` acceptance message, its tool title and description
      - the OTHER CARDS heading, and the system prompt's lines above
  - **Tests that move (§0)** are 29, all in the runner, each `it.skip` with "moves to 2e/2f/2h: ‹name›":
    - `manager.lifecycle` 1 (to 2h);
    - `manager.rounds` 3 (Feedback to 2e; two ghost tests to 2f);
    - `manager.accept` 10 (to 2f; Discard's to 2e/2f);
    - `walkthrough.e2e` 3 ((a), (b), and definition-belief's Accept refusal, to 2f);
    - `fresh.e2e` 9 (to 2f);
    - `integration/m2flow` 3 ((a)–(c), to 2f).
  - **Tests.**
    - **New** (the FakeBackend and the fake engine):
      - `session.queue` 12: chains, A12 with its tool refusals, give-up bounds, caps per step, Cancel and Retry, D2-62, a mid-stage Formalize and the seals, queue numbers;
      - `session.tools` 9: `propose_arrow` and `propose_assumption` in a session, AF10;
      - `session.reload` 20: a reload during a step, between steps, at and in a queue-start, before Claude started (3 variants), during a stage (D2-72), a judge whose head moved (F8, white box), a judge-apply crashed after each of its writes (AF11), persistence, v1 conversion;
      - `session.views` 5: the views, nothing leaking, the re-ask's outcomes;
      - one new real-Lean session test in `walkthrough.e2e`;
      - `toolServer` +1 (`propose_arrow` over MCP);
      - extension `runRouting` +8 (Formalize start and mid-stage, the start's lock, Retry step, Cancel step, AF14 ×2, the `session` message).
    - **Adapted to sessions:** `manager.start`, `happy`, `gate`, `caps`, `lifecycle`, `rounds`; `prompts`; the 20 cheating scripts; m2flow (d) and (e); the tool counts in `toolServer` and `m2Harness`; extension `runRouting` and `hostRuns` (the `session` message).
  - **Mutation checks:** 33, each restored byte for byte (`cmp`).
    - **31 fail at least one test.** The two carry-overs, then:
      - D2-62's refusal, and `stepRunning` without `interrupted`;
      - A12's detection, and its `propose_assumption` refusal;
      - the give-up without S₀ as a target;
      - AF10's drafts, and the ledger on a rollback and on a give-up;
      - `beforeGate`'s write, `proposeArrowProblems` ignored;
      - the seal of a later queue;
      - a judge-apply on a moved head, and recovery's head;
      - `isPersistedRun` v2;
      - queue-start's step-1 refusal and its replay on recovery;
      - D2-46's take-back;
      - the RunView's withholding;
      - AF12's written cards;
      - the never-started rule, and its narrower first draft;
      - D2-63, with the queue ending early;
      - D2-72's recompute;
      - Cancel's revert;
      - the host's start check, its mid-stage bypass, its `retryStep` routing, its `session` post and its start lock.
    - **Two are equivalent, and say so:**
      - the give-up's search bound S₀ replaced by the base: S₀ is itself a `step-start` commit, so the newest commit of the three kinds is never older than it;
      - `propose_arrow`'s A12 refusal removed: core's `arrowProblems` gives the same text as its only problem.
    - **Three survived at first and got tests:** the give-up and the moved head, and the A12 refusal checked by its exact tool result.
  - **Outside this sub-slice's files (reported, not changed):** `scripts/walkthrough-claude.mjs`, the integrator's walkthrough dry run, still drives M2's start, proposal and Accept. With 2d its start is a session whose `proposal()` is null, so the script ends it with Discard. It needs 2f's Apply, and was not run.
  - **Verification:**
    - tsc is clean for core and runner (`tsconfig.test.json`), webview (`tsconfig.json`, `tsconfig.node.json`) and extension.
    - vitest, all passed: core 1133 (76 files), webview 314 (19 files), extension 213 (22 files, `--no-cache`).
    - Runner, capped at 3000 MB, one worker, `TELELEAN_NO_REAL_CLAUDE=1`:
      - `session.*`, `manager.*`, `prompts`, `llm/*`, `backend` and `quotaTripwire`: 220 passed, 15 skipped. The skips are the 14 moved tests above and `llm/binary`'s pre-existing opt-in.
      - With real Lean:
        - `gate/session`: 27 passed;
        - `integration/m2flow`: 2 passed, 3 skipped;
        - `run/walkthrough.e2e`: 21 passed, 3 skipped;
        - `run/fresh.e2e`: 9 skipped.
    - No webview file changed, so there was no scratch build and no Playwright.

- 2026-11-20 (fixer 2d, round 1: the review of builder 2d, findings F-V2D-FC-1–FC-9 and A-F1–A-F9; four defects found twice: FC-3 = A-F9's first part, FC-5 = A-F5, FC-6 = A-F8, FC-7 = A-F2). Runner (`run/session.ts`, `run/step.ts`, `run/manager.ts`, `run/legacy.ts`, `run/types.ts`, `gate/engine.ts`, `gate/types.ts`), its tests (`test/run/session.queue`, `.tools`, `.reload`, `.views`, the new `test/run/session.failclosed.test.ts`, and `test/gate/session.test.ts`), and this plan (§6.1's 2d list, the builder 2d entry above, this entry). No core source, no webview or extension file, no `test-fixtures/` file. Every finding is fixed; none was judged wrong.
  - **RV-13 never showed (F-V2D-FC-1, major; fixed).** "A step that proposes nothing" was read as end commit = start commit, which a passed step never has (it always ends on a new `gate-pass` commit). **fixer 2d r1 decided:** it is decided at the step's end on content: the step passed, its end files (its gate's, before any re-ask take-back) equal its S₀'s, and it proposed no arrow and no premise draft. It is recorded as `PersistedStep.proposedNothing` (additive), which `wordsOf` reads. A give-up is never "proposed nothing": its Result already reads "Claude's step did not finish". *(Alternative: compare the declarations and items of S₀ and the end instead of the files, which would also count a step whose only change is telelean's normalise.)*
  - **A target asked as new (A-F1, major; fixed).** A target whose only steps were cancelled, failed or not run has no Result. A mid-stage Formalize of it kept the old question, so the stage judged the new proof against the question the person had replaced. **fixer 2d r1 decided:** in the `queue-start` write's step 4 (and its replay), a requested target that already has an inference, but no ended step, gets the request's question (§3.2: "asked as new"). A re-ask, one with an ended step, keeps its question until a step proves it (D2-46). *(Alternative: a new inference record for it, which would change its order and its item ids' history.)*
  - **A converted ghost's card after a reload (A-F2 = F-V2D-FC-7, major; fixed).** **fixer 2d r1 decided:** every `judge-apply` gives an Add premise record that has no `card` the card of the ledger `premise` entry whose `item` is its key. The two always change together: the premise write's step 4 sets both, and a take-out drops both. Builder 2d's in-memory `writtenCards` is removed, and `legacySession` returns `{ session }`. *(Alternative: persist `writtenCards` in the session until a judge-apply has applied them, a second record of what the ledger already says.)*
  - **A re-ask's take-back left a definition (A-F3, major; fixed).** A proof-phase definition that the step's premise draft reaches is its own `decl:` item (D2-42), part of T's Result. It stayed in ws/ unowned, which disabled Apply for the rest of the session. **fixer 2d r1 decided:** `takeBackReask` reverts the Result, the step's arrows, and every draft that is part of T's Result and was made by this step (`partOfResult === T`, `origin.step` the step). *(Alternative: every draft whose declarations are all among the step's proof-phase `created` names.)*
  - **Fail closed when the view cannot be built (A-F4, major; fixed).** **fixer 2d r1 decided:**
    - A SessionView that `buildSessionView` cannot build is never replaced by the previous one. There is no view (`session()` is null) and `SessionRuntime.viewError` is set until a build succeeds.
    - While it is set, the RunView withholds `activity` and `notices`. It shows one telelean notice instead ("telelean could not build the review list. Nothing of it is shown until it can: reload the window to try again, or Exit the session."). Its `inferences`, `target` and `premises` are the questions each target's latest ended step asked, which tell no outcome.
    - A mid-stage Formalize is refused with the same text.
    - A judge that throws at a queue's end clears the previous stage judgement in memory and on disk (`judged`), and raises `viewVersion`. The stage then has no judgement (nothing can be accepted; Submit is closed), and a reload runs the judge.

    *(Alternatives: keep the stale view with a flag and treat it as hidden, which still shows statuses of other records; withhold without the notice.)*
  - **Cancel step of a step that never ran (F-V2D-FC-2, minor; fixed).** **fixer 2d r1 decided:** a queued step cancelled between two steps, or right after its queue-start, gets its state only. It gets no round, finish, counters or attempt record copied from the previous step, so Exit writes one attempt per step that ran. *(Alternative: an attempt record of its own, with no finish and a round no other step has.)*
  - **The gave-up notice (F-V2D-FC-3 = A-F9's first part, minor; fixed).** **fixer 2d r1 decided:** a StepRunner hook `revertTarget(run)` gives the commit a give-up goes back to. M2 keeps `lastCommit(PASSING_COMMIT_KINDS)`; a session step uses `lastCommitSince(S₀, [gate-pass, freeze, step-start])`. `toolFinish`'s gave-up label and the session's rollback both read it, so the two notices name the same state. *(Alternative: rewrite the notice in `stepReverted` after the fact.)*
  - **An interrupted step was not posted (F-V2D-FC-4, minor; fixed).** **fixer 2d r1 decided:** `onStateChanged` marks the runtime (`stateChanged`) when the phase or the active step's state changes. The next run.json write (`persist`, `persistChecked`) then counts as a session change, and `onPersisted` clears the mark when it rebuilds the view. *(Alternative: compare the persisted phase and step states with the last view's at every write.)*
  - **A step whose `--resume` fails (F-V2D-FC-5 = A-F5, minor; fixed).** **fixer 2d r1 decided:**
    - `startStep` answers whether Claude got the turn. `startSession`, a queue's start (Retry step, a mid-stage Formalize) and Resume between two steps answer its refusal instead of a success label.
    - With no live session, the step's turn is kept in `PersistedRun.undeliveredTurn` (additive) until a session receives it. Resume sends it instead of the generic resume turn, and Cancel step drops it.
    - `continueSession`'s third parameter is now `'answers' | 'turn' | false`.

    *(Alternative: rebuild the step's turn from the records on Resume, whose "decisions since the last step" would need the stack as it was.)*
  - **Queue-end rules applied twice (F-V2D-FC-6 = A-F8, minor; fixed).** **fixer 2d r1 decided:** `PersistedSession.queueEndReconciled` (additive) is the newest queue whose end reconcile has applied `queueSteps`. It is written in that judge-apply's step 4. Recovery judges a queue's end with `endsQueue` always, and with `queueSteps` only when that queue is not reconciled yet. *(Alternative: carry the judge round in the judge-apply's `inFlight` action, which a crash after its step 4 would lose.)*
  - **A converted pending ghost had no explicit form (F-V2D-FC-8, minor; fixed).** §3.8's meaning check would always fail its premise write. **fixer 2d r1 decided:** with no core change, `engine.judge` returns `CheckReport.premiseExplicit` (additive, runner): the fully explicit form of each draft whose re-check passed, from its memo when nothing changed. The judge-apply fills a draft's empty `explicit`, and its record's content's, from it, and never replaces a draft's own form. *(Alternatives: a session ghost check of each pending ghost during the conversion, which needs a Lean job and a step context at recovery; core's `premiseChecks` with `explicit`, a core change 2d may not make, §0.)*
  - **Untested rules (A-F6, minor; fixed).** Tests now cover:
    - Retry and a mid-stage Formalize waiting for a running judge (`idle`);
    - propose_arrow after a passing finish;
    - Cancel step while a question waits;
    - a judge taking a converted written premise out.

    **fixer 2d r1 decided:** a judge queued behind another counts as judging (`SessionRuntime.queuedJudges`), and `idle()` waits on `isJudging`. *(Alternative: set `judging` when a judge is queued, which the running judge's end would clear while the queued one waits.)*
  - **A replayed queue-start (A-F7, minor; fixed).** **fixer 2d r1 decided:** `replaySteps` builds a Retry's steps as `retryNow` does (`{ ...old.scope, step }`, the old kind) and a Formalize's from `inferences`. A write whose steps cannot be rebuilt is not made: its `inFlight` is dropped, the stage stays as it was, and it is logged. Today that is only 2e's Submit queue-start, which records nothing more; 2e extends the write. *(Alternative: add each step's kind, target and scope to the `queue-start` write now, a contract that 2e's Submit may still shape.)*
  - **The A12 twins (F-V2D-FC-9, nit; fixed):** they compare the whole SessionView, and the RunView without counts, usage and times. There is a new failure variant: a statements-only step under a turn cap ends `failed` and goes to `retry`. **A-F9's second part (nit; fixed):** the R1-1 line above names the docstring the test rewords.
  - **Contracts (all additive, runner):**
    - `PersistedStep.proposedNothing?`;
    - `PersistedSession.queueEndReconciled?`;
    - `PersistedRun.undeliveredTurn?`;
    - `CheckReport.premiseExplicit?`.

    Internal: `JudgeOptions.writtenCards` is removed, `legacySession` returns `{ session }`, there is a StepRunner hook `revertTarget`, and `continueSession` takes `'answers' | 'turn'`. No core contract changed.
  - **Runner texts not in core (reported; no core text added):** "telelean could not build the review list. Nothing of it is shown until it can: reload the window to try again, or Exit the session." (`SESSION_VIEW_FAILED`).
  - **Tests (20 new, 4 extended; none skipped, moved or deleted).**
    - `session.queue` +5:
      - RV-13, and a premise-only step without the line;
      - a statements-only step failing under a cap goes to `retry`;
      - Cancel step while a question waits;
      - a cancelled target asked as new;
      - a judge that throws at a later queue's end.
    - `session.queue`, extended: the give-up test checks both notices' label, and the A12 twins compare whole JSON.
    - `session.tools`: +1, propose_arrow after a passing finish. Extended: a draft's own explicit form is kept.
    - `session.reload` +11:
      - a reload between two judge rounds;
      - a pending ghost's explicit form;
      - the conversion's card across a reload;
      - a judge taking the written premise out;
      - a Retry replay keeping its scope, and an unrebuildable queue-start not made;
      - `idle` for a queued judge, for Retry and for a mid-stage Formalize;
      - a failed `--resume`;
      - a dying Claude process.
    - `session.reload`, extended: Cancel step between two steps records no attempt for the step that never ran. The v1 run's fixture became the helper `writeV1Run`.
    - `session.views` +1: the re-ask take-back of a draft-reached definition.
    - New `session.failclosed` 2 (core's `buildSessionView` mocked to throw): the fail-closed view, and the RunView's questions for a proved and a not-proved re-ask.
    - `gate/session` (real Lean), extended: the judge's `premiseExplicit`, fresh, from the memo, and without a failed check's.
  - **Mutation checks:** 36 runs, each file restored byte for byte (`cmp`).
    - **33 mutants are caught by at least one test.** One for every rule above, among them:
      - the two real-Lean engine mutants (the re-check's form, and the memo's);
      - two A12 leak mutants (the mode in the RunView's `statementsFixed`, and in the records' question).
    - **The A12 leak mutants against the original test.** Both were also run against builder 2d's original version of the A12 test, which passed them: it missed both. The tightened test catches them.
    - **One equivalent mutant:** the RunView's `verdict` filter removed. A session's `view.verdict` is only ever set at its end, as `cancelled` or `failed`, which the filter keeps.
  - **Verification** (one job at a time, `capped.sh`; vitest with one worker, `--no-cache`, `TELELEAN_NO_REAL_CLAUDE=1`; lowest MemAvailable 21.5 GB):
    - tsc is clean for core and runner (`tsconfig.test.json`), webview (`tsconfig.json`, `tsconfig.node.json`) and extension.
    - vitest: core 1133 passed (76 files), webview 314 (19), extension 213 (22).
    - Runner, with the fakes: `session.*` (5 files), `manager.*`, `prompts`, `llm/*`, `backend` and `quotaTripwire`: 240 passed, 15 skipped. The skips are builder 2d's 14 moved tests and `llm/binary`'s opt-in.
    - Runner, with real Lean:
      - `gate/session`: 27 passed;
      - `gate/engine` + `gate/sessionPure`: 54 passed;
      - `integration/m2flow`: 2 passed, 3 skipped (moved);
      - `run/walkthrough.e2e`: 21 passed, 3 skipped (moved);
      - `run/fresh.e2e`: 9 skipped (moved).
    - No webview file changed, so there was no scratch build and no Playwright.

## 9. Baseline numbers (filled in as measured)

- Before 2a1, after slice 1's last fixer: to be measured (tsc in every package, and the vitest counts of core, webview, extension and the runner).
