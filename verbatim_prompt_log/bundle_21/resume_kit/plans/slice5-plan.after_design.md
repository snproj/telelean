# Slice 5 plan: references (spec v4.1)

*Integrator's plan, 2026-11-20, written on autopilot (the user is away and asked for the slices to be built without stopping; `verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md` logs every choice made without them). The specification is `verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md` (§13, CF-1, CM-4, FZ-4, S12, ES-9); clause IDs refer to it. The user's own words outrank everything here: REFERENCE SYSTEM 1 (`bundle_20/prompt20.md`: "reference another card, or any of its fields, clearly and conveniently … a dropdown menu upon typing a symbol like "#"") and ★D6, "search by sentence" (`bundle_21/prompt21_midturn.md`, message 1). One design fed this plan (references); it was checked against the two slice-4 designs (the transform engine, the transform window), and §7.1 resolves their conflicts. Every choice the spec leaves open, and every narrowing of it, is in §7.2 as an "AUTOPILOT DECISION" with its alternative and reversal, cited as (D5-n). Slices 2–4 are cited by their decisions, (D2-n), (D3-n), (D4-n); their built contracts are the interface this plan builds on. The coverage audit's "Scope of slices 4 and 5" (15 rows, plus the slice-4 rows that need references first) is mapped row by row in §9.*

*Designed for the simplest sound mechanism (AP-24's lesson). A reference is a token of text inside the sentence or Why that holds it; nothing about it is stored anywhere else. Holding (S12) adds keys to slice 3's one table and one whole-state check. Nothing is repaired, and nothing parallels slices 2–4.*

**Slice 5 = ★D8 (a) item 5, references:**
- **Typing `#`** in a prose field opens a dropdown that finds cards and vocabulary by their sentences and names (RF-1, RF-4, ★D6); → shows a card's fields. The pick is stored as a token, `#[card:ID]`, `#[card:ID:FIELD]`, `#[lean:NAME]` or `#[lean:NAME:FIELD]` (RF-2 a), and is shown everywhere as a chip with the target's current name, or "deleted card" (RF-1 b, RF-2 c). Esc leaves a plain `#`; Lean fields never open it (RF-3).
- **Ids are never reused** (RF-2 b): a per-subject registry, `ids.json`, of every card id telelean has given, or seen in a subject's files when it wrote them; one allocator for every new card; and every board write writes the `id:` of each card of its subject that lacks one (D5-3, D5-4).
- **Claude reads sentences** (RF-2 d): telelean's turns and tool results show each reference as its target's sentence, rendered at two choke points in the runner; docstring mirrors are written rendered. Claude never adds a reference (D5-8).
- **A frozen card's references hold their targets** (FZ-4 bullet 2, RF-5 a, S12): slice 3's `heldFields` hook is filled, inside its one table and one check.
- **Copy reference** (CM-4 row 10), on both views, during a session too (ES-9 bullet 2).
- **What slice 4 left for references:** `#` in the transform window's sentences, Whys and Instructions (TR-8); its Dependencies search opened with `#` (TR-4); other subjects' vocabulary referenced (TR-10 c); new ids from the registry (TR-2 c); TR-13's reference dependents (RF-5 b).

**Not in slice 5:** cross-subject card references (D5-6); references in glosses, notes after `---` and Lean fields (D5-11); re-mirroring a docstring because another card's sentence changed (D5-7); a board-wide find (D5-13); consistency checking (M3).

---

## 0. Rules for everyone working on slice 5

Slices 1–4's rules hold unchanged (§0 of their plans; the builder rules file is pasted into every builder's brief): no git changes, no installs, never real Claude (`TELELEAN_NO_REAL_CLAUDE=1`), never write `packages/extension/dist` or `out`; one heavy job at a time under `capped.sh`; vitest with one worker, the extension's with `--no-cache`, every run with `--fsModuleCachePath` in the scratch dir; binaries from `node_modules/.bin`; `TELELEAN_TEST_TMP` in the scratch dir; real Lean only for the files a change touches and above the 12 GB rule, otherwise listed as not run; webview test builds to `TELELEAN_WEBVIEW_OUT`; Playwright and the VS Code suite only by the integrator, when RAM allows.

Additions for slice 5:
- **Start.** 5a starts after slice 4's verified end ("slice 4 done" in the decisions log; D5-1). The integrator first measures the baseline (tsc in every package, the vitest counts) and records it in §8.
- **Contracts.** §2 is the integrator's. Slice 4 is planned in parallel with this plan, so slice-4 names here follow its two designs and are marked (S4): a builder maps each to what slice 4 built and records the mapping in §8. A builder who must change a contract, or who finds that built code of slices 2–4 differs from their plans in a way that matters here, records it in §8 and says so in the report.
- **Texts.** Every text quoted here is used verbatim. Core `refs/texts.ts` holds them (`REF_TEXTS` for the person, `CLAUDE_REF_TEXTS` for Claude); 5a writes every one. A later sub-slice that needs an unquoted text reports it; the integrator adds it between sub-slices.
- **One builder at a time in core** (slice 2's rule): 5a, 5c1, 5c2 and 5d run strictly one after another, with nothing beside them. 5a writes every core module of §2 with stubs throwing `NotImplementedError("‹name› (slice 5x)")`, and their index lines, so no later sub-slice edits an index; it also adds the runner's `IDS_FROM_MODEL` stopgap (§1.1), so every package stays green until 5b. 5b and 5e change no core source; 5f1 and 5f2 only the webview and docs, so 5f1 may run beside 5e when their files do not overlap.
- **Slices 2–4 stay green.** A test changed on purpose is changed by the sub-slice named and listed in its report with the reason. Known ones: F1 makes every plan on a fixture with id-less blocks also write their `id:` lines, and TL112's text changes (5a); docstring mirrors of sentences with tokens are rendered (5c1); person-facing labels use names (5c2); held maps may hold field keys (5d).
- **FakeBackend.** New scripts go in `packages/runner/test/run/fixtures/sessions/` as `refs-*.jsonl`; each cheat of §6.2 is also built by hand in `core/test/refs/cheats.test.ts` by the core sub-slice §6.2 names.
- **Patches and reports.** After each sub-slice, `verbatim_prompt_log/bundle_21/evidence/patches/after_slice_5x.patch` and the builder's report in `bundle_21/subagent_reports/`.

## 1. Order of work

Each sub-slice ends with every package compiling, the unit tests of every package it touched passing, its entry in §8, and a saved patch. Each is sized for one builder.

| Sub-slice | What | Main clauses | After |
|---|---|---|---|
| 5a | Tokens, the registry's format, the allocator and F1 (core); every text; the stubs | RF-2 (a, b), TR-2 (c) | slice 4 |
| 5b | The registry on disk, and every allocation through it (runner, host) | RF-2 (b), TR-2 (c) | 5a |
| 5c1 | Resolution and names, mirrors, the person's validation, dependents (core) | RF-2 (c, d), CF-1, TR-10 (c), RF-5 (b) | 5b |
| 5c2 | Claude never adds a reference; raw spans; slice 4's reference dependents; names in core texts (core) | RF-2 (c, d), RF-5 (b) | 5c1 |
| 5d | References hold their targets (core, then two runner files) | FZ-4 bullet 2, RF-5 (a), S12 | 5c2 |
| 5e | Claude reads sentences; the runner's check of the premise Why (runner) | RF-2 (d) | 5d |
| 5f1 | The `#` dropdown, chips, the board's editors, Copy reference (webview) | RF-1, RF-3, RF-4, CM-4 row 10, ES-9 bullet 2 | 5d (may run beside 5e) |
| 5f2 | `#` in session prose and the transform window; names, held marks, Delete's list; the guide | RF-1, RF-2 (c), RF-5, TR-4, TR-8 | 5e, 5f1 |

If a builder reports running out of room: 5c2 splits after the rule (5c2a: the `reference` rule, its validators, the raw spans; 5c2b: slice 4's reference dependents and the names); 5d after the check (5d1: `freeze/refs.ts`, the table, the check, judge, backstop; 5d2: changes, `unmeetable`, tools, views, texts, the runner part, slice 4's revalue); 5f2 after the window (5f2a: session prose and the window; 5f2b: names, marks, Delete, the guide).

### 1.1 Scope of each sub-slice

The files named are where the work lands; builders may add helper files next to them.

**5a: tokens, ids, F1.** Core only.
- `refs/tokens.ts`, `refs/texts.ts`, `ids/registry.ts`, `ids/allocate.ts`, `edit/ids.ts` (`writeSubjectIds`), `paths.ts` (`idsPath`); the stubbed modules of 5c1, 5c2 and 5d (`refs/resolve.ts`, `mirror.ts`, `claude.ts`, `validate.ts`, `dependents.ts`, `freeze/refs.ts`) with their index lines.
- `edit/planAction.ts`: F1 at the end of every plan that changes a model file of its subject, with D3-54's `lose` for the ids it writes (§3.2); `add-node` allocates through `takenIds` with `PlanContext.ids`, refusing without it; slice 4's direct `apply-transform` (S4) allocates its new cards the same way. `edit/types.ts` (`PlanContext.ids`). Slice 3's `planIdWrites` (`freeze/plan.ts`) becomes a call of `writeSubjectIds`, so there is one writer.
- `markup/parser.ts`: TL112's new text (§3.2).
- Runner stopgap (as slice 3's 3a did for its freezes): `ModelWorkspace.planContext()` passes as `ids` each subject's current `namedIds` (`IDS_FROM_MODEL`), so `add-node` keeps today's behaviour until 5b deletes it.

**5b: the registry on disk, allocations.** Runner and host; no core file.
- New `workspace/idsStore.ts` (`proposal/sidecarStore.ts`'s pattern: atomic temp file and rename, a per-file queue, never undone, never snapshotted). `workspace/modelWorkspace.ts`: reads every subject's ids.json at load and on its sidecar event; `idsOf`, `recordIds`; `planContext().ids`; the record before every write of its common write path (`applyRecorded`, used by perform, Undo, Redo, History revert and `applyChanges`; the builder confirms that no model-file write bypasses it); TL203 in `workspaceDiagnostics`. `workspace/types.ts`.
- The run's workspace interface (`run/types.ts`) gains `idsOf?` and `recordIds?`; without them every in-session allocation is refused (D3-51's pattern). `run/session.ts`: a session's start records B's `namedIds`, and is refused while the subject's registry is unreadable (slice 4's transform start too, S4). Every in-session allocation passes the registries in its `reserved` set and records its id before the id is written anywhere (a file, or run.json's records): premise adoption (`run/premises.ts`), `add_card` (`run/step.ts`, if slice 3 or slice 4's 4x built it), slice 4's typed write of new cards (S4). `IDS_FROM_MODEL` is deleted.

**5c1: names, mirrors, validation, dependents.** Core only.
- `refs/resolve.ts`, `refs/mirror.ts`, `refs/claude.ts`, `refs/validate.ts`, `refs/dependents.ts`; `model.ts` (`TlNode.name`); `project/build.ts` (names, TL124, TL125); `export/graphJson.ts` (leaves `name` out); `project/subjectGraph.ts` (referenced vocabulary joins the band).
- Mirrors: `gate/normalise.ts`, `gate/adoption.ts`, `edit/planAction.ts` (D-9's follow), slice 4's typed write (S4), and every other place that computes or compares the D-9 mirror (the builder greps `escapeBodyText(` applied to a sentence).
- The person's validation: `planEditNode` and `planAddNode` (sentence, Why), `gate/adoption.ts` (the Accept's Why, fail closed again at the write), slice 4's draft problems (S4: sentences and Whys).
- `edit/planDelete.ts` and `edit/types.ts` (`DeletePlan.referencedBy`).

**5c2: Claude's limit, raw spans, slice 4's dependents, names.** Core only.
- The rule `reference` (§3.5) where `judgeState`'s global rules live (`gate/sessionRules.ts`), `gate/types.ts`, `gate/describe.ts`, `review/judge.ts`, `review/backstop.ts`; its validators in `gate/adoption.ts` (a premise's sentence) and `freeze/tools.ts` (`addCardProblems`, if built).
- Raw spans (§3.4) in the Claude texts that quote a sentence or Why to restore: G5's field-change text (`gate/sessionRules.ts`), slice 3's frozen sentence and Why texts (`freeze/texts.ts`).
- Slice 4's TR-13 (S4): reference dependents in its analysis, and the detach follow-on in its typed write (§3.7).
- Names in person-facing core texts (§3.3): History labels (`edit/planShared.ts`, `planArrows.ts`), planner errors, `gate/describe.ts`'s board sentences, `review/` labels and texts, `FREEZE_TEXTS`, slice 4's `TRANSFORM_TEXTS` (S4).

**5d: holding.** Core, then two runner files; nothing beside it.
- `freeze/refs.ts`; `freeze/table.ts`, `check.ts`, `changes.ts`, `tools.ts`, `view.ts`, `texts.ts`; `review/judge.ts` (`freezeAtAccept` through `holdingMap`); `review/backstop.ts`; the `other-subject` rule; slice 4's `revalued`, TransformFreeze values and accepted cascade (S4).
- Runner: `run/session.ts` (own freezes' held maps through `holdingMap`), `run/prompts.ts` (the HELD listing names held fields).

**5e: Claude reads sentences; the premise Why.** Runner only.
- New `run/claudeText.ts`; `run/manager.ts` and `run/session.ts` wrap every run's LLM session and tool host once, for real and fake backends; `run/systemPrompt.ts` with its fixture; person-facing runner texts by name (activity lines, notices); FakeBackend scripts `refs-*.jsonl`.
- `decide` refuses an Add premise Accept whose Why holds a token that `refProblems` refuses, on the model the person sees (§3.3), before the reducer runs; the `propose_assumption` handler answers a sentence with a token at once, if its core check does not already.

**5f1: the dropdown, chips, the board.** Webview only.
- New `refs/`: `resolve.ts`, `search.ts`, `RefText.tsx`, `RefPicker.tsx`, `RefInput.tsx`, `reveal.ts`, `copy.ts`. `common/OneLineInput.tsx` (`InlineEdit` gains `references`), `board/NodeCard.tsx`, `board/CardDetails.tsx`, `prompt/PromptBox.tsx`, `board/BoardInput.ts` (a chip's pointerdown), `board/menu.ts`, `board/contextActions.ts`, `header/ContextSection.tsx` and slice 3's field and vocabulary menus (Copy reference), `state/store.ts` (the optimistic `name`), `labels.ts`, `styles/board.css`. The search extends slice 4's sentence matcher (S4: `common/CardSearch.tsx`, `model/cardSearch.ts`), never a second one.

**5f2: session prose, the window, names, marks, the guide.** Webview and `docs/user-guide.md`.
- `#` in `run/Questions.tsx` (free-text answers), slice 2's Shaky note and the Add premise Accept's Why (2g's `run/review/*`), and slice 4's window (S4): draft sentences and Whys, the Instructions box, the Dependencies editor. Chips in review rows, answers, notes and Earlier answers. `nameOf` at every remaining webview site that names a card (§4.6). The Delete dialog's list. Held marks for fields (slice 3's `model/freezeLook.ts`, `board/FieldLock.tsx`), the legend. The guide's "References" section. Drafts `test/e2e/s5-refs.spec.ts` (not run).

## 2. Contracts (integrator's; builders implement them as written)

### 2.1 Tokens (core `refs/tokens.ts`, 5a)
```ts
import type { CardField, VocabField } from '../freeze/types.js';   // slice 3
export type RefTarget = { kind: 'card'; card: string; field?: CardField } | { kind: 'lean'; name: string; field?: VocabField };
export interface RefSpan { start: number; end: number; target: RefTarget }
/** `#[card:ID]` / `#[card:ID:FIELD]`: ID per ID_PATTERN, FIELD a CardField. `#[lean:NAME]` / `#[lean:NAME:FIELD]`: NAME a
 *  dotted Lean name without whitespace, `:`, `[`, `]`, `«` or `»`, FIELD a VocabField. Anything else is plain text. */
export function refToken(t: RefTarget): string;               // throws for a target no token can name (D5-2)
export function parseRefToken(token: string): RefTarget | undefined;
export function refsIn(text: string): RefSpan[];               // well-formed tokens only, in order
export function refKey(t: RefTarget): string;                  // canonical: multisets compare by it
```
Tokens count only in a card block's `natural_name:` and `rationale:` values and in session prose (answers, Shaky notes, Instructions); glosses, notes after `---` and Lean text never hold one (D5-11). `formatFieldValue` already writes them raw (no `/-`, `-/` or leading `"`).

### 2.2 Ids (core `ids/`, `edit/ids.ts`, 5a; runner 5b)
```ts
// core ids/registry.ts — `.telelean/subjects/<S>/ids.json` (paths.ts `idsPath(S)`)
export interface IdsFile { format: 'telelean-ids'; version: 1; ids: string[] }        // sorted, unique
export type IdRegistry = { ids: readonly string[] } | { unreadable: string };        // the reason, for TL203
export function parseIdsFile(text: string | null): IdRegistry;                        // null (no file) → { ids: [] }
export function serialiseIds(ids: Iterable<string>): string;
/** Every card id the subject's files name: `id:` lines, the ids the build gave its cards, `premises:` entries, card tokens. */
export function namedIds(m: ProjectModel, subject: string): string[];
export function namedIdsInText(path: string, text: string): string[];                // the same, from one file's text
export function foldText(s: string): string;      // slugOf's transliteration, lower-cased, marks removed (RF-4's matcher)
// core ids/allocate.ts
/** Taken: every card id of the project now, every id of `registry[subject]` and of every other readable registry, D3-54's
 *  record ids, and `extra`. Throws ActionError('internal', REF_TEXTS.idsMissing) without `registry[subject]`, and
 *  ActionError('refused', REF_TEXTS.idsUnreadable) when it is unreadable (D5-17). */
export function takenIds(m: ProjectModel, subject: string, s: { registry: Readonly<Record<string, IdRegistry>>;
  records?: readonly string[]; extra?: readonly string[] }): (id: string) => boolean;
// core edit/types.ts: PlanContext + ids?: Readonly<Record<string, IdRegistry>>   (add-node and apply-transform refuse without it)
// core edit/ids.ts (F1, D5-4)
/** Writes the `id:` of every card of `subject` whose id is derived, as the build gave it (the node id, never the parser's
 *  file-level one), skipping blocks the plan removes; a block the plan edits gets it in the same edit. Returns the ids. */
export function writeSubjectIds(session: EditSession, m: ProjectModel, subject: string): string[];
```
- Every new card id is `deriveId(sentence, taken)` with `taken` from `takenIds`, or, in a session, with the `reserved` sets of slices 2–4 (D3-54's included) widened by the registries: `add-node`, `apply-transform`'s new cards (S4), premise adoption (`planGhostAdoption`), `add_card` (if built), slice 4's typed write (S4).
- **Runner (5b):** `ModelWorkspace.idsOf(subject): IdRegistry` and `recordIds(subject, ids): Promise<void>` (unions into the file, writes only when it grows, resolves after the write; logs and does nothing while the file is unreadable; a write it cannot make rejects, so the write that asked for it is refused with "telelean could not record the card ids in ‹path›: ‹error›"). The run's workspace interface gains both, optional; without them an in-session allocation is refused with `REF_TEXTS.idsMissing`.

### 2.3 Names, rendering, mirrors (core `refs/`, 5c1)
```ts
export interface RefResolver {
  card(id: string): { sentence: string; type: NodeType } | undefined;   // cards of the resolver's subject only (D5-6)
  lean(name: string): { shortName: string } | undefined;               // vocabulary items of every subject
}
export function resolverOfModel(m: ProjectModel, subject: string): RefResolver;
export function resolverOfGraph(g: Pick<TlGraph, 'subject' | 'nodes' | 'vocabulary'>): RefResolver;
/** A target's label: a card's sentence with each token in it as "…" and ‹ › as ' (one level, D5-5); a vocabulary item's
 *  short name; "deleted card" when the resolver has no such card or item. */
export function refLabel(t: RefTarget, r: RefResolver): { name: string; field?: string; deleted: boolean };
/** 'plain': each token → ‹label›, or ‹label›’s ‹field› (field words: sentence, kind, Why, stance, source, Lean statement,
 *  Dependencies, proof, Lean declaration, gloss). 'claude': the same, followed by " [card ‹id›]" or " [‹Lean name›]". */
export function renderRefs(text: string, r: RefResolver, style: 'plain' | 'claude'): string;
export function nameOf(n: Pick<TlNode, 'naturalName' | 'name'>): string;                   // n.name ?? n.naturalName
// model.ts: TlNode + name?: string — renderRefs(naturalName, 'plain') when the sentence holds a token; never in graph.json
export function mirrorText(sentence: string, r: RefResolver): string;                      // the D-9 docstring
/** `docstring` mirrors `sentence` under some names: equal (escapeBodyText, trimmed, as today), each token's place matching
 *  ‹[^‹›\n]*›(’s [A-Za-z ]+)?. A mirror written before a referenced name changed still counts (D5-7). */
export function isMirrorOf(docstring: string, sentence: string): boolean;
export function rawSpan(text: string): string;                     // U+E000 text U+E001: left as stored for Claude
export function renderForClaude(text: string, r: RefResolver): string;   // 'claude' outside raw spans; strips every marker
```
- `project/build.ts` computes `name` on the model it builds, the masked one in a session (RV-6), and adds **TL124** (warning) "This ‹sentence|Why› refers to a card of another subject (‹S›): a reference names a card of its own subject, so it shows “deleted card”." and **TL125** (info) "This ‹sentence|Why› refers to a deleted card." (the next free codes; 5c1 confirms them).
- `project/subjectGraph.ts`: Lean names the subject's sentences and Whys reference join `foreignVocabulary`'s `wanted`, so a referenced item of another subject shows read-only in the band (TR-10 c), and the webview resolves every `lean:` token from `graph.vocabulary`.

### 2.4 Validation and Claude's limit (5c1, 5c2)
```ts
// core refs/validate.ts (5c1)
/** The person's text: every token not already in `before` (a multiset) names another card of `subject` (not `card`, nor
 *  one in `trashed`) with that field for its kind, or a vocabulary item of the project. */
export function refProblems(i: { text: string; before?: string; model: ProjectModel; subject: string; card?: string;
  trashed?: readonly string[] }): string[];
export function addedRefs(before: string, after: string): RefSpan[];
// core refs/dependents.ts (5c1)
/** The cards of `subject` whose sentence or Why refers to `target`; for a `lean` target, those of other subjects too. */
export function referencedBy(m: ProjectModel, subject: string, target: { card: string } | { lean: string }):
  Array<{ card: string; subject: string; field: 'sentence' | 'why' }>;
/** Each token naming `target` becomes its 'plain' rendering, unlinked (§3.7). */
export function detachRefs(text: string, target: { card: string } | { lean: string }, r: RefResolver): string;
// core edit/types.ts: DeletePlan + referencedBy: string[]
// core gate (5c2): GateFindingCode + 'reference' (tokens `added`, `docstring`)
export function referenceFindings(i: { base: ProjectModel; current: ProjectModel; subject: string;
  ledger: readonly LedgerEntry[]; items: readonly ItemRecord[] }): GateFinding[];
```
`judgeState` runs `referenceFindings` among its global rules at every purpose (refused at step purposes and `final`, a stage problem at `stage`), and the backstop runs it on F.

### 2.5 Holding (core `freeze/refs.ts`, with slice 3's freeze modules; 5d)
```ts
/** A Lean name (slice 3's held names), or the FreezeKey of a held card field or vocabulary gloss (canonical JSON, so it
 *  starts with `[`, which no Lean name does). */
export type HeldKey = string;
/** D5-9: what the tokens in the values of `roots` (sentence and Why fields) hold in m, transitively through every held
 *  sentence and Why, each target once: card fields other than statement, Dependencies and proof, and glosses (`fields`);
 *  a referenced card's statement declarations and a referenced vocabulary declaration (`decls`). */
export function referenceHolds(m: ProjectModel, subject: string, roots: readonly FreezeTarget[]): { fields: FreezeTarget[]; decls: string[] };
/** A Lean name: slice 3's heldValue. A field key: its addressValue, which is text (key, approx = key, exact). */
export function heldValueOf(m: ProjectModel, k: HeldKey): HeldValue;
/** Slice 3's heldMap, widened: with refs = referenceHolds(m, subject, roots.fields), heldMap(m, roots.decls ∪ refs.decls),
 *  plus each of refs.decls by heldValue and each of refs.fields by heldValueOf. No fields: exactly heldMap(m, decls). */
export function holdingMap(m: ProjectModel, subject: string, roots: { decls: readonly string[]; fields: readonly FreezeTarget[] }): Record<HeldKey, HeldValue>;
/** The filled hook (3a's stub; signature adapted and recorded in §8): for every entry expected at B and not revalued
 *  (standing, foreign, session-start, own `{ from: 'base' }`) whose target is a sentence or Why, the keys
 *  holdingMap(B, subject, { decls: [], fields: [its target] }) gives, with their holders; memoised per B. */
export function heldFields(base: ProjectModel, subject: string, entries: ReadonlyMap<FreezeKey, FreezeTableEntry>): ReadonlyMap<HeldKey, { value: HeldValue; holders: FreezeKey[] }>;
/** D5-10: the declarations and glosses of `subject` that other subjects' sentences and Whys reference, at B. */
export function otherSubjectRefHolds(base: ProjectModel, subject: string): ReadonlyMap<HeldKey, { value: HeldValue; by: string[] }>;
```
Additive to slice 3: every held map (`OwnValue.held`, `ItemRecord.frozen.held`, `heldAtJudge`, `StateJudgement.freezeAtAccept` and `held`, `FrozenCheck.held`; slice 4's `revalued.held` and TransformFreeze values, S4) may hold field keys; `frozenChangesOf`'s rows gain `heldField?: FreezeKey`; a `held` finding on a field names it in `GateFinding.freezeKey`.

### 2.6 What slice 5 needs from slice 4 (for the integrator; all (S4))
Slice 5 changes these slice-4 places, so slice 4's plan must keep each one a single call: the allocation of a new card's id (direct and session paths); the D-9 mirror write of a typed sentence; the draft problems of a typed sentence or Why; TR-13's dependents analysis, with a `reference` via that stays empty until slice 5; the typed write's follow-on edits; the record of every value telelean writes for the person (its ledger `typed` units, with exact values); `revalued.held` and the accepted cascade keyed by held-map keys; the window's prose fields as plain inputs, its Lean fields never taking `#` (RF-3); one sentence matcher behind its Dependencies search. If slice 5 is built before slice 4 (D5-1's alternative), these lines move into slice 4's plan as requirements.

### 2.7 Runner, host, protocol, persistence
- **No new message.** Edits carry tokens in `editNode` and `addNode` text, answers in `answerQuestions`, notes and the premise Why in `decideItems`, Instructions in slice 4's messages; Copy reference uses `copyText`. Validators keep their length limits.
- **Files.** New `.telelean/subjects/<S>/ids.json` (§2.2): not a model file, so drift (ES-7) ignores it as it ignores decisions.json; never on the board stack and in no History snapshot (`isSubjectSidecarFile` unchanged); never in ws/ (`.telelean/` is hidden from Claude, S3); committed with the person's files (D-12). run.json: held maps may hold field keys; nothing else. freezes.json, layout.json, markup v1 and graph.json are unchanged.
- **TL203** (runner workspace diagnostic, warning): "telelean could not read ‹path› (‹reason›): fix it, or delete it (telelean then forgets which card ids it used before). Until then no card can be added to ‹S›."
- **Claude's text** passes `renderingSession(inner, resolver)` and `renderingToolHost(inner, resolver)` (`run/claudeText.ts`, 5e): `send(turn)` sends `renderForClaude(turn)`; every string of every result of every tool is rendered the same way. The resolver is `resolverOfModel` over the newest model of ws/ the run holds (the step's last check, else the stage judgement's, else B's), never a Lean job of its own.

### 2.8 Texts (`refs/texts.ts`, 5a; verbatim)
- **Picker:** hint "Find a card by its sentence · → its fields · Enter inserts · Esc keeps #"; "No card or vocabulary matches “‹q›”."; "No cards yet."; field rows by slice 3's field labels. **Preview:** "Shows as:". **Chips:** "deleted card"; tooltips "‹sentence› › ‹field› · Click to show it." and "This card was deleted: the reference stays as written."; toast "This card was deleted."
- **The person's refusals** (`refProblems`): "“‹token›” names no card of this subject: pick references from the # list." · "“‹card›” is an axiom: it has no ‹field›." · "‹name› is not a vocabulary item: pick references from the # list." · "‹token› names a card of the subject ‹S›: a reference names a card of its own subject (vocabulary from any subject is fine)." · "A card cannot refer to itself." · "“‹card›” is in this transform's trash: a reference to it would show “deleted card”."
- **Ids:** `idsMissing` "telelean could not read this subject's card ids: reload the window."; `idsUnreadable` TL203's text; TL112 "This block has no `id:`; telelean uses `‹id›` and writes it with its next change to this subject."
- **Delete:** "Referred to by ‹n› cards: ‹names›. Their references will show “deleted card”." **Transform rows (S4):** "Its reference becomes words: ‹text›." · "Refers to it, and will read: ‹text›." · "“‹card›” of ‹S› refers to it, and will show “deleted card”."
- **Copy:** "Copy reference" · "Copy ‹n› references" · "Copy reference works on cards and fields." · toast "Reference copied: paste it into a sentence, a Why or a message to Claude."
- **Held:** chain mark "held by “‹A›” (it refers to this)"; legend addition "or a frozen card refers to it with #"; stage problem "“‹card›” › ‹field› is held by frozen “‹A›”, which refers to it, but the working copy differs: unfreeze “‹A›”, or decline ‹item›."; the `reference` stage problem "“‹card›” holds a reference Claude added: decline ‹item›."
- **Claude** (`CLAUDE_REF_TEXTS`): `added` "“‹sentence›” (‹id›): ‹rawSpan(token)› is a reference you added. Only the person adds references: keep theirs exactly as written and add none (write the card's sentence in words)." · `docstring` "‹name›'s docstring holds a reference (‹rawSpan(token)›): docstrings hold plain words only; remove it." · `heldField` "“‹card›” (‹id›): its ‹field› is held: the frozen “‹holder›” refers to it, so it may not change. Restore it as it was when this step started: ‹rawSpan(S₀ value)›. Or ask with request_unfreeze (the person can unfreeze what refers to it)." · suggested cards "A suggested card's sentence holds no reference: write it in words." · `other-subject` "‹name› (or its gloss) is referred to by “‹card›” of the subject ‹S›: a session never changes what another subject relies on, so leave it exactly as it was."
- **System prompt** line (and its fixture): "Sentences and Whys may hold references to other cards, stored in the files as #[card:ID], #[card:ID:FIELD] or #[lean:NAME]. In telelean's messages each appears as ‹the target's sentence› [card ID]. When you change a sentence or a Why, keep its references exactly as written, and never write new ones."

## 3. Design

### 3.1 Invariants
- **I1.** telelean never gives a card id twice in the project, nor, within a subject, one a card had before, while the subject's registry is readable (RF-2 b).
- **I2.** A reference names its target only by card id or Lean name; every name shown, or sent to Claude, is computed from the current model (RF-2 a, c).
- **I3.** A frozen card's references hold their targets, in slice 3's one table and one whole-state check; refuse, never repair (RF-5 a).
- **I4.** Claude never adds a reference; new tokens come only from the person's text, as telelean recorded it (D5-8).
- **I5.** Nothing about references shows anything a hidden Result holds (RV-6): names come from the masked model, candidates from the view's graph, and the person's tokens are validated on the model the person sees.

### 3.2 Ids over time (5a, 5b; D5-3, D5-4, D5-17)
- **Recorded.** Before every write of its common write path, ModelWorkspace records the subject's `namedIds` in the model before the write and `namedIdsInText` of each changed file's new text; a session's start records B's; every in-session allocation records its id before the id is written anywhere. Opening a board writes nothing (AP-12). An id that existed only between two of telelean's writes and was deleted by hand is not recorded, and nothing telelean made can name it: references are made by model-file writes and by session prose (whose session start recorded B), and freeze records are avoided through D3-54.
- **Monotonic.** Undo, Redo and History revert never take an id out (the registry is not on the board stack); a rolled-back step, a declined premise and an Exit leave theirs in; a replayed write allocates again and burns its first id.
- **F1.** A derived id depends on the other blocks: with A (`id: cynder-dark`) and an id-less B with the same sentence (derived `cynder-dark-2`), deleting A would make B derive `cynder-dark`, and every reference to A would pass to B. So every plan that changes a model file of a subject also writes the `id:` of every card of that subject that lacks one (`writeSubjectIds`), with D3-54's `lose`: the plan that deletes A writes B's `id: cynder-dark-2`. Layout-only plans write none. Sessions already write them (D3-37's `ids` commit, then Apply).
- **No migration.** Nothing is rewritten at upgrade: ids.json appears at the first write or session after slice 5, and a subject's derived ids are written at its first board write, inside that action's Undo step and History entry (the guide says so).

### 3.3 What the person sees (5c1, 5c2, 5f1, 5f2; D5-5, D5-6)
- A token shows as a chip (§4.3) wherever its text is shown as the card's own (the face, "because:", details, review rows, answers, notes, Claude's words), and as ‹label› in plain text everywhere else, through `nameOf`. A label is one level deep: a token inside the target's sentence shows as "…", so no rendering nests.
- A card token resolves only within its subject: another subject's card shows "deleted card" with TL124, a missing one with TL125. A deleted target never comes back as another card (I1), only as itself, by Undo or History revert.
- Review rows resolve before-values on B's graph, after-values on the Proposed graph.
- In a session, every name, chip and candidate on the Proposed view and in the session's panels comes from the masked model or graph, and `refProblems` (the premise Accept's Why, slice 4's drafts) runs on the model the person sees: a hand-typed token naming a hidden card is refused exactly as one naming no card.

### 3.4 What Claude reads (5c1, 5c2, 5e; D5-7)
- Every turn and every tool result passes the two choke points (§2.7): the context bundle, step and feedback turns, Shaky notes, "Ask me about" notes, Instructions (S4), answers, Earlier answers from decisions.json, gate findings and freeze texts. So Claude reads ‹sentence› [card ID], never a raw token outside a raw span.
- Text Claude must restore exactly keeps its stored form inside a raw span: G5's quoted sentence and Why lines, slice 3's frozen sentence and Why values, `heldField`'s value, the tokens in the `reference` texts. The wrappers strip the markers after rendering; a marker in the person's own text is dropped first.
- The files Claude reads with its own tools keep the stored form; the system prompt line (§2.8) explains it.
- **Docstrings.** telelean writes `mirrorText` wherever it writes a D-9 mirror (normalise, adoption, D-9's follow on the board, slice 4's typed write), and counts a docstring as a mirror when `isMirrorOf` says so: a mirror written under names that changed since is left as it is, so telelean never rewrites it, frozen or not. No docstring is re-mirrored because another card's sentence changed.

### 3.5 Claude never adds a reference (5c2; D5-8)
For every card block of the session's subject in the judged state, `referenceFindings` checks:
- **`added`:** for `natural_name` and `rationale`, the multiset of tokens lies within B's value's (empty for a new block) plus those of the values telelean recorded for the person on that field: live typed units (S4), and an accepted Add premise's `accepted.rationale` on its card's `rationale`. So Claude may keep, reorder or drop the person's tokens, never add, forge or move one.
- **`docstring`:** a declaration of the subject whose text, docstring included, is new or differs from B's holds no token, unless it is a value telelean recorded for the person.
- The tools refuse at once: a premise's sentence (`propose_assumption`, through `gate/adoption.ts`) and an `add_card` sentence (if built), with "A suggested card's sentence holds no reference: write it in words."

### 3.6 References hold their targets (5d; D5-9, D5-10)
- **Holders:** every frozen sentence or Why, whatever its reason. Expected at B (standing, foreign, session-start, own `{ from: 'base' }`): `heldFields` over B. Own freezes, accepted items and slice 4's typed values: their stored held maps, now computed by `holdingMap` with the frozen sentence and Why targets as `fields` (own freezes by the runner's `freeze()`; accepted items through `freezeAtAccept`, with `acceptCovers`' sentence and Why targets).
- **What is held** (D5-9): `#[card:c]` holds c's sentence; `#[card:c:sentence|why|kind|stance|source]` that field, as text; `#[card:c:statement]` c's statement declarations by their held values (meaning, and text without the docstring) with their meaning closure, and nothing while c has no statement, so ES-2's fuzzy statements stay fuzzy; `#[card:c:dependencies]` and `#[card:c:proof]` nothing (FZ-4: no proof is held; Dependencies stay open); `#[lean:n]` n's declaration (held value and closure) and its gloss; `#[lean:n:declaration|gloss]` that one. A held sentence or Why holds what its own tokens hold, each target once.
- **The check:** slice 3's step 3 compares every held key, Lean name or field, with `heldValueOf(current, key)`; its two-value rule, `fresh`, `conflict` and one-message rule are unchanged, since they dispatch by key. ES-2's exceptions hold by construction: no held key is a proof, a Dependencies field or an empty statement.
- **Around the check:** `frozenChangesOf` emits held field rows (D3-48's dialogs, D3-49's keep set); `unmeetable` maps a field key to its card's lines in `snapshot.blocks`; `unfreezeRequestProblems` answers a `{ card, field }` item held by a reference with its holders; `deleteCardProblems` refuses a card with a held field; the views carry field holds (`StateJudgement.held`, and `boardFreezesView` outside sessions), so a field shows "held by “‹A›” (it refers to this)"; the backstop runs the same check on F.
- **Other subjects** (D5-10): at every purpose, `otherSubjectRefHolds` keeps at B the declarations and glosses of the session's subject that other subjects' sentences and Whys reference, under `existing-changed`'s token `other-subject`. It binds Claude only (FZ-1): a value telelean recorded for the person (S4's typed units) is not refused.
- **The person's own changes** (FZ-3 bullet 2e, S4): a typed unit that changes a held field revalues it like a held name (`revalued.held` with the field key); an accepted holder whose `frozen.held` names it leaves accepted through slice 4's confirmed cascade (RV-5 bullet 3). Outside a session nothing is needed: a standing freeze names a target, not a value.

### 3.7 Deleting or changing a referenced card (5c1, 5c2; D5-12)
- **The board's Delete** (outside sessions; Delete anyway): `DeletePlan.referencedBy` lists the cards whose sentence or Why refers to the card; the dialog names them; their references then show "deleted card".
- **A transform** (TR-13, S4): its dependents analysis adds, for each trashed card or vocabulary item, `referencedBy` with the `reference` via, frozen ones marked. A dependent through a reference needs no choice of its own: unless it is trashed too, telelean's follow-on edit detaches its tokens to the trashed target (`detachRefs`: the old words, unlinked), a typed unit of the person that may touch a frozen card (TR-15); its row reads "Its reference becomes words: ‹text›." A card whose referenced field changes but stays is listed as a warning only ("Refers to it, and will read: ‹text›."): its reference keeps resolving. A card of another subject that refers to a trashed vocabulary item is listed too ("“‹card›” of ‹S› refers to it, and will show “deleted card”."): its subject's files are not this transform's. A draft's own token to a trashed card is refused (`refProblems`' `trashed`).

## 4. The UI (webview; 5f1, 5f2)

### 4.1 RefInput (D5-5, D5-14)
- The field shows the stored form, as GitHub's editor shows `#123`; a live line below it, "Shows as:", renders the chips when the text holds a token.
- A typed `#` opens RefPicker only at the field's start or after whitespace or an opening ( [ “ " ‘; a pasted `#` never does, nor one typed during IME composition. The query is the text after `#` up to the caret, spaces included.
- Keys: ↑/↓ move; → (or a click on ›) shows the highlighted card's fields, those of its kind; ← goes back; Enter inserts `refToken` in place of `#query`, by selecting that range and `document.execCommand('insertText')`, so the browser's own undo takes it back (UN-4 4b; if 5f1 finds the webview does not record it, RefInput keeps one undo step of its own for the last insertion, noted in §8); Esc closes the picker and leaves `#query` as typed (RF-3), and a second Esc cancels the edit as before (CM-2); Backspace past `#`, or a blur, closes it. Rows use `onMouseDown` with preventDefault, so InlineEdit's blur-commit never fires mid-pick.
- RefInput is used only on prose fields; no Lean field opens it (RF-3).

### 4.2 RefPicker and search (RF-4, ★D6; D5-13)
- **Candidates:** the view's graph: this subject's axioms and propositions (never a provisional card, nor the card being edited) and every vocabulary item of the band, own and foreign (TR-10 c); in a session, the Proposed view's masked graph (I5). The Dependencies editor (S4) uses it with `{ cardsOnly, exclude, extra }`, `extra` being the window's new cards by their draft keys; prose tokens never name those (D5-11).
- **Search:** `searchRefs(query, candidates)` is slice 4's sentence matcher, extended: haystacks are `nameOf(card)`, and a vocabulary item's short name and gloss, folded by core's `foldText`; every query word must occur; word starts rank before inner matches, then earlier position, then board order; at most 50 rows; an empty query lists axioms, propositions, then vocabulary.

### 4.3 Chips and reveal (RF-1 b, RF-2 c; D5-16)
- `RefText` renders a text with chips: "‹label›", or "‹label› › ‹Field›" (RF-1's example), cut at 60 characters with the whole in the tooltip; a deleted target reads "deleted card". `--vscode-textLink-foreground` with an underline; a deleted chip in `disabledForeground` with its words; never an aura, a glow or a status (I5). On a card face a chip's pointerdown stops propagation, so it never starts a drag or a selection.
- A click reveals the target (`revealRef`): a card is selected and panned to (`revealCardSoon`); a field also expands its card and flashes its row (slice 3's FieldLock rows); a vocabulary item scrolls the band and is selected; a deleted one gives the toast. From a session panel the reveal switches to the Proposed view. Keyboard path: CardDetails' row "Referred to by", with focusable chips.

### 4.4 Where `#` works (D5-11)
- 5f1: the A|P box's sentence and Why; the board's in-place sentence and Why editors (outside sessions, ES-9).
- 5f2: free-text answers to Claude; slice 2's Shaky note, with D2-13's "Ask me about" prefill; the Add premise Accept's Why; slice 4's window (S4): draft sentences and Whys, Instructions (multiline), and Dependencies (`#` opens its search, as its button does).
- Not in glosses, notes after `---`, or any Lean field.

### 4.5 Copy reference (CM-4 row 10, ES-9 bullet 2; D5-15)
An icon in the Context Menu section and an entry in the right-click menus of cards, fields, vocabulary cards and their fields. It copies the stored form of every selected card, field and vocabulary item, space-separated, through `copyText`; arrows, marks and items are left out and its label says so (G12); it is disabled on a provisional card (MENU_PROVISIONAL) and, when nothing fits, with "Copy reference works on cards and fields."; it is enabled on both views, also during a session, since it only reads.

### 4.6 Names, marks, the Delete dialog, the guide
- Every webview place that names a card in text uses `nameOf`: relations, dialogs, toasts, review labels, the run panel, menus (about 35 sites; 5f2's DOM-scan test). The store's optimistic edits set `name` with core's function.
- Held field marks: slice 3's `freezeLook` adds field holds; FieldLock rows and the face show the `link` glyph and "held by “‹A›” (it refers to this)" in `descriptionForeground`, never the frozen colour; the legend's held entry gains its addition.
- The Delete dialog adds §2.8's line.
- `docs/user-guide.md`, "References": typing `#` and its keys, chips, Copy reference, "deleted card"; that a frozen card's references hold their targets; that ids are never reused and the first change to a subject writes its cards' missing `id:` lines; that Claude never adds references.

## 5. Undo and persistence
- **Board stack:** an edit with references is the same edit-node or add-node step; F1's `id:` lines join that step and its History entry. ids.json is never on the stack, so Undo, Redo and History revert never shrink it.
- **Session stack:** unchanged; references in answers, notes and Instructions belong to their existing actions.
- **ids.json:** monotonic, atomic, one queue per file; a missing file is empty; an unreadable one is never overwritten, refuses allocation and the session start in its subject (TL203), and recording skips it (D5-17).
- **run.json:** held maps may hold field keys (additive); nothing else changes, since allocations go straight to ids.json.
- **Reload:** nothing new; a RefInput's text persists as its field's text already does (ES-6).
- **Reversal:** the slice-5 patch (AP-4), after finishing or exiting open sessions (their held maps). ids.json stays, ignored by older code; tokens stay in the files as text, shown raw by the older board; F1's `id:` lines stay (valid markup).

## 6. Tests

All unit tests single-worker under the memory caps; no Lean in core (slice 3's `fakeFacts` with meaningKey); FakeBackend only. Each key rule gets a mutation check (AP-27).

### 6.1 Per sub-slice
- **5a.** Tokens: round trip for every field and both kinds; plain text stays plain (`#[card:]`, `#[card:Bad Id]`, `#[lean:«x»]`, `#[card:x:nosuch]`, an unterminated token, `#[1, 2]`); property: a text without `#[card:` or `#[lean:` has none. Registry: round trip, sorted and unique; null is empty; bad JSON unreadable; `namedIds` covers written and derived ids, `premises:` entries and tokens. Allocator: never a taken, registry, other-registry, record or extra id; the exact refusals. F1: the sibling case (deleting A writes B's `id: cynder-dark-2` in the same plan; mutation: without F1, C's token to A resolves to B); layout-only plans write none; removed blocks skipped; no double write; other subjects untouched; `lose` equals `planIdWrites`'; re-adding after a delete gives `-2`.
- **5b.** The record runs before every kind of write (a spy on order: perform, Undo, Redo, History revert, `applyChanges`, the end's board step) and holds the earlier model's and the new texts' ids; Undo, Redo and revert never shrink it; ids.json is in no snapshot or undo entry and never synced into ws/ (path guard); opening a board writes nothing; TL203 and the refused add-node; a start records B's ids and is refused while unreadable; a premise taken out and a new one with the same sentence get different ids; the id is recorded before it is written anywhere (a crash between them burns it); `PlanContext.ids` reaches every `planAction` call, and `IDS_FROM_MODEL` is gone.
- **5c1.** Labels and both renderings: card, field, vocabulary (own and foreign), deleted, another subject's card (TL124), dangling (TL125); one level, ‹ › sanitised; `name` only when the sentence holds a token, computed on the masked model; graph.json's schema test unchanged; a referenced foreign item joins the band; every `refProblems` text, and a dangling token already present may stay; `isMirrorOf` with renamed targets and a non-mirror; D-9's follow; normalise leaves a stale mirror alone; `referencedBy`, `detachRefs`, `DeletePlan.referencedBy`; twin test: two stage states differing only in hidden Result content give byte-identical SessionView JSON when visible sentences carry tokens, one hand-typed to a card that exists only in the hidden content.
- **5c2.** The rule refuses a token added to a sentence or Why, moved between them, forged (`#[card:future-id]`), in a docstring, in a new block; it allows keeping, reordering or dropping the person's tokens, a typed unit's (S4) and an accepted premise's Why; at step purposes, `stage`, `final` and in the backstop. The two validators. Raw spans: a frozen sentence with a token quotes its stored form. S4: a trashed referenced card detaches a frozen and an unfrozen referrer, a trashed referrer is left, a changed target gives the warning only, a draft token to a trashed card is refused. Names: with every sentence holding a token, History labels, planner errors, `describeFinding` and review labels hold no `#[card:` or `#[lean:` (list-driven over the producers).
- **5d.** The hold table row by row; transitivity A→B→C, and a cycle A→B→A ends; a statement held by meaning while its docstring may change; an empty statement stays fuzzy; a target's proof and new arrows into it pass though referenced; own freezes mid-stage and accepted Changes take their values; the two-value rule and `fresh` for field keys; `frozenChangesOf`'s held field row and Submit's keep set (D3-49); `unfreezeRequestProblems` names holders; `deleteCardProblems` refuses; views on the masked model; other subjects; the person's board edit of a held sentence is allowed; S4: a typed change to a held sentence passes and revalues, Claude's later change of it is refused, and an accepted holder joins the cascade.
- **5e.** A transcript scan over FakeBackend sessions whose cards, answers, notes and Instructions carry tokens: no `#[card:` or `#[lean:` in any turn or tool result outside the raw-span texts, and no marker reaches the backend; the context bundle's golden file; an answer reaches Claude rendered while decisions.json keeps it raw; the system prompt matches its fixture; activity lines by name; `decide` refuses a premise Why naming no card, and one naming a hidden card, with the same text.
- **5f1.** `searchRefs`: folding, all words, ranking, the limit; no provisional, hidden or edited card; foreign vocabulary included. RefInput: `#` at a word start only, never on paste or IME; Enter inserts the exact token; → lists the kind's fields; Esc keeps `#query` and a second cancels; Backspace past `#` closes; a row click never commits InlineEdit; Ctrl+Z restores the text before the insertion. RefText: labels, the cut, deleted. Reveal per target; pointerdown starts no drag. Copy reference: the tokens, both views during a session, provisional disabled, G12's label. Drafts the three themes' chip screenshots in `s5-refs.spec.ts` (not run).
- **5f2.** DOM scan: panels, dialogs, toasts and menus rendered from a fixture where every sentence holds tokens show none outside RefInput values; `#` in answers, notes, the premise Why and the window (S4); held marks never in the frozen colour; the Delete dialog's list; the picker offers no hidden card. Playwright draft only.

### 6.2 Cheat scenarios
| # | Cheat | Caught by | Where |
|---|---|---|---|
| 1 | S12: frozen A says “#[card:spyro-pg] is too strong”; a whole-model step rewords “Spyro is PG” | `held` at step purposes; a stage problem when a revert plants it; the backstop on F | 5d core; `refs-hold.jsonl`; mutation: `heldFields` → [] passes |
| 2 | Claude forges `#[card:future-id]`, moves a token into the Why, writes one in a docstring | `reference` | 5c2 core; `refs-forge.jsonl`; mutation: the rule off passes |
| 3 | A suggested premise or added card worded with a token | the validators, at once | 5c2 |
| 4 | Changing what a referenced statement means (an instance placed before it) | `held` (meaning) | 5d |
| 5 | An S2 session changes the gloss of S2.InGame that an S1 sentence references | `other-subject` | 5d |
| 6 | Raw tokens or markers reaching Claude | the transcript scan | 5e |
| 7 | A deleted card's id given to a new card (re-add, Undo, revert, sibling suffix, session take-out) | the registry, F1 | 5a, 5b |
| 8 | A hand-typed token to a hidden card, to learn whether it exists | validation and chips on the masked model | 5c1, 5f2 (twin tests) |

### 6.3 The integrator, at the slice end
Typechecks in every configuration; every package's unit tests; the full runner suite with real Lean when RAM allows; Playwright `s5-refs` when RAM allows, otherwise listed as not run; checks that nothing is staged, no commit was made and `dist` is untouched; then the decisions log's "slice 5 done" entry and the rebuild of `dist` (AP-8).

## 7. Decisions, conflicts, patches

### 7.1 How the designs were reconciled
| Topic | References design | Slice-4 designs | Resolved |
|---|---|---|---|
| Order | slice 5 before slice 4 | slice 4 first, with hooks for slice 5 | slice 4 first; slice 5 changes the slice-4 places of §2.6 (D5-1) |
| Recording ids | before each write, plus run.json `allocatedIds` folded in at the end | reserved sets | before each write, at each start, and each in-session allocation at once; no run.json field (D5-3) |
| Statement references | the address value, docstring included | — | the declarations' held values, without the docstring, so a mirror never breaks a hold (D5-9) |
| Docstrings | re-mirrored on board edits | — | never re-mirrored; `isMirrorOf` leaves an older mirror alone (D5-7) |
| TR-13 | `detachRefs` as "rewrite" | per-dependent choices | references detached unless trashed, with no choice of their own (D5-12) |
| The premise Accept's Why | no `#` until slice 4 | — | `#` allowed; the rule reads `accepted.rationale` (D5-8, D5-11) |
| Draft cards in prose | real ids at creation, by a message | `new:<n>` keys | prose names existing cards only; Dependencies take draft keys (D5-11) |
| The picker | its own search | CardSearch, for slice 5 to reuse | one matcher, slice 4's, extended (§4.2) |

### 7.2 Autopilot decisions (for `02_autopilot_decisions.md`)
1. **D5-1** AUTOPILOT DECISION (★D8, AP-2): slice 5 is built after slice 4, in the logged order; it then changes the slice-4 places of §2.6, marked (S4). *Alternative:* build slice 5 first, so that slice 4 uses its parts and stubs nothing (the references design's recommendation). *To reverse:* move every (S4) line into slice 4's plan as a requirement and start 5a after slice 3.
2. **D5-2** AUTOPILOT DECISION (RF-2 a): a reference is a token of text, `#[card:ID]`, `#[card:ID:FIELD]`, `#[lean:NAME]` or `#[lean:NAME:FIELD]`, in sentences and Whys; a Lean name with whitespace, `:`, `[`, `]`, `«` or `»` cannot be referenced. *Alternative:* GitHub's `#ID` (ambiguous with prose `#`), or links that store a sentence snapshot (stale text inside other cards). *To reverse:* change `refs/tokens.ts`; tokens already written stay as text.
3. **D5-3** AUTOPILOT DECISION (RF-2 b): card ids keep their slug form; telelean never reuses one, through a monotonic per-subject registry, ids.json, recorded before each of its writes, at each session start and at each in-session allocation, and read by one allocator, which also avoids every other readable registry. Opening a board writes nothing. *Alternative:* opaque or random ids (unreadable files and `premises:` lines, a migration of every id-keyed file); or recording on every read (a write on opening a board); or a run.json list of a session's allocations, folded in at its end. *To reverse:* stop reading ids.json; allocation falls back to the current ids and D3-54's records.
4. **D5-4** AUTOPILOT DECISION (RF-2 b): every plan that changes a model file of a subject also writes the `id:` of every card of that subject that lacks one (F1), so no derived id can slide onto a deleted card's. *Alternative:* write only the ids something names, accepting that a delete can hand an id to an id-less card with the same sentence. *To reverse:* drop `writeSubjectIds` from `planAction`.
5. **D5-5** AUTOPILOT DECISION (RF-1, RF-2 c): an editor shows the stored token with a live "Shows as:" line, as GitHub's does, keeping the browser's own undo; everywhere else a token is a chip or ‹label›, one level deep (a token inside the target's sentence shows as "…"). *Alternative:* atomic chips inside the input; nested names. *To reverse:* replace RefInput's text model, or `refLabel`; the storage is unchanged.
6. **D5-6** AUTOPILOT DECISION (CF-1, RF-1, TR-10 c): a card token names another card of its own subject, never the card itself ("reference another card"); a vocabulary token may name any subject's vocabulary item. A hand-written token to another subject's card shows "deleted card" with TL124. *Alternative:* cross-subject card references, which need a session to hold other subjects' frozen references and the board to show other subjects' sentences. *To reverse:* resolve cards project-wide and add their holds to `otherSubjectRefHolds`.
7. **D5-7** AUTOPILOT DECISION (RF-2 d, narrowed): Claude reads every turn and tool result rendered at two choke points; the files it reads keep the stored form, which the system prompt explains; exact restores quote the stored form in raw spans; docstrings are rendered when telelean writes them and never re-mirrored because another card's sentence changed, so a docstring may keep an older name until its own card's mirror is written again. *Alternative:* re-mirror the referring docstrings on the person's board edits; or tokens that carry a sentence snapshot. *To reverse:* add the re-mirror to `planEditNode` (outside sessions only, since a statement may be frozen).
8. **D5-8** AUTOPILOT DECISION (RF-1, S12): Claude never adds, forges or moves a reference; only tokens in B, or in values telelean recorded for the person (typed units, the premise Accept's Why), may be in a judged state. *Alternative:* let Claude add references to existing targets, reviewed with their item. *To reverse:* drop `referenceFindings` and the tools' token refusal.
9. **D5-9** AUTOPILOT DECISION (FZ-4 bullet 2, RF-5 a; narrowed): a whole-card reference holds the sentence; a field reference holds that field; a statement reference holds what the statement means and its Lean text without the docstring, and nothing while there is no statement; Dependencies and proof references hold nothing; a vocabulary reference holds the declaration and the gloss; holding is transitive through held sentences and Whys. This keeps ES-2's exceptions and FZ-4's "proofs are not held" by construction. *Alternative:* also hold Dependencies (against removals) and docstrings, with ES-2's exceptions applied inside the check. *To reverse:* edit `referenceHolds`.
10. **D5-10** AUTOPILOT DECISION (D3-41 extended): in a session, the declarations and glosses of its subject that other subjects' sentences and Whys reference keep their B values against Claude, whether or not the referring card is frozen; the person's own typed change is not refused, and a referring card of another subject then shows "deleted card" if the item is trashed. *Alternative:* hold only those referenced by frozen cards, which needs other subjects' freezes in the start snapshot. *To reverse:* drop `otherSubjectRefHolds`.
11. **D5-11** AUTOPILOT DECISION (RF-1; narrowed): `#` works in card sentences and Whys (the A|P box, the board's editors, the premise Accept's Why, the transform window), answers to Claude, Shaky notes and Instructions; not in glosses (they are Lean docstrings, which RF-2 d wants in words), notes after `---` or Lean fields. Prose tokens name existing cards, never a transform's new cards, which the Dependencies list takes by their draft keys. The person's prose to Claude is not validated: a token there that names nothing reads ‹deleted card›. *Alternative:* glosses too; ids for draft cards at creation. *To reverse:* add RefInput to those fields, and allocate draft ids when a card is created in the window.
12. **D5-12** AUTOPILOT DECISION (TR-13, RF-5 b; narrowed): a card referring to a card a transform deletes is detached (its tokens become the deleted card's words) unless it is trashed too, with no choice of its own; one referring to a field that changes is listed as a warning only; the board's Delete lists the referring cards and leaves "deleted card" (Delete anyway). *Alternative:* the per-dependent choices, leaving a reference to Claude, whose fix no check can confirm. *To reverse:* add the reference via to slice 4's choice sets.
13. **D5-13** AUTOPILOT DECISION (RF-4): the sentence search is the `#` dropdown's; there is no board-wide find. *Alternative:* Ctrl+F with the same matcher. *To reverse:* add it, with `searchRefs`.
14. **D5-14** AUTOPILOT DECISION (RF-1, RF-3): `#` opens the dropdown only at a word start; a paste never does. *Alternative:* anywhere (`C#` would open it). *To reverse:* drop RefInput's word-start test.
15. **D5-15** AUTOPILOT DECISION (CM-4 row 10, ES-9 bullet 2): Copy reference copies the stored form of every selected card, field and vocabulary item, space-separated, on both views, during a session too. *Alternative:* copy the sentence. *To reverse:* change `refs/copy.ts`.
16. **D5-16** AUTOPILOT DECISION (RV-6; a safety rule, so no alternative is offered): chips show only names and field labels, never a status; names, candidates and validation come from what the person sees, the masked model in a session. *To reverse:* not applicable.
17. **D5-17** AUTOPILOT DECISION (RF-2 b): a missing ids.json counts as empty; an unreadable one is never overwritten, refuses every allocation and the session start in its subject (TL203), and recording skips it. *Alternative:* treat it as empty. *To reverse:* `parseIdsFile` returns `{ ids: [] }` for it.
18. **D5-18** AUTOPILOT DECISION (residuals accepted, with D5-3, D5-4, D5-7): an id-less block written by hand since telelean's last write that derives a retired id, or a hand-written `id:` of a deleted card, is taken for that card (RF-2 identifies a card by its id, as D3-54 accepts); a git checkout, or deleting ids.json, rolls the registry back; ids of cards deleted before slice 5 are unknown; ids are not recorded while ids.json is unreadable; a docstring may keep an older name. *Alternative:* registry-aware derivation in the build, which would give a History restore of an id-less block a new id.

### 7.3 Patches and logs
After each sub-slice: `bundle_21/evidence/patches/after_slice_5x.patch` and the reports in `bundle_21/subagent_reports/slice5x_workflow/`; §8 gets the builder's and fixers' entries; at the slice end the integrator copies §7.2 into the decisions log.

## 8. Change log

*(empty)*

## 9. Coverage (the audit's "Scope of slices 4 and 5": every slice-5 row, and the rows that need references first)

| Audit row | Status there | Where this plan covers it |
|---|---|---|
| §1 Reference | slice-5 | §2.1 tokens; §4.1–4.3 (5a, 5f1) |
| CF-1 (reference with #) | slice-5 | §4.2: every axiom and proposition of the board and every vocabulary card of its band, own and foreign (5f1); card tokens within their subject (D5-6) |
| RF-1 (a) | slice-5 | §4.1, §4.4 (5f1, 5f2); narrowed by D5-11; D5-14 |
| RF-1 (b) | slice-5 | §4.3 (5f1) |
| RF-2 (a) | slice-5 | §2.1 (5a); D5-2 |
| RF-2 (b) | slice-5 | §2.2, §3.2 (5a, 5b); D5-3, D5-4, D5-17, residuals D5-18 |
| RF-2 (c) | slice-5 | §2.3, §3.3, §4.3, §4.6 (5c1, 5c2, 5e, 5f1, 5f2); D5-5 |
| RF-2 (d) | slice-5 | §3.4 (5c1, 5c2, 5e); narrowed by D5-7 |
| RF-3 | slice-5 | §4.1, §4.4 (5f1, 5f2); slice 4's Lean fields stay plain (§2.6) |
| RF-4 | slice-5 | §4.2 (5f1); D5-13 |
| RF-5 (a) | slice-5 | §2.5, §3.6 (5d); narrowed by D5-9; D5-10 |
| RF-5 (b) | slice-5 | §3.7: slice 4's TR-13 (5c2) and the board's Delete (5c1, 5f2); narrowed by D5-12 |
| FZ-4 bullet 2 | slice-5 | §3.6 (5d); D5-9 |
| S12 fix | slice-5 | §3.6; cheat 1 (5d) |
| CM-4 row 10 | slice-5 | §4.5 (5f1); D5-15 |
| Held (term: holding through #) | planned-3 | slice 3's `heldFields` hook filled (§2.5, 5d) |
| ES-9 bullet 2 (copy references during a session) | built; Copy reference itself slice 5 | §4.5: enabled on both views during a session (5f1) |
| TR-2 (c): new ids respect RF-2 | slice-4, needs references | §2.2, §3.2: slice 4's allocations through the registry (5a, 5b) |
| TR-4 fuzzy Dependencies as # references | slice-4, needs references | §4.2, §4.4: `#` opens the Dependencies search, `{ cardsOnly, extra }` (5f2) |
| TR-8: # in the Instructions | slice-4, needs references | §4.4 (5f2); rendered for Claude (§3.4, 5e) |
| TR-10 (c): other subjects' vocabulary referenced | slice-4, needs references | §2.3's band, §2.4's validation, §4.2's candidates (5c1, 5f1); D5-6 |
| Audit note: RF-2 (b) at risk in slice 3 | — | D3-54 in slice 3; closed at the source by §3.2 |
| Slice-4 follow-ups G4, G5, G6, D2-15, D3-1, D3-43's fallback | slice-4 | slice 4's; slice 5 changes none of them (a typed sentence with tokens is the person's, CF-6, as any) |
| D2-13 | slice-4 | its "Ask me about" note takes # (§4.4, 5f2) |
| D3-49 | slice-4 | held field rows join Submit's keep set through `frozenChangesOf` (§3.6, 5d) |
