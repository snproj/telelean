# Slice 4 plan: the transform window (spec v4.1)

*Integrator's plan, 2026-11-20, written on autopilot (the user is away and asked for the slices to be built without stopping; `verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md` logs every choice made without them). The specification is `verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md`; clause IDs refer to it. The user's own words outrank every simplification here: `bundle_20/prompt20.md` (TRANSFORM 1–10, DECLINE OPTIONS 2, REVIEW 4, EDIT SESSIONS 1, INITIATING 2, FROZEN 3–5) and `bundle_21/prompt21_midturn.md` (★D1: no direct edits during a session; ★D6: search by sentence; message 3: two Undo stacks, a base that never changes). Two designs fed this plan: the transform engine and checks (core, runner) and the transform window (webview, host, protocol); the references design fed §3.12 and D4-28. Every choice the spec leaves open, and every narrowing of it, is in §7 as an "AUTOPILOT DECISION" with its alternative and how to reverse it, cited as (D4-n). Slice 2's plan (`docs/slice2-plan.md`, final, with its §8) and slice 3's plan (`scratchpad/plans/slice3-plan.md`, frozen) are the interface this plan builds on; their decisions are cited as (D2-n) and (D3-n).*

*Designed for the simplest sound mechanism (AP-24's lesson). A transform is data, a draft. One pure analysis decides what it changes, what it needs and what blocks it; one pure planner writes it. Inside a session a transform is carried out by one queue step of a new kind whose start S₀ is the judged head, so slice 2's step limits, rollback, reconcile and backstop, and slice 3's freeze table and checks, apply unchanged; what you typed is recorded in telelean's ledger and owned by "typed" items, accepted as yours. Outside a session the window is a provisional session (a real run, so slices 2–3's lock, base, freezes, stack, reload and Exit apply); a transform that needs no Claude ends it and is written as one board step. Anything that would need repairing is refused with a sentence.*

**Slice 4 = ★D8 (a) item 4, the transform window:**
- **Transform cards…** (a labelled Context Menu button and a right-click entry): with no session, it opens the window in a provisional session, with every other card of the subject frozen (ES-3, INITIATING 2; D3-1 made real); in a stage, on the Proposed view, it opens a window whose transform waits for Submit review (RV-9, ES-9).
- **The window** (TR-1–TR-11): exact copies; new cards (axiom, proposition, vocabulary); a trash you can drag back from; field states (frozen, open, "Claude fills this", kept empty); Kind with its impact, naming the frozen arrows it removes (G6); Dependencies as card chips found by searching sentences (★D6); Proof kept or cleared; "Claude may add cards"; Instructions; a "Before you submit" panel (TR-13's dependents with their choices, typed-Lean problems, "Claude must define").
- **Submit transform** (TR-15): unchanged → the session goes on with an empty first stage; needs Claude → its first step; changed without Claude → one board Undo step and no session. In a stage: queued.
- **Decline → Transform** (DO-2, RV-8) for one item or a group, with the previous version alongside; **Ask me instead** becomes one (D2-13 retired); a suggested premise can be transformed (TRANSFORM 9, D4-14).
- **Carrying transforms out at Submit review** (RV-12): one step per transform, telelean's typed write first, then a check or Claude's turn, all or nothing; your typed content is owned by typed items accepted as yours (RV-7 b5); content copied from Claude stays Claude's (TR-15); accepted items your change touches return to review after a confirmation (RV-5 b3).
- **Checks** (TR-12, TR-13, TR-14 a/b, S8–S11): typed Lean is checked (the single-term and shape rules, a scratch elaboration against your files); nothing is left broken in a session; transform steps write no proofs; your change becomes the frozen value (FZ-3 2e); the `transform` and `session-start` reasons (FZ-7).
- **The rest:** what you typed is listed separately at Apply (EN-2); queueing and dropping are session steps (UN-4); drafts survive a reload (ES-6); the banner "Everything except the selected cards is frozen" (FZ-11).

**Not in slice 4:**
- References (slice 5, built after this one: AP-2, D4-28). Until then Dependencies use card chips found by sentence, Instructions are plain prose, and TR-13 lists no reference dependents (§3.12).
- "Make it pending" inside a session (D4-11), re-proving a broken proof in the session that broke it (D3-47), D-11 rewrites inside a session (D4-13), Shaky splits (D2-15, D4-12).
- Formalize's "Claude may add cards", unless slice 3 moved it here (4x, D3-43).

---

## 0. Rules for everyone working on slice 4

The rules of slices 1–3 hold unchanged (§0 of each plan; the builder rules file is pasted into every builder's brief):
- no git changes, no installs, never real Claude (`TELELEAN_NO_REAL_CLAUDE=1`), never write `packages/extension/dist` or `out`;
- one heavy job at a time under `capped.sh`; vitest with one worker (the extension's with `--no-cache`), `--fsModuleCachePath` in the scratch dir; binaries from `node_modules/.bin`; `TELELEAN_TEST_TMP` in the scratch dir;
- real Lean only for the files a change touches, above the 12 GB rule, otherwise listed as not run; webview builds to `TELELEAN_WEBVIEW_OUT`; Playwright and the VS Code suite only by the integrator, when RAM allows;
- after each sub-slice, `verbatim_prompt_log/bundle_21/evidence/patches/after_slice_4x.patch` and the builder's report in `bundle_21/subagent_reports/`.

Additions for slice 4:
- **Start.** 4a starts after slice 3's verified end ("slice 3 done" in the decisions log); the integrator measures the baseline first and records it in §8. Slice 4 reuses slice 3's whole-model ownership and tools (3c1: Change, Delete, Remove arrow and Proof broken items; `remove_arrow`, `mark_proof_broken`; G5's allowances). If D3-43's fallback left 3c2/3e3 unbuilt, 4d and 4e build the `card` ledger entry and `add_card` for transform steps, and 4x builds Formalize's half last.
- **Contracts and texts.** §2 is the integrator's. A builder who must change a contract, or who finds that slice 2's or 3's built code differs from their plans in a way that matters here, records it in §8 with the reason. Every quoted text is used verbatim; core `transform/texts.ts` (`TRANSFORM_TEXTS` for the person, `CLAUDE_TRANSFORM_TEXTS` for Claude) holds them, all written by 4a; a later sub-slice that needs an unquoted text reports it.
- **One builder at a time in core:** 4a → 4b → 4c → 4d → 4e → 4f, strictly in order, nothing beside them. 4g changes no core file and may run beside 4b–4f. 4h and 4i (runner, host) and 4j–4l (webview) change no core file; 4j–4l may run beside 4g–4i when their files do not overlap. 4a adds one line each to webview `labels.ts` and runner `workspace/history.ts`, and a case wherever a new union member meets an exhaustive switch in built code (throwing `NotImplementedError("‹name› (slice 4x)")` until its sub-slice), so every package compiles after every sub-slice. 4f makes the host answer the new messages `not-yet` ("Not built yet (slice 4)") until 4i routes them.
- **Slices 2 and 3 stay green**, with these intentional changes, each listed in the report of the sub-slice that makes it: the reducer's `transform` refusal and D2-14's disabled menu entry go (4f, 4l); "Ask me instead" opens a transform (4l); `SessionPhase` gains `transform` (4a); `formalizeStartProblems` refuses a target with a Transform-declined item (4f); the system-prompt fixture gains the transform paragraph (4h).
- **FakeBackend** scripts go in `packages/runner/test/run/fixtures/sessions/` as `transform-*.jsonl`; each cheat of §6.2 is also built by hand in `core/test/transform/cheats.test.ts` by the core sub-slice named there.
- **Mutation checks** (AP-27) for every rule a test guards, and the edge cases: empty, single, many, removal, reload.

## 1. Order of work

Each sub-slice ends with every package compiling, the unit tests of every package it touched passing, its entry in §8, and a saved patch. Each is sized for one builder.

| Sub-slice | What | Main clauses | After |
|---|---|---|---|
| 4a | Contracts, texts, the draft from the model, TR-12 (a), validators (core) | TR-1, TR-2, TR-4, TR-6, TR-10, TR-12 a, S10, S11 | slice 3 |
| 4b | The analysis (core): changes, outcome, dependents, kinds, session rules | TR-11, TR-13, TR-15, RV-5 b3, RV-6 b4, G6 | 4a |
| 4c | The typed write and the direct plan (core) | TR-3, TR-5, TR-11, TR-15, CF-6, G5, D3-44 | 4b |
| 4d | Typed items: ownership, classes, dependencies, revert, reconcile, backstop (core) | RV-7 b5, TR-15, DO-2, App B baseline | 4c |
| 4e | Judging transform steps; the freeze table's new reasons and revalue (core) | TR-14 a/b, S8, B.3, CF-4, FZ-3 2e, FZ-7, FZ-11, D3-1 | 4d |
| 4f | Reducer, Submit's plan, start checks, the session view (core; the host's `not-yet`) | UN-4 4a, RV-8, RV-9, RV-12, EN-2, DO-2 | 4e |
| 4g | TR-12 (b): the scratch elaboration (runner) | TR-12 b, c | 4a (beside 4b–4f) |
| 4h | The transform step and Submit review with transforms (runner) | TR-14, TR-15, RV-12, A2, A3 | 4f |
| 4i | Windows: the provisional session, windows in a stage, the direct path, consent (runner, host) | ES-3, ES-6, ES-9, CM-4, TR-9, TR-15 | 4g, 4h |
| 4j | Webview: the store, the draft model, autosave, entry gates | TR-5, ES-6, CM-3, FZ-9 | 4f (beside 4g–4i) |
| 4k | Webview: the window | TR-1–TR-11, TR-13, FZ-11, ★D6 | 4j |
| 4l | Webview: entry points and the session; the user guide | CM-3, CM-4, DO-2, RV-8, RV-10, EN-2, UN-4 | 4k, 4i |
| 4m | Playwright specs (integrator only) | | 4l |
| 4x | Conditional: Formalize's "Claude may add cards" (D3-43's fallback) | ES-2, A25 | 4l |

- **The largest are 4a, 4d, 4h and 4k.** If a builder runs out of room: 4a splits after the validators (4a1: types, texts, validators, stubs; 4a2: `draftFromModel`, `typedLeanProblems`); 4d after ownership (4d1: `computeItems`, classes, dependencies; 4d2: revert, reconcile, backstop); 4h after the step (4h1: the step; 4h2: Submit with transforms, rework steps, the queue end); 4k after the cards (4k1: shell, cards, fields, trash; 4k2: Dependencies, the impact panel, the outcome line, dialogs).
- The user's installed extension is not affected: `dist` is rebuilt only at the verified slice end (AP-8).

### 1.1 Scope of each sub-slice

The files named are where the work lands; builders may add helper files next to them.

**4a: contracts and drafts.** Core, plus one line each in webview `labels.ts` and runner `workspace/history.ts`.
- New `core/src/transform/`: `types.ts` (§2.1), `texts.ts`, `draft.ts` (`fieldState`, `draftFromModel`), `typedLean.ts` (TR-12 a), `validate.ts` (`transformDraft()` and the validators' helpers), `index.ts` and its line in `core/src/index.ts`; stubs for 4b–4f's functions.
- Additive contracts: `review/types.ts` (§2.2), `freeze/types.ts` (§2.3), `review/view.ts` (§2.4 types; empty placeholders in `buildSessionView`), `run.ts` (RunView's step kind), `actions.ts` and `edit/planAction.ts` (`apply-transform` with a stub case; `HistoryActionKind`), `protocol.ts` (§2.5: messages, validators, LIMITS, `RUN_MESSAGE_TYPES`), `gate/g0.ts` (`termProblems` exported); the exhaustive-switch cases (§0).

**4b: the analysis.** Core only. `transform/analyse.ts`: `analyseTransform` (§3.2–§3.4) and `transformLabel`; `kindChange.ts` names the arrows and the mark a P→A removes, with their freeze reasons (G6).

**4c: writes.** Core only. `transform/plan.ts`: `planTypedWrite` (§3.5); `edit/planTransform.ts`: `apply-transform` in `planAction` (§3.6); `edit/session.ts` helpers if needed.

**4d: typed items.** Core only. `review/items.ts` (typed ownership; the `card` entry of transform steps), `keys.ts` (`typedKey`), `classify.ts`, `deps.ts`, `reveal.ts`, `revert.ts`, `reconcile.ts` (§3.10's queue end), `backstop.ts`, `texts.ts`.

**4e: judging and freezes.** Core only. `review/judge.ts`, `gate/rules.ts`, `gate/types.ts`, `gate/describe.ts` (§3.9's transform scope, the code `transform`, the typed exceptions); `freeze/tools.ts` (the transform branches of `proposeArrowProblems`, `removeArrowProblems`, `proofBrokenProblems`, `addCardProblems`); `freeze/table.ts`, `check.ts`, `plan.ts`, `changes.ts`, `view.ts`, `texts.ts` (§3.11); `transform/scope.ts` (`transformScopeOf`).

**4f: reducer, Submit, view.** Core, plus the host's `not-yet`. `review/reducer.ts` (`queue-transform`, `drop-transform`, the refusals, typed items' options, `planGroupDecline` with `transform`), `review/submit.ts` (§3.8), `review/formalize.ts` (check 3's Transform rule), `review/view.ts` (§2.4, built), `review/texts.ts`; extension `logic/boardSession.ts` and `logic/runs.ts` (`not-yet`).

**4g: the scratch.** Runner only. `semantic/typedScratch.ts` (the source and its messages, §3.3); `workspace/modelWorkspace.ts` and `workspace/types.ts` (`checkTypedLean`).

**4h: the transform step.** Runner only. `run/step.ts` (kind `transform`, §3.9), `run/session.ts` (Submit with transforms, rework steps, the queue end's inputs), `run/types.ts`, `run/persist.ts`, `run/prompts.ts`, `run/systemPrompt.ts` with its fixture, `llm/toolSchemas.ts` and `llm/types.ts` (`add_card`'s `slot` and `kind`; `finish`'s `status`), `gate/engine.ts`, `shadow/types.ts` and `shadow/workspace.ts` (commit kind `typed`); the FakeBackend scripts.

**4i: windows.** Runner and host. `run/transform.ts` (the window lifecycle, §3.1, §3.7), `run/session.ts` (phase `transform`, TW-1, the start outcomes, the lazy conversation), `run/sessionEnd.ts` (the end of a provisional session; the direct path), `run/types.ts`; extension `logic/boardSession.ts`, `logic/runs.ts`, `logic/actionMapping.ts` (routing, consent, the direct path's board action).

**4j: the store.** Webview. `state/transform.ts` (wired into `store.ts` and 2g's `state/session.ts`), `model/transformDraft.ts` (`applyDraftEdit`), autosave and restore, `board/contextActions.ts` (`transformCardsState`).

**4k: the window.** Webview. `transform/*` (§4.2–§4.4); `common/CardSearch.tsx`, `CardChip.tsx`, `ChipChoice.tsx` (taken out of PromptBox), `ProseField.tsx`; `common/Popover.tsx` (`container`); `model/transformView.ts`, `model/cardSearch.ts`; `styles/transform.css`; `App.tsx`, `main.tsx`.

**4l: entry points.** Webview and `docs/user-guide.md`. `header/ContextSection.tsx`, `board/menu.ts`, `board/runAction.ts`, 2g's `run/review/*` (decline menu, item detail, stage report, queued transforms, end confirmation), `run/SessionBar.tsx`, `RunBadge.tsx`, `dialogs/Dialogs.tsx`, `state/session.ts` (undo routing), `header/legend.ts`; the guide's "Transform cards…" section.

**4m: Playwright.** The harness's MUTATIONS gain the new messages and canned sessions; specs `s4-window`, `s4-session`, `s4-look`.

**4x (conditional).** Only if slice 3 moved "Claude may add cards" for Formalize here: 3c2 and 3e3 from slice 3's §3.10 (intermediate inferences, DO-0's card decline, the mask) and the ▾ item, sharing 4d/4e's `card` entry and `add_card`.

## 2. Contracts (integrator's; builders implement them as written)

### 2.1 Drafts and windows (core `transform/types.ts`, 4a)
```ts
/** `card:<id>` (an axiom or proposition of the subject), `vocab:<fully qualified Lean name>` (a vocabulary item of the
 *  subject), `new:<n>` (a card made in the window; n from `nextNew`, never reused in the draft). */
export type DraftKey = string;
/** CF-2's fields (TR-6). Kind, a new vocabulary card's Lean name and Proof are choosers, with no field state. */
export type DraftFieldName = 'sentence' | 'why' | 'stance' | 'source' | 'statement' | 'dependencies' | 'declaration' | 'gloss';
/** TR-4, for this transform only (D4-10): empty + not frozen = fuzzy; filled + not frozen = open; empty + frozen = kept empty. */
export interface DraftField<V> { value: V; frozen: boolean }
export type FieldState = 'frozen' | 'open' | 'fuzzy' | 'keep-empty';
export interface DraftDependencies { sources: DraftKey[]; fromNothing: boolean }
export interface DraftCard {
  key: DraftKey;
  kind?: NodeType;                 // AXIOM | PROPOSITION; absent for vocabulary; chosen, never fuzzy (TR-2, TR-11)
  leanName?: string;               // a new vocabulary card's short name, chosen at creation (TR-2)
  sentence?: DraftField<string>; why?: DraftField<string>;
  stance?: DraftField<Stance | null>; source?: DraftField<Evidential | null>;
  statement?: DraftField<string>;  // the statement's term: the body of `abbrev n : Prop := …`
  dependencies?: DraftField<DraftDependencies>;  // propositions; kept while Kind is AXIOM, so switching back restores it
  proof?: 'keep' | 'clear';        // only on a copied proposition with a proof or a pending claim (TR-4)
  declaration?: DraftField<string>; gloss?: DraftField<string>;   // vocabulary (CF-2)
  trashed: boolean;                // TR-3
}
/** TR-13, per dependent; "Delete it too" moves the dependent into the draft's trash instead (D4-21). */
export type DependentChoice = 'claude' | 'rewrite' | 'broken';
export interface TransformDraft {
  format: 'telelean-transform-draft'; version: 1;
  cards: DraftCard[]; nextNew: number;
  mayAddCards: boolean;            // TR-7 (a), default false
  instructions: string;            // TR-8; plain prose until slice 5
  dependents: Record<string, DependentChoice>;   // by card id or `vocab:<name>`
}
export type TransformOutcomeKind = 'start-session' | 'claude-step' | 'direct' | 'queue' | 'queue-claude' | 'nothing';
export interface TransformProblem { card?: DraftKey; field?: DraftFieldName | 'kind' | 'proof' | 'trash' | 'leanName'; text: string }
export interface TransformDependent {
  card?: string; vocab?: string;
  via: Array<{ kind: 'arrow' | 'proof' | 'statement' | 'definition' | 'reference'; of: DraftKey }>;
  frozen: FreezeReasonView[];      // its reasons but accepted ones (the Submit cascade handles those, D4-23)
  choices: DependentChoice[];      // §3.4; 'claude' only when `frozen` is empty
  target?: true;                   // a session target: its Result is reworked, no choice (D4-19)
}
export interface TransformAnalysis {
  changed: boolean; outcome: TransformOutcomeKind;
  reasons: string[];               // why Claude is needed (TR-15), from TRANSFORM_TEXTS.reasons
  problems: TransformProblem[];    // block Submit transform
  warnings: TransformProblem[];    // TR-13 b2, a trashed source, the touched and cascade previews
  dependents: TransformDependent[];
  kinds: Array<{ card: DraftKey; from: NodeType; to: NodeType; impact: KindChangeImpact;
    removed: { arrows: Array<ArrowEnds & { frozen: FreezeReasonView[] }>; mark?: { frozen: FreezeReasonView[] } } }>;   // TR-11, G6
  mustDefine: string[];            // TR-12 (c), from the scratch
  sessionNames: string[];          // names only the session's visible content defines (D4-6)
  touched: string[];               // session: item ids whose content the typed write replaces or removes
  cascade: string[];               // session: accepted item ids that would leave accepted (RV-5 b3; confirmed at Submit review)
  reworkResults: string[];         // session: targets whose Result is reworked in the same queue (D4-19)
  typedKeys: FreezeKey[];          // every target whose value the typed write changes, follow-on edits included (§3.11)
}
/** run.json `PersistedSession.transform.window` (4i); TransformWindowView (§2.4) is its view. */
export interface TransformWindowRecord {
  id: string;                      // RUN_TOKEN_PATTERN
  mode: 'start' | 'cards' | 'decline' | 'edit' | 'premise';
  subject: string;
  items: Array<{ item: string; rev: number }>;   // decline and premise windows
  edits?: string;                  // the queued transform an edit window replaces
  rev: number; draft: TransformDraft;
  original: TransformDraft;        // the copies at opening (TR-1): the host's, never the webview's (D4-1)
  provenance: Record<DraftKey, Partial<Record<DraftFieldName, { by: 'you' | 'claude'; item?: string }>>>;
  previous: Record<DraftKey, Partial<Record<DraftFieldName, string>>>;   // DO-2: B's version
  locked: Record<DraftKey, Partial<Record<DraftFieldName | 'kind' | 'proof' | 'trash', string>>>;   // §3.4's texts
  basis: { commit: string; viewVersion: number } | null;   // a stage's judged commit; null in a provisional session
  openedAt: string; openedAtAction: number;      // the stack's `nextAction` at opening (ES-3's freeze count)
}
export interface TypedScratchResult { problems: TransformProblem[]; unknown: Array<{ card: DraftKey; name: string }>; checked: string }
```
- **`draftFromModel(i: { model: ProjectModel; graph: TlGraph; subject: string; keys: string[]; mode; items?: readonly ItemRecord[]; drafts?: readonly ItemDraft[]; base?: ProjectModel; ledger?: readonly LedgerEntry[]; targets?: readonly string[] }) → { draft, original, provenance, previous, locked, left: Array<{ key: string; reason: string }> }`.** Exact copies (TR-1) from the view's model, masked while the results are hidden (RV-6). Starting states: your copied Sentence, Why, Stance and Source open; the Lean statement, Dependencies and a vocabulary declaration frozen (S11); a gloss open; an empty field kept empty; Proof `keep`; a value whose provenance is Claude's (the working copy differs from B and from every live typed unit) open, marked (D4-9); a Delete item's card in the trash; a statement that is not `abbrev n : Prop := ‹term›` locked ("Edit this statement in its file: it is not a plain abbrev."); a target's locks (§3.4). `left`: another subject's vocabulary ("Vocabulary of another subject can be frozen and referenced, but not transformed.", TR-10 c), a provisional card, a card the view does not show.
- **`typedLeanProblems(i: { field: 'statement' | 'declaration'; text: string; name?: string }) → string[]`** (TR-12 a, S10). A statement passes g0's single-term rule (`termProblems`, exported, with the statement wording). A declaration is exactly one declaration (`markup/decls.ts`) named `name`, with a keyword among `axiom def abbrev structure inductive class instance opaque` and no other command, in which `scanForbiddenText` finds nothing (`init` attributes and hygienic names included, AP30-1); an `axiom` passes the shape rule; never a theorem (TR-14); never a Prop axiom ("A Prop axiom here would be a belief no card holds: add an axiom card instead.", D2-40).

### 2.2 The review model (core `review/types.ts`, 4a; additive)
```ts
// ItemKind + 'typed'. Keys `typed:<card id>` and `typed:vocab:<lean name>` (keys.ts `typedKey`; card ids hold no ':').
// ItemMarker + 'typed-by-you' | 'replaced-by-transform'.   ItemRecord.accepted.how + 'yours' (RV-7 b5).
// DeclineOption 'transform': made only by `queue-transform`; `decide` with it is refused (§3.7).
// PremiseDraft + wordedBy?: 'user'   (a typed sentence, D4-14: its adoption writes no `worded_by: agent`).
/** What telelean wrote for you; `owner` is the typed item's key that owns it. */
export type TypedUnit = { owner: string } & (
  | { kind: 'line'; card: string; field: 'natural_name' | 'rationale' | 'stance' | 'source' | 'type' | 'lean' | 'follows_from' | 'worded_by'; value: string | null }
  | { kind: 'entry'; card: string; source: string; present: boolean }   // one `premises:` entry of `card`
  | { kind: 'decl'; name: string; text: string | null }                // a whole declaration, docstring included
  | { kind: 'block'; card: string; present: boolean }                   // a new block, or a trashed one
  | { kind: 'premise'; item: string; naturalName?: string; whyNeeded?: string; leanStatement?: string });   // D4-14
// LedgerEntry +
//   | { kind: 'typed'; transform: string; step: string; units: TypedUnit[];
//       ids: Record<string, string>;     // `new:<n>` → the id telelean gave it (TR-2 c)
//       touched: string[] }              // item keys whose content the units replace or remove (§3.10)
// Slice 3's ledger `card` + transform?: string; slot?: string; kind?: NodeType   (added by a transform step: an Add, no inference)
/** PersistedSession.transform (run.json v2, additive; absent = empty), and SessionRecords.transform. */
export interface SessionTransforms {
  window?: TransformWindowRecord;
  queued: QueuedTransform[];
  /** Carried out, for rework steps (§3.9). */
  done: Array<{ id: string; label: string; draft: TransformDraft; step: string }>;
  start?: { cards: string[]; vocab: string[] };   // a transform-started session's selection (ES-3)
  nextId: number;
}
export interface QueuedTransform {
  id: string; label: string; from: 'cards' | 'decline' | 'premise';
  items: Array<{ item: string; rev: number }>;   // its sources, declined `transform` while it is queued (D4-8)
  draft: TransformDraft; original: TransformDraft; keys: string[];
  provenance: TransformWindowRecord['provenance'];
  claude: boolean; reasons: string[]; mustDefine: string[];
  queuedAt: string; action: number;              // the SessionAction that queued it
  lastFailure?: string;                          // its last step did not pass (D4-4)
}
// StepScope + transform?: TransformScope. For a transform step, `target` is `transform:<id>`, `question` empty,
// `openProof` and `openArrows` false, `fuzzyStatements` empty, `openItems` the rework items (rework steps only).
export interface TransformScope {
  id: string; claude: boolean; rework?: true;
  open: FreezeKey[];               // the window's open and fuzzy fields, minus every key the session freezes (§3.9)
  arrowsInto: Array<{ card: string; remove: boolean }>;   // Dependencies open (remove: true) or fuzzy
  slots: Array<{ slot: string; kind: NodeType }>;          // D4-15
  mayAddCards: boolean;
  dependents: { statements: string[]; definitions: string[]; proofs: string[] };   // left to Claude (TR-13)
  mustDefine: string[]; instructions: string;
}
// SessionAction +
//   | { id: number; kind: 'transform'; op: 'queue' | 'replace' | 'drop'; label: string;
//       before: QueuedTransform | null; after: QueuedTransform | null;
//       changes: Array<{ item: string; rev: number; before: ItemState; after: ItemState }>; at: string }
// ReviewAction +
//   | { kind: 'queue-transform'; transform: QueuedTransform; replaces?: string; confirmed: boolean }
//   | { kind: 'drop-transform'; transform: string; confirmed: boolean }
// ReviewState + transforms: readonly QueuedTransform[];   ReviewOutcome (ok) + transforms: QueuedTransform[].
// SessionRecords.steps + kind 'transform', with transform: string and rework?: true.
// PersistedSession + claudeStarted?: boolean (D4-27); PersistedStep.kind + 'transform', with transform and rework?.
// runner llm/types.ts FinishStatus + 'done' | 'cannot' (transform steps only).
```

### 2.3 Freezes (core `freeze/types.ts`, 4a; additive)
```ts
// FreezeReason { kind: 'transform'; at } + transform: string; 'session-start' is now made (D3-1 made real, §3.11).
// SessionFreezes +
//   start.transform?: { cards: string[]; vocab: string[] }   // the window's opening selection; absent for Formalize starts
//   startCleared?: FreezeKey[]                               // session-start keys the person unfroze (one flag per key)
//   transform?: TransformFreeze[]
export interface TransformFreeze {
  target: FreezeTarget; transform: string; at: string;
  /** Pending during its queue: the typed unit's text only; set from the queue-end judgement (D4-23). */
  value: OwnValue | { pending: true; text: string };
}
// FreezeDelta's per-key value + startCleared?: boolean (an Unfreeze's Undo restores it).
// FreezeReasonView + { kind: 'session-start' } | { kind: 'transform'; transform: string }.
```

### 2.4 Views (core `review/view.ts`; types in 4a, built in 4f)
- `SessionPhase` + `'transform'`: a provisional session, stage 0, in which only the window, freeze actions and Exit act.
- `SessionView` + `transform: { window: TransformWindowView | null; queued: QueuedTransformView[]; start: { cards: number; vocab: number } | null }`; `transformCards: Gate` (opening a window from cards); `claudeStarted: boolean` (D4-27); `submit.work` + `transforms`, `claudeTransforms`.
- `TransformWindowView`: the record without `basis`, plus `items[].label`, `targets: string[]`, `sessionFrozen: Record<DraftKey, Partial<Record<DraftFieldName, FreezeReasonView[]>>>` (the session's reasons, on the view's model), `freezeActions` (freeze actions on the stack since `openedAtAction`), `submit: Gate`.
- `QueuedTransformView { id; label; from; items: string[]; cards: CardRef[]; claude: boolean; reasons: string[]; lastFailure?: string; edit: Gate; drop: Gate }`.
- `StepView.kind` and RunView's `step.kind` + `'transform'`, with `label` (the transform's) and `rework?: true`.
- `ItemDetailView` + `{ kind: 'typed'; card?: CardRef; vocab?: string; fields: FieldChangeView[]; created?: true; trashed?: true }`.
- `EndConfirmationView.typed: Array<{ item: string; card?: CardRef; vocab?: string; field: DraftFieldName | 'kind' | 'proof' | 'new' | 'deleted'; before?: string; after?: string }>` (EN-2 b2).
- `SessionFreezesView.mode` + `transform: boolean` (a session-start reason remains: the banner, D4-17); `start` + `transform?: { cards: number; others: number }`; `changes` leaves out keys whose only reasons are session-start (EN-2's one line).
- `ActionOutcome` (both branches) + `transform?: { window?: string; outcome?: TransformOutcomeKind; reasons?: string[]; mustDefine?: string[]; problems?: TransformProblem[]; dependents?: TransformDependent[]; cascade?: CascadeEntry[]; stale?: Array<{ transform: string; text: string }>; queued?: string; rev?: number }`.

### 2.5 Protocol (core `protocol.ts`; types and validators in 4a, routing in 4i)
Every message takes `requestId`, is answered by `actionResult`, is in `RUN_MESSAGE_TYPES` (the ES-9 lock never refuses it), and has a hand validator that returns a fresh object, drops unknown fields (`origin`, `provenance` and `consented` never survive, D4-1, D4-27) and refuses `__proto__` keys.

| Message | Payload | Validator rules |
|---|---|---|
| `openTransform` | `{ subject, from, runId?, stage? }`; `from` is `{ kind: 'cards'; cards; vocab }`, `{ kind: 'decline'; items: [{ item, rev }]; instructions? }` or `{ kind: 'edit'; transform }` | cards: 0–`LIMITS.transformCards` ids; vocab: 0–`transformCards` Lean names (`leanName()`); together ≥ 1, distinct; items: 1–`transformCards`, distinct, rev 0–`LIMITS.revision`; instructions ≤ `LIMITS.instructions`, may span lines; transform a token; `runId` and `stage` both or neither, and neither only with `cards` (the provisional start) |
| `saveTransformDraft` | `{ runId, window, rev, draft }` | window a token; rev 0–`LIMITS.revision`; `transformDraft()` |
| `submitTransform` | `{ runId, window, rev, draft, expect, confirmed? }` | as save; `expect` a `TransformOutcomeKind`; `confirmed` keeps only `outcome` and `cascade`, `true` |
| `cancelTransform` | `{ runId, window }` | tokens; a stage's window only (a provisional window's Cancel is `endSession exit`, D4-2) |
| `dropTransform` | `{ runId, stage, transform, confirmed? }` | token; `confirmed` a boolean |
| `submitReview` + | `confirmed?: { transforms: true }` | only that key |

`transformDraft()`: format and version exact; cards 1–`LIMITS.draftCards`, keys `card:‹id›`, `vocab:‹leanName›` or `new:‹0–9999›`, distinct; a `card:`/`vocab:` key not among the window's keys only when trashed ("Delete it too"); a vocabulary card (a `vocab:` key, or a `new:` key with `leanName` and no `kind`) has only `declaration`, `gloss`, `trashed` and, when new, `leanName` (a Lean identifier ≤ 200 characters); an axiom or proposition card has `kind` and only CF-2 fields; sentence, why and gloss one line ≤ `textLength`; stance and source their enums or null; statement and declaration ≤ `LIMITS.leanText`, may span lines, no NUL; dependencies' sources ≤ `listLength`, distinct, never the card itself, never with `fromNothing`; proof `keep` or `clear`; `nextNew` above every `new:` key; instructions ≤ `LIMITS.instructions`; dependents ≤ `listLength` entries, each a `DependentChoice`. LIMITS gain `transformCards: 50`, `draftCards: 60`, `leanText: 20_000`, `instructions: 4_000`, `transformsQueued: 50`. Host → webview: no new message; `session.transform` gets a light check when present (`queued` an array; `window` null or with `draft.cards` an array).

### 2.6 The board action (core `actions.ts`; types in 4a, planner in 4c)
- `BoardAction` + `{ kind: 'apply-transform'; subject: string; draft: TransformDraft; keys: string[]; label: string }`. `keys`: every `card:`/`vocab:` key of the draft, from which the planner recomputes `original` on the model it plans on. Only the host builds it, from the runner's answer (§3.6); it is ES-9-locked like every board action. `HistoryActionKind` + `'apply-transform'` ("Transform" in webview `labels.ts` and runner `workspace/history.ts`); its History label is "Transform: ‹label›".

### 2.7 RunManager (runner `run/types.ts`)
```ts
openTransform(r: { subject: string; from: OpenTransformFrom; runId?: string; stage?: number }): Promise<ActionOutcome>;
saveTransformDraft(runId: string, window: string, rev: number, draft: TransformDraft): Promise<ActionOutcome>;
submitTransform(runId: string, r: { window: string; rev: number; draft: TransformDraft; expect: TransformOutcomeKind;
  confirmed: { outcome?: true; cascade?: true }; consented: boolean }): Promise<ActionOutcome>;
cancelTransform(runId: string, window: string): Promise<ActionOutcome>;
dropTransform(runId: string, stage: number, transform: string, confirmed: boolean): Promise<ActionOutcome>;
// submit(runId, stage) + confirmed?: { transforms?: true }, consented?: boolean; formalize(r) and retry(runId) + consented?: boolean
```
- **When each resolves** (D2-74). `openTransform`, `saveTransformDraft`, `cancelTransform` and `dropTransform`: after their run.json write. `submitTransform`: after TR-12's scratch (§3.3; no step runs while a window is open, and Exit is not queued by the host), and then: `direct` once the provisional session has ended (the host then performs the board action, §3.6); `start-session` once stage 1 is recorded (its judge runs after, `judging`); `claude-step` once its step is working; `queue`, `queue-claude` and `nothing` after their write.
- A stale `rev` answers `conflict` ("The transform draft changed in another board: reloaded."); a stale `stage` gets slice 2's text.
- **TW-1** (D4-18). While `transform.window` is set, the runner refuses `decide`, `reveal`, `submit`, a mid-stage `formalize`, `retry`, `moveProposed`, `sessionDiff` with `confirmed`, a freeze action that changes an item's status, and `undoSession`/`redoSession` of anything but a freeze action, with "A transform window is open: finish or cancel it first." Other freeze actions, the window's own messages, `endSession exit` and looking stay.

### 2.8 Gate, tools and turns (core in 4e; runner in 4h)
- **`GateFindingCode` + `'transform'`**, token `no-proofs`: a transform step adds or changes no theorem and no `.holds`, but telelean's own (typed units, `proof-broken` removals). For Claude: "A transform step writes no proofs: remove ‹name›. Proofs come from Formalize for dependencies." Board: "Claude's transform step wrote a proof (‹name›), which a transform may not do."
- **Tools in a transform step**, each checked at once by core (a refusal is the tool result; none counts as a check):
  - `check_lean`, `ask_user`, `request_unfreeze` (slice 3);
  - `propose_arrow`: into `arrowsInto` cards and the step's new cards, from any axiom or proposition of the subject with a `.holds`; never into an axiom, a session target or a marked card, never a declined arrow, never a cycle;
  - `remove_arrow`: only into an `arrowsInto` card with `remove`, under slice 3's rules (unfrozen, unselected, unused by any proof);
  - `mark_proof_broken`: only `dependents.proofs`, under slice 3's rules;
  - `add_card { sentence, why, slot?, kind? }`: a slot (its kind fixed by it), or, with `mayAddCards`, at most 10 axiom or proposition cards;
  - `finish { status: 'done' | 'cannot', summary, gap? }`.
  - Not offered: `freeze_statements`, `propose_assumption`, `delete_card`.
  - Refusals (`CLAUDE_TRANSFORM_TEXTS`): "This transform's step may add arrows only into the cards whose Dependencies the person left open: ‹cards›." · "Mark a proof broken only where the person left that proof to you: ‹cards›." · "“‹slot›” is not a card the person left for you to make." · "You may add cards only when the person ticked “Claude may add cards”." · "‹tool› is not part of a transform step."
- **Turns.** First lines (FakeBackend scripts match them): `Step <i> of <n>: transform “<label>” (the person's transform)` or `Step <i> of <n>: rework your transform step for “<label>” after the review`. Then the window's cards, field by field with their states (frozen: "keep exactly: ‹value›"; fuzzy: "fill"; open: "you may change it if the transform needs it"), the trashed and new cards, the slots, `MUST DEFINE: ‹names› (the person's statement “‹text›” uses them)`, the instructions quoted, "You may add cards: yes/no", DEPENDENTS LEFT TO YOU, and slice 3's FROZEN BY THE PERSON and HELD sections. A transform-started session's context bundle starts `Run: "Transform cards" for the subject <S>`.
- **System prompt** (and `system-prompt-5.1.txt`), one paragraph: "In a transform step you carry out the person's transform: fill the fields marked fill, change open fields only if the transform needs it, define what MUST DEFINE names (vocabulary or definitions, never proofs), and fix or mark broken what the person left to you. Write no proofs and no theorem; never change a field the person typed, or a card's kind. If you cannot do all of it, finish with status cannot and say what is missing in gap."

### 2.9 Core functions (signatures; stubbed in 4a)
```ts
// 4b transform/analyse.ts
export interface AnalyseInput {
  draft: TransformDraft; original: TransformDraft; keys: string[]; subject: string;
  /** The view's model and graph: B in a provisional session; the stage judgement's, masked while the results are hidden. */
  model: ProjectModel; graph: TlGraph;
  context: 'start' | 'stage'; mode: TransformWindowRecord['mode'];
  frozen: Readonly<Record<FreezeKey, readonly FreezeReasonView[]>>;   // the view's reasons
  scratch?: TypedScratchResult;    // TR-12 (b); absent in the webview's preview
  session?: { records: SessionRecords; drafts: readonly ItemDraft[]; deps: Readonly<Record<string, readonly string[]>>;
    targets: readonly string[]; base: ProjectModel; resultsShown: boolean };
}
export function analyseTransform(i: AnalyseInput): TransformAnalysis;
export function transformLabel(draft: TransformDraft, graph: Pick<TlGraph, 'nodes' | 'vocabulary'>): string;
// 4c transform/plan.ts
export interface TypedWritePlan { changes: FileChange[]; units: TypedUnit[]; ids: Record<string, string>;
  archive: ArchivedDecl[]; touched: string[]; problems: string[] }
export function planTypedWrite(model: ProjectModel, i: { draft: TransformDraft; original: TransformDraft; subject: string;
  mode: 'direct' | 'session'; today: string; reserved: ReadonlySet<string>;
  session?: { drafts: readonly ItemDraft[]; ledger: readonly LedgerEntry[]; run: string } }): TypedWritePlan;
// 4e transform/scope.ts
export function transformScopeOf(t: QueuedTransform, a: TransformAnalysis, sessionFrozen: ReadonlySet<FreezeKey>): TransformScope;
```
Extended, not new: `computeItems`, `classify`, `itemDeps`, `resultsState`, `reconcile`, `planItemRevert`, `applyBackstop`, `judgeState`, `proposeArrowProblems`, `effectiveFreezes`, `frozenFindings`, `planFreeze` (phase `transform`; session-start reasons), `buildFreezesView`, `frozenChangesOf`, `reduceReview`, `planGroupDecline`, `planSubmit`, `formalizeStartProblems`, `buildSessionView`, and slice 3's tool validators (each a transform branch, §2.8).

## 3. Design

### 3.1 The provisional session (ES-3, INITIATING 2, EDIT SESSIONS 1; D4-2)
- **Opening.** "Transform cards…" with no session posts `openTransform { subject, from: cards }`: Current view; at least one card or vocabulary item of the board's subject; no provisional card. The host applies first the board edits that reached it (slice 1e's order), refuses while any run of the folder is active (`busyRefusal`), then calls the runner. The runner makes, in its first run.json write:
  - the run, its shadow and its `base` commit;
  - the session at phase `transform`, stage 0, with slice 3's freeze snapshot and `start.transform` = the selection (§3.11);
  - the window record, from `draftFromModel` on the board's model (= B).

  RunState is `review`, so `runLocksBoard` locks every board of the folder (ES-9). No consent, no Claude, no Lean.
- **In phase `transform`** the runner reads B as the board's ProjectModel and facts (ModelWorkspace, whose files equal the base commit; drift refuses Submit), so nothing is built. Freeze actions work (FZ-9), with values `{ from: 'base' }`, since the working copy is B.
- **Submit transform** (outcome by §3.2):
  - `start-session` (nothing changed, nothing for Claude: TR-1): one write closes the window and opens stage 1, empty and `judging` (the view shows B until then); then `checkBase` and a judge of the head (= B) publish its judgement. Formalize can run from it.
  - `claude-step` (TR-15): the host asks the egress consent (once per root, as today) and passes `consented: true`. The runner runs preflight, the backend and `checkBase` ("Your files must build first: ‹errors›"; the window stays), opens the conversation, and makes one `queue-start` write with the transform as its only step (§3.9). Stage 1 opens when it ends.
  - `direct` (changed, nothing for Claude): §3.6.
- **Cancel is Exit** (EN-2's exception). `endSession exit` is sent at once when no freeze action was made since the window opened; otherwise slice 3's Exit dialog opens, led by "Cancel the transform? The edit session it started ends; your files are not changed. Your ‹n› freeze changes in this session are dropped, except those you keep." A provisional session that ends writes no attempt record and is dismissed (no ended-run line).
- **Reload** (ES-6): the window comes back from run.json (§5.3).

### 3.2 Field states, changes, the outcome and the problems (TR-1, TR-4, TR-5, TR-15)
- **States are the transform's own** (D4-10). Typing a non-empty value sets `frozen` (TR-5); emptying a field makes it fuzzy; the state chip sets open, fuzzy, frozen or kept empty. A field the session freezes (any reason: `sessionFrozen`) is frozen for Claude whatever its chip. The window's Context Menu Freeze and Unfreeze are real session freeze actions (§4.2).
- **Changed** (TR-1 b): a field value that differs from `original` (Dependencies compared entry by entry), a new or trashed card, a Kind change, a cleared proof. State changes alone never count.
- **Needs Claude** (TR-15), any of: a fuzzy field (a slot included); instructions not blank; "Claude may add cards"; an open Lean statement on a card whose sentence changed; a typed statement naming something not defined (`mustDefine`); a dependent left to Claude. Each gives a reason (`TRANSFORM_TEXTS.reasons`).
- **Outcome.** Start context: needs Claude → `claude-step`; else changed → `direct`; else `start-session`. Stage context: needs Claude → `queue-claude`; else changed → `queue`; else `nothing` (the window closes; a decline window's items stay in review, TR-9 b). A premise window never needs Claude: fuzzy fields, instructions and the tick are refused there (D4-14).
- **Problems** block Submit:
  - every TR-12 (a) failure; a cycle over drawn, solid and draft arrows (AR-3);
  - a dependent with no choice; a frozen dependent (§3.4); a fuzzy field the session freezes: "You asked Claude to fill it, but it is frozen in this session (‹reasons›): unfreeze it, or type it.";
  - a new vocabulary name that is not an identifier or clashes; a frozen empty sentence on a card that is not new;
  - a new card with a typed field but a fuzzy sentence: "Type the sentence of a new card whose other fields you fill, or clear them to let Claude make the whole card." (D4-15); a typed arrow from or into a slot;
  - a changed Lean statement on a card whose proof is kept: "“‹c›”'s proof proves its old statement: clear it (prove it again with Formalize for dependencies)." with [Clear the proof] (D4-20);
  - §3.4's refusals for kinds and session targets.

### 3.3 TR-12: typed Lean (D4-6, D4-7)
- **(a)** `typedLeanProblems` runs live in the window, at Submit, and again in `planTypedWrite` and in the direct planner (fail closed).
- **(b)** At Submit transform the runner calls `ModelWorkspace.checkTypedLean` (4g): one `lake env lean --stdin --json` at the model root, under the refresh's sandbox, `runExclusive` and the memory guard.
  - It is refused while the board's facts are stale ("Wait for the Lean check of your files, then submit.") or the files differ from the base ("Your files changed since the session started: they must match it again before telelean checks your Lean.").
  - The source: the library's imports; `set_option autoImplicit false` and `set_option relaxedAutoImplicit false`; `namespace ‹S›.telelean_typed`; the typed vocabulary declarations in draft order; each typed statement as `abbrev ‹its statement's short name› : Prop := ‹text›`, ordered by mentions (a cycle is a problem); `end`. So the transform's own names shadow your files' inside the namespace.
  - Messages are attributed by line. An "unknown identifier" or "unknown constant" in a statement goes to `unknown`; any other error is a problem on its field. A typed vocabulary declaration must elaborate (D4-6).
- **(c)** An unknown name that the session's visible content defines (the view's vocabulary and card statements: `sessionNames`) is fine, and its use is checked when the transform is carried out (D4-6). The others are `mustDefine`, shown as "Claude must define: ‹names›", and make the transform need Claude. telelean still writes the statement itself; Claude defines the names (D4-7).

### 3.4 TR-13, TR-11 and session targets (D4-13, D4-19, D4-20, D4-21)
- **Dependents** of each trashed or changed card or declaration, cleared proof and removed arrow, from the view's facts (masked while the results are hidden, RV-6 b4), inside the window or outside it:
  - **proof:** a card whose proof uses a removed or changed `.holds` (`usersOf`, `axiomListUsers`, transitively through the proofs that go too) or a changed declaration (`uses` reach), or uses a removed arrow's source (direct(v));
  - **statement / definition:** a card statement or vocabulary declaration whose meaning closure reaches a changed or removed declaration (slice 2's `reach`);
  - **arrow:** arrows out of a trashed card, removed with it as follow-on edits (TR-15); listed, with no choice, unless a proof uses one (that proof is then a proof dependent);
  - **reference:** none until slice 5 (§3.12).
- **Choices.**
  - "Delete it too" moves the dependent into the window's trash; its own dependents join the list.
  - `claude` only when the dependent has no reason but accepted ones (accepted items leave accepted through the Submit cascade, §3.8). A proof left to Claude becomes a Proof broken item, since Claude writes no proofs (TR-14 b).
  - `rewrite` (D-11, only for a P→A of a conditional proof) and `broken` (today's Delete anyway) only with a `direct` outcome. With them the outcome cannot need Claude: "With Claude's step nothing is left broken: choose Delete it too or Leave it to Claude for “‹c›”."
  - A dependent frozen by any other reason is a problem: "“‹c›” relies on ‹x› and is frozen (‹reasons›): unfreeze it to leave it to Claude, or delete it too.", with [Unfreeze them] (slice 3's action on those cards).
- **TR-13 b2.** A changed sentence whose Lean statement stays unchanged and frozen is a warning: "You changed the sentence of “‹c›”, but its Lean statement stays as it was: the two may disagree. Unfreeze its Lean statement to let Claude reformalise it, or clear it." Its typed item gets c3.
- **TR-11 with G6.** Each Kind change shows `kindChangeImpact` on the view's graph, with the incoming arrows and the mark it removes named by their source's sentence, each frozen one with its reasons. A→P keeps the axiom as pending (AR-6, with its glow-loss sentence); P→A removes the incoming arrows and the mark and replaces the proof by `axiom n.holds` (AR-7). In a session, a P→A whose conditional proof has dependents is refused: "Move it to axioms after the session: telelean would have to rewrite proofs that use it." (D4-13).
- **Session targets** (cards with a Result in the session; D4-19):
  - Kind, Dependencies and Proof are locked: "“‹T›” is a target of this session: its arrows are its question, and its proof is its Result's.";
  - trashing one, or a card with an arrow into one (the trash would change that target's question or Dependencies), is refused: "“‹c›” has an arrow into “‹T›”, a target of this session: trash it after the session.";
  - its statement may change only when B has no proof of it; its Result is then reworked in the same queue (`reworkResults`);
  - a change to anything B's proof of a target uses is refused: "“‹T›”'s proof in your files uses ‹x›: change ‹x› after the session.";
  - a target whose current proof (its Result's content) uses what changes joins `reworkResults` too, computed once the results are shown (Submit review).

### 3.5 The typed write (`planTypedWrite`, 4c)
One composition on EditSession, in this order. Each piece is recorded as a TypedUnit with the exact value written; `owner` is `typed:<card>` or `typed:vocab:<name>`, and the follow-on removal of a trashed card's arrows is owned by that card's typed item.
1. **New cards** (not slots): a block in the subject's Inbox module as `add-node` writes it, with an explicit id from `newCardId` (`deriveId`; taken: B, the working copy, the ledger's cards, the ids the freeze records name (D3-54) and the draft's other ids; TR-2 c), the typed fields, and no `worded_by`. A typed statement goes in an abbrev after the block, with its `lean:` pin, plus `axiom n.holds : n` for an AXIOM.
2. **Vocabulary:** a new declaration at the end of the subject's vocabulary module namespace, in draft order; a changed one by `replace-decl`; a gloss by `set-docstring`.
3. **Field lines** by `setField`: sentence, Why, stance, source. A typed sentence on a `worded_by: agent` block drops that line (CF-6, G5). It updates the statement's D-9 mirror only when the docstring equals the old sentence and the declaration holds no Claude content (D4-29).
4. **Statements of existing cards:** `replace-decl` of the abbrev, its docstring kept; or, for a card without one, an insert with its pin (and a `.holds` axiom for an AXIOM).
5. **Kinds:** P→A through `planKind` (`holds-theorem-to-axiom` or `add-holds-axiom`; the incoming entries and the mark removed); A→P sets `type:` and keeps the axiom as pending.
6. **Dependencies:** `premises:` entries added and removed per the draft's diff; the mark set or removed (never together with entries, B.6).
7. **Cleared proofs:** `remove-holds`, archived in direct mode: unproved, never pending (TR-4).
8. **Trash** (TR-3 b): `delete-node`'s pieces (the block, its statement, its `.holds`, archived in direct mode, and the entries naming it in other cards' `premises:`), or `remove-decl` for a vocabulary card.
- It never edits a line or declaration that holds Claude content, except to replace it whole (D4-29). `touched` lists the items whose content a unit replaces or removes (session mode). Slots and the `dependents` choices are not written. Any `problems` (a LeanOp that could not apply, a cycle) refuse the whole plan.

### 3.6 The direct path (ES-3, TR-15 outside a session; D4-3, D4-16)
1. In phase `transform`, `submitTransform` with outcome `direct` runs the analysis and TR-12 (b) on B, then a dry run of `planAction(apply-transform)` on the board's model (pure). Any problem refuses, and the provisional session stays. Drift refuses: "Your files changed since you opened the window: Cancel, then open it again."
2. The runner ends the provisional session (discarded, dismissed, no attempt record) and answers `{ ok: true, transform: { outcome: 'direct' } }` with the board action.
3. The host performs `apply-transform` first in its board queue: one history entry "Transform: ‹label›", one board Undo step, `graph` and `workspace` posted before `actionResult`. If it is refused (a hand edit in that instant), nothing is written, and the toast reads "Your transform was not applied: ‹reason›. Its window is closed." (D4-3's residual).
- **`planAction(apply-transform)`** (`edit/planTransform.ts`):
  - recomputes `original` with `draftFromModel(model, keys)`, and refuses `invalid` on any problem of `analyseTransform` (context `start`, outcome `direct`) or when `reasons` is not empty ("This transform needs Claude: submit it from the window.");
  - then `planTypedWrite` in direct mode, plus D-11's rewrite for dependents marked `rewrite`, and nothing for `broken` (left as they are, as Delete anyway leaves them);
  - D3-44's standing freezes for the typed fields of existing cards and vocabulary (sentence, Why, stance, source, statement, declaration, gloss), each storing its cards' sentences, with the derived `id:` of each card it freezes written first (D3-16, D3-54; D4-16);
  - A6's drops for trashed cards and removed arrows and marks; the stored positions of trashed cards dropped (new propositions are placed by the board);
  - its label.

### 3.7 Windows in a stage (RV-9, ES-9 b3, DO-2, RV-8, RV-10; D4-8, D4-14, D4-18)
- **Opening** (`openTransform { runId, stage, from }`): in phase `stage` only, from the Proposed view or the review list. It is refused while a step runs or is queued (D2-62's text), while judging ("Re-checking the working copy: transform in a moment."), while another window is open, in confirming ("Back to review first."), from the Current view ("During an edit session, Transform cards… works on the Proposed view: switch to Proposed."), and for a card that a queued transform holds ("“‹c›” is in the queued transform “‹label›”: edit that one instead."). The window record (a records-only write) copies the stage judgement's state, masked while the results are hidden; `basis` is the judged commit and `viewVersion`.
- **Decline → Transform** (DO-2), from the detail's Decline ▾, the D menu's T, a group's Decline… and the Context Menu's review-item entry.
  - Items that take it: Formalize, Change, Add, Delete, Vocabulary term, Declaration, typed, and an Add premise on its own (D4-14, D4-26).
  - A group takes the items that fit and names the others with their reasons: arrow items and Results ("Transform applies to cards: decline arrows and results on their own."); Proof broken ("A transform writes no proofs: accept it, or reject it."); a premise in a group ("Transform a suggested premise on its own."). A hidden Result's part is never listed.
  - The window shows each item's card as in the working copy, with "Previous version" (B's) beside it; a Delete item's card starts in the trash; Claude's values start open, marked "Claude's proposal" (D4-9).
- **Ask me instead** (RV-10 b2): a decline window on the row's items that take Transform, with the instructions "Ask me about: ‹choice›" prefilled. When none takes it, D2-13's Shaky decline stays (D4-26).
- **A premise window** (D4-14) edits only the premise card's sentence, Why and Lean statement; its target is shown read-only. It never needs Claude. At Submit review a no-Claude transform step carries it out: its `premise` unit rewrites the draft in the session's records (a typed sentence sets `wordedBy: 'user'`). The queue-end judge checks it again (slice 2 §3.8: one that no longer closes the gap is to be redone), and it returns to review "updated". Its Accept still asks how you hold it.
- **Submit transform** recomputes the analysis on the stage judgement's state, with TR-12 (b), then sends `queue-transform` through the reducer: one session step, "Queue transform: ‹label›" (an edit window's is `replace`, "Edit transform: ‹label›").
  - The window closes and the transform is queued.
  - A decline window's items become declined `transform`, Shaky-like: their content stays; their dependents in review become to be redone, not reverted; accepted dependents need RV-5's confirmation first.
  - An outcome that differs from `expect` answers `needs-confirmation` with it (usually TR-12 (c)'s names). `nothing` closes the window and changes nothing.
- **While queued:**
  - a source item's status changes only by dropping or editing its transform: "It is part of a queued transform: drop the transform to bring back its ‹n› items.";
  - `decide` with option `transform` is refused: "Decline with Transform opens the transform window.";
  - a mid-stage Formalize refuses a target with a Transform-declined item, as for Shaky (RV-9 b1, D2-53): "“‹T›” has a transform waiting for Submit review: formalize it after."; slice 3's whole-model limits keep content declined Transform fixed.
- **Drop** (`drop-transform`, "Drop transform: ‹label›"): its sources return to review, as a Shaky item does. **Edit…** reopens it (`edit` mode); Cancel leaves it queued. **Cancel** of a stage window changes nothing (TR-9 b).

### 3.8 Submit review with transforms (RV-12, RV-5 b3, D2-57, D3-49; D4-5, D4-30)
1. **Gates:** slice 2's (nothing in review, the results shown, no step, not judging), plus no window open.
2. **Each queued transform is analysed again**, on the real state (the results are shown). It is **stale** (`transform.stale`, D4-30) when:
   - a card it names is gone, a copied value in the working copy differs from its `original`, or a problem appears;
   - a dependent needing a choice, or its needs-Claude reasons, changed;
   - a target in `reworkResults` has its Proof frozen by a reason other than accepted ("“‹T›”'s proof is frozen and uses ‹x›: unfreeze it, or drop the transform.").

   Text: "“‹label›” needs a new look: open it with Edit…". New targets in `reworkResults` need no choice.
3. **Cascade** (RV-5 b3): the accepted items each transform touches; the accepted items whose `frozen.held` has a key whose value it changes or removes; the accepted Results in `reworkResults`; and their accepted RV-5 dependents. When it is not empty and `confirmed.transforms` is absent, the answer is `needs-confirmation`, "These accepted items return to review, because your transforms change what they rest on: …" (slice 2's dialog). Cancelling leaves everything queued.
4. **`planSubmit`** gains `transformSteps: Array<{ transform: string; rework: boolean; claude: boolean }>`, in this order: each queued transform; then one rework step per carried-out transform whose steps made Shaky or to-be-redone items (D4-24); then slice 2's Submit steps, with the inferences of `reworkResults` among the affected ones. The take-out (D2-57) also takes out `reworkResults` (to be redone, reverted), under D3-49's keep set (the `transform` and `session-start` reasons count as frozen).
5. **Writes:** one write sets the cascade in review and clears its `frozen` (R2-4); then `submit-take-out`; then `queue-start` with its seal (D4-5). Even a queue of no-Claude transforms seals and ends in stage + 1, never in confirming.
6. **Consent:** in a session whose conversation has not started (`claudeStarted` false) and whose queue has a Claude step, the host asks the egress consent first; the runner opens the conversation, with the context bundle, before that step (D4-27).

### 3.9 The transform step (runner `run/step.ts`; core judge; D4-4, D4-7, D4-25)
1. **Start:** commit `step-start` (S₀, the judged head), with the StepScope from `transformScopeOf` (`open` minus every key the session freezes, so a freeze wins).
2. **Typed write:** one run.json write with the ledger `typed` entry (`planTypedWrite` in session mode on the head's model) and the transform's `TransformFreeze`s (pending, §3.11); then the files into ws/, and commit `typed` (a new shadow kind). A rework step skips this.
3. **No Claude:** the `typed` commit is judged once (`engine.check`, purpose `gate-other`, with the transform scope). With no step finding the step ends `passed`; otherwise it fails: "Your transform “‹label›” could not be carried out: ‹findings›."
4. **Claude:** the turn (§2.8). Claude works from the `typed` commit with the transform's tools; normalise pins the fuzzy statements of `open` (as slice 2 pins `fuzzyStatements`), writes the step's ledger arrows and `card` blocks, and writes `worded_by: agent` for a sentence Claude changed. Gate attempts (`gate-other`: no target, no comparator; up to 3) judge every rule of slices 2 and 3 with the transform scope:
   - **step limits** against S₀: every declaration and block line keeps its text and meaning, except the step's own typed units, the `open` fields, the statements and definitions of `dependents` left to Claude, `mark_proof_broken`'s removals, new declarations (vocabulary, definitions and instances: items like any) and the cards `add_card` made;
   - **frozen and held** (slice 3); a key that has a `TransformFreeze` of the running step's transform is compared with that value only (its text while pending), never excused by S₀'s value (the two-value rule's S₀ is before the typed write);
   - **G5:** Claude changes no `type:`, `follows_from:`, `premises:` (telelean's ledger writes) or `worded_by` (normalise's, CF-6);
   - **B.3** with §2.8's arrows; **B.4** (no `.holds` changes kind but by a typed unit); **new-axiom** (D2-40 included); **`transform` (`no-proofs`)**; **stray-command**; **`rejected-repeat`**, with DO-3's identical set per transform in a rework step;
   - every inference is judged, and other inferences' findings never count against Claude (RV-11).

   `finish` says `done` or `cannot`; `cannot` passes when the gate passes, and its gap is reported (A3). The state must build: whatever the transform broke is fixed, marked broken or deleted (TR-13: nothing is left broken).
5. **All or nothing** (D4-4). A step that fails, gives up, is cancelled or hits a cap goes back to `step-start`, with its ledger entries and `TransformFreeze`s dropped. Its transform stays queued, with `lastFailure`. Retry step runs it again, with a new typed write; a failure ends the queue as slice 2 says (the rest not run).
6. **Step end:** ledger `created` (phase `statements`: a transform step has no freeze_statements, so nothing it makes is ever a Result's part) and slice 3's `changed` entries; the transform moves from `queued` to `done`.
7. **Rework step** (D4-24): the done transform's scope with `rework: true`, `openItems` = its Shaky and to-be-redone items, and no typed write; its feedback turn is slice 2's for those items; D2-15 holds (D4-12).

### 3.10 Ownership, typed items and the queue end (4d; D4-1, D4-22)
- **`computeItems`.** A difference B→W is owned by a typed item when the newest live typed unit covering it has exactly W's value: a block line, a `premises:` entry, a whole declaration, or a block (a new one: all its lines and bound declarations; a trashed one: its absence). Live means in a `typed` entry that no rollback dropped; a later entry supersedes an earlier one unit by unit. Every other difference keeps the rules of slices 2–3. So typed and Claude content of one card are owned field by field, and a value Claude writes is never yours unless you typed exactly it.
- **Typed items** (`typed:<card>`, `typed:vocab:<name>`):
  - classes for the badges only: never an own Accept (RV-7 b5), untouched by D2-23, exempt from the backstop's `own-accept` and `class`;
  - never meaning items for the reveal: you typed their content, and they cannot mention proof material (`other-result`);
  - RV-5 edges as for any item;
  - decline options Reject (B's version of their units back, through `planItemRevert`) and Transform; no Shaky ("Claude may not rework what you typed.");
  - a cascade that takes one out makes it withdrawn, never to be redone; un-reject of what took it out brings it back in review.
- **The queue end** (`reconcile` with `queueSteps`):
  1. `heldAtJudge` for every draft (slice 3). Then each typed draft of this queue's typed entries is created or updated, and **accepted as yours** (`how: 'yours'`, `frozen` from its `heldAtJudge`) when each RV-5 dependency outside the typed set is accepted, as a fixpoint over the queue's typed drafts; a dependency the results hide counts as not accepted (slice 2's "waits for the results to be shown"), so the outcome never reads a hidden status. Otherwise it is in review, marked `typed-by-you`, and takes a plain Accept.
  2. Each passed transform's sources return to review, "updated" when their key changed (slice 2's F5 rule, generalised); withdrawn, `replaced-by-transform`, when no draft is left. A trashed Add of Claude's is declined (Reject), so it is never proposed again.
  3. A record named in a typed entry's `touched` that has no draft is withdrawn, `replaced-by-transform` (not slice 2's "disappeared" problem); one with a changed key follows slice 2's rule ("updated").
  4. Pending `TransformFreeze`s take their values from this judgement, and the judge-apply runs `frozenFindings` again after setting them (slice 3 §3.5).
- **`planItemRevert`** of a typed item restores B's version of exactly its units' lines, entries, declarations and blocks.
- **Backstop:** typed ownership is re-derived from B, F and the live ledger; a typed item must be accepted, with its key on F equal to its accepted key; `type:`, `follows_from:` and `worded_by` changes, a `.holds` theorem→axiom, an AXIOM card's new `.holds`, and arrows pass only with their typed unit.

### 3.11 Freezes (4e; D3-1, D4-10, D4-17, D4-23)
- **Session-start** (FZ-7 r2; D3-1 made real). In a session with `start.transform`, `effectiveFreezes` gives every card and vocabulary item of the subject outside the selection a `session-start` entry, whole (every field, its Dependencies and its mark), expected at B, except the keys in `startCleared`. Cards created later are not covered.
  - Unfreeze (of one key, or "Unfreeze all other cards", which counts them with the standing ones) adds the keys to `startCleared` in its freeze delta; Undo restores them.
  - They end with the session (FZ-8), with no keep rows. EN-2's line reads "Started with Transform cards…: the other ‹N› cards of ‹subject›, frozen for this session, return to how they were." The banner "Everything except the selected cards is frozen" shows while one remains (FZ-11 5a).
- **Transform** (FZ-7 r4, TR-5). Each of `typedKeys` gets a `TransformFreeze` with the typed write. While pending it compares the unit's text; from the queue end, its full value (text, meaningKey, held map). It ends only by Unfreeze or the session's end (rows "frozen: you typed it", with keep ticks at Apply).
- **Revalue** (FZ-3 2e). A key with a `TransformFreeze` expects the transform's value for every other reason but accepted ones (standing, foreign, session-start, own), so your change becomes the frozen value. Accepted items your change touches leave accepted through the Submit cascade (§3.8), which clears their `frozen`. The holders of a declaration you change are TR-13 dependents (§3.4): accepted ones cascade, the others must be unfrozen or deleted, so no held value needs revaluing.
- **Views:** the reasons `session-start` ("frozen: the session started with Transform cards…") and `transform` ("frozen: you typed it"); `mode.transform` for the banner.
- **In the window**, the state chips are the transform's limits and never session freezes; its Context Menu actions are slice 3's freeze actions on the session (FZ-9; D4-10).

### 3.12 Hooks for slice 5 (references; D4-28)
Slice 5 (planned after this one, its D5-1 agreeing) changes these places, so each stays one call that it can replace:
- **new card ids:** one helper in `planTypedWrite`, `newCardId(sentence, reserved)` (`deriveId` with the reserved set, TR-2 c), for both paths and for `add_card`'s ids; slice 5's allocator replaces it (RF-2 b);
- **the D-9 mirror** of a typed sentence: one helper in `planTypedWrite` step 3; **prose problems** of a typed sentence or Why: one function, `proseProblems(field, text)`, empty in slice 4 beyond the validator's rules;
- **dependents:** `analyseTransform`'s one walk, whose `reference` via stays empty until slice 5 (RF-5 b); there "rewrite" will mean slice 5's `detachRefs`. Slice 4 revalues no held value (D4-21: holders are unfrozen, deleted or cascaded), so a frozen card whose reference holds a field a transform changes is simply one more dependent; the Submit cascade reads `frozen.held` by key, so field keys join it unchanged;
- **the person's texts:** the ledger `typed` units, with exact values, which slice 5's `reference` rule counts as the person's (Claude adds no reference);
- **inputs:** Instructions and the window's sentences and Whys are plain prose fields (`common/ProseField`), which slice 5 replaces by its `#` input; Lean fields never open a dropdown (RF-3); Dependencies use one sentence matcher (`model/cardSearch.ts`, behind `common/CardSearch` and `CardChip`; ★D6), which slice 5's `#` dropdown extends.

## 4. The UI (webview; 4j–4l)

### 4.1 Principles
- The host owns everything durable: the window record, the queue, provenance, outcomes and problems. The webview owns the live draft between autosaves, and previews with the same core functions (`analyseTransform` without the scratch, `typedLeanProblems`, `transformLabel`), which decide only enablement and texts (slice 2 §5.1).
- Provenance is the host's (D4-1): a field equal to its original keeps the original's owner; the webview's marks are display only.
- One window per session; it is modal (D4-18).

### 4.2 The window (`transform/TransformWindow.tsx`; D4-18)
- A native modal `<dialog>` (common/Modal) over the board area (16 px inset; one column below 720 px), with `data-undo-scope="session"`. Its title: "Transform cards", "Decline with Transform: ‹labels›", "Edit transform: ‹label›" or "Transform the suggested premise". Popover gains `container`, so menus and searches render inside the dialog; the window has its own Toasts. Esc closes a menu, then clears the window's selection; it never closes the window.
- Its rows, top to bottom:
  1. the title;
  2. the banner: in a transform-started session "Everything except the selected cards is frozen", with the counts; in a stage "Claude may change only the open and fuzzy fields here and what you leave to it, and add vocabulary" (+ "and cards" when ticked);
  3. the window's own Context Menu row: the selection summary; Freeze, Unfreeze, Freeze all other cards and Unfreeze all other cards as slice 3's session actions, with their dialogs, each disabled with its reason; Move to trash and Restore. A right click opens the same at the cursor (CM-7);
  4. the draft area in three groups (Axioms, Propositions, Vocabulary), with [+ New card ▾] (Axiom, Proposition, or Vocabulary… with its Lean name, checked live), and the Trash column: "Trash: deleted when the result is applied", drag in and out with pragmatic-dnd, Restore, Delete on a focused card; no "delete permanently" (TR-3 c);
  5. options: ☐ "Claude may add cards" with its hint ("New axiom or proposition cards to fill gaps. Off: Claude sticks to the cards here. New plain vocabulary is always allowed. Everything comes back for review."), and "Instructions for Claude (optional)";
  6. ImpactPanel "Before you submit": the dependents with their choices and "Set all to …"; the sentence/Lean warnings with [Unfreeze its Lean statement] [Clear it]; kind changes; cycles; typed-Lean problems (live, then the host's); "Claude must define: …"; the touched and cascade previews;
  7. the OutcomeLine, then [Cancel] [Submit transform]. Submit is disabled while a problem exists or a save is in flight.

### 4.3 A draft card (`DraftCardEditor`, `DraftFieldRow`)
- **Header:** the kind glyph and the Kind control [Axiom | Proposition] (no state; locked on a target), or "Vocabulary · ‹name›"; a provenance badge ("copy of your card", "Claude's proposal: ‹item›", "new"); Move to trash; KindImpact under it when Kind changed (G6's list, the frozen ones with a lock).
- **One row per CF-2 field of its kind** (TR-6):
  - its label, and FieldLock (slice 3's: the session's lock and reasons; a click selects the field);
  - its state chip: **frozen** ("frozen: you typed it" or "frozen for this transform"); **kept empty** ("— kept empty"); **open** ("open: Claude may change it"); **fuzzy** (codicon-sparkle, "Claude fills this"; never italic, dashed or translucent, TR-4);
  - an unchanged value of Claude's shows in AgentText, with "Claude's proposal";
  - its editor: one-line inputs for Sentence, Why and gloss; ChipChoice for stance and source; LeanField (monospace, live `typedLeanProblems`, no `#` dropdown) for statement and declaration; DependenciesEditor; ProofChoice [Keep] [Clear] ("Clear: deletes the proof; the card becomes unproved (never pending)."), locked on a target.
- A decline window adds PreviousVersion beside each card, read-only, with "Use this" per field, which types it.

### 4.4 DependenciesEditor (TR-4, AR-4; D4-28)
- Each source is a CardChip (glyph and sentence) with ×. [+ Arrow from…] opens CardSearch over this subject's axioms and propositions and the window's other cards: word-prefix matches first, then substrings, case folded; never the card itself, a trashed card or a slot; a source that would close a cycle is shown disabled, with the cycle named (AR-3).
- "Follows from nothing" is offered only with no sources (AR-5). Clearing the list makes the field fuzzy ("Claude proposes what it follows from"). The field is struck through while Kind is Axiom.

### 4.5 Entry points and the session (4l)
- **Context Menu:** the labelled "Transform cards…" beside Formalize (CM-3 b1b), and the right-click entry on cards and vocabulary cards. `transformCardsState` applies to the part of a mixed selection it fits and says so ("Transform 2 of 3 selected…", G12). It is disabled, with its reason, during a session on another subject (RunElsewhere), while a start is on its way, on the Current view during a session, when `session.transformCards` is closed, and while a window is open.
- **The review UI:**
  - Decline's Transform follows ItemView's options (D2-14's disabled entry goes); T in the D menu; the group's left list; Ask me instead;
  - a "Queued transforms (N)" section: label, cards, "needs Claude: ‹reasons›" or "telelean carries it out", `lastFailure`, [Edit…] [Drop];
  - a Transform-declined item reads "✗ Declined (Transform) · queued: ‹label›", with Back to review disabled;
  - the `typed-by-you` marker ("you typed it: accept it once the ‹n› items it uses are accepted"); a typed item's detail shows each field before → after.
- **Submit review:** its tooltip counts transforms ("Carries out your ‹k› transforms first (‹j› need Claude), then …"); its needs-confirmation opens slice 2's cascade dialog, led by "Your transforms change accepted items:".
- **Session bar:** phase transform: "Edit session · Transform cards…: the window is open (nothing has started yet)" [Exit session…]; a transform step: "Claude's step for your transform “‹label›”: working · ‹counts›", or "telelean is carrying out “‹label›”"; the banner (D4-17); RunBadge "Edit session: transform window · ‹subject›".
- **End confirmation:** "What you typed yourself (N)", grouped by card, "‹field›: before → after", each a link (EN-2 b2); the transform-start summary line; the Exit dialog adds "and ‹k› transforms you queued".
- **Undo:** `undoScope` routes the focus inside the window to the session stack; main.tsx no longer counts the window as a blocking dialog (only a dialog above it); text fields keep the browser's undo (UN-4 4b); while a window is open, Undo and Redo act only on a freeze action (TW-1's text otherwise).
- **Formalize:** the Transform-declined reason (§3.7).
- **User guide:** a "Transform cards…" section: the window and its field states, the three outcomes, queueing, what you typed counting as accepted, the trash, Ask me instead, and the narrowings of D4-11–D4-20 in plain words.

### 4.6 Texts (`TRANSFORM_TEXTS`, verbatim)
- **Outcomes:**
  - start-session: "Nothing changed: starts the edit session with an empty first stage. Everything except the selected cards stays frozen; from there you can run Formalize for dependencies."
  - claude-step: "Needs Claude (‹reasons›): starts the edit session with Claude's first step."
  - direct: "Applies your edits to your files as one Undo step, with no edit session. The fields you typed stay frozen, as board edits do." (+ "The ‹n› freeze changes you made in this session are dropped.")
  - queue: "Queued for Submit review: telelean carries it out then (no Claude)."
  - queue-claude: "Queued for Submit review: Claude's step carries it out then (‹reasons›)."
  - nothing: "Nothing changed: nothing to queue."
- **Reasons:** "‹n› fields for Claude to fill" · "your instructions" · "Claude may add cards" · "Lean statement open on “‹c›”, whose sentence you changed" · "‹n› cards left to Claude" · "Claude must define: ‹names›".
- **Dependents panel:** "These rely on cards you delete or change:" · "Delete it too" · "Leave it to Claude" · "Rewrite it (telelean)" · "Leave it broken (Delete anyway)" · "frozen: Claude may not change it".
- **Toasts:** "Transform cancelled: nothing changed." · "Applied: ‹label›" (with Undo) · "Transform queued: ‹label›" · "Started the edit session: ‹label›".
- **Labels:** "Queue transform: ‹label›" · "Edit transform: ‹label›" · "Drop transform: ‹label›" · History "Transform: ‹label›" · `transformLabel`: "“‹first sentence›” and ‹n› more · +‹k› new · −‹m› deleted".
- The refusals quoted in §2.7, §2.8 and §3.1–§3.9.

## 5. Undo and persistence

### 5.1 The session stack (UN-4, UN-5)
- `queue-transform` (queue or replace) and `drop-transform` are one step each, recording the queue entry before and after and every item change with its rev. Undo and Redo go through the reducer's checks (D2-73): undoing a queue restores the sources' statuses and removes the entry; undoing a drop puts both back; Redo sends `after` again. An item whose rev changed gives `conflict`.
- Opening, saving and cancelling a window are not steps. The window's freeze actions are slice 3's freeze steps. Text fields keep their own undo (UN-4 4b).
- Submit review with transforms seals (D4-5); a provisional session's stack is discarded with it (UN-6).

### 5.2 The board stack (UN-2)
- `apply-transform` is one board step: Undo restores the files, the freezes.json delta and layout.json, as for any plan; History keeps its snapshot (AR-7: a replaced proof stays in History).

### 5.3 run.json, webview state, reload (ES-6)
- run.json v2 gains, additively: `PersistedSession.transform` (§2.2), `claudeStarted`, `PersistedStep.kind` `transform` (with `transform` and `rework?`), the ledger `typed` entry, and `SessionFreezes.start.transform`, `startCleared` and `transform`. `recover()` reads absent fields as empty; no migration.
- The webview autosaves the draft 400 ms after the last edit, one save in flight, coalesced, and at once on Submit, Cancel and `visibilitychange`. It keeps a crash copy in its state (`updateState({ transformDraft: { runId, window, rev, draft } })`, debounced 150 ms). When `session` arrives, a window the store lacks opens with the host's draft, or with the crash copy when it has the same runId and window and a rev ≥ the host's (then saved again); a window the host closed closes.
- An interrupted transform step is resumed or cancelled as slice 2's are; Cancel step takes the whole transform back (D4-4).

### 5.4 Reversal hazard
Reversing slice 4 while a session holds a window, a queued transform or a typed entry leaves run.json fields the older code refuses: finish or Exit such sessions first. The AP entry says so.

## 6. Tests

### 6.1 Per sub-slice
- **4a.** Every validator rule (key shapes, kind against fields, one-line fields, limits, sources, `nextNew`, the `runId`/`stage` pairing, the provisional start only with cards), fresh objects, `origin`, `provenance` and `consented` dropped, `__proto__` refused. `draftFromModel` on Spyro models: exact copies (TR-1), the starting states (TR-4, S11), Claude's values open and marked (D4-9), a Delete item's card trashed, a target's locks, a non-abbrev statement locked, `left` for other subjects' vocabulary and provisional cards. `typedLeanProblems` cheats (S10): `True`, a newline, then `axiom evil : False`; `#eval`; `/-`; `set_option`; `@[init]` and its hygienic spelling; `macro`; a top-level `:=` and `|`; unbalanced brackets; two declarations; a wrong name; a Prop axiom; a theorem. Every package compiles.
- **4b.** Each TR-15 reason alone, and none; each outcome; dependents by proof, statement, definition and arrow, frozen and not, inside and outside the window; choices per context (`claude` only unfrozen; `rewrite` and `broken` only direct; `broken` with a Claude reason refused); a frozen dependent's problem; TR-13 b2's warning; P→A naming the frozen arrows and the mark (G6); A→P's glow loss; an in-session conditional P→A refused; D4-19's target rules (with and without a proof in B); D4-20's kept proof; slots; cycles through new cards. Twin test: two stage states that differ only in a hidden Result give byte-identical analyses (RV-6).
- **4c.** Each unit kind written and recorded with its exact value; ids never reserved ones (TR-2 c); CF-6 drops `worded_by: agent`; the mirror untouched on Claude's statement (D4-29); a trash removes the block, statement, `.holds` and the entries elsewhere, leaving no `.holds` (S9); a cycle refuses; text that is not part of the transform stays byte-identical. `apply-transform`: one EditPlan, with standing records for the typed fields of existing cards only (D4-16), A6's drops, `rewrite`, `broken`, a refusal when `reasons` is not empty, TR-12 (a) run again (S10), keys that no longer exist.
- **4d.** A typed sentence and Claude's Lean on one card give two items; a W value that differs from its unit is not typed (Claude cannot forge "yours", cheat T8); a later typed entry supersedes; the auto-accept fixpoint with and without accepted dependencies; sources updated or withdrawn; a touched record with no draft withdrawn, not a problem; a trashed Add declined; a typed revert then re-applied gives the same text; typed items exempt from own Accept, D2-23 and the reveal; a cascade withdraws a typed item and un-reject brings it back; backstop refusals: a typed item not accepted, its content changed, a forged unit (no ledger entry: unowned), a typed P→A's theorem→axiom only with its unit.
- **4e.** Cheats T1–T7 built by hand (§6.2); `transformScopeOf` drops frozen keys; session-start entries for non-selected cards and vocabulary, `startCleared` and its Undo; revalue: a typed change to a standing-, own- or start-frozen field passes, and Claude's later change of it fails; a pending `TransformFreeze` compares text and is never excused by S₀; values set at the queue end; views (the banner's mode, the reasons, rows without session-start keys).
- **4f.** Reducer: queue, replace and drop, and their Undo restoring statuses exactly; `decide` with `transform` refused; decisions on a source refused while queued; a group decline's left reasons; typed items' options; the stack property (undoing everything gives back the start records). `planSubmit`: the step order (transforms, rework, Submit), the `reworkResults` take-out with D3-49's keep set, the cascade list, stale transforms. `formalizeStartProblems`' Transform rule. The view: phase `transform`, the transform view, the typed detail, `EndConfirmationView.typed`, twin tests (queued transforms and an open window reveal nothing hidden). The host's `not-yet` answers.
- **4g.** Unit tests of the generated source and the message parsing. Real Lean (capped, RAM rule) on the Spyro fixture: a good statement; a type error; an unknown predicate as `unknown`; a changed vocabulary declaration seen through the namespace; a vocabulary declaration with an error refused; autoImplicit off; the refusals on stale facts and on drift; nothing written to the model's files or `.lake` (hashes before and after).
- **4h.** FakeBackend sessions: a no-Claude transform at Submit gives stage + 1 with typed items accepted as yours; a fuzzy statement filled gives a Formalize item plus the typed item; scripts T1–T3; a statement naming undefined things, whose names Claude defines, passes, and its typed item waits for the vocabulary item (D4-7); a dependent proof marked broken; a slot filled by `add_card`; Cancel step and a reload mid-step (ES-6); the rework of a Shaky item from a transform step; Retry runs the typed write again; a give-up takes the whole transform back, queued with `lastFailure` (D4-4).
- **4i.** A provisional open locks every board of the folder; freeze actions in phase `transform` store `{ from: 'base' }`; the three outcomes; Cancel with and without freeze actions; direct: one board Undo step whose Undo restores files and freezes, no run left, the drift refusal; start-session: session-start freezes on the cards outside the window, the banner, and Formalize from stage 1 asking consent once; claude-step: consent before anything is sent; stage windows: TW-1's refusals, Proposed only, a stale rev's conflict, a decline-transform queued and dropped, a premise window, Ask me instead; a reload restores the window. Host: consent declined → the manager is never called; a `consented` sent by the webview never reaches it.
- **4j.** `applyDraftEdit` (typing freezes, clearing gives fuzzy, chips, a kind change keeping dependencies and proof, new-card states, trash and restore, Use this); autosave with fake timers; restore precedence; Submit's `expect`, its blocks and the confirmation's resend; the Cancel paths; window freeze actions post `sessionFreeze`; `transformCardsState`'s reasons; no posted draft holds `origin`, `provenance` or `consented`.
- **4k.** The view model: state chips (fuzzy never italic, dashed or translucent; AgentText only for Claude's unchanged values; Kind with no state; Proof keep or clear only; locks); CardSearch (ranking, folding, excluded cards, a cycle-closing source disabled); ImpactPanel rows; KindImpact texts; OutcomeLine per outcome; Popover's container; PromptBox's tests after ChipChoice is taken out.
- **4l.** Menu and Context Menu entries with their reasons; the decline menu per kind; the T key; a group's left list; Ask me instead's fallback; the queued section's gates; Back to review disabled; the typed marker; `undoScope` and main.tsx's Ctrl+Z; the end confirmation's typed section; the session bar's texts; the banner rule.
- **4m.** `s4-window`, `s4-session`, `s4-look` (the computed style of fuzzy fields; lock colours per theme; drag and drop inside the dialog).

### 6.2 Cheat scenarios
Each is a FakeBackend script (`transform-*.jsonl`) and is built by hand in `core/test/transform/cheats.test.ts` (4e, or the sub-slice named).
- **T1 (S8, TR-14 a):** Claude writes a theorem, replaces a proof or completes a pending `.holds` → `transform` (`no-proofs`); after 3 attempts the whole transform is taken back and stays queued with `lastFailure`.
- **T2 (TR-5):** Claude rewrites a typed sentence, or puts B's back → `frozen` (transform reason), not excused by S₀.
- **T3 (CF-4, §14.10):** Claude changes `type:` → G5.
- **T4 (D3-1, FZ-7 r2):** in a transform-started session, Claude changes the Why of a card outside the window → `frozen` (session-start).
- **T5 (S11):** Claude weakens a copied statement that started frozen to `… ∨ True` → `existing-changed`.
- **T6 (B.3):** `propose_arrow` into an axiom, into a session target or into a marked card; `remove_arrow` of an arrow a proof uses → each refused with its text.
- **T7 (D2-40):** a Prop axiom bound to no card → `new-axiom`.
- **T8 (D4-1, 4d):** Claude writes a value equal to a typed unit's on another card or field → owned by Claude's item, never yours.
- **T9 (S10, 4a and 4c):** typed `True`, a newline, then `axiom evil : False` → refused at Submit and by both planners.
- **T10 (TR-13, S9):** a dependent proof neither fixed nor marked broken → the state does not build → the gate refuses.

### 6.3 The integrator, at the slice end
The full core, webview and extension suites; the runner suite with real Lean when about 20 GB is free; a scratch webview build and Playwright one spec at a time; the VS Code suite if RAM allows; anything not run listed. Then, only if every check passes: the `dist` rebuild (AP-8), the AP entry (listing D4-1–D4-30 and §5.4's warning) and the patch.

## 7. Decisions, conflicts, patches

### 7.1 How the two designs were reconciled
| Topic | Engine design | Window design | Resolved |
|---|---|---|---|
| Drafting with no session | a host-held draft; the session starts at Submit | a real session in phase `transform` | the real session (D4-2): the user's words have the button create the session |
| The direct path | an EditPlan through the board | ends the session; a board step | the board action after the session ends (D4-3) |
| Window freezes | — | window-frozen fields become `yours` | state chips are the transform's own; the window's Context Menu acts on the session (D4-10) |
| Claude's copied values | open (D4-7 there) | frozen like your own (TR-4) | open (D4-9) |
| Suggested premises | the draft is edited | not offered | edited (D4-14): TRANSFORM 9 is the user's |
| Hidden-result targets | allowed, locked, masked | refused | allowed (D4-19): refusing would block declining Claude's formalisations while the results are hidden |
| Verbatim statements | Claude writes them under `typed-text` | — | telelean writes them; S₀ is before the write (D4-7) |
| An S₀ check before Claude | yes | — | only for no-Claude steps (§3.9) |
| Minimize; checkTransform | — | Minimize; no check message | neither (D4-18); TR-12 (b) at Submit |
| Make it pending | after Apply | an in-session step | after Apply (D4-11) |
| History kind | `apply-transform` | `transform` | `apply-transform` |
| Order with slice 5 | — | — | slice 4 first (D4-28; the references design recommends the reverse) |

### 7.2 Autopilot decisions (for `02_autopilot_decisions.md`)

1. **D4-1** AUTOPILOT DECISION (RV-7 b5, TR-15, App B baseline, RV-1): what you typed is recorded by telelean in a ledger `typed` entry, out of Claude's reach, and owned unit by unit (only while the working copy holds exactly that value) by one typed item per card or vocabulary item, accepted as yours at the queue end once its RV-5 dependencies are accepted; content copied from Claude stays in Claude's items; the window's provenance is the host's comparison with its own copy. *Alternative:* a moving baseline Y = B + typed, with items computed against Y (narrows RV-1's "against the base"; typed Lean using Claude's vocabulary would make Y fail to build). *To reverse:* route typed units into `card:`, `decl:` and `arrow:` items accepted with how `yours`.
2. **D4-2** AUTOPILOT DECISION (ES-3, INITIATING 2, EDIT SESSIONS 1): with no session, opening the window starts a real session at once (phase `transform`, stage 0), as the user's words have the button create the session; no Claude, consent or Lean until needed; Cancel is Exit. *Alternative:* a draft held by the host, the session made at Submit (no lock and no session freezes while drafting). *To reverse:* keep the messages, store the draft in the host, start the run at Submit.
3. **D4-3** AUTOPILOT DECISION (ES-3, TR-15, ★D1): a transform that needs no Claude in a provisional session ends that session, and the host then writes it as one board action `apply-transform`, first in its queue; a hand edit in that instant refuses it and the draft is lost, which the toast says. *Alternative:* an Apply-like write inside the run (`applyChanges` with the attic and the freezes delta, under the run's lock). *To reverse:* move the plan into an ExternalChangeSet applied in phase applying.
4. **D4-4** AUTOPILOT DECISION (TR-15, ES-4, RV-12): every transform in a session is one queue step at Submit review (telelean's typed write, then a check or Claude's turn), whose S₀ is the judged head before the write; it is all or nothing: a step that does not pass is taken back whole, its transform stays queued with the reason, and Retry or the next Submit runs it again. *Alternative:* keep the typed write when only Claude's part fails. *To reverse:* roll back to the `typed` commit when it passed its own check.
5. **D4-5** AUTOPILOT DECISION (RV-12 b2, EN-1, UN-5; narrows D2-54): a Submit review that carries out transforms seals the stack and always opens a new stage, even when no other work needs Claude; you see the result, then Submit again to reach the end confirmation. *Alternative:* go straight to the end confirmation, with Back to review undoing the typed writes. *To reverse:* let `planSubmit` choose confirming after a no-Claude queue, and make the typed write an undoable decision write.
6. **D4-6** AUTOPILOT DECISION (TR-12 b, c, RV-6): typed Lean is elaborated in a scratch file at the model root, against your files (B, which the lock keeps); a name that only the session's visible content defines is accepted and checked when the transform is carried out (a failure then takes the transform back); "Claude must define" applies to statements only, and a typed vocabulary declaration must elaborate now (narrows TR-12 c for declarations). *Alternative:* elaborate in the session's mirror against the working copy (nothing hidden must leak, and the mirror would switch between B and the head). *To reverse:* run the scratch in the session mirror with the visible names, and allow unknown names in declarations once Lean's error recovery is shown to keep them.
7. **D4-7** AUTOPILOT DECISION (TR-12 c): telelean writes every typed statement itself, those naming undefined things included, and Claude defines the names; no "typed text" rule is needed, because the transform freeze keeps the text. *Alternative:* Claude writes such statements verbatim, checked by a `typed-text` rule. *To reverse:* leave those statements out of the typed write and add the rule.
8. **D4-8** AUTOPILOT DECISION (DO-2, TR-9 b, RV-3): Decline → Transform declines its items only when the transform is queued, Shaky-like; Cancel changes nothing; while it is queued, its items' statuses change only by dropping or editing it. *Alternative:* decline when the window opens and undo that on Cancel; or let Back to review drop the transform after a confirmation. *To reverse:* route Back to review on such an item to `drop-transform`, behind a confirmation.
9. **D4-9** AUTOPILOT DECISION (TR-4 refined, S11): values copied from Claude's proposals start open and marked "Claude's proposal"; TR-4's frozen start protects your own Lean, while Claude's stays its item, which needs your Accept. *Alternative:* TR-4 literally (Claude's Lean starts frozen; unfreeze it to let Claude redo it). *To reverse:* `draftFromModel`'s starting states.
10. **D4-10** AUTOPILOT DECISION (FZ-9, TR-4, TR-5, FROZEN 3): the window's field states are the transform's own limits and never session freezes, so merely opening a window never freezes a card for the session; the window's Context Menu Freeze, Unfreeze and their "all other cards" forms are real session freeze actions, which persist as FROZEN 3 asks; typed fields get the `transform` reason. *Alternative:* the starting states, or fields frozen in the window, become session freezes (`yours`), which would block a later Formalize from filling a statement kept empty. *To reverse:* turn chip changes into own freezes at queueing.
11. **D4-11** AUTOPILOT DECISION (TR-14 d narrowed; D3-10, D3-47): "make it pending" is the board's existing Mark pending, after Apply, on the card a Proof broken item left unproved. *Alternative:* an in-session step that writes `axiom ….holds` as a belief item needing its own Accept. *To reverse:* add that step on the Proof broken detail.
12. **D4-12** AUTOPILOT DECISION (TR-7 c, DO-3, CF-3; D2-15 kept): every Shaky rework, transform-origin included, re-proposes content only: no new cards, splits or merges; split your cards yourself with Decline → Transform. *Alternative:* lift D2-15 with `add_card` in rework steps. *To reverse:* allow `add_card` in rework steps, with TR-7 (c)'s splits.
13. **D4-13** AUTOPILOT DECISION (TR-13, TR-11): no D-11 rewrite and no Delete anyway in a session: a kind change needing a rewrite is refused there, and both choices exist only for transforms applied directly. *Alternative:* typed rewrites of dependents' proofs in the session. *To reverse:* give typed items proof-text units and allow `rewrite` in sessions.
14. **D4-14** AUTOPILOT DECISION (TRANSFORM 9, TR-10 a, RV-1): a suggested premise can be transformed on its own: the window edits its sentence, Why and Lean statement only, never needs Claude, and is carried out at Submit review by a no-Claude step that rewrites the draft in the records; the premise is checked again and returns to review "updated", still accepted with "how you hold it". *Alternative:* not offered (narrows the user's TRANSFORM 9); or turned into a new card of yours. *To reverse:* refuse Add premise items in `openTransform`.
15. **D4-15** AUTOPILOT DECISION (TR-4, TRANSFORM 4): a new card whose sentence you leave to Claude is a slot, made by `add_card` in the step; its other fields must be left to Claude too, and no typed arrow touches it. *Alternative:* require every new card's sentence. *To reverse:* refuse slots in the analysis.
16. **D4-16** AUTOPILOT DECISION (ES-3, FROZEN 1, D3-44): a transform applied directly freezes the typed fields of existing cards and vocabulary as standing freezes in the same Undo step, as board edits do; new cards, kinds, arrows and chip states freeze nothing; the provisional session's freezes are dropped (ES-3). *Alternative:* freeze nothing. *To reverse:* drop the freezes delta from `apply-transform`.
17. **D4-17** AUTOPILOT DECISION (ES-3, INITIATING 2, FZ-7, EN-2; D3-1): a transform-started session freezes, for the session, every card and vocabulary item of the subject outside the window, whole; Unfreeze lifts one key for the session; the end confirmation sums them up in one line, with no keep rows. *Alternative:* axiom and proposition cards only. *To reverse:* restrict `effectiveFreezes`' session-start entries.
18. **D4-18** AUTOPILOT DECISION (narrows RV-3, RV-9, ES-9 like D2-62): the window is modal, with no Minimize, and in a session opens only from the Proposed view or the review list; while it is open, telelean refuses every action that changes the working copy, an item's status or starts Claude (TW-1); freeze actions that change no status stay; Esc never closes it. *Alternative:* a non-modal window, with stale drafts refused at Submit. *To reverse:* drop TW-1's refusals and compare the draft's basis at Submit.
19. **D4-19** AUTOPILOT DECISION (RV-6, D3-47, ES-2): in a session, a target's Kind, Dependencies and Proof are locked in the window, and neither it nor a card with an arrow into it can be trashed; its statement may change only when your files have no proof of it, and its Result is then reworked in the same queue; nothing your files' proof of a target uses may change. A window may hold a target while the results are hidden, shown masked. *Alternative:* refuse windows on hidden-result targets (blocks declining Claude's formalisation of a target before the reveal); or let a target's proof become Proof broken. *To reverse:* lift the locks and add those cases to reconcile.
20. **D4-20** AUTOPILOT DECISION (TR-13, prefer refusing): a changed Lean statement on a card whose proof is kept is refused; clear the proof (and prove it again later). *Alternative:* keep the proof, and let Claude mark it broken if it fails. *To reverse:* turn the problem into a dependent of the card itself.
21. **D4-21** AUTOPILOT DECISION (TR-13 b1, TR-14 b, S9): in a session a dependent is left to Claude only when nothing but accepted items freezes it, and a proof left to Claude becomes a Proof broken item; a dependent frozen otherwise must be unfrozen or deleted too ("Delete it too" moves it into the trash); references wait for slice 5. *Alternative:* revalue frozen dependents too, letting Claude change them. *To reverse:* allow `claude` on frozen dependents, with a held-value revalue.
22. **D4-22** AUTOPILOT DECISION (RV-7 b5, RV-6, DO-3): typed items never need their own Accept, never keep the results hidden, and are untouched by D2-23; they can be rejected or transformed, never declined Shaky; a cascade withdraws them, never "to be redone". *Alternative:* plain items needing an Accept. *To reverse:* drop the exemptions in classify, reveal and the backstop.
23. **D4-23** AUTOPILOT DECISION (FZ-3 2e, FZ-7 r4): a typed field's freeze compares its text during its queue and its full value from the queue end; it replaces the expectation of every other reason on that key but accepted ones, so your change becomes the frozen value; accepted items your change touches leave accepted through Submit's confirmed cascade. *Residual:* an instance Claude adds in the same step that changes how your typed Lean elaborates is its own item, on which your typed item depends. *Alternative:* an S₀ check with facts before Claude's turn, giving full values at once. *To reverse:* judge the `typed` commit before every Claude transform step and set the values there.
24. **D4-24** AUTOPILOT DECISION (RV-3, DO-3): Shaky and to-be-redone items that a transform step made are reworked at Submit review by one rework step per transform, with that transform's instructions. *Alternative:* no Shaky on them, and to-be-redone ones withdrawn. *To reverse:* drop rework steps and withdraw such items.
25. **D4-25** AUTOPILOT DECISION (TR-14 a, CF-4, Appendix B): a transform step has no `freeze_statements`, `propose_assumption` or `delete_card`, writes no proofs, changes no kind, and finishes `done` or `cannot`; trashing is yours. *Alternative:* `delete_card` for Claude in transforms. *To reverse:* offer it with slice 3's rules.
26. **D4-26** AUTOPILOT DECISION (DO-2, TR-10, RV-8, RV-10): Transform is offered on Formalize, Change, Add, Delete, Vocabulary term, Declaration, typed and (alone) Add premise items; never on Results, arrow items or Proof broken; never on another subject's vocabulary; Ask me instead falls back to D2-13's Shaky decline when none of its items takes Transform. *Alternative:* Transform on every item, arrows declined plainly in the same step. *To reverse:* widen the reducer's and the menu's lists.
27. **D4-27** AUTOPILOT DECISION (S6, egress consent): a transform-started session asks the egress consent only before its first Claude step, and opens its conversation then. *Alternative:* ask when the window opens. *To reverse:* ask in `openTransform`.
28. **D4-28** AUTOPILOT DECISION (★D8 a, AP-2; the references design's D5-1 recommends the reverse): slice 4 is built before slice 5, with small stubs slice 5 extends (card chips found by sentence, plain Instructions, `deriveId` with reserved ids, no reference dependents). *Alternative:* build slice 5 first and use its parts here. *To reverse:* build slice 5 first; 4j–4l then use its picker and `#` input, and 4b its `referencedBy`.
29. **D4-29** AUTOPILOT DECISION (TR-15, DO-2): the typed write never edits Claude's content except to replace a whole line or declaration; so a sentence you type leaves the docstring mirror of Claude's statement as it is (a cosmetic residual until that statement is accepted or redone). *Alternative:* update the mirror and leave that change in Claude's item, marked "updated". *To reverse:* update it in `planTypedWrite` step 3.
30. **D4-30** AUTOPILOT DECISION (ES-7's spirit, prefer refusing): at Submit review, a queued transform whose cards, copied values, dependents or needs changed since it was queued is refused with "needs a new look", never merged; and a card that a queued transform holds opens in no other window (edit that transform instead), so two queued transforms never write one card. *Alternative:* re-copy and apply what still fits; let later transforms overwrite earlier ones unit by unit. *To reverse:* let `planSubmit` re-derive the draft against the current state.

### 7.3 Patches and logs
- After each sub-slice: `verbatim_prompt_log/bundle_21/evidence/patches/after_slice_4x.patch` (every file changed or created since the baseline, without `package-lock.json`) and the builder's report in `bundle_21/subagent_reports/`.
- At the slice end: one AP entry listing D4-1–D4-30, how to reverse each, and §5.4's warning; then a "slice 4 done" entry.

## 8. Change log
- 2026-11-20 (integrator): plan written from the engine and window designs, with the references design for §3.12 and D4-28; conflicts resolved in §7.1.

## 9. Coverage: every audit row assigned to slice 4

| Row (audit) | Where |
|---|---|
| Fuzzy (§1) | `FieldState` (§2.1); "Claude fills this" (§4.3); scope `open` and slots (§3.9); 4a, 4k |
| Transform (§1) | §2.1, §3; 4a–4l |
| CF-1 (transform) | `draftFromModel` takes any card, vocabulary, Claude's cards and a premise (§2.1, §3.7; D4-14, D4-26) |
| CF-1 exception (TR-10) | `left` for another subject's vocabulary (§2.1); 4a, 4j |
| CF-4 bullet 1 (in a transform) | the Kind control (§4.3); §3.4; typed units (§3.5 step 5); Claude never (G5, B.4, §3.9) |
| FZ-3 bullet 2e | revalue (§3.11; D4-23); 4e |
| FZ-7 reason 4 | `TransformFreeze` (§2.3, §3.11); 4e, 4h |
| FZ-9 para 1 (transform window) | the window's Context Menu row (§4.2), session actions (§3.11; D4-10); 4j, 4k |
| FZ-11 bullet 5a (transform) | the banner (§3.11, §4.2, §4.5; D4-17); 4e, 4l |
| CM-3 bullet 1b | the labelled button (§4.5); 4l |
| CM-4 row 3 | §3.1, §3.7; 4i, 4l |
| ES-3 bullet 1 | the provisional session, with session-start freezes (§3.1, §3.11; D4-2, D4-17); 4i |
| ES-3 Submit transform, unchanged | `start-session` (§3.1); 4i |
| ES-3 Submit transform, needs Claude | `claude-step` (§3.1, §3.9); 4h, 4i |
| ES-3 Submit transform, changed, no Claude | the direct path (§3.6; D4-3, D4-16); 4c, 4i |
| ES-3 Cancel | Exit, confirming only after freeze actions (§3.1); 4i, 4j |
| ES-6 sentence 3 (transform drafts) | run.json and the crash copy (§5.3); 4i, 4j |
| ES-9 bullet 3 (transforms) | windows in a stage, queued (§3.7); disabled on the Current view (§4.5); 4i, 4l |
| TR-1 (a) | `draftFromModel` (§2.1); 4a |
| TR-1 (b) | `start-session` and `nothing` (§3.2); 4b |
| TR-2 (a) | [+ New card ▾] (§4.2); units (§3.5 steps 1–2); 4c, 4k |
| TR-2 (b) | Kind and Lean name chosen at creation; the validator (§2.1, §2.5) |
| TR-2 (c) | `deriveId` with reserved ids (§3.5 step 1); never-reuse in slice 5 (§3.12) |
| TR-3 (a) | the Trash column (§4.2); 4k |
| TR-3 (b) | §3.5 step 8; 4c |
| TR-3 (c) | no "delete permanently" (§4.2); 4k's test |
| TR-4 bullet 1 (fuzzy) | §3.2, §4.3; 4a, 4k |
| TR-4 bullet 2 (open) | §3.2; scope `open` (§3.9); 4e |
| TR-4 starting states (new card) | §3.2, `applyDraftEdit` (4j); slots (D4-15) |
| TR-4 starting states (copied card) | `draftFromModel` (§2.1; D4-9, D4-10) |
| TR-4 fuzzy Dependencies | DependenciesEditor (§4.4), `arrowsInto` (§3.9); the `#` list in slice 5 (D4-28) |
| TR-4 Proof field | ProofChoice (§4.3); §3.5 step 7; locked on targets (D4-19) |
| TR-5 | §3.2; the `transform` reason (§3.11); standing when applied directly (D4-16) |
| TR-6 | the validator (§2.5); rows per CF-2 (§4.3) |
| TR-7 (a) | `mayAddCards`, `add_card` (§2.8, §3.9) |
| TR-7 (b) | new declarations allowed in transform steps (§3.9) |
| TR-8 | Instructions (§4.2), quoted in the turn (§2.8); `#` in slice 5 |
| TR-9 (a) | `submitTransform` (§2.5, §3.1, §3.7) |
| TR-9 (b) | Cancel changes nothing; items never leave review (§3.7; D4-8) |
| TR-10 (a) | any card, vocabulary, Claude's cards, premises (D4-14, D4-26) |
| TR-10 (c) | `left` (§2.1); referencing in slice 5 |
| TR-11 (window) | §3.4, §3.5 step 5, KindImpact (§4.3); refused in a session when D-11 is needed (D4-13) |
| TR-12 (a) | `typedLeanProblems` (§2.1, §3.3); cheat T9 |
| TR-12 (b) | `checkTypedLean` (§3.3; D4-6); 4g |
| TR-12 (c) | `mustDefine`; telelean writes, Claude defines (§3.3; D4-7) |
| TR-13 bullet 1 | dependents and choices (§3.4); the panel (§4.2) |
| TR-13 (nothing left broken) | session choices; the gate requires a build (§3.4, §3.9; D4-21); cheat T10 |
| TR-13 bullet 2 | the warning and c3 (§3.4) |
| TR-14 (a) | `no-proofs`, the tool set (§2.8, §3.9; D4-25); cheat T1 |
| TR-14 (b) | Proof broken by `mark_proof_broken` for proofs left to Claude (§3.4, §3.9) |
| TR-14 (d) | narrowed: Mark pending after Apply (D4-11) |
| TR-15 (needs-Claude test) | §3.2 |
| TR-15 (outside a session) | §3.6 |
| TR-15 (inside a session) | §3.8–§3.10 |
| TR-15 (copied content) | §3.5 (D4-29); §3.10 queue end, steps 2–3 |
| TR-15 (follow-on edits) | owned by typed items (§3.5); may touch frozen cards (revalue, §3.11); listed (§3.4) |
| RV-5 bullet 3 (your change) | the Submit cascade (§3.8); the window's preview (§4.2) |
| RV-7 bullet 5 | typed items accepted as yours (§3.10; D4-1, D4-22) |
| RV-8 bullet 2 (Transform) | one window for a group (§3.7) |
| RV-9 bullet 2 | queued until Submit review (§3.7) |
| RV-12 bullet 1 | transform steps first (§3.8); a new stage always (D4-5) |
| DO-2 | §3.7, PreviousVersion (§4.3); never accepted by Submit transform (§3.10) |
| EN-2 Apply, bullet 2 | `EndConfirmationView.typed` (§2.4, §4.5) |
| UN-4 bullet 4a | SessionAction `transform` (§2.2, §5.1) |
| UN-4 bullet 4b | text fields' own undo (§4.5) |
| §14 item 10 (transform) | kinds only through typed units; G5 and B.4 (§3.9, §3.10); cheat T3 |
| S8 fix (transform) | `no-proofs` (§3.9); cheat T1 |
| S9 fix (dependents) | TR-13 (§3.4); cheat T10 |
| S10 fix | TR-12 (§3.3); cheat T9 |
| S11 fix (copied Lean frozen) | starting states (§2.1), step limits (§3.9); cheat T5; Claude's copies open (D4-9) |
| B.3 transform | `propose_arrow` and `remove_arrow` branches (§2.8); cheat T6 |
| App B Baseline (transforms) | typed units, owned by typed items (§3.10) |
| App B Baseline (copied content) | §3.5, §3.10; cheat T8 |
| **Follow-up G4** | S9's other half: §3.4 |
| **Follow-up G5** | a typed sentence drops `worded_by: agent` (§3.5 step 3; premises: `wordedBy`, §3.7) |
| **Follow-up G6** | `analysis.kinds.removed` (4b); KindImpact (4k) |
| **D2-13** | Ask me instead opens a transform (§3.7; D4-26) |
| **D2-15** | kept (D4-12) |
| **D3-1** | session-start freezes made real (§3.11; D4-17) |
| **D3-43 fallback** | 4x |
| **D3-49** | the keep set counts `transform` and `session-start` reasons (§3.8 step 4) |
| RV-6 bullet 4 (slice-4 part) | analyses on the masked state; recomputed at Submit (§3.4, §3.8) |
| RV-9 bullet 1 sentence 3 (slice-4 part) | the Formalize refusal and whole-model limits (§3.7) |
| EN-1 sentence 1, EN-2 sentence 1 (slice-4 parts) | queued transforms never go straight to confirming (D4-5); the Cancel exception (§3.1) |
| A2, A3 (slice-4 parts) | `request_unfreeze` in transform steps; `cannot` with its gap in the report (§3.9) |
| TR-13 "Delete anyway" (direct transforms) | the `broken` choice (§3.4, §3.6) |
| Transform-made Change items, RV-7 c2, RV-1 Result sub-bullet 5, S11's own Accept | Claude's changes in transform steps are slices 2–3's items; a Result reworked for a changed statement carries c2 and its flag (§3.8, §3.9) |
| Needs references: TR-4 `#` list, TR-8 `#`, TR-10 (c) referencing, TR-2 (c) never-reuse | stubs and hooks (§3.12; D4-28) |
