# design:slice5-refs

Agent `a2abba9048ea76a8b` of workflow `wf_824d854d-064`. Verbatim output (JSON alongside).

- **summary:** Slice 5 (references) is designed as eight sub-slices, 5a to 5f2. It is built on slice 2's and slice 3's machinery and adds no parallel mechanism.
- **Ids.** Ids keep their slug form, so slice 2's item keys and slice 3's freeze records stay valid byte for byte. Three rules stop reuse:
  - a monotonic per-subject registry, `.telelean/subjects/<S>/ids.json`;
  - one allocator for every new card;
  - every board write also writes the `id:` of each card of the subject that lacks one (F1), so a derived id can never slide onto a deleted card's id.
- **Stored form.** References are stored as `#[card:ID]`, `#[card:ID:FIELD]`, `#[lean:NAME]` or `#[lean:NAME:FIELD]`, in sentences and Whys only.
- **What each viewer sees.**
  - The board shows chips with the target's current sentence, or "deleted card".
  - Docstring mirrors render references as ‹sentence›.
  - Everything telelean sends Claude is rendered at two runner choke points. The files themselves keep the stored form, which the system prompt explains (a logged narrowing of RF-2 (d)).
- **Holding.** A frozen card's references hold their targets by filling slice 3's `heldFields` hook:
  - one table and one whole-state check, as for every other freeze;
  - FZ-4's exceptions are kept by construction;
  - the `other-subject` rule now also covers prose references into the session's subject.
- **Claude.** Claude may never add a reference.
- **UI.**
  - A # dropdown searches sentences (RF-4); Esc keeps a plain #.
  - Copy reference reuses the existing `copyText` message and stays available during a session.
  - Chips never show status, and the dropdown draws only from the view's masked graph (RV-6).
- **Order.** Recommended: build slice 5 after slice 3 and before slice 4. The transform window then uses these parts directly (allocator, picker, # input, rendering, `referencedBy`) instead of stubs, and its TR-13 covers RF-5 (b).
- **Decisions.** 19 decisions, D5-1 to D5-19, are logged with alternatives and reversals.
- **current_state:** Where things stand (read-only survey, 2026-11-20).
- Slice 1 is built. Slice 2 is being built; its webview review UI (2g) and the runner's session engine (2d–2f) do not exist yet. Slice 3 is planned and frozen, not built. Slice 4 is not planned.

**Ids today**
- `core/src/markup/ids.ts`: `slugOf` transliterates the sentence and keeps at most 6 words; `fallbackId` gives `n-<6 hex>`; `deriveId` adds `-2`, `-3`… against a `taken` predicate.
- `markup/parser.ts:367-375`: a block keeps its written `id:`. A block without one gets a derived id (TL112), deduplicated within its file.
- `project/build.ts:239-270`: written ids win across the project. Derived ids are re-suffixed on collisions, files in path order. So a derived id depends on other blocks, and can shift when a same-slug card is deleted or added above it.
- `markup/edits.ts:79`: any block edit writes back that block's derived id.
- `edit/planAction.ts:43-45` (add-node) and `gate/adoption.ts:125-127` (premise cards) call `deriveId` against the ids that exist now. Nothing remembers deleted ids, so a deleted card's id is handed to the next card with the same slug.
- `actions.ts:47` declares `add-node.preferredId`, which nothing uses.
- Ids are ID_PATTERN slugs, which slice 2's item keys rely on (`review/keys.ts`: `card:<id>`, `proof:<id>`, `arrow:<s>><t>`; "card ids never hold `:` or `>`").

**What slice 3 adds (planned)**
- D3-16: freezing a card first writes its id.
- D3-37: the session `ids` commit, and Apply, write every derived id of the subject.
- D3-54: records store sentences and can be marked `lost`. add-node, adoption and add_card avoid ids that records name (`reserved`).
- `planIdWrites` (3b).
- `heldFields(model, entries)` is a stub that returns `[]` (§3.4 step 3, §3.12).

**References today: none.**
- No `#` handling, chips or token grammar. The webview has no sentence search (the `filter(` calls are unrelated).
- Prose inputs are plain `<input>`/`<textarea>`:
  - `common/OneLineInput.tsx` InlineEdit, used by `NodeCard.tsx:261-305` for the sentence and Why;
  - `prompt/PromptBox.tsx` (the A|P box);
  - `run/Questions.tsx` (answers to Claude).
- Slice 2 will add a Shaky "Note for Claude" textarea and a one-line Why on a premise's Accept (plan2 §5.7, §2.4).
- The host already copies text to the clipboard (`protocol.ts:159` CopyTextMessage, `vscode.env.clipboard` in BoardPanel/host).
- `board/reveal.ts` has `revealCardSoon` (Show on board).

**Text that names cards**
- Claude-facing texts quote `naturalName` directly:
  - `runner/src/run/prompts.ts` targetLines, premiseLines, otherCardLine;
  - about 30 gate messages in `core/src/gate/rules.ts` and `sessionRules.ts`;
  - `review/judge.ts:132`.
- The D-9 docstring mirror is the escaped raw sentence, in three places:
  - `gate/normalise.ts:25-30`;
  - `edit/planAction.ts:107-113`, which follows only when the docstring equals the old sentence;
  - `gate/adoption.ts` (the `/-- sentence -/` it writes).
- `naturalName` appears 53 times in 19 webview files, 91 times in core and 27 times in the runner, mostly as display names.

**Sidecars**
- `layout.json` and `attic/` are on the board stack and in History snapshots (`runner/workspace/files.ts isSubjectSidecarFile`).
- `attempts.jsonl` and `decisions.json` are written directly by the runner (`proposal/sidecarStore.ts`): atomic, per-file queue, never undone, never snapshotted.
- `.telelean/` is never copied into Claude's working copy (S3).

**The user's sample model**
- `mental_model/Model/Spyro/Main.lean` has 4 cards, all with written ids, so a write-back of missing ids changes nothing there.
- **design:** SLICE 5: REFERENCES. Design for the integrator (spec v4.1 §13, CF-1, CM-4 row 10, FZ-4 bullet 2, S12, ES-9 bullet 2, and slice 4's reference hooks). Decisions are D5-n (§12).

================================================================
0. SHAPE, ORDER, INVARIANTS
================================================================
**Order (D5-1).** After slice 3's verified end, build 5a → 5b → 5c1 → 5c2 → 5d → 5e → 5f1 → 5f2, then slice 4.

**What slice 4 then uses directly:**
- the allocator (TR-2 c);
- RefPicker for its Dependencies list (TR-4);
- RefInput and the Claude rendering for Instructions (TR-8);
- foreign vocabulary in the candidates (TR-10 c);
- `referencedBy`/`detachRefs` in its TR-13 (RF-5 b).

**Build rules.**
- One builder at a time in core: 5a, 5c1, 5c2 and 5d run strictly one after another.
- 5b and 5e are runner/host. 5f1 and 5f2 are webview (and docs).
- 5f1 may run beside 5c2, 5d or 5e when files don't overlap.
- Nothing is installed before the slice end (AP-8). So the UI that exposes references (5f) only ever ships together with holding (5d) and Claude rendering (5e).

**Invariants**
- I1: telelean never gives a card id of a subject to a second card of that subject.
- I2: a reference names its target only by card id or vocabulary Lean name. Every displayed or Claude-facing form is computed from the current model.
- I3: a frozen card's references hold their targets. This uses slice 3's one table, checked whole-state like every freeze; refuse, never repair.
- I4: Claude never adds a reference.
- I5: nothing about references (chips, dropdown, names, diagnostics) shows anything a hidden Result holds (RV-6).

================================================================
1. IDS THAT ARE NEVER REUSED (RF-2 b; 5a core, 5b runner)
================================================================
**Form unchanged.**
- ID_PATTERN slugs, `-n` suffixes, `n-<hex>` fallback.
- No existing id is rewritten. Slice 2's item keys and slice 3's FreezeTargets and freezes.json keep working byte for byte.
- Opaque ids were rejected (D5-2). They would make files and `premises:` lines unreadable, and they would need a migration of every id-keyed file (premises, layout.json, freezes.json, attempts, History).

**Registry (5a format, 5b writer).** `.telelean/subjects/<S>/ids.json`:
```ts
// core ids/registry.ts
export interface IdsFile { format: 'telelean-ids'; version: 1; ids: string[] }   // sorted, unique, one per line
export function parseIdsFile(text: string | null): { ids: string[]; problems: string[]; unreadable: boolean }; // null -> empty
export function serialiseIds(ids: Iterable<string>): string;
/** Every id the subject's blocks hold (written or derived, as the build assigned), and every card id its `premises:`
 *  lines and reference tokens name. */
export function namedIds(m: ProjectModel, subject: string): string[];
export function namedIdsInText(path: string, text: string): string[];   // the same from one file's text
// core paths.ts
export function idsPath(subject: string): string;                       // `.telelean/subjects/<S>/ids.json`
```
- It is written directly by the runner, like decisions.json (`proposal/sidecarStore.ts` pattern: atomic temp+rename, per-file queue).
- Monotonic: it is never on the board stack, never in History snapshots (`isSubjectSidecarFile` stays layout.json + attic/), never in ws/ (`.telelean/` is hidden from Claude).
- It is committed with the person's files (D-12), not gitignored.
- A missing file means no ids yet. An unreadable file (bad JSON or format) refuses every allocation in that subject, fail closed. A TL2xx workspace diagnostic says: "telelean could not read ‹path›: fix or delete it; until then no new card can be added to ‹S›." (D5-18).

**When ids are recorded (5b).** `ModelWorkspace.recordIds(changes, extra?)` runs:
- **before** every write the workspace makes to a subject's model files: perform, Undo, Redo, History revert, applyChanges (Apply, and its recovery), and the end's board step;
- at every session start (B's `namedIds`);
- at every session end, whether Apply, Exit, or the drop of slice 4's provisional session (the session's `allocatedIds`).

What it records:
- the union of `namedIds` of the subject's current model;
- `namedIdsInText` of every changed file's before and after text;
- any `extra` ids.

Recording before writing means a crash can only add ids. A superset is harmless: more ids are simply avoided.

**Allocator (5a).**
```ts
// core ids/allocate.ts
export interface IdSources {
  registry: readonly string[];          // the subject's ids.json (PlanContext.ids[S]; in a session read at start)
  records?: readonly string[];          // D3-54: ids the subject's freeze records name
  session?: readonly string[];          // in a session: B's namedIds and PersistedSession.allocatedIds
}
/** Taken: every card id of the project now (ids are project-unique, build.ts), plus namedIds of the subject, plus every
 *  source above. */
export function takenIds(m: ProjectModel, subject: string, s: IdSources): (id: string) => boolean;
export function allocateCardId(sentence: string, taken: (id: string) => boolean, also?: ReadonlySet<string>): string; // = deriveId
// core edit/types.ts PlanContext + ids?: Readonly<Record<string, readonly string[]>>   (each subject's ids.json)
```
- **add-node.** It allocates with `takenIds`, plus D3-54's records from `PlanContext.freezes`. Without `ctx.ids[subject]` it refuses, `internal`: "telelean could not read this subject's card ids: reload the window." This follows D3-51: no absence turns a check off.
- **Sessions (5b).** `PersistedSession.allocatedIds?: string[]` is additive in run.json, and absent counts as []. `allocateSessionIds(session, sentences): Promise<string[]>` allocates against registry ∪ B ∪ ws/ ∪ records ∪ allocatedIds. It persists the new ids in a run.json write **before** the file write that uses them. It is used by:
  - premise adoption, through slice 2's `run/premises.ts`, which passes them as D3-54's `reserved`, widened;
  - `add_card`, through 3c2/3e3's `run/step.ts`, when built (the D3-43 fallback may leave it out);
  - slice 4's draft cards.

  So a card taken out in a session never lends its id, or its `card:<id>` item key, to a later card of the same session. This also closes a latent in-session reuse (open question 9).
- `add-node.preferredId` stays ignored (it was never used). Removing it from the type is the integrator's call.

**F1: the subject's missing ids are written with every board write (5a, D5-3).**
```ts
// core edit/ids.ts
/** Writes the `id:` of every card of `subject` that has none into `session`, skipping blocks the plan removed or replaced,
 *  and returns the ids written (for D3-54's `lose`, computed exactly as slice 3's planIdWrites does). */
export function writeSubjectIds(session: EditSession, m: ProjectModel, subject: string): string[];
```
- `planAction` calls it at the end of every plan that changes a model file of the plan's subject. Layout-only plans never call it.
- Slice 3's `planIdWrites` is refactored onto it, so there is one implementation. The ids join the plan's `lose` delta through `PlanContext.freezes` (D3-54).

Why F1 is needed: a derived id depends on other blocks. Take A (`id: x`) and B (id-less, same slug, so derived `x-2`). Deleting A makes B derive `x`, and every reference or freeze naming A would silently pass to B. With F1, B's `id: x-2` is written in the very plan that deletes A.

After the first telelean write in a subject, derived ids exist only for blocks the person wrote by hand since. TL112's text becomes: "This block has no `id:`; telelean uses `‹id›` and writes it on its next change to this subject."

**Migration**
- Nothing is rewritten at upgrade.
- ids.json appears at the first write or session after slice 5.
- Derived ids are written at the first board write of each subject, inside that action's Undo step and History entry. The user guide says so.
- Freeze records are unchanged. D3-54's `recordApplies`/`sentences`/`lost` still handle hand edits, and the allocator avoids the ids of records made before the registry existed.
- No references exist before slice 5.
- A session open across the upgrade gets `allocatedIds` = [] (residual: ids of cards it took out before the upgrade are not protected).

**Compatibility**
- Slice 2's item keys: ids stay stable within a session (D3-37's ids commit). With `allocatedIds`, an id is never allocated twice, so keys never collide.
- Slice 3's records: D3-16 and D3-54 unchanged; the allocator subsumes D3-54's `reserved`.
- Attempts history (`attempts.jsonl` targets) can no longer attach to a new card that took a deleted card's id.

**Residuals (D5-19)**
- A hand-written id-less block that derives a retired id, or a hand-written `id:` of a deleted card, is taken for that card. RF-2 identifies a card by its id, as D3-54 already accepts.
- A git checkout can roll ids.json back.
- Ids of cards deleted before slice 5 are unknown, but nothing then named them except freeze records, which D3-54 covers.

================================================================
2. STORED FORM (RF-2 a; 5a)
================================================================
```ts
// core refs/tokens.ts  (CardField, VocabField: slice 3 freeze/types.ts)
export type RefTarget = { kind: 'card'; card: string; field?: CardField } | { kind: 'lean'; name: string; field?: VocabField };
export interface RefSpan { start: number; end: number; token: string; target: RefTarget }
export function refToken(t: RefTarget): string;       // throws when !canReference(t)
export function canReference(t: RefTarget): boolean;  // id per ID_PATTERN; name per the grammar below
export function parseRefToken(token: string): RefTarget | undefined;
export function refsIn(text: string): RefSpan[];
export function refKey(t: RefTarget): string;          // canonical, for maps and multisets
```
**Grammar.**
- `#[card:ID]` or `#[card:ID:FIELD]`, where FIELD is one of sentence | kind | why | stance | source | statement | dependencies | proof.
- `#[lean:NAME]` or `#[lean:NAME:FIELD]`, where FIELD is declaration | gloss.
- ID matches ID_PATTERN. NAME is dotted Lean identifiers (Unicode letters, digits, `_ ' ! ?`, subscripts), with no «», whitespace, `:` or `]`. A vocabulary item whose name does not fit cannot be referenced (D5-4).
- Anything else is plain text.
- Tokens live only in card `natural_name:` and `rationale:` values, which may be raw or JSON-quoted (D5-11). `formatFieldValue` already writes them raw, since they contain no `/-` or `-/`.
- Bodies after `---` and vocabulary glosses (Lean docstrings) take no tokens.
- Session prose (answers to Claude, Shaky notes, slice 4's Instructions) uses the same tokens. They are stored raw in decisions.json and run.json.

================================================================
3. NAMES, CHIP DATA, DIAGNOSTICS (RF-2 c; 5c1)
================================================================
```ts
// core refs/resolve.ts
export interface RefResolver {
  card(id: string): { sentence: string; type: NodeType } | undefined;  // the resolver's subject's cards only (D5-6)
  lean(name: string): { shortName: string } | undefined;              // any vocabulary item of the project
}
export function resolverOfModel(m: ProjectModel, subject: string): RefResolver;
export function resolverOfGraph(g: Pick<TlGraph, 'nodes' | 'vocabulary'>): RefResolver;   // webview and views
export const FIELD_LABEL: Readonly<Record<CardField | VocabField, string>>;  // slice 3's labels: Sentence … Lean statement, Dependencies, Proof, Lean declaration, Gloss
export function refLabel(t: RefTarget, r: RefResolver): { name: string; field?: string; deleted: boolean };
/** 'plain': ‹S› · ‹S›’s Lean statement · ‹InGame› · ‹deleted card›; a reference inside S is shown as … (one level; ‹ ›
 *  inside S become '), so renderings never nest. 'claude': the same, each followed by [card ID] or [NAME]. */
export function renderRefs(text: string, r: RefResolver, style: 'plain' | 'claude'): string;
export function nameOf(node: Pick<TlNode, 'naturalName' | 'name'>): string;   // node.name ?? node.naturalName
// core model.ts TlNode + (optional, additive; change-log entry):
/** RF-2 (c) (slice 5): the sentence with each reference shown as ‹its target's current sentence›, for every place that
 *  names the card in text; absent when the sentence holds no reference. */
name?: string;
```
**build.ts**
- Computes `name` per node from the same model it builds. In a session that is the masked model, so names never show hidden content.
- Adds `TL124` (warning; the next free code, the integrator confirms): "This ‹sentence|Why› refers to a card of another subject (‹S›): references name cards of their own subject, so it shows “deleted card”."
- Adds `TL125` (info): "This ‹sentence|Why› refers to a deleted card."

**subjectGraph.ts.** The Lean names that this subject's cards reference join `foreignVocabulary`'s `wanted` set. A referenced foreign vocabulary item therefore appears in this board's band, read-only, freezable as TR-10 allows. This means the webview can resolve every `lean:` token from `graph.vocabulary`, and TlGraph needs no new field.

**Webview data.** Chips need only the raw text and the view's graph (`resolverOfGraph`). The webview store sets `name` for optimistic edits with the same function.

================================================================
4. DOCSTRINGS AND CLAUDE (RF-2 d; 5c1, 5e)
================================================================
```ts
// core refs/mirror.ts
export function mirrorText(sentence: string, r: RefResolver): string;            // renderRefs(…,'plain'), for /-- -/
/** D-9 with references: the docstring mirrors `sentence` when it equals its plain rendering under SOME names: each
 *  reference matches ‹[^‹›]*›(’s [a-z ]+)?, the rest exactly (escapeBodyText, trimmed). */
export function isMirrorOf(docstring: string, sentence: string): boolean;
// core refs/claude.ts
export function rawSpan(text: string): string;    // wraps text the runner must leave as stored (tl-raw … /tl-raw)
export function renderForClaude(text: string, r: RefResolver): string;  // renders outside raw spans, strips the markers
```
**Docstrings**
- Three writers render references: `gate/normalise.ts` (`set-docstring` with `mirrorText`, compared with its escaped form), `gate/adoption.ts` (`/-- mirrorText -/`), and `planEditNode`.
- In `planEditNode`, D-9 follows the sentence when `isMirrorOf(docstring, oldSentence)`.
- Also in `planEditNode`, outside sessions only (the board path): when the person edits card B's sentence, every card of the subject whose sentence references B and whose docstring `isMirrorOf` its own sentence is re-mirrored in the same plan and Undo step. This is a follow-on edit by the person.
- Sessions never re-mirror other cards. That would change their statement text, which may be frozen (D5-7). Residual: after a session changes a referenced sentence, the referencing docstrings keep the old wording until their own sentence is next edited on the board.

**Claude (5e): two choke points per run (`runner/src/run/claudeText.ts`)**
```ts
export function renderingSession(inner: LlmSession, resolver: () => RefResolver): LlmSession;          // send(turn) renders
export function renderingToolHost(inner: AgentToolHost, resolver: () => RefResolver): AgentToolHost;  // every string of every result
```
- The run manager wraps the session and the tool host once per run, for real and fake backends alike.
- The resolver is `resolverOfModel` over the session's latest parsed ws/ model (a parse, no Lean).
- So every user turn reads references as ‹sentence› [card ID]. That covers the context bundle, feedback turns, notes, answers, Instructions, and "Earlier answers in force" from decisions.json. Every tool result does the same: gate findings, freeze texts, request answers.
- Exception: a frozen sentence or Why that Claude must restore verbatim. Slice 3's `CLAUDE_FREEZE_TEXTS.frozen` "‹show›" for those fields, and any G5 text that quotes an original line to restore, wraps its value in `rawSpan`.
- The files Claude reads with its own tools keep the stored form (D5-7).

The static system prompt gains one line (fixture and plan text updated): "Sentences and reasons may contain references to other cards, stored in the files as `#[card:ID]`, `#[card:ID:FIELD]` or `#[lean:NAME]`. In telelean's messages each appears as ‹the target's sentence› [card ID]. When you change a sentence, keep its references exactly as written, and never write new ones."

================================================================
5. VALIDATION AND CLAUDE'S LIMIT (5c1, 5c2)
================================================================
```ts
// core refs/validate.ts
/** The person's edit: every token in `text` that is not in `before` (multiset) must name a card of `subject` whose kind
 *  has the field, or a vocabulary item of the project. Tokens already there (a dangling one too) may stay. */
export function refProblems(i: { text: string; before?: string; model: ProjectModel; subject: string }): string[];
export function addedRefs(before: string, after: string): RefSpan[];
```
**The person's edits (5c1).**
- `planEditNode` (naturalName, rationale) and `planAddNode` (sentence, Why) refuse with ActionError `invalid`, using refProblems' text:
  - "“‹token›” names no card of this subject: pick references from the # list."
  - "“‹card›” is an axiom: it has no ‹field›."
  - "‹name› is not a vocabulary item: pick references from the # list."
  - "“‹token›” names a card of the subject ‹S›: a reference names a card of its own subject (vocabulary from any subject is fine)."
- The plan already writes every missing id of the subject (F1). The target's id is therefore written in the same plan, and a reference only ever names a written id.

**Claude never adds a reference (5c2, D5-8).** New GateFindingCode `reference`, in `judgeState`'s global findings: refusals at step purposes and at `final`; a stage problem if one is ever seen.
- For each card block of the session's subject in the judged state, `addedRefs(B's value, state's value)` must be empty for `natural_name` and `rationale`. A new block counts B's value as "".
- Docstrings of declarations Claude added or changed must contain no token.
- Message: "“‹sentence›” (‹id›): ‹token› is a reference you added. Only the person adds references: keep theirs exactly as written and add none (write the card's sentence in words)."
- Slice 4 adds `JudgeInput.personTexts`, the texts the person typed in a transform, which count as B for this rule (hook).

**Validators**
- `gate/adoption.ts` refuses a premise sentence that contains a token.
- Slice 3's `addCardProblems` refuses an add_card sentence that contains a token.
- The runner's `propose_assumption` handler reports the refusal to Claude at once.
- The `decideItems` validator refuses a token in the one-line Why typed at an Add premise's Accept: "References in this Why come with the transform window: write it in words, or add the reference on the board after Apply." (D5-11; slice 4 lifts this with `personTexts`).

**Person-facing core texts use `nameOf` (5c2).** The sites, found by grepping `naturalName`:
- `edit/planShared.ts label`, `planArrows nameOf`/`quoted`;
- `review/items.ts`, `backstop.ts`, `formalize.ts`, `records.ts`, and the view labels;
- `gate/describe.ts` board sentences;
- slice 3's `FREEZE_TEXTS`.

Claude-facing gate texts need no sweep: 5e renders them.

================================================================
6. REFERENCES HOLD THEIR TARGETS (FZ-4 bullet 2, RF-5 a, S12; 5d)
================================================================
**What a reference holds (D5-9).** Holding is transitive through held sentences and Whys (each target once, cycle-safe). A target missing in the model holds nothing. So does a deleted one, which never comes back as another card (§1).

| Reference | Holds |
|---|---|
| `#[card:c]` | c's sentence (FZ-4's "that card's Sentence") |
| `#[card:c:sentence/why/kind/stance/source]` | that field's text |
| `#[card:c:statement]` | c's Lean statement when it has one: its addressValue (text and meaningKey) and its Lean closure, as a frozen statement holds; nothing when empty, so ES-2's fuzzy statements stay fuzzy |
| `#[card:c:dependencies]`, `#[card:c:proof]` | nothing: FZ-4's own exceptions (Dependencies stay open for additions; proofs never change what a statement means) |
| `#[lean:n]` | n's declaration (slice 3's heldValue, D3-3) and n's gloss |
| `#[lean:n:declaration]`, `#[lean:n:gloss]` | that field |

```ts
// core freeze/refs.ts
export type HeldKey = string;   // a Lean name (slice 3), or the FreezeKey of a held field (canonical JSON, starts with '[')
export function isFieldKey(k: HeldKey): boolean;
export function referenceHolds(m: ProjectModel, subject: string, roots: readonly FreezeTarget[]): FreezeTarget[];
export function heldValueOf(m: ProjectModel, k: HeldKey): HeldValue;     // Lean name: heldValue; field: addressValue's key/approx/exact
/** Slice 3's heldMap, widened: heldMap(m, decls ∪ held statements' and Lean refs' decls) plus each referenceHolds target
 *  of `fields` (sentence/why roots) with heldValueOf. */
export function holdingMap(m: ProjectModel, subject: string, roots: { decls: readonly string[]; fields: readonly FreezeTarget[] }): Record<HeldKey, HeldValue>;
/** The filled hook (signature adapted to 3a's stub if it differs; recorded in §8): for B-expected entries (standing,
 *  foreign, own `{ from: 'base' }`), the held keys their sentence/why references add, with their holders; memoised per B. */
export function heldFields(base: ProjectModel, subject: string, entries: ReadonlyMap<FreezeKey, FreezeTableEntry>): ReadonlyMap<HeldKey, { value: HeldValue; holders: FreezeKey[] }>;
/** D5-10: declarations of `subject` that other subjects' sentences/Whys reference: declaration and gloss at B. */
export function otherSubjectRefHolds(base: ProjectModel, subject: string): ReadonlyMap<HeldKey, { value: HeldValue; by: string[] }>;
```
**Wiring into slice 3** (one table, nothing parallel):
- (a) `effectiveFreezes`/`frozenFindings` step 3 compares every held key with `heldValueOf(current, k)`. The keys come from:
  - `heldFields` for B-expected holders;
  - the stored maps of own freezes and accepted items.

  Two-value rule, `fresh`, `conflict` and the one-message rule are unchanged, because the dispatch is by key.
- (b) Every held map slice 3 stores is computed by `holdingMap`:
  - an own freeze's `OwnValue.held`, computed by the runner's `freeze()` values (3d's `run/session.ts`);
  - `StateJudgement.freezeAtAccept`, hence `heldAtJudge` and `frozen.held` (`review/judge.ts`), with the draft's covered sentence/why targets as `fields`.
- (c) `frozenChangesOf` emits held rows with `key` for field holds. This gives D3-48's dialogs and D3-49's keep set the field holds too.
- (d) `unmeetable` maps a field key to its card's lines in `snapshot.blocks`.
- (e) `unfreezeRequestProblems` accepts `{card, field}` items held by references and names their holders. `deleteCardProblems` refuses a card any of whose fields is held.
- (f) `buildFreezesView` and `boardFreezesView` carry field holds, so `StateJudgement.held` gets field keys. These drive the chain marks "held by “‹A›” (it refers to this)".
- (g) The backstop runs the same check on F.
- (h) `other-subject` (§3.5) also compares `otherSubjectRefHolds` at every purpose. Token `other-subject`, text: "‹name› (or its gloss) is referred to by “‹card›” of the subject ‹S›: a session never changes what another subject relies on, so leave it exactly as it was."

**New texts** (`freeze/texts.ts`)
- For Claude, `heldField`: "“‹card›” (‹id›): its ‹field› is held: the frozen “‹A›” refers to it with #, so it may not change. Restore it: ‹rawSpan(show)›. Or ask with request_unfreeze (the person can unfreeze what holds it)."
- For the person: "“‹card›” › ‹field› is held by frozen “‹A›”, which refers to it."

**Runner part of 5d.** The step turn's listing of frozen and held content (`run/prompts.ts`, slice 3's) lists held fields.

**Persisted maps.** run.json held maps may now contain field keys (additive). Reversing slice 5 mid-session is unsafe; finish or Exit first (§13).

================================================================
7. RELIANCE WARNINGS (RF-5 b)
================================================================
```ts
// core refs/dependents.ts (5c1)
export function referencedBy(m: ProjectModel, subject: string, card: string, field?: CardField): Array<{ card: string; field: 'sentence' | 'why' }>;
export function detachRefs(text: string, card: string, r: RefResolver): string;   // its tokens → plain ‹…›, unlinked
// core edit/types.ts DeletePlan + referencedBy: string[]
```
- **Board Delete (5c1 data, 5f2 dialog; D5-12).** The dialog adds: "Referred to by ‹n› cards: ‹names›. Their references will show “deleted card”." There is no rewrite option.
- **Slice 4's TR-13 (requirement handed to slice 4).**
  - When a transform deletes a card, or changes a field that whole-card or field references point to, the window lists `referencedBy` with frozen marks.
  - For references, "rewrite" means `detachRefs`: telelean's follow-on edit, which counts as the person's.
  - Its other options are TR-13's own.

================================================================
8. UI (5f1, 5f2; webview)
================================================================
New `webview/src/refs/`:
```ts
// resolve.ts: chipOf(token, graph) → { label: string; field?: string; deleted: boolean; target: RefTarget }
// search.ts (pure, unit-tested; RF-4)
export interface RefCandidate { target: RefTarget; label: string; haystack: string; kind: NodeType | 'vocab'; fields: Array<{ field: CardField | VocabField; label: string }> }
export function refCandidates(g: TlGraph, o?: { cardsOnly?: boolean; exclude?: readonly string[] }): RefCandidate[];
export function searchRefs(query: string, c: readonly RefCandidate[], limit?: number): RefCandidate[];
// RefText.tsx: <RefText text graph onReveal/>   RefPicker.tsx: <RefPicker anchor query candidates onPick onClose cardsOnly?/>
// RefInput.tsx: <RefInput value onChange multiline? onCommit? onCancel?/>   reveal.ts: revealRef(t, store)   copy.ts
```
**Candidates.**
- The view's graph: this subject's axioms and propositions, without provisional cards, and every vocabulary item of the band, own and foreign (TR-10 c).
- In a session the graph is the Proposed view's, which the host has already masked (D2-61). Hidden premise cards and proof material are never offered (I5).
- Search (RF-4, no numbers):
  - Haystacks are `nameOf(card)`, and a vocabulary item's short name plus gloss.
  - Matching folds with core's transliteration (exported from ids.ts), case and diacritics. Every query term must occur.
  - Ranking: word-start matches first, then earlier position, then board order.
  - At most 50 results. An empty query lists axioms, then propositions, then vocabulary.

**RefInput (RF-1, RF-3, D5-5).**
- The field shows the stored form, as GitHub shows `#123` in its editor. A live preview line below renders the chips ("Shows as: …").
- A typed `#` opens RefPicker only at the start of the field or after whitespace or an opening ( “ " ‘ (D5-14). A pasted `#` never does, and neither does one typed during IME composition.
- The query is the text after `#` up to the caret, spaces allowed.
- Keys:
  - ↑/↓ moves; → (or a click on ›) opens the card's fields, those of its kind; ← goes back.
  - Enter inserts `refToken` in place of `#query`, with `setRangeText`, so native undo keeps working (UN-4 4b).
  - Esc closes the picker and leaves `#query` as plain text (RF-3). A second Esc cancels the edit as before (CM-2).
  - Backspace past `#`, or a blur, closes it.
- Rows use `onMouseDown` preventDefault, so InlineEdit's blur-commit never fires mid-pick.
- RefInput is used only on prose fields, so no Lean field can open it (RF-3). Slice 4 must keep its Lean fields on plain inputs.

**Where # works (D5-11)**
- 5f1:
  - the A|P box sentence and Why (`PromptBox.tsx`);
  - the board's in-place sentence and Why editors (`InlineEdit` gains `references`; `NodeCard.tsx`, `CardDetails.tsx`).

  All of these are disabled during a session by ES-9, as today.
- 5f2:
  - answers to Claude (`run/Questions.tsx`, free text);
  - slice 2's Shaky "Note for Claude" (2g's decline menu), including D2-13's "Ask me about" prefill.
- Slice 4: Instructions (multiline RefInput), draft sentences and Whys, and the Dependencies list (RefPicker `{cardsOnly, exclude}`).

**Chips (RF-1 b, RF-2 c).** `RefText` renders a sentence or Why wherever it is shown as the card's own text:
- the card face and "because:", and CardDetails;
- slice 2's Change and Add field rows (before and after, resolved on the Proposed graph);
- answers, notes, Earlier answers.

How a chip looks and reads:
- Label "‹nameOf target›" or "‹…› › ‹Field label›" (RF-1's example). Long sentences are cut at 60 characters, with the full text in the tooltip "‹sentence›‹ › field›. Click to show it."
- A deleted target reads "deleted card", with the tooltip "This card was deleted: the reference stays as written."
- Style: `--vscode-textLink-foreground` with an underline, never an aura or a glow colour. A deleted chip uses disabledForeground plus its words, never colour alone.
- Chips never show status, glows or bands (I5).
- On the card face, `pointerdown` on a chip stops propagation, so it never starts a drag or a selection.
- Click → `revealRef`:
  - a card: select it and pan (`revealCardSoon`);
  - a field: also expand the card and flash its field row (`data-field`, slice 3's FieldLock rows);
  - vocabulary: scroll the band and select it (slice 3's vocabulary selection);
  - deleted: toast "This card was deleted.";
  - in session panels: reveal on the Proposed view, switching to it as slice 3's [Select them] does.
- Keyboard path: CardDetails gets two rows of focusable chips, "References" and "Referred to by" (the latter from the graph).

**Names elsewhere.** Every webview place that names a card in text uses `nameOf`: relations, dialogs, toasts, review labels, the run panel, menus. That is about 35 sites; 5f2 sweeps them, with a DOM-scan test.

**Copy reference (CM-4 row 10, ES-9 bullet 2; D5-15)**
- An icon in the Context Menu section, and an entry in the right-click menus of cards, fields and vocabulary cards (`board/menu.ts cardActions`, `contextActions.ts`, `header/ContextSection.tsx`, slice 3's field and vocabulary menus).
- It copies the stored form of every selected card and field, space-separated, through the existing `copyText` message. Arrows, marks and items are ignored, and the label says so ("Copy reference", "Copy ‹n› references"; G12).
- Enabled on both views, also during a session: it only reads.
- Disabled on a provisional card (MENU_PROVISIONAL), and with "Copy reference works on cards and fields." when nothing fits.
- Toast: "Reference copied: paste it into a sentence, a Why or a message to Claude."

**Held marks (5f2).** Slice 3's `model/freezeLook.ts` adds held field keys. FieldLock rows and the face show the `link` glyph and "held by “‹A›” (it refers to this)" in descriptionForeground. The legend's held entry adds "or a frozen card refers to it with #".

**User guide** (`docs/user-guide.md`, 5f2): a "References" section covering:
- typing #, chips, Copy reference and "deleted card";
- that frozen cards' references hold their targets;
- that ids are never reused, and that the first change to a subject writes its cards' missing `id:` lines;
- that Claude never adds references.

================================================================
9. PROTOCOL AND PERSISTENCE
================================================================
- **Protocol.** No new webview↔host message: edits travel in `editNode`/`addNode` text, and copying uses `copyText`. The `decideItems` validator gains the premise-Why token refusal (§5).
- **Files**
  - new `.telelean/subjects/<S>/ids.json` (§1);
  - run.json `PersistedSession.allocatedIds?` (additive);
  - held maps may hold field keys.
- **Formats unchanged:** freezes.json, layout.json, markup v1 (tokens are text), and the graph.json schema. `TlNode.name` is exported or left out per the schema test; the 5c1 builder records which.

================================================================
10. HOOKS FOR SLICE 4
================================================================
- TR-2 (c): `allocateSessionIds`. Draft cards get real ids at creation through a slice-4 message to the runner, so drafts can reference each other. Burned ids reach the registry at the session's end.
- TR-4: RefPicker `{cardsOnly, exclude}` for the Dependencies list. The stored data stays `premises:` ids.
- TR-8: multiline RefInput. 5e already renders the result for Claude.
- TR-10 (c): foreign vocabulary is in the candidates.
- RF-5 (b): `referencedBy`/`detachRefs` in TR-13 (§7).
- `JudgeInput.personTexts`, for the `reference` rule (§5) and for allowing # in a premise's Accept Why.
- Typed Lean fields stay plain inputs (RF-3).
- A transform that edits a referenced sentence holds per §6 through `holdingMap`, for the `transform` reason's values.

================================================================
11. TEXTS (verbatim; core `refs/texts.ts` REF_TEXTS; webview labels.ts)
================================================================
- **Picker**
  - hint: "Find a card by its sentence · → its fields · Enter inserts · Esc keeps #"
  - empty query result: "No card or vocabulary matches “‹q›”."
  - board without cards: "No cards yet."
- **Preview:** "Shows as:"
- **Chips:** "deleted card" (RF-2 c).
- The refusal texts of §5, the delete line of §7, TL124, TL125 and the TL2xx text (§1, §3).
- The Claude texts of §4 to §6, and the copy texts of §8.

================================================================
12. AUTOPILOT DECISIONS (each with its alternative and reversal)
================================================================
- **D5-1** Build slice 5 after slice 3 and before slice 4.
  - Alternative: ★D8's order, with slice 4 stubbing:
    - TR-2 (c) with D3-54's reserved ids plus B's and the session's ids;
    - a plain sentence-filtered card list for Dependencies;
    - plain-text Instructions;
    - TR-10 (c) waiting;
    - RF-5 (b)'s rows added by 5f.
  - Reverse: build slice 4 first with those stubs.
- **D5-2** Slug ids kept; never-reuse comes from the monotonic ids.json registry and one allocator.
  - Alternative: opaque random or counter ids, with a migration of every id-keyed file.
  - Reverse: stop reading ids.json; allocation becomes current ids ∪ D3-54's reserved ids (∪ B and allocated ids in sessions).
- **D5-3** Every board write writes the subject's missing `id:` lines (F1).
  - Alternative: write only the ids of named cards, accepting that a delete can hand an id to an id-less card with the same slug.
  - Reverse: drop `writeSubjectIds` from planAction.
- **D5-4** Stored form `#[card:…]` / `#[lean:…]` with optional `:FIELD`. Names with «» cannot be referenced.
  - Alternative: GitHub's `#ID` (ambiguous with prose `#`), or markdown links with sentence snapshots (stale text inside other cards' blocks).
- **D5-5** The editor shows the stored form, with a chip preview (as GitHub does; it keeps native undo).
  - Alternative: atomic chip markers inside the input.
  - Reverse: replace RefInput's text model; the storage is unchanged.
- **D5-6** Card references stay within the subject; vocabulary from any subject can be referenced. A hand-written cross-subject card token shows "deleted card" with TL124.
  - Alternative: cross-subject card references, with the session start reading other subjects' frozen references into the table.
  - Reverse: resolve project-wide in `refProblems`/`resolverOfModel` and add those holds to D3-41's foreign snapshot.
- **D5-7** RF-2 (d) reading:
  - turns and tool results are rendered at the runner's two choke points;
  - the files Claude reads keep the stored form, explained by the system prompt;
  - exact restores keep the stored form in a raw span;
  - docstrings are rendered when written, and re-mirrored on board edits of a referenced sentence;
  - sessions never re-mirror other cards.
  - Alternative: sentence snapshots inside tokens, refreshed by telelean.
- **D5-8** Claude never adds a reference (the `reference` rule plus validators).
  - Alternative: allow references to existing targets, judged like any change.
  - Reverse: drop the rule and keep only the existence checks.
- **D5-9** The hold table of §6.
  - Alternatives: also hold Dependencies, Proof and empty statements (this would override ES-2's exceptions, which FZ-4 forbids); or hold only a vocabulary item's declaration.
  - Reverse: edit `referenceHolds`.
- **D5-10** Prose references from other subjects into the session's subject are held whether or not the referencing card is frozen (extends D3-41's `other-subject` rule).
  - Alternative: hold only frozen ones, which needs other subjects' frozen fields in the start snapshot.
  - Reverse: drop `otherSubjectRefHolds`.
- **D5-11** References are allowed in card sentences and Whys, answers to Claude, Shaky notes and slice 4's Instructions. They are not allowed in glosses (Lean docstrings), block bodies, Lean fields, or (until slice 4) a premise's Accept Why.
  - Reverse: add RefInput to those fields, plus `personTexts`.
- **D5-12** The board's Delete lists the references and offers no rewrite.
  - Alternative: a "keep their wording" option using `detachRefs`.
- **D5-13** There is no board-wide find; the # dropdown is RF-4's sentence search.
  - Alternative: Ctrl+F with the same matcher.
- **D5-14** `#` opens the dropdown only at a word start.
  - Alternative: anywhere (C# would open it).
- **D5-15** Copy reference copies the stored form of every selected card and field, and is allowed in both views during a session.
  - Alternative: copy the sentence text.
- **D5-16** Chips show only the sentence and field; candidates come from the masked view (RV-6). This is a safety rule, with no alternative.
- **D5-17** Session allocations are recorded in `allocatedIds` and folded into ids.json at the session's end. The registry also records at the session's start.
  - Alternative: derive allocated ids from the ledger and records.
- **D5-18** An unreadable ids.json refuses allocations (fail closed); a missing file counts as empty.
  - Alternative: treat an unreadable file as empty.
- **D5-19** Residuals:
  - a hand-written id-less block or `id:` that takes a retired id is taken for that card;
  - a git checkout can roll ids.json back;
  - docstrings referencing a sentence a session changed stay stale until their own edit.
  - Alternative: registry-aware derivation in build. Rejected: a History restore of an id-less block would get a new id.

================================================================
13. REVERSAL
================================================================
- Reverse with the slice-5 patch (AP-4), after finishing or exiting open sessions: run.json held maps may hold field keys, and `allocatedIds`.
- ids.json is left in place and ignored by older code.
- References already written stay in the files as `#[card:…]` text. The older board shows them raw.
- `id:` lines written by F1 stay. They are valid v1 markup.
- **sub_slices:**
  - [1]
    - **id:** 5a
    - **scope:** Core: the reference token grammar, the ids registry format, the allocator, and F1.
- Token grammar (refs/tokens.ts).
- Ids registry format and namedIds (ids/registry.ts); paths.idsPath.
- Allocator and takenIds (ids/allocate.ts).
- F1: writeSubjectIds, called at the end of every model-file plan in planAction, with D3-54's lose delta. Slice 3's planIdWrites is refactored onto it.
- add-node allocates with PlanContext.ids and refuses without it.
- TL112 text.
After slice 3's verified end; nothing beside it in core.
    - **files:**
      - packages/core/src/refs/tokens.ts (new)
      - packages/core/src/ids/registry.ts (new)
      - packages/core/src/ids/allocate.ts (new)
      - packages/core/src/edit/ids.ts (new: writeSubjectIds)
      - packages/core/src/edit/planAction.ts
      - packages/core/src/edit/types.ts (PlanContext.ids)
      - packages/core/src/freeze/plan.ts (planIdWrites onto writeSubjectIds)
      - packages/core/src/paths.ts (idsPath)
      - packages/core/src/markup/parser.ts (TL112 text)
      - packages/core/src/index.ts
      - packages/core/test/refs/tokens.test.ts
      - packages/core/test/ids/registry.test.ts
      - packages/core/test/ids/allocate.test.ts
      - packages/core/test/edit/ids.test.ts
    - **tests:** - Tokens:
  - refToken/parseRefToken round trip for every field and both kinds.
  - These stay plain text: #[card:], #[card:Bad Id], #[lean:«x»], #[card:x:nosuch], an unterminated token, #[1].
  - refsIn finds overlapping-looking runs correctly.
  - Property: text without '#[card:' or '#[lean:' has no refs.
- Registry:
  - parse/serialise round trip, sorted and unique;
  - lenient problems;
  - null gives empty; bad JSON gives unreadable.
  - namedIds covers written and derived ids, premises entries and token ids.
- Allocator:
  - never returns a taken, registry, records or session id;
  - suffix order;
  - the n-<hex> fallback is suffixed.
- F1:
  - id-less blocks of the subject get id: in a model-file plan, and not in a layout-only plan;
  - removed blocks are skipped;
  - no double write when the plan wrote the id;
  - other subjects are untouched;
  - the lose delta matches planIdWrites';
  - the sibling scenario: A 'id: cynder-is-dark', B id-less 'Cynder is dark!' (derived -2), C references A. Delete A, then B's id: cynder-is-dark-2 is written in the same plan and C's token resolves to nothing. Mutation: drop the post-pass and the test fails.
- add-node:
  - re-add after delete gives -2;
  - refused without ctx.ids, with the exact text (fail closed);
  - D3-54 record ids are avoided.
- Core unit tests single-worker under the memory cap; no Lean.
    - **risk:** Medium. F1 changes the exact output of every plan on subjects with id-less blocks, so tests that compare plans exactly on such fixtures change. The builder lists them in §8. The EditSession post-pass must skip blocks the plan replaced (session.block throws 'unsafe').
  - [2]
    - **id:** 5b
    - **scope:** Runner and host: the ids registry on disk and session allocations.
- An ids.json store using the sidecarStore pattern (atomic, per-file queue, never undone or snapshotted).
- ModelWorkspace reads every subject's ids.json at load, on its sidecar event and after its own writes; idsOf(subject); planContext().ids.
- recordIds runs before perform, Undo, Redo, History revert, applyChanges (and Apply's recovery) and the end's board step, and at session start and end.
- An unreadable file gives a TL2xx diagnostic and refuses allocations.
- PersistedSession.allocatedIds; allocateSessionIds persists before use.
- Premise adoption (run/premises.ts) and add_card (run/step.ts, if 3c2/3e3 were built) allocate through it (D3-54's reserved, widened).
- recover() treats an absent field as [].
After 5a; may run beside 5c1.
    - **files:**
      - packages/runner/src/proposal/sidecarStore.ts (or new packages/runner/src/workspace/idsStore.ts)
      - packages/runner/src/workspace/modelWorkspace.ts
      - packages/runner/src/workspace/types.ts
      - packages/runner/src/run/session.ts
      - packages/runner/src/run/types.ts
      - packages/runner/src/run/persist.ts
      - packages/runner/src/run/premises.ts
      - packages/runner/src/run/step.ts (add_card site, if built)
      - packages/runner/src/run/sessionEnd.ts (fold allocatedIds at Apply/Exit)
      - packages/runner/test/workspace/ids.test.ts
      - packages/runner/test/run/allocate.test.ts
    - **tests:** - recordIds runs before each kind of write, checked with a spy on write order; the content is the union of before and after texts.
- Monotonic: Undo, Redo and History revert never shrink ids.json.
- ids.json is excluded by isSubjectSidecarFile, is in no History snapshot and no undo entry, and is never synced into ws/ (path guard).
- An unreadable ids.json refuses add-node with TL2xx; a missing one starts empty.
- History revert keeps identity: X referenced by C; delete X; add Y with X's sentence, which gets x-2; revert, and C's token resolves to X.
- Sessions:
  - a premise card taken out, then a new draft with the same sentence, gets a different id;
  - allocatedIds is persisted before the premise write (crash between the two writes);
  - Exit folds allocatedIds into ids.json;
  - session start records B's ids;
  - recover() of a run.json without the field.
- PlanContext.ids reaches every planAction call (spy).
- FakeBackend only; touched runner files only; real Lean not needed.
    - **risk:** Low to medium. Write ordering across the per-file queue, and the end/recovery paths of slice 2/3 (recordIds must be idempotent).
  - [3]
    - **id:** 5c1
    - **scope:** Core references, part 1: resolution, names, mirrors, the person's validation and dependents.
- Modules: refs/resolve.ts (RefResolver, resolverOfModel/Graph, FIELD_LABEL, refLabel, renderRefs plain/claude, nameOf), refs/mirror.ts (mirrorText, isMirrorOf), refs/claude.ts (rawSpan, renderForClaude), refs/validate.ts (refProblems, addedRefs), refs/dependents.ts (referencedBy, detachRefs), refs/texts.ts.
- TlNode.name, computed in build.ts, plus TL124 and TL125.
- subjectGraph: referenced Lean names join the foreign vocabulary.
- planEditNode and planAddNode validate tokens.
- D-9: follow with isMirrorOf; re-mirror referencing cards' docstrings, on the board path only.
- normalise and adoption mirror with mirrorText.
- DeletePlan.referencedBy.
After 5a; core alone.
    - **files:**
      - packages/core/src/refs/resolve.ts (new)
      - packages/core/src/refs/mirror.ts (new)
      - packages/core/src/refs/claude.ts (new)
      - packages/core/src/refs/validate.ts (new)
      - packages/core/src/refs/dependents.ts (new)
      - packages/core/src/refs/texts.ts (new)
      - packages/core/src/model.ts (TlNode.name)
      - packages/core/src/project/build.ts
      - packages/core/src/project/subjectGraph.ts
      - packages/core/src/edit/planAction.ts
      - packages/core/src/edit/planDelete.ts
      - packages/core/src/edit/types.ts (DeletePlan.referencedBy)
      - packages/core/src/gate/normalise.ts
      - packages/core/src/gate/adoption.ts
      - packages/core/src/ids/registry.ts (export the transliteration fold for search)
      - packages/core/test/refs/*.test.ts
      - packages/core/test/edit/refsEdit.test.ts
    - **tests:** - Resolution and labels: card; field; vocabulary, own and foreign; deleted; another subject's card gives TL124; a dangling token gives TL125.
- renderRefs plain and claude: nested refs become '…'; ‹ › are sanitized; deleted renders as ‹deleted card›.
- TlNode.name is present only when the sentence has refs; the graph.json schema test passes.
- subjectGraph lists a foreign vocabulary item that is only referenced.
- refProblems, each refusal text exact: unknown card; card of another subject; field not of its kind; non-vocabulary name. A dangling token already present may stay.
- isMirrorOf with wildcard slots (and a non-mirror docstring).
- planEditNode:
  - follows the mirror;
  - re-mirrors a referencing card's docstring in the same plan;
  - leaves non-mirror docstrings alone;
  - one Undo restores all.
- normalise and adoption docstrings are rendered.
- referencedBy and detachRefs.
- The delete plan lists the referencing cards.
- Non-interference: a slice-2 hidden-results pair whose sentences carry references gives byte-identical SessionView JSON (names come from visible sentences only).
    - **risk:** Medium. The build's per-node pass must stay cheap. The masked build must compute names on the masked model. The D-9 re-mirror must order leanOps before field edits per file.
  - [4]
    - **id:** 5c2
    - **scope:** Core references, part 2: Claude's limit and person-facing names.
- GateFindingCode 'reference': Claude adds no token to any card's natural_name or rationale, and none to a docstring of a declaration it wrote or changed. Runs at step purposes and final, in judgeState's global findings; describeFinding and Claude texts.
- Validators refuse tokens in: premise sentences (gate/adoption.ts), add_card sentences (addCardProblems, if built), and the Why typed at a premise's Accept (decideItems validator in protocol.ts / reducer input).
- The nameOf sweep of person-facing core texts: planShared.label, planArrows, review/items, backstop, formalize, records, view labels, gate/describe, slice 3's FREEZE_TEXTS.
After 5c1; core alone.
    - **files:**
      - packages/core/src/gate/rules.ts or packages/core/src/gate/sessionRules.ts (rule 'reference')
      - packages/core/src/gate/types.ts (code)
      - packages/core/src/gate/describe.ts
      - packages/core/src/review/judge.ts
      - packages/core/src/gate/adoption.ts
      - packages/core/src/freeze/tools.ts (addCardProblems)
      - packages/core/src/protocol.ts (decideItems rationale validator)
      - packages/core/src/edit/planShared.ts
      - packages/core/src/edit/planArrows.ts
      - packages/core/src/review/items.ts
      - packages/core/src/review/backstop.ts
      - packages/core/src/review/formalize.ts
      - packages/core/src/review/records.ts
      - packages/core/src/review/view.ts
      - packages/core/src/freeze/texts.ts
      - packages/core/test/gate/referenceRule.test.ts
      - packages/core/test/refs/names.test.ts
    - **tests:** - The reference rule:
  - refused: a whole-model Change adds a token to a sentence, to a Why, or moves one into the Why field; a token in a docstring Claude wrote; a new block with a token;
  - allowed: keeping the person's tokens, reordering them, dropping one (a visible Change).
  - Mutation: disable the rule, and the cheat (Claude forges #[card:future-id]) passes.
- The premise sentence validator refuses tokens; so does the add_card validator (if built); so does decideItems for the Accept Why, with the exact text.
- Person-facing texts: with a fixture where every card's sentence holds a reference, the History label, the planner errors, the describeFinding sentences and the review labels contain no '#[card:' or '#[lean:'. This is a list-driven test over the producers.
    - **risk:** Low to medium. The sweep is mechanical, but sites are easy to miss: a grep-based checklist goes in the builder's report.
  - [5]
    - **id:** 5d
    - **scope:** Core (plus small runner texts): references hold their targets (FZ-4 bullet 2, RF-5 a, S12).
- freeze/refs.ts: referenceHolds, heldValueOf, holdingMap, heldFields (the filled hook), otherSubjectRefHolds.
- Table/check step 3 over held keys, including field keys.
- judge.ts freezeAtAccept via holdingMap; the other-subject rule plus prose references.
- frozenChangesOf field rows (D3-48 dialogs, D3-49 keep set); unmeetable for field keys; unfreezeRequestProblems and deleteCardProblems.
- Views (held field marks); texts (heldField for Claude with rawSpan, the person's sentence).
- Runner: own-freeze values via holdingMap (run/session.ts freeze); the step turn lists held fields (run/prompts.ts).
After 5c2; core alone, with its runner part after.
    - **files:**
      - packages/core/src/freeze/refs.ts (new)
      - packages/core/src/freeze/table.ts
      - packages/core/src/freeze/check.ts
      - packages/core/src/freeze/changes.ts
      - packages/core/src/freeze/tools.ts
      - packages/core/src/freeze/view.ts
      - packages/core/src/freeze/texts.ts
      - packages/core/src/review/judge.ts
      - packages/core/src/review/backstop.ts
      - packages/runner/src/run/session.ts
      - packages/runner/src/run/prompts.ts
      - packages/core/test/freeze/refsHold.test.ts
      - packages/core/test/freeze/cheats.test.ts (new cheats)
    - **tests:** - Cheat S12: A 'frozen: “#[card:spyro-pg] is too strong”'; whole-model Claude rewords 'Spyro is PG'.
  - Refused at step purposes, naming A as holder.
  - A stage problem if planted by a revert.
  - Apply's backstop refuses F.
  - Mutation: heldFields → [] and holdingMap without fields makes the cheat pass.
- The hold table, row by row:
  - a statement ref holds text, meaning (fakeFacts meaningKey) and closure;
  - an empty statement ref leaves the statement fuzzy at a selected arrow;
  - dependencies and proof refs: a target's proof stays open and arrow additions pass;
  - a lean ref holds declaration and gloss.
- Transitive A→B→C; cycle A→B→A terminates.
- An own freeze mid-stage takes the state's values; an accepted Change carrying a token holds its target.
- Two-value rule and 'fresh' for field keys.
- frozenChangesOf lists the held field row, and Submit's keep set keeps it (D3-49).
- unfreezeRequestProblems names the holders; deleteCardProblems refuses a held card.
- Other subject: S1's sentence references S2.InGame; an S2 session changing InGame's gloss is refused ('other-subject').
- The person's board edit of a held sentence is allowed (frozen binds Claude only).
- Views: held-by marks for fields in SessionFreezesView and BoardFreezesView, built on the masked model.
- No real Lean; slice 3's fakeFacts helper.
    - **risk:** Medium to high. It touches slice 3's most intricate code (table, check, held maps, persisted run.json maps). Keep the dispatch by key so no rule is duplicated. If 3a's heldFields stub signature differs, adapt and record it in §8.
  - [6]
    - **id:** 5e
    - **scope:** Runner: Claude reads sentences (RF-2 d).
- run/claudeText.ts: renderingSession and renderingToolHost, wrapped once per run by the manager for real and fake backends.
- The resolver is the session's latest ws/ parse.
- Exact-restore values use rawSpan; the markers are stripped and never reach Claude.
- The system prompt line (systemPrompt.ts, its fixture, and the plan text).
- The nameOf sweep of person-facing runner texts (activity lines, notices).
- FakeBackend fixtures with references.
After 5d and 5b.
    - **files:**
      - packages/runner/src/run/claudeText.ts (new)
      - packages/runner/src/run/manager.ts
      - packages/runner/src/run/session.ts
      - packages/runner/src/run/systemPrompt.ts
      - packages/runner/test/run/fixtures/system-prompt fixture
      - packages/runner/src/run/prompts.ts (person-facing names only)
      - packages/runner/test/run/fixtures/sessions/refs-*.jsonl (new)
      - packages/runner/test/run/claudeText.test.ts
    - **tests:** - Transcript scan over FakeBackend sessions whose cards, answers and Shaky notes carry references: no '#[card:' or '#[lean:' in any user turn or tool result, except inside the known exact-restore templates; no  marker reaches the backend.
- The context bundle golden renders ‹sentence› [card ID].
- An answer with a token reaches Claude rendered, and decisions.json keeps it raw.
- A frozen sentence with a token: Claude's change is refused, and the restore instruction quotes the stored form.
- The prompts test matches the system prompt with its fixture and the plan.
- Activity lines use nameOf.
- FakeBackend only (TELELEAN_NO_REAL_CLAUDE=1).
    - **risk:** Low. A choke point that misses a path (for example a result built outside the tool host) is caught by the transcript scan.
  - [7]
    - **id:** 5f1
    - **scope:** Webview, part 1: the reference components, the board editors, chips and Copy reference.
- refs/{resolve,search,RefText,RefPicker,RefInput,reveal,copy}.
- InlineEdit gains references; NodeCard and CardDetails get chips, the editor with #, and the References and Referred to by rows.
- PromptBox sentence and Why with #.
- Chip reveal.
- Copy reference in menu.ts cardActions, contextActions, ContextSection and slice 3's field and vocabulary menus (both views, during a session too).
- The store's optimistic name; CSS; labels.
After 5c1; may run beside 5c2, 5d and 5e.
    - **files:**
      - packages/webview/src/refs/resolve.ts (new)
      - packages/webview/src/refs/search.ts (new)
      - packages/webview/src/refs/RefText.tsx (new)
      - packages/webview/src/refs/RefPicker.tsx (new)
      - packages/webview/src/refs/RefInput.tsx (new)
      - packages/webview/src/refs/reveal.ts (new)
      - packages/webview/src/refs/copy.ts (new)
      - packages/webview/src/common/OneLineInput.tsx
      - packages/webview/src/board/NodeCard.tsx
      - packages/webview/src/board/CardDetails.tsx
      - packages/webview/src/prompt/PromptBox.tsx
      - packages/webview/src/board/menu.ts
      - packages/webview/src/board/contextActions.ts
      - packages/webview/src/header/ContextSection.tsx
      - packages/webview/src/board/BoardInput.ts (chip pointerdown)
      - packages/webview/src/state/store.ts
      - packages/webview/src/labels.ts
      - packages/webview/src/styles/board.css
      - packages/webview/test/unit/refs/*.test.ts
    - **tests:** - searchRefs: folding, all terms, ranking, limit; candidates exclude provisional and masked-out cards; foreign vocabulary included.
- RefInput:
  - # opens only at a word start, never on paste or IME;
  - typing filters; Enter inserts the exact token;
  - → lists the kind's fields;
  - Esc closes and keeps #query; a second Esc cancels;
  - Backspace past # closes;
  - clicking a row never commits the InlineEdit (blur);
  - native undo restores the text before the insertion.
- RefText: labels, field labels, 60-character cut with tooltip, 'deleted card'.
- Clicks reveal (select/pan, expand+flash, vocabulary scroll); deleted gives a toast; pointerdown does not start a drag.
- Copy reference posts copyText with space-separated tokens; enabled on Current and Proposed during a session; disabled on provisional cards with the reason.
- An optimistic edit sets name.
- Harness screenshots of chips in the three themes.
    - **risk:** Medium. Caret handling in inputs and textareas; focus and blur interplay with InlineEdit; chip clicks inside draggable cards.
  - [8]
    - **id:** 5f2
    - **scope:** Webview part 2, and the guide.
- # in answers to Claude (Questions.tsx), with answers displayed as chips; slice 2's Shaky note (2g decline menu), including D2-13's prefill.
- Chips in slice 2's Change and Add field rows and in Earlier answers.
- nameOf sweep of every remaining webview site that names a card.
- Delete dialog: 'Referred to by …'.
- Held-by marks for fields (slice 3's freezeLook and FieldLock); legend.
- DOM-scan test.
- User guide 'References' section.
- Playwright draft s5-refs.spec.ts (not run).
After 5f1 and 5d.
    - **files:**
      - packages/webview/src/run/Questions.tsx
      - packages/webview/src/run/review/* (slice 2's 2g files: decline menu, item detail, labels)
      - packages/webview/src/run/RunPanel.tsx
      - packages/webview/src/dialogs/Dialogs.tsx
      - packages/webview/src/model/freezeLook.ts
      - packages/webview/src/board/FieldLock.tsx
      - packages/webview/src/header/legend.ts
      - packages/webview/src/model/cardData.ts and the other naturalName display sites
      - packages/webview/test/unit/refs/domScan.test.ts
      - packages/webview/test/e2e/s5-refs.spec.ts (draft, not run)
      - docs/user-guide.md
    - **tests:** - DOM scan: panels, dialogs, toasts and menus rendered from a fixture where every sentence carries references show no '#[card:' or '#[lean:' outside RefInput values.
- The Shaky note and answers insert tokens and display chips.
- The delete dialog lists referencing cards.
- Held-by marks appear on a referenced field of a frozen card's target, never in the frozen colour.
- Hidden results: chips in session panels show sentences only, and the picker offers no hidden premise card.
- Harness themes.
- Playwright left as a draft for the integrator when RAM allows.
    - **risk:** Low to medium. It depends on slice 2's 2g component names; the builder maps them from what was built and records the mapping in §8.
- **open_questions:**
  - 1. Build slice 5 before slice 4 (D5-1)? **Recommended: yes.** Slice 4's TR-2 (c), TR-4, TR-8, TR-10 (c) and TR-13/RF-5 (b) then use the finished parts, so nothing is stubbed and then replaced. **Alternative:** keep ★D8's order, and slice 4 builds the stubs listed in D5-1; 5a–5f replace them later.
  - 2. F1 scope (D5-3): write every missing `id:` of the subject at each board write? **Recommended: yes.** It is one invariant, and it closes the case where a delete hands a deleted card's id to an id-less card with the same slug. **Alternative:** write only the ids of cards that something names, and accept that residual.
  - 3. Editor UX (D5-5): show the stored `#[card:…]` form while editing, with a live chip preview? **Recommended: yes.** It is simple, keeps native undo, and is how GitHub behaves. **Alternative:** atomic chip markers inside the input (nicer, but caret, IME and undo handling are fragile).
  - 4. Cross-subject card references (D5-6)? **Recommended: refuse.** References to cards stay within the subject; vocabulary from any subject can be referenced. **Alternative:** allow them, which needs the session start to read other subjects' frozen references into the table.
  - 5. May Claude add references (D5-8)? **Recommended: no.** One text rule, and it closes forged and dangling references. **Alternative:** allow references to existing targets, reviewed as part of the Change item.
  - 6. What a whole-vocabulary reference holds (D5-9). **Recommended:** its declaration and its gloss. **Alternative:** the declaration only, treating the Lean name as its 'sentence'.
  - 7. Board Delete of a referenced card (D5-12). **Recommended:** list the referencing cards only. **Alternative:** add a 'keep their wording' option, which replaces their tokens with the plain sentence (`detachRefs`).
  - 8. Re-mirror other cards' docstrings when the person edits a referenced sentence on the board (D5-7)? **Recommended: yes, outside sessions only.** **Alternative:** never; docstrings stay stale until each card's own sentence is edited.
  - 9. Slice 3 is frozen but not built. Should its `reserved` id set for premise adoption and add_card (D3-54) already include B's ids and the ids of the session's records? **Recommended: yes**, a one-line change in 3c2 (and in slice 2's premise path if already built). As planned, a card taken out in a session can lend its id, and so its `card:<id>` item key, to a later card of the same session, until 5b's `allocatedIds`. **Alternative:** accept the gap until 5b.
  - 10. The one-line Why typed when accepting a suggested premise (D5-11). **Recommended:** no references until slice 4 adds `JudgeInput.personTexts`; the validator refuses tokens there. **Alternative:** build `personTexts` in 5c2 now.
  - 11. A TL125 info diagnostic for dangling references? **Recommended: yes**, so the person can find them after a delete. **Alternative:** the 'deleted card' chip only.
  - 12. Lean names with «» (or holding ':' or ']') cannot be referenced (D5-4). **Recommended:** accept; such names are rare and G0 already restricts names. **Alternative:** a JSON-escaped payload form, `#[lean:"…"]`.
  - 13. Record a session's allocated ids in a dedicated `PersistedSession.allocatedIds` (D5-17)? **Recommended: yes.** **Alternative:** derive them from ledger `card` entries and premise records (no new field, but coupled to slice 2/3 internals).
  - 14. Should RF-4's sentence search also be a board-wide 'Find card' (Ctrl+F) (D5-13)? **Recommended: no** (not required by the spec). **Alternative:** add it later with the same `searchRefs` matcher.
- **safety_notes:**
  - **S12, references hold their targets (FZ-4 bullet 2, RF-5 a).** 5d fills slice 3's `heldFields` hook. Field holds go through the one table, the whole-state check, the two-value rule and the backstop. Tested by:
- a new cheat: whole-model Claude rewords a sentence that a frozen card refers to. It is refused at step purposes, becomes a stage problem if a revert plants it, and Apply's backstop refuses it;
- a mutation test: emptying `heldFields` and `holdingMap`'s `fields` makes the cheat pass.
  - **FZ-4's exceptions are kept by construction (D5-9).** References to Dependencies and Proof hold nothing, and an empty statement is not held. So a target's proof stays open, empty statements at selected arrows stay fuzzy, and arrow additions pass. Each is tested in 5d.
  - **Ids are never reused (RF-2 b).** The monotonic ids.json registry, the allocator, F1 and session `allocatedIds` together guarantee it. Tested by:
- re-add after delete, and Undo, which never shrinks the registry;
- a History revert that brings back the same card and the same reference;
- the sibling-suffix case, with a mutation test that drops F1;
- a session take-out followed by a new premise;
- Exit folding `allocatedIds` into ids.json;
- ids.json absent from snapshots and undo entries.
  - **Fail closed.**
- add-node without `PlanContext.ids` is refused, with its text.
- An unreadable ids.json refuses allocations, with a TL2xx diagnostic.
- The session allocator refuses without its sources.
- A frozen meaning key the state lacks still refuses (slice 3's `no-key`, unchanged for statement holds).
Each has a test.
  - **Claude cannot forge or add references (D5-8).**
- The `reference` gate rule runs at step purposes and at final.
- The validators for premise sentences, add_card sentences and the Accept Why refuse tokens.
Tested, including tokens in docstrings, moved between fields, and a forged id. A mutation test that disables the rule lets the forged-id cheat pass.
  - **RV-6, meaning before proof.**
- Chips show only sentences and field labels, never status.
- `TlNode.name` is computed on the masked model.
- The dropdown's candidates come from the view's (masked) graph, so hidden premise cards and proof material are never offered.
Tested by a non-interference pair whose sentences carry references (byte-identical SessionView JSON), and by a webview test that the picker offers no hidden card.
  - **RF-2 (d), raw tokens never reach Claude** except exact-restore quotes inside raw spans. The rendering is applied at two runner choke points for every user turn and tool result. Tested by FakeBackend transcript scans. The private-use markers never reach the backend (tested).
  - **Out of Claude's reach.** ids.json sits in `.telelean/`, which is never synced into ws/ (path guard test). The registry and the allocation happen in telelean, never in Claude's working copy.
  - **Frozen binds Claude only (FZ-1).**
- The person's board edit of a held sentence is allowed, and so is the re-mirror of referencing docstrings that follows it.
- Sessions never re-mirror other cards, so no frozen statement text changes through telelean's follow-on edits.
Both are tested.
  - **Other subjects (D5-10, extending D3-41).** An S2 session cannot change S2 vocabulary that S1 sentences reference: declaration and gloss are kept at B by the `other-subject` rule. Tested.
  - **Dangling references hold nothing and never reattach** to another card, because the registry is monotonic. Tested by a delete, then an add with the same sentence, then a check that the token still reads 'deleted card' (TL125).
  - **Copy reference only reads.** It posts nothing but `copyText`, and it is allowed during a session on both views (ES-9). Tested by store tests.
  - **Resource and process rules.**
- Tests never call real Claude: FakeBackend scripts `refs-*.jsonl`, `TELELEAN_NO_REAL_CLAUDE=1`.
- No real Lean in unit tests: slice 3's `fakeFacts` with meaningKey.
- Vitest single-worker under memory caps; one heavy job at a time.
- `packages/extension/dist` and `out` are never built except at the verified slice end (AP-8).
- No git changes, no installs, no network.
  - **Reversal hazard.** Reversing slice 5 while a session is open could misread run.json held maps that hold field keys. Finish or Exit sessions first; the user guide and the decisions log say so (§13 of the design).
- **coverage:**
  - §1 Reference (a link to a card or field, typed with #). Covered by:
- the stored form `#[card:ID(:FIELD)]` / `#[lean:NAME(:FIELD)]` (5a);
- typing through the # dropdown (5f1);
- chips (5f1).
  - CF-1 (every card can be referenced with #). The candidates of 5f1 include every axiom and proposition card of the board and every vocabulary card it shows, including other subjects' vocabulary. Another subject's cards are referenced from their own board (D5-6).
  - RF-1 (a) (# opens a filtered dropdown in prose fields). Where # works:
- 5f1: the A|P box sentence and Why, and the board's in-place sentence and Why editors.
- 5f2: answers to Claude, and slice 2's Shaky note.
- Slice 4: Instructions and draft fields (hook).
Narrowed by D5-11: no references in glosses, block bodies or Lean fields, nor (until slice 4) in a premise's Accept Why.
  - RF-1 (b) (a chip such as 'Cynder has a dark past › Lean statement'; clicking reveals the target). 5f1 RefText and revealRef:
- a card: select and pan;
- a field: expand the card and flash its row;
- vocabulary: scroll and select;
- a deleted target: a toast.
  - RF-2 (a) (stored by stable id: the card id or a vocabulary Lean name, plus an optional field). 5a token grammar.
  - RF-2 (b) (telelean never reuses a card id within a subject). 5a: registry format, allocator, F1 (D5-2, D5-3). 5b: recording ids.json and session `allocatedIds`. Residuals: D5-19.
  - RF-2 (c) (always the current name; 'deleted card').
- 5c1: resolution, `TlNode.name`/`nameOf`, TL125.
- 5c2: core person-facing texts.
- 5f1/5f2: chips and the `nameOf` sweep.
  - RF-2 (d) (target's sentence in Lean docstrings and everything Claude reads).
- 5c1: docstring mirrors (normalise, D-9 follow and re-mirror, adoption).
- 5e: two choke points and the system prompt.
Narrowed by D5-7: the files Claude reads keep the stored form; exact restores quote it.
  - RF-3 (no dropdown in Lean fields; Esc leaves a plain #). 5f1: RefInput is used only on prose fields, and Esc closes the picker and keeps #query. Slice 4 must keep its Lean fields on plain inputs (requirement handed over).
  - RF-4 (no short numbers; search by sentence). 5f1 `searchRefs` over sentences and vocabulary names and glosses, folded for case and accents, with no numbers. There is no board-wide find (D5-13).
  - RF-5 (a), FZ-4 bullet 2 and the S12 fix (a frozen card's references hold their targets). 5d:
- `heldFields` filled, `holdingMap`, check step 3;
- views, requests, tools, backstop;
- `other-subject` extended to prose references (D5-9, D5-10);
- the S12 cheat test.
  - RF-5 (b) (TR-13 warns about references). Built by slice 4's TR-13, after slice 5 (D5-1), from 5c1's `referencedBy`/`detachRefs`. Meanwhile 5c1/5f2 add the board Delete's 'Referred to by' list (D5-12).
  - CM-4 row 10 (Copy reference, for cards and fields). 5f1: Context Menu section icon, right-click entries on cards, fields and vocabulary cards, the stored form through `copyText` (D5-15).
  - ES-9 bullet 2 (copy references stays possible during a session). 5f1: Copy reference is enabled on Current and Proposed during a session, and # works in session prose (answers, notes).
  - Audit note 'RF-2 (b) at risk already in slice 3'. Handled in slice 3 by D3-54. Closed at the source by 5a/5b (registry, allocator, F1). Open question 9 proposes widening slice 3's `reserved` now.
  - TR-2 (c) (new ids respect RF-2), a slice-4 hook. 5b `allocateSessionIds` (registry ∪ B ∪ ws ∪ records ∪ `allocatedIds`); burned ids fold into ids.json at the session's end.
  - TR-4 (fuzzy Dependencies, a list of # references), a slice-4 hook. 5f1 RefPicker `{cardsOnly, exclude}`; the stored data stays `premises:` ids. Slice 4 builds the field.
  - TR-8 (Instructions with # references), a slice-4 hook. 5f1 multiline RefInput, and 5e renders the text for Claude. Slice 4 builds the box.
  - TR-10 (c) (other subjects' vocabulary can be referenced), a slice-4 hook. 5c1: subjectGraph adds referenced foreign vocabulary to the board. 5f1: candidates include foreign vocabulary.
  - Slice-4 follow-ups G4, G5, G6, D2-15, D3-1 and D3-43's fallback are slice 4's area; references do not change them. Two touch references:
- D2-13: its note, and later the Instructions, take # through RefInput (5f2, slice 4).
- D3-49: held fields join Submit's keep set through `frozenChangesOf` (5d).
