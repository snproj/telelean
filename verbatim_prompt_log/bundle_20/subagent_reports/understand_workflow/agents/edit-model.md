# map:edit-model

# Map: card data model, `@@ telelean` markup, user edits, undo/history, storage (the M1 machinery)

All paths are relative to `/home/zhengyew/telelean`. "Code" means what the implementation does; "docs" means the design documents (`docs/`, `verbatim_prompt_log/bundle_1/user_requested_documents/`). Where they disagree, the code is authoritative; §8 lists every discrepancy I found.

---

## 1. The `@@ telelean` block

### 1.1 Detection and grammar (code)

- **Block detection.** A block is a plain Lean block comment `/- … -/` whose first non-blank line matches `MARKER = /^@@[ \t]*telelean(?:[ \t]+v(\d+))?[ \t]*$/` (`packages/core/src/markup/parser.ts:28`).
  - A missing version means v1, with no diagnostic (`parser.ts:116`).
  - A marker inside `/--` or `/-!` gets TL009 ("…is inside a doc comment…, so it is ignored") and is ignored (`parser.ts:111-114`).
  - An unterminated comment gets TL010 (`parser.ts:121`, `338-344`).
  - An unsupported version gets TL008, but the block is still shown and its fields are kept (`parser.ts:122-125`; `SUPPORTED_MARKUP_VERSIONS = [1]`, `markup/types.ts:58-60`).
- **Field lines.** Each further non-blank line is `key: value`, matched by `FIELD = /^([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)[ \t]*:(.*)$/s` (`parser.ts:30`).
  - A line `---` starts the Markdown body: the rest of the comment, dedented (`parser.ts:135-149`).
  - Any other line gets TL001 "Malformed line (expected `key: value`)" (`parser.ts:150-156`).
- **Keys.**
  - `kind` is a silent alias of `type` (`parser.ts:39-41`).
  - Dotted keys (`x.y`) are extensions. They are kept verbatim in `MarkupBlock.extensions` and become `TlNode.ext`.
  - An unknown undotted key gets TL002 "Unknown field … (kept as written; use a dotted key such as `mytool.x` for tool data)" and is also kept in `extensions` (`parser.ts:165-168`).
  - A repeated non-list field gets TL005 and the first value wins (`parser.ts:170-173`).
  - The list fields `premises`, `lean` and `tags` accumulate across repeated lines (`values.ts:27`).
- **Values.** Never YAML. A value is the trimmed raw text, or a JSON string literal when it starts with `"` (`values.ts:34-45`).
  - The serializer quotes a value that is empty, contains `/-` or `-/`, starts with `"`, contains control characters, or has edge whitespace (`needsQuoting`, `values.ts:73-75`).
  - Escapes: `/-` becomes `/-` and `-/` becomes `-\/` (`values.ts:53-67`).
  - Lists are written `a, b, c`, with optional `[…]`. An item holding a comma is JSON-quoted (`values.ts:77-81`, `109-142`).
  - Body escapes: `-/` becomes `-\/`, `/-` becomes `/\-`, and a leading `--` becomes `\--` (`values.ts:99-103`).
  - `#`, `:` and quotes are plain text inside raw values (D-8).
- **Writer.** `renderBlock` (`serializer.ts:18-50`) writes `/-`, then `@@ telelean v1`, then the known fields in `FIELD_ORDER` (`types.ts:81-97`: id, type, natural_name, rationale, stance, source, premises, asserted, lean, supersedes, refines, tags, origin, session, worded_by), then the extra keys, the optional `---` body, and `-/`.
- **Required fields and edits.**
  - `type` and `natural_name` are required (TL003, `parser.ts:358-361`). A block without them is not a card (`project/build.ts:244`).
  - Field edits touch only their own lines (`setBlockFields`, `markup/edits.ts:74-147`). A missing key is inserted at its FIELD_ORDER position, and the derived id line is written too (`edits.ts:79`).

### 1.2 Every field

`KnownFieldKey`: `markup/types.ts:63-78`. Interpretation: `parser.ts:181-271`. TlNode construction: `build.ts:730-775`. The gate column refers to G5 `markupFindings` (`core/src/gate/rules.ts:836-1032`, `COMPARED_FIELDS` at `rules.ts:60`).

| key | validation | meaning | written by | on `TlNode` (`model.ts:182-204`) | board-editable today | gate G5 (Claude) |
|---|---|---|---|---|---|---|
| `id` | `ID_PATTERN` `^[a-z0-9]+(?:[-_.][a-z0-9]+)*$` (`ids.ts:8`) | stable card identity | add-node (`deriveId`); write-back of a derived id on any telelean edit (TL112) | `id` | no | unchanged, or the derived id written back (`rules.ts:932-935`) |
| `type` (alias `kind`) | ASSUMPTION / DERIVATION / GOAL; lower case accepted with TL019 hint | column / kind | add-node, change-kind, lifecycle item (GOAL→DERIVATION at Accept, `gate/normalise.ts:38-57`) | `type` | via drag or "Make Assumption/Derivation/Goal" (change-kind, D-11) | compared |
| `natural_name` | one line (TL004 warning if multi-line, `parser.ts:230`) | the user's sentence, verbatim | add-node, edit-node | `naturalName` | "Edit" / F2 | compared ("the person's words are the specification and stay byte-identical") |
| `rationale` | text (may be JSON with `\n`) | why held / why cared; TL011 info for an ASSUMPTION without one (`values.ts:20-24`: "no reason yet" / "no source yet") | add-node, edit-node, change-kind to ASSUMPTION | `rationale` | "Edit why" / "Add why"; shown as "because: …" (`NodeCard.tsx:264`) | compared |
| `stance` | believe / rule / supposing (`model.ts:34-35`) | D-14 chip ("I believe it", "It's a rule or definition", "Supposing, for argument", `webview/src/labels.ts:35-39`) | add, edit | `stance` | chips (`CardDetails.tsx:243-256`) | compared |
| `source` | observed / reported / inferred / common (`model.ts:37-38`) | D-14 evidential ("observed", "reported", "inferred", "common knowledge") | add, edit | `source` | chips (`CardDetails.tsx:258-271`) | compared |
| `premises` | list of ids | declared joint support (dashed arrows). Diagnostics: TL007 dangling, TL121 other subject, TL015 cycle (`build.ts:684-728`) | set-premises ("These suffice"); delete cascade; ghost adoption appends | `premises` | only through "These suffice" | compared; exception: telelean's own ghost-adoption append (`rules.ts:877-888`) |
| `asserted` | `YYYY-MM-DD` | date the card was added | add-node (`ctx.today`), adoption | `asserted` | no | compared |
| `lean` | list of Lean names; the first is the statement | pinned binding (D-8) | telelean pin on any edit of an adjacency-bound formalised card (`planAction.ts:49-55`); run normalisation (`gate/normalise.ts:25`) | via `lean.binding` / `lean.statement` | no | never changed or removed; added only by telelean's pin for chosen cards (`rules.ts:936-973`) |
| `supersedes`, `refines` | one id | D-18 lifecycle links | nobody (no UI) | `supersedes`, `refines` | no; no existence check, no delete cascade | compared |
| `tags` | `[A-Za-z0-9][A-Za-z0-9_./-]*` list | bookkeeping | nobody | **not carried to TlNode** (`build.ts:738-767`), so invisible on the board and in graph.json | no | compared |
| `origin` | user / agent | who created the card | ghost adoption writes `agent` (`adoption.ts:129-133`) | `provenance.origin` | no | compared |
| `session` | token `[A-Za-z0-9][A-Za-z0-9_.:+-]*` | the **run id** that created the card (`gate/types.ts:268-269`) | ghost adoption | `provenance.session` | no | compared |
| `worded_by` | user / agent | who worded the sentence; `agent` shows italics + "(Claude's wording)" (`NodeCard.tsx:132`, `226-228`) | ghost adoption | `provenance.wordedBy`; `endorsed = wordedBy==='user'` | no | compared |
| dotted `x.y` | any | extension / tool data | anyone (hand) | `ext` (repeated values joined by `\n`) | no | extensions compared as a whole (`rules.ts:930`) |
| body after `---` | Markdown | notes | hand only | `body` | **not rendered and not editable** on the board | compared (`rules.ts:931`) |

**Not in markup** (03 §3.2, confirmed in code): proof status (derived), layout (sidecar), decisions (sidecar), vocabulary (computed).

### 1.3 How a block binds to Lean (`parser.ts:389-425`; `project/build.ts:296-360`; docs/m1-plan.md §6.1)

- **pinned.** A `lean:` field binds the block; the first name is the statement. Names resolve against the enclosing namespaces (`_root_.` honoured) and, failing that, the known declarations (`build.ts:315-323`). Extra pinned names are owned by the card too.
- **adjacent.** Otherwise the block binds to the next declaration with no blank line in between. Docstring, `@[…]`, modifiers and plain comments may sit in between (`findFollowingDecl`, `parser.ts:274-301`).
  - A following `example`, `mutual` or anonymous declaration gets TL014 and the card stays code-less (`parser.ts:405-412`).
- **none (code-less).** A blank line, EOF or another block in between means the card has no Lean. TL013 hint: "This node is code-less, but `X` follows after a blank line: remove the blank line to attach it." (`parser.ts:414-423`).
- **D-2(b) convention.** The statement must be `abbrev n : Prop := …` (or a Prop `def`). The justification is `n.holds`, anywhere in the project: an axiom (assumed, or "claimed" for a DERIVATION) or a theorem (proved or conditional). Diagnostics (`build.ts:445-646`):
  - TL113: bound to something that is not a Prop abbrev/def (ill-formed).
  - TL101: bound declaration not found.
  - TL117: ASSUMPTION without `.holds`.
  - TL114: `.holds` does not state `n`.
  - TL116: GOAL asserted as an axiom.
  - TL105 / TL106: proved goal / provable assumption.
- **Ownership.** One declaration belongs to one card (TL017). `ProjectModel.ownerOfDecl` maps the statement, `.holds` and extra pinned names to the node id (`build.ts:341-360`; `project/types.ts:57-58`).
- **Card code.** From the statement (with its docstring) to the end of `.holds` when contiguous; otherwise the pieces joined by a blank line (`build.ts:190-205`, `472-481`).
- **Statement closure.** `LeanBinding.uses` is the statement closure: vocabulary reached from the statement, through other cards' statement abbrevs and through vocabulary definitions (`build.ts:483-506`; `model.ts:95-102`).
- **Docstring mirror (D-9).** `set-docstring` keeps `/-- <natural_name> -/` on the statement. It is written by edit-node only when the docstring equals the old sentence (`planAction.ts:129-135`), and by run normalisation (`gate/normalise.ts:27-31`).

**Formalised card** (03 §3.3, matches the code):
```
/-
@@ telelean v1
id: cynder-dark-past
type: ASSUMPTION
natural_name: Cynder is a character who has a dark past
rationale: familiar with gaming lore
source: common
asserted: 2026-11-01
lean: Spyro.cynder_dark_past
-/
/-- Cynder is a character who has a dark past -/
abbrev cynder_dark_past : Prop := HasDarkPast cynder
axiom cynder_dark_past.holds : cynder_dark_past
```

**Card with no Lean** (code-less): the same block without `lean:`, followed by a blank line, EOF or another block.
- The A|D|G box writes exactly this to `Model/<S>/Inbox.lean`, before `end <S>`, with `asserted` set to today.
- It creates `Inbox.lean` and its import if they are missing (`planAction.ts:61-104`).
- Such a card has `lean.binding = 'none'` and `status.formal = 'informal'`.
- The card has no fields for "Lean statement" or "proof": those are separate declarations reached through the binding.

### 1.4 Ids and their stability

- **Derivation.** `deriveId` (`markup/ids.ts:43-103`): transliterated slug of at most 6 words, fallback `n-<6 hex of FNV-1a>`, `-2`, `-3`… on collision.
- **New cards.** add-node derives the id on the host, unique across every block of the workspace (`planAction.ts:67-69`).
  - `BoardAction add-node.preferredId` (`actions.ts:33-34`) is documented as "Id the webview proposed (used when valid…)", but **nothing reads it**. Users and the webview can never choose an id.
  - The webview's provisional card uses a different slug function, `slugId` (`core/src/graph.ts:159-176`, called at `webview/src/state/store.ts:1275`). It is remapped to the host's id when the graph or actionResult arrives (`store.ts:1040-1095`).
- **Blocks without `id:`.**
  - The parser derives an id, unique within the file. TL112 info: "This block has no `id:`; telelean uses `<id>` and writes it into the block on its next edit." (`parser.ts:347-357`).
  - Collisions across the workspace get `-n` suffixes, in file-path order (`build.ts:236-264`).
  - Every planner edit of the block writes the id (`edits.ts:79`; `edit/session.ts:125-137`). G5 allows exactly that write-back.
- **Duplicate written ids.** TL006, and the later block is **not a card** (`build.ts:246-257`).
- **Stability.**
  - Ids are "never changed implicitly" (`ids.ts:1-5`). A sentence edit keeps the id (it stays the slug of the original sentence). A kind change keeps it. There is no rename-id action.
  - Caveat (a): a derived, unwritten id changes when the sentence is hand-edited, or when a block in an earlier file takes the slug.
  - Caveat (b): deleting a card and re-adding the same sentence re-derives the same slug. Stale references then silently point at the new card: `attempts.jsonl` `target`/`premises`, `decisions.json` `affectedNodes`, the history trailer `Telelean-Nodes`, layout.json ids, attic file names `attic/<id>.lean`, and `supersedes`/`refines`.
  - Caveat (c): Lean names are a separate namespace (`Spyro.cynder_dark_past` vs `cynder-dark-past`), linked by `lean:`. Renaming the Lean statement by hand breaks the binding (TL101) but keeps the id.

### 1.5 Vocabulary (not markup)

- **Computed.** Vocabulary is every declaration of a subject's modules that is bound to no card (`project/vocabulary.ts:1-5`; `build.ts:362-400`).
- **`VocabItem` fields** (`model.ts:277-302`):
  - `name`: the fully-qualified Lean name, its **only identity**.
  - `shortName`, `subject`.
  - `kind`: sort / predicate / function / constant / presupposition / definition / lemma / unmarked-axiom / other.
  - `type`, `arity`, `gloss` (the docstring), `glossBy`, `presupposes` / `presupposition`, `loc`, `code`, `usedBy`, `flags`.
- **`glossBy` is always `'user'`** (`vocabulary.ts:333`). Nothing records who wrote vocabulary or its docstrings.
- **No markup state possible today.** A telelean block written directly above a vocabulary declaration would bind to it by adjacency and turn it into a card, flagged TL113. So markup cannot carry per-vocabulary state without new syntax.
- **On the board.**
  - Shown in the Vocabulary group at the top of the Assumptions column. Section titles: "Types", "Predicates & relations", "Functions", "Constants", "Presuppositions", "Definitions", "Lemmas", "Unmarked axioms", "Other" (`webview/src/labels.ts:61-71`).
  - Items are **not selectable**: they are only highlighted from a card's "uses" dropdown or a click on a Lean ref (`VocabularyGroup.tsx:1-8`).

### 1.6 "Claude suggests" ghosts

- **Where they live.** `GhostView` (`core/src/run.ts:235-254`), id `ghost-<n>`, unique within the run. They live only in the run's state (`run.json` in VS Code global storage).
- **On the board.** Shown translucent at the top of the Assumptions column, **in the Proposed view only**. They have no `data-node-id` and no arrows (`webview/src/board/GhostCards.tsx:1-4`).
- **Adoption ("I hold this")** writes into the **shadow** (`core/src/gate/adoption.ts:118-147`):
  - a block with an id derived from Claude's sentence, `type: ASSUMPTION`, `natural_name`, optional `rationale`, `asserted`, a pinned `lean`, `origin: agent`, `session: <runId>`, `worded_by: agent`;
  - followed by `/-- … -/`, `abbrev …`, `axiom ….holds`;
  - and the new id appended to the target's `premises`.
- It reaches the user's files only on Accept.

---

## 2. Board actions, protocol messages, planning, undo, history

### 2.1 `BoardAction` (`core/src/actions.ts:23-67`) and its plan (`core/src/edit/planAction.ts`)

| action | payload | what the planner does (text edits via markup primitives in `EditSession`) | history/undo label |
|---|---|---|---|
| `add-node` | subject, type, naturalName, rationale?, stance?, source?, preferredId? (unused) | renders a block into `Model/<S>/Inbox.lean` before `end <S>`; creates Inbox + import when missing; appends the id to layout.json (`planAction.ts:61-104`) | "Add assumption/derivation/goal: …" |
| `edit-node` | id, field ∈ `EditableField` = naturalName/rationale/stance/source (`actions.ts:18`), value or null (null is not allowed for naturalName) | `setField` on that key; D-9 docstring mirror for a sentence edit; D-8 pin; id write-back (`planAction.ts:106-146`) | "Edit sentence: …" / "Edit why: …" / "Set stance: <v> (…)" |
| `delete-node` | id, keepLean, confirmed? | `planDel` (`planDelete.ts`): removes the statement abbrev and `.holds` unless keepLean (theorem proofs archived to the attic); removes the block; **removes the id from every other card's `premises:` and pins those cards**; refuses with `needs-confirmation` listing broken dependents unless `confirmed` (`planAction.ts:162-208`) | "Delete: …" |
| `change-kind` | id, to, beforeId, dependents? (rewrite / mark-broken), confirmedDependents?, rationale? | `planKind` (`edit/planKind.ts:93-285`): `type:` line plus D-11 Lean ops (`add-holds-axiom`, `holds-theorem-to-axiom`, `remove-holds`; for dependents `add-hypothesis` / `apply-hypothesis` / `drop-arguments` **in other declarations**, including other cards' proofs); fresh facts required to rewrite; pin; layout move | "Make Derivation: …" (+ " (dependents rewritten)" / " (dependents marked broken)") |
| `reorder` | id, column (must equal its type), beforeId | layout only (`layoutOnly: true`) | "Move: …" |
| `set-premises` | target, premises | replaces `premises:`; refuses an empty list (`not-yet`), cross-subject premises, and cycles (`planAction.ts:259-291`) | "These suffice: … ← N premises" |
| `create-subject` | name | scaffold files + `import` in `Model.lean` + empty layout (`planAction.ts:293-305`; `scaffold.ts`) | "New subject: S" |

- **Refusals** are `ActionError` codes (`actions.ts:140-157`): not-found, invalid, needs-confirmation, facts-stale, conflict, unsafe, not-yet, no-history, internal.
- **Sentence checks:** "The sentence is empty." and "A sentence is one line." (`planAction.ts:32-37`).
- **`HistoryActionKind`** (`actions.ts:72-84`) = the action kinds above plus `initial`, `manual`, `undo`, `redo`, `revert`, `initialize`, `accept-proposal`.

**`EditSession`** (`core/src/edit/session.ts:46-245`) is an internal, pure planner helper. It is **not** a user-facing session. It applies text edits one step at a time, re-parses between steps, and maps block offsets.
- `keepOtherBindings` (`session.ts:203-236`) inserts a blank line after another code-less block when an edit would make it bind, and refuses ("This edit would change what the card "X" is bound to…") any other change of another card's binding.
- Removing a field that a block repeats is refused (`session.ts:125-137`).

**Cascades that touch cards other than the one acted on.** These matter for FROZEN:
1. delete-node removes the id from other cards' `premises:` and pins them (`planAction.ts:193-198`).
2. A D-11 rewrite adds a hypothesis binder to other cards' theorems and untracked lemmas, and applies or drops arguments in them (`planKind.ts:171-202`, `234-284`).
3. delete / mark-broken leaves other declarations broken: they stop compiling.
4. The D-8 pin and the TL112 id write-back modify any block telelean touches.
5. The D-9 docstring mirror edits the statement declaration's docstring.
6. `keepOtherBindings` inserts whitespace after a neighbouring block.
7. In runs: the premises declaration at start (`run/manager.ts:856-866`), ghost adoption's append to the target's premises (`adoption.ts:140-144`), shadow normalisation (pins, ids, docstrings for the chosen cards, `gate/normalise.ts:14-35`), and the GOAL→DERIVATION lifecycle item at Accept (`normalise.ts:38-57`).

### 2.2 Protocol (`core/src/protocol.ts`): envelope `{ v: 1, type, payload }`, hand-validated (`parseWebviewToHost`, `protocol.ts:472-685`)

**Host → webview** (`protocol.ts:53-76`):

| message | payload | purpose |
|---|---|---|
| `graph` | `{ graph: TlGraph }` | one subject's board |
| `workspace` | `{ state: WorkspaceState }`: rootName, subjects [{name, nodeCount}], subject, undo label or null, redo label or null, history availability (`actions.ts:245-255`) | board-level state |
| `history` | `{ listing: HistoryListing }` | reply to historyList |
| `actionResult` | `{ requestId, outcome: ActionOutcome }` | outcome of a request; may carry `dependentCards` |
| `notice` | `{ id, level: info/warning/error, text, undoable }` | toast; `undoable` adds an Undo button that posts `undo` |
| `run` | `{ run: RunView or null }` | M2 |
| `proposal` | `{ proposal: ProposalView or null }` | M2 |

**Webview → host** (`protocol.ts:80-218`), with the routing in `extension/src/logic/boardSession.ts` and `actionMapping.ts`:

| message | payload | routing |
|---|---|---|
| `ready` | `{ lastVersion: number or null }` | publish workspace + graph, then run + proposal |
| `addNode` | `{ clientId, type, naturalName (non-blank, one line, ≤4000), requestId?, rationale?, stance?, source? }` | → add-node (the clientId never becomes the id) |
| `kindChange` | `{ id, from, to (≠from), beforeId, requestId?, dependents?, rationale?, confirmedDependents? }` | → change-kind |
| `select` | `{ ids }` | **only logged** (`boardSession.ts:190-192`; `BoardPanel.ts:222`); the selection lives only in the webview |
| `theseSuffice` | `{ premises, target, requestId? }` | → set-premises; refused `not-yet` when premises are empty (`actionMapping.ts:51-55`, `81-83`). The M2 tray posts `startRun` instead |
| `diagnostic` | `{ level, code, message, data? }` | webview log channel |
| `editNode` | `{ id, field, value or null, requestId? }` | → edit-node |
| `deleteNode` | `{ id, keepLean, confirmed?, requestId? }` | → delete-node |
| `reorder` | `{ id, column, beforeId, requestId? }` | → reorder |
| `undo` / `redo` | `{ requestId? }` | ws.undo / ws.redo for the board's subject |
| `selectSubject` | `{ subject }` | switches the board's subject |
| `createSubject` | `{ name, requestId? }` | → create-subject |
| `historyList` | `{ subject, limit? }` | read-only |
| `historyPreview` | `{ subject, entryId, compare: parent/current }` | read-only diff editor |
| `historyRevert` | `{ subject, entryId, requestId? }` | ws.revert |
| `historyPrune` | `{ subject, keepLast, requestId? }` | ws.prune |
| `initGit` | `{ requestId? }` | host modal, then ws.initGit |
| `copyText` | `{ text }` | clipboard |
| `openInEditor` | `{ file, range? }` | opens a file, path re-checked inside the root |
| `refresh` | `{}` | Lean refresh now |
| `startRun` | `{ target, premises, requestId? }` | RunManager.start (after busy check + consent) |
| `answerQuestions` | `{ runId, setId, answers[1..3], requestId? }` | RunManager |
| `cancelRun` | `{ runId, requestId? }` | RunManager (not queued) |
| `resumeRun` | `{ runId, requestId? }` | RunManager |
| `acceptProposal` | `{ runId, proposalId, lifecycle[], definitions[], requestId? }` | RunManager (all-or-nothing) |
| `feedback` | `{ runId, text, requestId? }` | RunManager |
| `discardProposal` | `{ runId, requestId? }` | RunManager |
| `adoptGhost` | `{ runId, ghostId, rationale?, requestId? }` | RunManager |
| `rejectGhost` | `{ runId, ghostId, requestId? }` | RunManager |
| `openProposalDiff` | `{ runId, proposalId, file? }` | read-only diff |
| `dismissRun` | `{ runId }` | RunManager |

- **Limits** (`protocol.ts:259-272`): ids ≤200, text ≤4000, lists ≤2000, review items ≤200, 1-3 answers per batch.
- **Run messages** are listed in `RUN_MESSAGE_TYPES` (`protocol.ts:221-233`).

### 2.3 From gesture to disk: the pipeline (`actions.ts:7-9`; `runner/src/workspace/modelWorkspace.ts`)

1. The webview posts a message. `parseWebviewToHost` validates it. `BoardPanel.handle` passes it to `BoardSession.handle` (`boardSession.ts:184-217`).
2. An action message enters the board queue and becomes a `BoardAction` through `toBoardAction` (`actionMapping.ts:22-73`). The board's current subject fills in the subject.
3. `ModelWorkspace.perform` runs in the workspace's single queue (`modelWorkspace.ts:402-404`, `533-537`).
4. `performNow` (`modelWorkspace.ts:879-899`) calls `core.planAction(model, action, planContext)` and gets an `EditPlan` (`actions.ts:120-138`): whole-file Lean `changes`, an optional `layout`, an optional `archive`, `layoutOnly`, `nodeId`.
5. `materialisePlan` (`runner/src/workspace/sidecars.ts:30-58`) adds `layout.json` and the attic appends as FileChanges.
6. `applyRecorded` (`modelWorkspace.ts:998-1034`) then runs:
   1. a "Manual edits" or "Initial state" snapshot of each touched scope (`snapshotBase`, `1092-1110`);
   2. `EditApplier.apply`: the extension's `CheckedEditApplier` (`extension/src/logic/editApplier.ts:167-217`) checks each file's `before` against the open buffer or disk, else throws `conflict` "… changed since telelean planned "<label>"; nothing was applied."; computes minimal line edits; applies one WorkspaceEdit; saves;
   3. `undoStacks.record`;
   4. the action snapshot (skipped for layout-only);
   5. re-read, `graph.json`, and `requestRefresh('edit')` when model files changed.
7. `BoardSession.finish` (`boardSession.ts:460-470`) posts `actionResult` (with `dependentCards` for needs-confirmation, `477-497`) and a `notice` with Undo (except for undo/redo outcomes), then republishes workspace + graph.

### 2.4 Undo / redo (`runner/src/workspace/undo.ts`)

- **Scope.** Per subject, in memory, at most 100 entries (`UNDO_LIMIT`, `undo.ts:20`). Lost on window reload; the workspace lives until the window closes (`vscode/registry.ts:1-5`).
- **An entry** is the applied whole-file `FileChange[]`, sidecars included, plus label, nodes and `layoutOnly` (`undo.ts:22-31`).
- **Undo and redo both apply the top entry backwards** (`undo.ts:1-15`, `41-63`):
  - exact when the file still equals `after`;
  - a no-op when it already equals `before`;
  - otherwise a reverse patch (`diff` structuredPatch/applyPatch, `fuzzFactor: 0`);
  - a created file is deleted only while unchanged;
  - anything else refuses the whole step: "<path> changed since; use History to revert" (`modelWorkspace.ts:913`).
- **Undo is recorded like an action.** Labels "Undo: <label>" / "Redo: <label>", snapshotted, moved to the other stack (`modelWorkspace.ts:905-928`).
  - An undo outcome is not `undoable`, so no Undo button on its toast; a redo outcome is.
  - A new action clears redo (`undo.ts:71-74`).
  - Refusals: "Nothing to undo." / "Nothing to redo."
- **UI.** Toolbar Undo/Redo with tooltips "Undo: <label> (Ctrl+Z)" / "Nothing to undo" and "Redo: <label> (Ctrl+Shift+Z)" (`webview/src/header/Header.tsx:45-66`).

### 2.5 History (D-33; `runner/src/workspace/history.ts`, `git.ts`; docs/m1-plan.md §8 agrees with the code)

- **Refs.** `refs/telelean/<rootKey>/subjects/<S>` and `refs/telelean/<rootKey>/project`.
- **Commits** are built with plumbing only: hash-object, a temporary index in `<gitDir>/telelean-tmp-*`, write-tree, commit-tree, update-ref compare-and-swap. The user's index, branches and hooks are never touched (`history.ts:1-20`; `git.ts:1-28`).
- **Message**: the label, then `Telelean-Action`, `Telelean-Subject`, `Telelean-Nodes` (ids), `Telelean-Format: 1` (`history.ts:465-477`).
- **Subject scope**: the subject root file, `.lean` files under `Model/<S>/`, and of its sidecars **only** `layout.json` and `attic/*.lean` (`runner/src/workspace/files.ts:146-176`).
- **Project scope**: `Model.lean`, lakefile.toml, lean-toolchain, lake-manifest.json, .gitignore, `.telelean/config.json` (`core/src/paths.ts:146-148`).
- **When**: "Manual edits" before a write when hand edits exist; the action snapshot after; "Initial state" for a new chain. Layout-only changes ride along with the next snapshot (`modelWorkspace.ts:1085-1118`).
- **"Revert to this"** (`modelWorkspace.ts:963-990`):
  - writes the entry's tree over the subject scope;
  - first requires a base snapshot (`requireBaseSnapshot`), else refuses `no-history`;
  - labelled "Revert to: <label> (<time>)";
  - undoable and snapshotted.
- **Other operations.** Prune ("Keep last N") and the storage counter. UI strings: "History", "Revert to this", "Keep last" (`webview/src/header/HistoryMenu.tsx:111`, `147`, `220`).

---

## 3. Sidecars and where FROZEN / edit-session state could live

### 3.1 What exists under `.telelean/` (code)

| path | content | written by | snapshotted, reverted, undone? | gitignored? | visible to Claude? |
|---|---|---|---|---|---|
| `config.json` | `{format:'telelean-config', version:1, library}` (`paths.ts:35-59`) | Initialize | project scope: yes | no | no |
| `graph.json` | export for scripts (`core/src/export/graphJson.ts`) | workspace, direct atomic write after each refresh/action (`modelWorkspace.ts:763-787`) | no | yes | no |
| `subjects/<S>/layout.json` | `{format:'telelean-layout', version:1, columns:{ASSUMPTION[],DERIVATION[],GOAL[]}, collapsed?:{vocabulary?}}` (`core/src/layout.ts:10-17`) | plan.layout via the EditApplier | yes (`files.ts:146-151`) | no (committed) | no |
| `subjects/<S>/attic/<nodeId>.lean` | archived declarations, each with header `-- archived <ISO> (<reason>): <declName>` (`runner/.../sidecars.ts:15-24`) | plan.archive via the EditApplier | yes | no | no |
| `subjects/<S>/attempts.jsonl` | one JSON line per "These suffice" round plus resolution lines (`core/src/proposal/sidecars.ts:66-171`) | the run's sidecar store, O_APPEND direct write (`runner/src/proposal/sidecarStore.ts:1-15`) | **no** (never undone) | no | no |
| `subjects/<S>/decisions.json` | recorded answers (D-20) with `affectedNodes` ids and scope (`proposal/sidecars.ts:174-287`) | sidecar store, atomic replace | **no** | no | no; sent to Claude as "EARLIER ANSWERS IN FORCE" in the context bundle (`runner/src/run/prompts.ts:233-235`) |
| `*.tmp` | temp files of atomic writes | fs applier / sidecar store | no | yes | no |
| `frozen/`, `sessions/` | **never written**: gitignore lines (`runner/src/workspace/initialize.ts:39`) and ignored watcher paths (`extension/src/logic/modelPaths.ts:89`) only; runs live in `<VS Code globalStorage>/runs/<rootKey>/<runId>/` (`run.json`, `ws/`, `frozen/<n>/`, `session/`; `runner/src/shadow/types.ts:1-30`) | none | no | yes | no |

**Notes on the code paths.**
- **Re-reading.** The workspace re-reads only config, lakefiles, project files, model files, layout.json and attempts.jsonl (`modelWorkspace.ts:631-712`). A new sidecar would need its own classification and graph attachment, as `attempts` does (`modelWorkspace.ts:326-340`).
- **Layout keys.** `parseLayout` keeps only `columns` and `collapsed` (`layout.ts:24-44`), so any new key added to layout.json is **dropped** on the next layout write.
- **Accept writes model files only.** `applyChanges` refuses anything else: "Nothing was changed: <path> is not a model file, and Accept changes only model files." (`modelWorkspace.ts:949-951`).
- **The shadow carries model files only.** `ws/` holds `.lean` files plus lakefile/toolchain/manifest, with no dot-entries. The path guard hides `.lake`, `.telelean` and `.git` (`runner/src/llm/confinement.ts:28`; `runner/bin/telelean-path-guard.mjs`). **Claude can never read or write a `.telelean/` sidecar**; it learns sidecar facts only through the context bundle telelean renders.

### 3.2 A persistent "frozen" flag: markup or sidecar

**Option A: a new known markup field**, for example `frozen: natural_name, rationale, statement` or `frozen: all`. It would be added to `KnownFieldKey`/`FIELD_ORDER`, which the frozen contract allows as an additive change (`markup/types.ts:6-7`).

Advantages:
- Visible in the Lean file.
- Travels with git commits, branches and history snapshots.
- Restored by Undo and Revert automatically, as part of whole-file changes.
- Moves with the block.
- A freeze change shows up as base drift at Accept, which forces the existing rebase and re-gate (`manager.ts:1662-1715`).

Disadvantages:
- Each toggle rewrites a `.lean` file: new sha256, the file's facts go stale, its cards get the `stale` flag, D-11 rewrites need fresh facts, `requestRefresh('edit')` rebuilds that module and its dependents, and an undo entry plus a snapshot appear. Design decision D-12 rejected putting non-node state in `.lean` files for exactly this reason: "Comment edits re-elaborate files, and line shifts rebuild dependents" (`02_design_decisions.md:230-232`). A review stage that freezes every accepted item would cause many rebuilds.
- Undo, Revert, hand edits and git checkout change frozen status outside the CONTEXT MENU, which conflicts with FROZEN 3.
- Claude sees the flag in the shadow and can edit it there. The gate must judge it against telelean's authoritative copy (today G5 compares fields against base B, `rules.ts:911-929`).
- Impossible for vocabulary items: a block above a vocabulary declaration makes it a card (TL113).
- Impossible for ghosts and TRANSFORM drafts, which are not in the files.
- Lean-side "fields" (statement, `.holds`) need names that are not markup keys.
- Older telelean versions would warn TL002 but keep the field.

**Option A′: a dotted extension key** such as `telelean.frozen`. It works today with no parser change, and G5 already refuses any change to extensions (`rules.ts:930`). But dotted keys are meant for other tools' data (the TL002 text), and it has all of A's costs.

**Option B: a per-subject sidecar**, for example `.telelean/subjects/<S>/frozen.json`. Cards would be keyed by **written** id (write back a derived id when freezing, as TL112 does), vocabulary by fully-qualified Lean name, with a list of field names per entry.

Advantages:
- No `.lean` change, so no rebuild and no staleness.
- Tamper-proof against Claude by construction (invisible in the shadow). telelean passes the frozen set to the gate and to Claude's context bundle, as it does for decisions.
- Supports vocabulary, field granularity, and ghost or draft entries in session state.
- Committed with the user's own commits unless gitignored.

Choices and costs:
- Either include it in `isSubjectSidecarFile` (`files.ts:146-151`), so it is snapshotted, reverted and undone like layout.json, or keep it out, like decisions.json (never undone or reverted).
- `baseDrift` compares model files only, so freeze changes during a run or session must invalidate the judged state explicitly.
- The id caveats of §1.4 apply: reuse after delete, derived ids.
- Not visible when reading the `.lean` files.
- Needs a new path helper in `core/paths.ts`, re-read handling, a graph or protocol field, and an `applyChanges` exception if it must change atomically with an Accept.

**Option C: layout.json.** Not suitable. Its contract is "layout only, never semantics" (`layout.ts:1-5`), and unknown keys are dropped (above).

**Option D: session-scoped state.** This covers edit-session status, the per-stage accept/decline table, the blacklist, shaky marks, fuzzy markers, draft cards with provisional ids, session-only freezes, and the pre-session frozen snapshot that EDIT SESSIONS 7 needs.
- The natural home is the run directory's persisted state: `run.json` in global storage, recovered after a reload (`manager.ts` RunFiles/recover; `PersistedRun`, `runner/src/run/types.ts:279-298`).
- Alternatively `.telelean/sessions/`, which is already gitignored and ignored by the watchers.
- Never in model files.

**A design that fits the spec with the least friction** (for the main session to weigh):
- Keep persistent user freezes in B, with the effective frozen set = persistent set, plus session overlay freezes, minus session overlay unfreezes.
- Session freezes and unfreezes live in D. Ending the session drops the overlay, which is exactly the "restore" of EDIT SESSIONS 7 and the only automatic removal of FROZEN 3.
- The gate enforces the effective set when it judges a state, and again at Accept.

### 3.3 Design precedents in the docs (not implemented)

- **D-12 sidecar table** (`02_design_decisions.md:230-244`): `signoffs.json` "Faithfulness sign-offs (D-19)" and `wording.jsonl` "Every past wording of your sentences". Neither exists in code (no matches).
- **D-19 sign-offs** (`02_design_decisions.md:331`): "A sign-off binds to your wording, the statement, its closure and the decisions in force; it goes stale when any of these changes, and says which side changed."
  - The `StatusFlag` `signoff-stale` is reserved but never computed (`model.ts:143`; only in `build.ts:46-49` FLAG_ORDER).
  - This is the closest designed analogue of "accepted / frozen".
- **D-21** (`02_design_decisions.md:347-352`):
  - "Accept is all-or-nothing (node-level partial accept comes later)."
  - "Editing a statement or sentence yourself marks its sign-off stale and drops it from any frozen set, with a "Re-sign" action."
- **D-20(a)** chose the `decisions.json` sidecar over "DECISION markup blocks inside your Lean files" (`02_design_decisions.md:339`).
- **D-18**:
  - "The agent may propose deletions, merges or kind changes only when an "Ask Claude…" request asked for them, and each one is confirmed separately." (`02_design_decisions.md:313`)
  - Redefining vocabulary "changes the meaning of every node whose statement closure mentions it… the gate's immutability check is authorised for exactly that set" (`02_design_decisions.md:309`).
- **Deferred items** (`docs/m2-plan.md:113`): "partial (node-level) Accept (later, D-21)", "formal immutability", and "sign-offs (`signoffs.json`, M3)".

---

## 4. Card fields and references

### 4.1 Field inventory as the board shows it

| UI | model | stored | editable on the board now | notes |
|---|---|---|---|---|
| sentence | `naturalName` | `natural_name` | "Edit" / F2 (inline) | one line, ≤4000 characters |
| "because: …" | `rationale` | `rationale` | "Edit why" / "Add why" | prompt adapts: "Why do you believe it?", "Where does the rule come from?", "What are you exploring?", "Why do you think it follows?", "Why do you care?" (`labels.ts:47-58`) |
| stance chips | `stance` | `stance` | toggle chips | shown for an ASSUMPTION or when set |
| source chips ("source:") | `source` | `source` | toggle chips | hidden for a GOAL unless set |
| column / kind | `type` | `type` | drag to a column, or "Make <Kind>" | D-11 drop-zone impact text (`kindChange.ts`) |
| declared support | `premises` | `premises` | "These suffice" only | |
| Lean code (expanded) | `lean.code`, `lean.statement`, `lean.justification(Kind)` | the declarations | no ("Open in editor", "Copy") | ref hover and click (`LeanCode.tsx:1-9`) |
| footprint / "rests on" | `status.proof.footprint`, `lean.axioms`, `lean.presupposes` | computed | no | |
| "Depends on" / "Used by" | edges + `lean.externalUsers` | computed | no | empty texts "Nothing: no declared premises and no proof." / "Nothing uses it yet." (`CardDetails.tsx:354-355`) |
| "uses:" line | `lean.uses` | computed | no | |
| status chips | `status.flags`, `formal`, `proof` | computed | no | |
| attempts | `TlGraph.attempts` | attempts.jsonl | no | |
| (hidden) | `id`, `asserted`, `provenance`, `supersedes`/`refines`, `ext`, `body`; `tags` not even on TlNode | markup | no | |

**Existing field vocabularies** a FROZEN or reference system could reuse:
- `EditableField` (`actions.ts:18`).
- `KnownFieldKey` (`markup/types.ts:63-78`).
- The proposal diff's `NodeChangeField` = sentence, type, statement, proof, premises, status, binding, fields (`run.ts:334`; `proposal/diff.ts:1-60`).
- The gate's `COMPARED_FIELDS` (`rules.ts:60`).
- At the text level each markup field is individually addressable: `MarkupBlock.lines: FieldLine{key, writtenKey, span, valueSpan, raw}` (`markup/types.ts:120-130`).
- Lean-side parts are addressable by Lean name: statement `n` and justification `n.holds` (`facts.ts` `holdsName`).
- Vocabulary items are addressable by fully-qualified name only.

### 4.2 Existing references and links

**Structural references:**
- `premises` (ids; validated, cascaded on delete, cycle-checked).
- `supersedes` / `refines` (ids; never validated or cascaded).
- `LeanRef.nodeId` on identifiers in a card's code (`model.ts:75-81`; `build.ts:509-535`). Hover shows the card's sentence or the vocabulary gloss. A click calls `revealNode(id)` (scroll + flash) or `highlightVocab(name)` (`LeanCode.tsx:80-90`). Ctrl/Cmd+click is "reserved… does nothing yet" (`LeanCode.tsx:7`).
- `ExternalUser` (`model.ts:120-131`).
- decisions `affectedNodes`, attempts `target` / `premises`, history `Telelean-Nodes`, layout ids, attic file names.

**No reference syntax in natural-language text:**
- `natural_name` and `rationale` render as plain text through `UserText` / `AgentText` (`webview/src/common/AgentText.tsx:22-40`).
- `#` has no meaning in markup values.
- No autocomplete or mention component exists in the webview.
- Core diagnostics use Markdown-style backticks for Lean names (`webview/src/model/format.ts:41`, `common/InlineCode.tsx`), but that is not user text.

**Anchor caveats for a `#` system:**
- `ID_PATTERN` allows `.` (and `-`, `_`), so `#id.field` is ambiguous with dotted ids. `:` or `/` would be safe field separators (ids end in `[a-z0-9]`, so `-/` cannot arise at the boundary).
- Vocabulary needs Lean-name anchors.
- Ghosts and drafts need temporary ids.
- Derived ids are unstable until written, and ids are reused after delete + re-add (§1.4).

---

## 5. Extension routing, long-lived sessions, and how runs coexist with board edits

### 5.1 BoardSession (`extension/src/logic/boardSession.ts`)

- **One per board panel**; disposed with the panel (`BoardPanel.ts:186-195`; `host.ts:330-352`).
- **Two queues** (`150-151`, `268-278`): board edits run in arrival order in one queue, run messages in another, "so a run start or an Accept that waits for Lean never blocks typing a card" (`22-26`).
- **Not queued:** read-only messages (history list and preview, copy, open, refresh, raw diff) and `cancelRun` (`184-217`).
- **startRun:**
  - subject = the board's current subject;
  - busy check via `busyRefusal` (`logic/runs.ts:169-181`), e.g. "Claude's proposal for "<subject>" is waiting for your review: Accept, Feedback or Discard it first.";
  - egress consent, asked once per root (`CONSENT_MESSAGE` "Run Claude on this model?");
  - then `manager.start` (`boardSession.ts:342-349`).

### 5.2 Long-lived "session" concepts that exist

| concept | where | lifetime | relevance |
|---|---|---|---|
| `ModelWorkspace` (one per model root) | `runner/src/workspace/modelWorkspace.ts`; `vscode/registry.ts:1-20` | until the window closes; undo stacks in memory | owns every write to user files and the undo stacks |
| `RunManager` (one per root, at most one active run) | `runner/src/run/manager.ts:1-17` | outlives the board (D-25); `run.json` persisted in global storage and recovered after reload | **closest analogue of an EDIT SESSION** (see below) |
| `BoardSession` | extension | per panel, transient | message router only |
| `EditSession` | `core/src/edit/session.ts:46` | one plan | internal planner helper (**name clash**) |
| Claude CLI session | `sessionId`, `--resume` | per run | Feedback continues it |

How a run maps onto an edit session:
- Shadow copy at base B ≈ the session's working copy.
- Rounds ≈ REVIEW STAGES; Feedback starts a new round in the same Claude session.
- Discard ≈ exit with every change cancelled.
- Accept ≈ end successfully; all-or-nothing, applied as one undo step, history kind `accept-proposal`.
- The proposal's `diff.nodes` (added / changed / removed + fields, `proposal/diff.ts:64-104`) ≈ the "Add / Change / Delete" review items.

### 5.3 How a run coexists with user edits

- **No lock.** The Current board stays fully editable during a run. The A|D|G box keeps working (D-16; `store.ts:1286`).
- **One start-time write.** The run writes the user's files once before it starts: the premises declaration as its own undoable `set-premises` action (`manager.ts:856-866`). After that it works only in the shadow (a copy of the model files at start = B).
- **Arrival of a proposal.** The board switches to "Proposed" unless the user is mid-drag or mid-edit (`store.ts:958-967`).
  - The Proposed view is read-only: "This is Claude's proposal (read-only): switch the board to "Current" to edit your cards." (`CardDetails.tsx:359`).
  - The banner toggle reads "Current" / "Proposed", with "Review…", "Accept", "Feedback…", "Discard", "Raw Lean diff…" (`ProposalBanner.tsx:33-72`).
- **Accept** (`manager.ts:1645-1730`):
  - If the user's model files drifted from B, Claude's changes are rebased onto them (3-way `mergeFile`), then normalised, re-frozen (when proved) and re-gated with B = the user's files at Accept.
  - On failure: "Accept was refused: Claude's changes, applied to your current files, did not pass the checks (…). Discard, or undo your edits since the run started and Accept again."
- **Tray while a run is active** (`webview/src/model/run.ts:45-58`): "Claude's proposal is waiting for your review: accept, give feedback or discard it first." and similar messages.

### 5.4 Toolbar (for the CONTEXT MENU)

`<header class="tl-toolbar">` holds: "telelean", the root name, SubjectPicker, History, Undo/Redo, the Lean badge, Problems, the Run badge, a spacer, and Legend (`Header.tsx:69-84`). **No context menu exists anywhere.** D-17's "Move to ▸ … in the context menu" was never implemented.

---

## 6. Today, everything that existed before a run is frozen against Claude (the gate)

- **G5 `markupFindings`** (`rules.ts:836-1032`) refuses:
  - any change to any compared field ("…changed its `natural_name:` … the person's words are the specification and stay byte-identical; restore it.");
  - any change to extensions, body, version, id, or `lean:` lines;
  - a change of a formalised card's binding;
  - formalising an unselected card;
  - a block removed ("…was removed: never add or delete blocks; restore it exactly."), moved, or added ("a new telelean block (X) was added: never add or delete blocks; propose a missing premise with propose_assumption instead."), except telelean's adopted-ghost blocks.
- **G3 `existing-changed`** (`rules.ts:343-384`): every declaration of B keeps its text (docstring included) and its meaning (type and value from Lean facts, e.g. through `open … in`), except the target's `.holds`.
- **G3 `statement-changed`** (`rules.ts:466-498`): after `freeze_statements`, the frozen declarations keep kind, type and value (`FrozenSnapshot`, `gate/types.ts:166-179`).
- **Timing.** These rules judge states: `check_lean` reports, `freeze_statements` and `finish` refuse, and Accept re-gates. Claude's file tools may still type anything into `ws/`.
- **Consequence for the spec.** It would replace "all of B is immutable" with "the frozen set is immutable, and every other change is a review item". The enforcement point is these B-vs-S comparisons; the per-field data already exist (`FieldLine` raws, declaration text, facts type/value).

---

## 7. Name collisions with the spec's vocabulary

- **"freeze / frozen"** already means D-19 `freeze_statements`:
  - `RunView.frozen` (`run.ts:302`); gate codes `not-frozen`, `statement-changed`, `proof-before-freeze`; the run directory `frozen/<n>/`;
  - UI text such as "Statements frozen (round 1)" and "Claude must first **freeze** the statements" (`docs/user-guide.md:174`, `186`);
  - code headers saying "FROZEN CONTRACT".
- **"session"** already means:
  - the markup field `session:` (the run id that created a card);
  - the Claude CLI session;
  - `BoardSession`, and the core `EditSession` (planner);
  - the run directory's `session/`, and the unused `.telelean/sessions/`.
- **"review"** already means the run state `review`, the review stepper (`webview/src/run/Review.tsx`), and `ReviewItem` / `StatementReview` / `VocabularyReview` (`run.ts:352-375`).
- **"blacklist"** sits close to the G0 "token denylist".
- **"fuzzy"** appears in a comment about undo patches (`workspace/types.ts:13`), although undo uses fuzz 0.
- **"definition"** is both the stance chip "It's a rule or definition" and the Lean vocabulary kind `definition`.

---

## 8. Docs vs code discrepancies (code is authoritative)

1. **Body rendering.** 03 §3.2 says the body after `---` is "Rendered with raw HTML disabled and a URL sanitiser". The board never renders `TlNode.body` (no use in the webview).
2. **Claude's wording marker.** `docs/user-guide.md:210` says an adopted card "stays marked as Claude's wording (italics) until you edit its sentence". In code, `planEditNode` never touches `worded_by` (`planAction.ts:106-146`; no writer of `worded_by` except adoption), so the marker persists after an edit.
3. **Vocabulary glosses.** 03 §3.3 says vocabulary "docstrings are Claude's wording until you rewrite them". Code always sets `glossBy: 'user'` (`vocabulary.ts:333`) and records no provenance.
4. **`preferredId`.** It is documented as used (`actions.ts:33-34`) but never read.
5. **`.gitignore`.** docs/m1-plan.md §7.1 lists the `.gitignore` text without `/.telelean/*.tmp`; the code adds it (`initialize.ts:39`).
6. **Sidecars.** D-12 lists `signoffs.json` and `wording.jsonl`, which are not implemented. `frozen/` and `sessions/` exist only as gitignore lines; run directories live in VS Code global storage.
7. **Vocabulary collapse state.** `VocabularyGroup.tsx:1-5` says it is "never in a model file", while `layout.ts:16` supports `collapsed` in layout.json. That key is round-tripped but never written by telelean.
8. **Status flags.** `signoff-stale`, `depends-on-removed`, `broken` and `unselected-used` are declared (`model.ts:135-160`) but never computed (also stated in `docs/project-report.md:1531`).
9. **`tags`.** Parsed and gate-compared, but not on `TlNode` or in graph.json.
10. **`id` required.** 03 §3.2's field table marks `id` "(required)", but 03 §3.1 and D-8 accept id-less blocks. Code: optional, with TL112 info.
11. **Context menu.** D-17 mentions a context menu ("Move to ▸"); none exists.


## spec_interactions

- **FROZEN 1** — current: No per-card or per-field lock state exists anywhere: no markup key, no sidecar, no TlNode field. The designed analogue, D-19 sign-offs (signoffs.json, StatusFlag 'signoff-stale'), was never implemented: the flag is declared in model.ts:135-160 but never computed. Fields are addressable only at the markup level (MarkupBlock.lines: FieldLine{key, span, valueSpan, raw}, markup/types.ts:120-130). The board edits only EditableField = naturalName | rationale | stance | source (actions.ts:18), plus type via change-kind and premises via These suffice. The formalised aura is a box-shadow on .tl-card[data-formal='formalized'] (board.css:348-351; colour --tl-aura from theme colour telelean.formalizedAura, default charts blue, board.css:18). Proposal diff halos are box-shadows composed with that aura (board.css:1472-1475).
  - files: packages/core/src/markup/types.ts, packages/core/src/model.ts, packages/core/src/actions.ts, packages/core/src/run.ts (NodeChangeField), packages/core/src/gate/rules.ts:60, packages/webview/src/styles/board.css
  - conflict/gap: (1) The spec needs a field vocabulary that spans three things: markup keys; Lean parts that are not markup keys (the statement abbrev, n.holds, the docstring mirror); and vocabulary items, which have no id and only a Lean name. Ghosts and TRANSFORM drafts are not in the files at all. (2) 'Accepting freezes its definition' must define 'definition': the sentence, the Lean statement, both, or also its statement closure. (3) A third halo would collide with the two existing box-shadow halos; a non-halo cue (border style, lock glyph, pattern) avoids the clash.
  - safety: The frozen field set defines what Claude may never change. If it is underspecified, gaps follow: for example a frozen sentence with an unfrozen Lean statement, or a frozen statement whose definitions remain editable.
- **FROZEN 2** — current: Today every pre-existing card is effectively frozen against Claude, enforced mechanically by the gate on judged states. G5 markupFindings (core/src/gate/rules.ts:836-1032; COMPARED_FIELDS at rules.ts:60) refuses any change to any block field, extensions, body, id or lean line, any binding change, and any block that is added, removed or moved (adopted-ghost blocks excepted). G3 existing-changed (rules.ts:343-384) refuses any change to the text or meaning of a declaration that existed at base B, except the target's .holds. G3 statement-changed (rules.ts:466-498) enforces the freeze_statements snapshot. Claude's file tools can still write any .lean file in the shadow ws/: the path guard confines tools to ws/ but cannot see fields. ask_user exists (answerQuestions), but no question kind requests an unfreeze.
  - files: packages/core/src/gate/rules.ts, packages/core/src/edit/planAction.ts, packages/core/src/edit/planKind.ts, packages/core/src/edit/session.ts, packages/core/src/gate/normalise.ts, packages/core/src/gate/adoption.ts, packages/runner/src/llm/confinement.ts
  - conflict/gap: The spec replaces the blanket immutability with a frozen set and lets Claude change, add and delete unfrozen cards. That needs G3 and G5 generalised (frozen set immutable; everything else becomes a reviewed item), not bypassed. 'Never edit' should be read as: no judged, shown or applied state ever contains a change to a frozen field. telelean's own cascades also edit other cards and must each be classified: the delete cascade removes the id from other cards' premises (planAction.ts:193-198); the D-11 rewrite adds hypotheses to other cards' proofs (planKind.ts:234-284); the D-8 pin and TL112 id write-back (planAction.ts:49-55, edits.ts:79); the D-9 docstring mirror (planAction.ts:129-135, gate/normalise.ts:27-31); keepOtherBindings blank-line insertion (edit/session.ts:203-236); and the ghost-adoption premises append (adoption.ts:140-144). An unfreeze-request mechanism is needed (a new ask_user kind or MCP tool).
  - safety: Central soundness clause. Meaning can change through the closure: a frozen statement's meaning changes when a definition, vocabulary item or other card statement in its closure changes (LeanBinding.uses, lean-ref edges). Today G3 prevents this only because everything pre-existing is immutable. D-19 already binds a sign-off to wording, statement, closure and decisions in force, and D-18 authorises meaning changes only for an explicit set.
- **FROZEN 3** — current: No frozen state exists. Several user operations rewrite file content wholesale: Undo/Redo (runner/src/workspace/undo.ts), History 'Revert to this' (modelWorkspace.ts:963-990), hand edits in VS Code (D-21: 'Hand edits are authoritative'), and git checkout.
  - files: packages/runner/src/workspace/undo.ts, packages/runner/src/workspace/modelWorkspace.ts, packages/runner/src/workspace/files.ts
  - conflict/gap: If the frozen flag lives in markup, or in a sidecar inside the snapshot scope (files.ts:146-151), then Undo, Revert, hand edits and branch switches change frozen status without the CONTEXT MENU and outside a session end. That contradicts 'the only time frozen status can be removed automatically'. If it lives in a sidecar outside snapshots (like decisions.json), Undo and Revert leave it alone, but they can then change the content of a frozen card. The spec must say whether Undo, Revert and hand edits count as manual changes.
  - safety: An unexpected automatic unfreeze would let Claude edit a card the user believes is locked.
- **EDIT SESSIONS 7** — current: No edit-session concept exists. The closest long-lived state is the RunManager, one per root and at most one active run. It persists run.json under <globalStorage>/runs/<rootKey>/<runId>/ (shadow/types.ts:1-30) and recovers it after a reload. The undo stacks are in memory per subject and lost on reload (undo.ts:1-15). The planned .telelean/sessions/ is only a gitignore and watcher-ignore line (initialize.ts:39, modelPaths.ts:89).
  - files: packages/runner/src/run/manager.ts, packages/runner/src/run/types.ts (PersistedRun), packages/runner/src/shadow/types.ts, packages/runner/src/workspace/undo.ts
  - conflict/gap: Restoring the frozen status of all cards is simplest if session freezes are an overlay in session state over a persistent store the session never writes; restoring then means dropping the overlay. Open edge cases: cards created in the session have no pre-session status; deleted cards cannot be restored; the user's manual freezes during the session would also be reverted, which contradicts FROZEN 4/5 ('at any time'). The spec should say whether a permanent freeze can be made during a session. The session's base can also drift from hand edits, which needs the same rebase and re-gate that Accept does.
  - safety: The restore step must never unfreeze anything that was frozen before the session, and it must be atomic with the session end. It must not be an undoable file change that could be undone into a half-restored state.
- **EDIT SESSIONS 8** — current: Confirmation dialogs exist in two forms: host modals (BoardSessionPorts.confirm with ConfirmId 'initGit', boardSession.ts:65-83; host.ts:562-570, a modal showInformationMessage) and webview dialogs (webview/src/dialogs/Dialogs.tsx). Cards of other subjects can be named by sentence through the dependentCards pattern (boardSession.ts:477-497). Nothing computes which cards or fields will be frozen or unfrozen.
  - files: packages/extension/src/logic/boardSession.ts, packages/extension/src/vscode/host.ts, packages/webview/src/dialogs/Dialogs.tsx
  - conflict/gap: The popup needs a diff between the effective frozen set and the persistent set. Field-level names need a user-facing field vocabulary (sentence, why, stance, source, kind, premises, Lean statement, proof). Vocabulary entries need their Lean names shown.
  - safety: Low. The popup supports informed consent; it does not enforce anything.
- **TRANSFORM 2** — current: add-node writes immediately to Model/<S>/Inbox.lean. It creates the Inbox file and its import when missing (planAction.ts:61-104), and the host derives the id from the sentence with deriveId (ids.ts:95-103). The webview shows a provisional card under a slugId clientId (graph.ts:159-176; store.ts:1275) and remaps it when the host's graph or actionResult arrives. BoardAction.preferredId is declared but never read (actions.ts:33-34).
  - files: packages/core/src/edit/planAction.ts, packages/core/src/markup/ids.ts, packages/core/src/graph.ts, packages/webview/src/state/store.ts
  - conflict/gap: TRANSFORM cards are drafts that must not touch the files until submit or session end. They need provisional ids that stay stable across REVIEW STAGES, because the blacklist, shaky marks, frozen fields and references all key on them. Ids derive from natural_name, which may be 'fuzzy' (unknown) when the card is created, so id derivation must be deferred or replaced by a temporary-id scheme. preferredId could carry a user-chosen id but is unimplemented.
  - safety: A new ASSUMPTION card is a new belief (an axiom n.holds once formalised). Cards created or completed by Claude must stay reviewed items and never be applied automatically.
- **TRANSFORM 3** — current: delete-node removes the block and, unless keepLean is set, the statement abbrev and .holds; theorem proofs are archived to .telelean/subjects/<S>/attic/<id>.lean. It removes the id from every other card's premises and pins those cards. When other declarations break, it refuses with needs-confirmation listing them; the board then resends with confirmed: true or chooses keepLean (planAction.ts:162-208; planDelete.ts:11-37). With keepLean, an axiom n.holds left behind becomes an unmarked hidden assumption (TL104; DeletePlan.leavesUnmarkedAxiom).
  - files: packages/core/src/edit/planAction.ts, packages/core/src/edit/planDelete.ts, packages/core/src/edit/dependents.ts
  - conflict/gap: A card in the TRANSFORM trash is a staged delete. The real cascade edits other cards (their premises lines) and breaks other proofs and statements; those may be frozen. The spec has no counterpart to the 'card only, keep Lean' choice or to the confirmation that lists broken dependents.
  - safety: Deleting a card whose .holds others use breaks proofs. Keeping its Lean leaves a hidden axiom that proofs may silently rest on (TL104).
- **TRANSFORM 4** — current: type and natural_name are required (TL003, parser.ts:358-361), and asserted is written automatically. Provenance is per card only: worded_by covers the sentence (italics plus "(Claude's wording)"), and origin and session identify the creating run. rationale, stance, source and the Lean statement carry no provenance. No 'unset / fuzzy' marker exists in markup or anywhere else.
  - files: packages/core/src/model.ts (Provenance), packages/core/src/markup/types.ts, packages/core/src/edit/planAction.ts, packages/webview/src/common/AgentText.tsx
  - conflict/gap: Values Claude autofills would be indistinguishable from the user's. Only the sentence has a marker, and editing a sentence does not reset worded_by today, contrary to user-guide.md:210. Fuzzy markers need session storage until they are filled. A fuzzy 'type' filled by Claude decides whether a card is an ASSUMPTION, which means Claude decides what the user believes.
  - safety: High. Autofill touches belief introduction (axioms) and the attribution of words, which D-15 requires to be visible.
- **TRANSFORM 5** — current: Board edits (editNode) write immediately and carry no 'manually set' flag. G5 already treats natural_name and rationale as 'the person's words … byte-identical' for Claude.
  - files: packages/core/src/gate/rules.ts:911-929, packages/core/src/edit/planAction.ts
  - conflict/gap: Values the user types in TRANSFORM must become frozen per field, and they belong to drafts that are not yet in the files. That needs per-field frozen entries keyed by draft id, which migrate to the real id once the card is written.
  - safety: These values are what the user specified. Claude must never change them, so the gate must compare them against the user's values, never against the shadow's text.
- **TRANSFORM 10** — current: Computed, never stored, never editable: Depends on / Used by (edges plus lean.externalUsers, CardDetails.tsx:354-355), uses, refs, footprint / axioms / presupposes, status flags and chips, attempts. Stored but not editable on the board: id, asserted, the lean pin, supersedes/refines, tags (not even on TlNode), origin/session/worded_by, body notes (not rendered), dotted extensions, and the Lean statement and .holds code (only 'Open in editor' and 'Copy'). Editable today: sentence, why, stance, source, type (via D-11 with a dependents dialog) and premises (These suffice only).
  - files: packages/core/src/actions.ts, packages/core/src/model.ts, packages/webview/src/board/CardDetails.tsx, packages/core/src/kindChange.ts
  - conflict/gap: The spec must decide whether TRANSFORM may edit the Lean statement text directly, premises (today only through These suffice), type (today a drag with D-11 impact and dependents confirmation) and body notes (not shown at all). Ids, asserted dates, provenance and pins should stay non-editable, because the gate and the history trailers rely on them.
  - safety: Editing type or premises has Lean consequences: D-11 adds or removes .holds axioms and rewrites dependents. Editing a Lean statement directly changes meaning and invalidates sign-off-like approval.
- **REFERENCE SYSTEM 1** — current: No reference syntax exists in any text. Sentences and rationales render as plain text (AgentText / UserText), '#' has no meaning in markup (raw text, not YAML), and the webview has no autocomplete or mention component. Structural references do exist: premises, supersedes and refines (ids); LeanRef.nodeId on identifiers in card code, whose hover shows the card's sentence and whose click calls revealNode or highlightVocab (LeanCode.tsx:1-9, 80-90); ExternalUser; decisions affectedNodes; attempts target and premises; the history trailer Telelean-Nodes. Sentences are one line and at most 4000 characters (protocol.ts:350-356; planAction.ts:32-37).
  - files: packages/core/src/markup/ids.ts, packages/core/src/markup/values.ts, packages/core/src/model.ts (LeanRef), packages/webview/src/board/LeanCode.tsx, packages/webview/src/common/AgentText.tsx
  - conflict/gap: Anchors: card ids are slugs, and ID_PATTERN (ids.ts:8) allows '.', '-' and '_', so '#id.field' is ambiguous; ':' or '/' would be unambiguous field separators. Vocabulary needs fully-qualified Lean-name anchors, ghosts are run-scoped 'ghost-<n>', and drafts need temporary ids. Derived ids are unstable until written. Ids are reused after delete and re-add, so old references silently rebind to the new card. supersedes and refines have no dangling check today. Reference tokens inside natural_name fall under G5's 'byte-identical' rule and must go through formatFieldValue escaping.
  - safety: A reference inside a sentence makes that card's meaning depend on the referenced card. If the referenced card is unfrozen and changes, the referencing card's meaning changes while its text does not. Freezing should extend to referenced cards, or a 'referenced card changed' flag is needed; the reserved signoff-stale and depends-on-removed flags are never computed today.
- **INITIATING EDIT SESSIONS 3** — current: The Current view is the editing surface (D-16, D-17: 'Edits are saved immediately'). It offers inline 'Edit' (sentence, F2), 'Edit why' / 'Add why', stance and source chips, 'Make Assumption/Derivation/Goal', drag across columns (change-kind with D-11 impact drop zones), reorder drag, 'Delete', and the A|D|G add box (CardDetails.tsx:236-312). The Proposed view is read-only, with the string "This is Claude's proposal (read-only): switch the board to \"Current\" to edit your cards." (CardDetails.tsx:359).
  - files: packages/webview/src/board/CardDetails.tsx, packages/webview/src/board/NodeCard.tsx, packages/webview/src/prompt/PromptBox.tsx, packages/webview/src/state/store.ts, packages/extension/src/logic/actionMapping.ts
  - conflict/gap: This reverses D-17 and the current UI, and the read-only string must change. The spec must say whether these stay direct: the A|D|G box, reorder (layout only), kind-change drag, delete, and the These suffice premises declaration. FROZEN 4/5 still require freeze and unfreeze on the Current tab. Hand edits in VS Code stay possible regardless, because the files are the source of truth (D-21).
  - safety: Hand edits bypass any board-level rule. They must be detected as base drift (as Accept does: rebase and re-gate) rather than assumed impossible.
- **INITIATING EDIT SESSIONS 2 / FROZEN 5** — current: Selection lives only in the webview (store selected and target). The host only logs 'select' messages (BoardPanel.ts:222; boardSession.ts:190-192). Vocabulary items and fields cannot be selected. Runs already restrict Claude to formalising only the target and the selected premises (G5 'formalised' rule, rules.ts:985-1000).
  - files: packages/webview/src/state/store.ts, packages/extension/src/board/BoardPanel.ts, packages/core/src/gate/rules.ts
  - conflict/gap: 'Make every non-selected card FROZEN' must say whether vocabulary and definitions count. Claude adding or changing vocabulary changes the meaning of statements that use it. Field-level and vocabulary selection would be new concepts.
  - safety: Leaving vocabulary unfrozen while cards are frozen re-opens the closure loophole described under FROZEN 2.
- **REVIEW STAGE 5 / INITIATING EDIT SESSIONS 1** — current: startRun is refused while any run of the root is active, including a proposal in review (busyRefusal, logic/runs.ts:169-181; tray text in webview model/run.ts:45-58). Starting a run first writes the premises declaration (set-premises) to the target's premises line in the user's files, as its own undoable action (manager.ts:856-866).
  - files: packages/extension/src/logic/runs.ts, packages/extension/src/logic/boardSession.ts, packages/runner/src/run/manager.ts
  - conflict/gap: During a session, 'These suffice' must run inside the existing session rather than be refused. The premises declaration edits the target card's premises field directly in the user's files; a frozen target would block it, and under the spec it should probably become a review item instead.
  - safety: A user-file write before review bypasses the review model; today it is undoable and snapshotted.
- **DECLINE OPTIONS 1 and 3 (blacklist, shaky)** — current: Nothing similar exists. G0 has a 'token denylist' (gate/g0.ts), which is a different concept. Ghost ids are run-scoped, and card ids are derived from sentences.
  - files: packages/core/src/markup/ids.ts, packages/runner/src/run/types.ts
  - conflict/gap: Identifying 'this card' across stages is the problem. A regenerated card reworded by Claude gets a new id and escapes an id-keyed blacklist. The rule 'cannot regenerate the exact configuration' needs a canonical card identity, for example the normalised sentence plus the Lean statement. Both are session-scoped state (run.json-like) and should not be stored in files.
  - safety: Low for soundness, but it determines whether these controls actually work.
- **EDIT SESSIONS / REVIEW STAGE (per-item accept vs D-21)** — current: Accept is all-or-nothing (D-21; protocol.ts:166-174), and 'partial (node-level) Accept (later, D-21)' is deferred (docs/m2-plan.md:113). Accept applies model files only (modelWorkspace.ts:949-951), as one undo step with history kind accept-proposal.
  - files: packages/runner/src/workspace/modelWorkspace.ts, packages/runner/src/proposal/service.ts, packages/core/src/protocol.ts
  - conflict/gap: Per-item accept and decline inside a session can coexist with an all-or-nothing apply at session end. But any sidecar that must change atomically with the session end (the frozen store, the layout of new cards) is refused by applyChanges today, which accepts model files only.
  - safety: Applying per stage, rather than once at the end, would split one user decision into several undo steps and several base states, each needing its own gate.

## safety_invariants

- **Claude never changes the user's words or any field of an existing block (natural_name, rationale, type, premises, stance, source, asserted, supersedes, refines, tags, origin, session, worded_by, extensions, body, version, id, lean lines). It never adds, deletes or moves blocks; only telelean-written adopted-ghost blocks may appear.** — enforced: packages/core/src/gate/rules.ts:836-1032 (G5 markupFindings; COMPARED_FIELDS at rules.ts:60). Applied when check_lean reports, when freeze_statements and finish refuse, and in the Accept re-gate (runner/src/run/manager.ts:1662-1715).
  - spec could break it: The spec lets Claude propose changes, creations and deletions of cards. Relaxing G5 wholesale, instead of replacing 'every block is immutable' with 'frozen fields are immutable, and every other change is a review item the user accepted', would let unreviewed edits to sentences, rationales or premises reach the files.
- **Every declaration that existed at the run's base B keeps its text (docstring included) and its meaning (type and value from Lean facts), except the target's .holds.** — enforced: packages/core/src/gate/rules.ts:343-384 (G3 existing-changed). B is re-taken as the user's files at Accept when they drifted (runner/src/run/manager.ts:1666-1715).
  - spec could break it: Letting Claude change unfrozen cards' Lean must keep the text-and-meaning check for every frozen card's statement and .holds, and for everything in their statement closure (LeanBinding.uses: vocabulary, definitions, other cards' statement abbrevs referenced through lean-ref edges). Freezing only a card's own block and abbrev would let its meaning change through a definition it uses.
- **After freeze_statements, the frozen statements, vocabulary and definitions keep kind, type and value, and the target statement is identical (lake comparator).** — enforced: packages/core/src/gate/rules.ts:466-498 (statement-changed); FrozenSnapshot in gate/types.ts:166-179; RunView.frozen in core/src/run.ts:302.
  - spec could break it: The spec reuses the word FROZEN for a user lock. Conflating the two could weaken the run-level check when the user unfreezes a card, or confuse the UI and the prompts that Claude reads.
- **Only the person adds beliefs. No new axiom appears except the .holds of a selected ASSUMPTION and pure-signature vocabulary. Premises that Claude thinks are missing arrive as ghosts, which become cards only through 'I hold this' and then Accept.** — enforced: packages/core/src/gate/rules.ts:267-341 (new-axiom); propose_assumption and adoptGhost (runner/src/run/manager.ts:1526-1615); core/src/gate/adoption.ts.
  - spec could break it: Claude-proposed 'Add <card>' items, 'Claude suggests' cards treated as plain new cards, a TRANSFORM 'fuzzy' type autofilled as ASSUMPTION, and 'shaky' reshuffles could all introduce ASSUMPTION cards (axioms) without an explicit per-card user acceptance.
- **A definition introduced on a statement path, and any presupposition the run creates, needs the user's explicit yes at Accept (D-4: 'A definition can quietly carry a belief').** — enforced: DefinitionQuestion (core/src/run.ts:381-394); acceptNow's check of missingDefinitions (runner/src/run/manager.ts:1651-1652); flagged() in core/src/gate/rules.ts:808-834.
  - spec could break it: The spec's 'one item for all the vocabulary' in the review list could lump definitions together with auto-approved pure-signature vocabulary. Accepting a 'Formalize <card>' item could implicitly accept the definitions it introduced.
- **Ids are never changed implicitly; only a derived id is written back (TL112). Claude never changes or removes lean: pins, a formalised card keeps its binding, and unselected cards are not formalised in a run. No telelean edit silently changes another card's binding.** — enforced: core/src/markup/ids.ts:1-5; core/src/gate/rules.ts:932-1000; core/src/edit/session.ts:203-236 (keepOtherBindings).
  - spec could break it: Several new features key on ids staying stable: Claude-proposed 'Change <card>' that rewords or re-formalises a card, '#' references, the blacklist, and per-card frozen entries. Ids are also reused after delete and re-add, which silently rebinds old references.
- **User files change only through ModelWorkspace (perform, undo, redo, revert, applyChanges). Each write gets a before-text check (else conflict), a 'Manual edits' or 'Initial state' snapshot first, one undo entry, an action snapshot, a re-read and a Lean refresh.** — enforced: packages/runner/src/workspace/modelWorkspace.ts:879-1034; packages/extension/src/logic/editApplier.ts:167-217; packages/runner/src/workspace/fsAdapters.ts:65-92.
  - spec could break it: Freeze toggles, or writes at session end, made as direct sidecar writes (as attempts.jsonl and decisions.json are written) bypass undo and history. applyChanges accepts model files only (modelWorkspace.ts:949-951), so atomic session-end updates of sidecars need a deliberate extension.
- **Nothing from the shadow reaches the user's files without a passing gate on the exact state applied. If the user's model files changed since base B, Accept rebases (3-way merge), re-normalises, re-freezes and re-gates with B equal to the user's files at Accept.** — enforced: packages/runner/src/run/manager.ts:1645-1730; packages/runner/src/proposal/service.ts:1-16, 320-397.
  - spec could break it: baseDrift compares model files only. If the frozen set lives in a sidecar, a freeze or unfreeze during a session does not register as drift, so the final gate must use the frozen set as of the moment of applying. Applying per review stage would need a gate per stage.
- **Claude's file tools see and write only the shadow's model files; .telelean, .lake and .git are hidden. Sidecar facts reach Claude only through the context bundle that telelean renders.** — enforced: packages/runner/bin/telelean-path-guard.mjs; packages/runner/src/llm/confinement.ts:28 (HIDDEN_SEGMENTS); packages/runner/src/shadow/types.ts:1-30; runner/src/run/prompts.ts:192-241 (renderContextBundle).
  - spec could break it: Frozen flags stored in markup would be visible and editable by Claude in the shadow. The gate must then compare them against telelean's authoritative copy and never trust the shadow's text.
- **Undo and Redo are all-or-nothing, applied exactly or as a reverse patch with no fuzz. History revert first snapshots the current state or refuses.** — enforced: packages/runner/src/workspace/undo.ts:41-63; modelWorkspace.ts:905-928, 986 (requireBaseSnapshot), 998-1014.
  - spec could break it: If the frozen status is restored at session end as an undoable file change, an Undo could leave a half-restored freeze state. Sessions that write per stage would also produce many partial undo steps.
- **Text worded by Claude is always marked (italics plus a marker): cards with worded_by: agent show "(Claude's wording)", and every agent string carries data-provenance=agent.** — enforced: packages/webview/src/common/AgentText.tsx:1-40; webview/src/board/NodeCard.tsx:132, 226-228; core/src/gate/adoption.ts:129-133.
  - spec could break it: TRANSFORM 4 autofill has no per-field provenance, so a rationale, stance or source filled by Claude would render as the user's. Today worded_by covers only the sentence and is never reset by an edit (planAction.ts:106-146).
- **A D-11 dependents choice (rewrite or mark broken) applies only to dependents the user saw listed. A delete that breaks other declarations needs explicit confirmation.** — enforced: packages/core/src/edit/planKind.ts:145-152, 183-189, 221-227 (confirmedDependents); packages/core/src/edit/planAction.ts:166-177 (confirmed).
  - spec could break it: Batched session changes (several accepted deletes or kind changes) must still list every dependent. Cascades into frozen cards (premises cleanup, hypothesis rewrites in their proofs) must be refused or require an unfreeze first.
- **Markup round-trips safely: values containing comment delimiters are JSON-escaped, a rendered block always re-parses to the same block, and unrelated text stays byte-identical.** — enforced: packages/core/src/markup/values.ts:53-103; serializer.ts:18-50; edits.ts:60-147.
  - spec could break it: Reference tokens, fuzzy markers or frozen-flag syntax inserted into fields must go through formatFieldValue. A raw '/-' would comment out the rest of the file.

## answers

These are facts I checked in the code; question 3 is in my area, and I verified questions 1 and 2 as well.

1. The "Fully explicit" checkbox:
- Where: in the end-of-round review, on each "Statement" step (packages/webview/src/run/Review.tsx:52-58). The checkbox is labelled "Fully explicit", with the tooltip "No notation, every argument and universe shown, no coercion arrows".
- What it does: switches the shown Lean statement between StatementReview.pretty (Lean's #print in default notation) and StatementReview.explicit ("pp.explicit, no notation, universes shown, no coercion arrows"; core/src/run.ts:352-367). The setting is kept per statement in the webview ("Statements shown in their fully explicit form, by node id", store.ts:243).
- What it does not do: it is display-only. Nothing is written to any file and Accept is not affected. It comes from D-19, which asks for the "fully explicit" toggle so the user can check meaning before seeing proof status.

2. "Statement 1", "Statement 2" versus "Claude suggests":
- "Statement N" steps (Review.tsx:21-24) are StatementReview items. There is one per statement abbrev that is new or changed compared with the run's base B: the user's own cards that Claude formalised (target and selected premises), plus adopted ghosts. Each step asks "Does the Lean say what the sentence says?" and shows the card's sentence beside its Lean and the statement closure ("It uses").
- "Claude suggests" cards are GhostView items (core/src/run.ts:235-254). These are new premises Claude proposed with propose_assumption, which the gate checked would close the gap. They are not cards of the model: they appear translucent at the top of the Assumptions column only in the Proposed view (GhostCards.tsx:1-4), and the report card lists them as "Premises Claude suggests".
- "I hold this" adopts a suggestion. That starts a new round, writes an ASSUMPTION block into Claude's working copy (worded_by: agent, origin: agent, session: <runId>), adds it to the target's premises, and re-freezes the statements. It reaches the user's files only on Accept. "No" rejects it.

3. Where "definitions" appear in the main card graph: they are never cards.
- A Lean definition (a def/abbrev/structure/inductive/instance with no telelean block) is a vocabulary item of kind 'definition'. It is listed in the Vocabulary group at the top of the Assumptions column, under the section "Definitions" (webview/src/labels.ts:61-71; core/src/project/vocabulary.ts). When a statement relies on it, the item gets the flag "definition on a statement path" (VocabularyGroup.tsx:39).
- Every card whose statement closure uses a definition gets the chip "definitional choice", with the tooltip "Its statement relies on a definition (D-4: needs your endorsement)" (webview/src/model/cardData.ts:168).
- Definitions have no arrows. A card's "uses:" line and clicks on identifiers in its Lean code highlight them in the Vocabulary group.
- During a review, definitions that Claude added on a statement path appear as definition questions (yes/no). Accept needs a yes for every one; a no opens Feedback.
- Separately, the stance chip "It's a rule or definition" is a card's stance, not a Lean definition.

## uncertainties

- I did not read every webview component in full (PromptBox.tsx, Dialogs.tsx, most of store.ts, the run panel). The UI strings quoted come from targeted reads and greps; other areas may have more strings relevant to editing on the Current tab.
- I skimmed rather than fully read core/src/markup/lexer.ts, decls.ts and text.ts, and runner/src/gate/engine.ts and runner/src/proposal/files.ts (mergeFile). Claims about command starts and the Accept merge rely on their doc comments and call sites.
- I did not read extension/src/vscode/editor.ts (the VS Code EditApplier port) or registry.ts beyond its header. The behaviour of the watchers and echo detection for a hypothetical new sidecar is inferred from modelPaths.ts:73-110 and changeBatcher.ts.
- I did not run anything, so I could not confirm at runtime that the board never renders TlNode.body or tags, or that worded_by persists after a sentence edit. These are static readings: no use in the webview, and no writer of worded_by except ghost adoption.
- The design recommendation in report section 3.2 is my own analysis of the trade-offs (persistent freezes in a subject sidecar, session-scoped freezes as an overlay in session state, enforcement in the gate). It is not taken from the user's docs; the user should decide.
- I did not check whether existing tests assert the exact G5/G3 messages or the read-only string. Changing them may break tests in packages/*/test and test/e2e.
- Whether '.telelean/frozen/' and '.telelean/sessions/' are used anywhere outside packages/*/src (scripts, tests) was not checked; within src they appear only as gitignore and watcher-ignore entries.
- Where the spec says 'Claude can never edit a frozen card', I read 'never' as 'no judged, shown or applied state contains such an edit'. Blocking Claude's individual file writes per field is not possible with the current path guard. The user may mean something stricter.
