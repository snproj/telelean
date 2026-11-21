# design:engine-checks

Agent `a2f6a50621d1d091d` of workflow `wf_d355dac3-0d9`. Verbatim output (JSON alongside).

- **summary:** Slice 3's freeze engine is built around one core table and one comparison, and it reuses slice 2's machinery (judgeState, computeItems ownership, content keys, the reducer, the session stack, the write queue and the end confirmation). The key choices:

(1) A freeze addresses a card field (CF-2's 8 fields), a vocabulary field (declaration, gloss), an arrow, a follows-from-nothing mark, or a card's existence (accepted Delete). Every judged state is compared address by address against a frozen value. Each address's value on a state is a canonical key from `addressValue()`: exact texts plus a new Lean meaning fingerprint `DeclFacts.meaningKey`. The probe computes that fingerprint as the SHA-256 of the derived `Repr` of the elaborated `Expr`. The held closure is the existing `reach(model, decls, 'meaning')` from slice 2's closure.ts (a `.holds` counts by its type only), and each declaration in it must keep its text and meaning.

(2) Storage, all out of Claude's reach. Standing freezes live in `.telelean/subjects/<S>/freezes.json`: a sidecar, outside ws/, refused by the path guard. They are board actions with their own Undo step, and History restores never touch them. Session freezes live in run.json (`PersistedSession.freezes`). The accepted reason (RV-4) is derived from item records through a new `ItemRecord.frozen`. That field is cleared only by the user's own status change or Unfreeze, never by telelean's reconcile.

(3) Expected values. Standing addresses, and accepted fields the accepted item did not change, are compared with B. B never changes during a session (ES-7). Accepted content is compared with its content key plus the meaningKeys recorded at Accept. Only the user's own session freezes store a value: key, display text and held map.

(4) Unfreeze requests. The new `request_unfreeze` tool pauses the step exactly like ask_user. Continue or Keep frozen are answered from the freeze store, never from what Claude claims. "Allow this change" exempts a held B declaration X and produces "meaning changed by X" items.

(5) FZ-10, freezing while Claude works. The freeze is enforced from the next check, and Claude is told in its next tool result. The first check that fails only on such a fresh freeze is not counted. A gate that passed before the freeze is re-checked at the step's end, and the rollback then goes to S₀. If an already ended step of the running queue had the address in its scope, the queue is cancelled from that step; the rule depends only on scope, so it never tells an outcome.

(6) FZ-8. At Apply, Exit or failure, freezes.json becomes the start snapshot plus the changes the user ticked "keep". The Apply's Undo step includes freezes.json.

(7) Slice-2 deferrals, all needed so the whole model can be opened safely:
- the switches "Open the whole model" and "Claude may add cards";
- new tools `remove_arrow`, `delete_card`, `add_card` and `mark_proof_broken`, which telelean writes through ledger entries, as with propose_arrow (D2-1);
- ownership, classes, dependencies and revert for the item kinds Change (card fields), Delete, Remove arrow, Add (intermediate cards), Proof broken and meaning-changed;
- the backstop's frozen, held and allowance codes.

One deliberate simplification (an AUTOPILOT DECISION): a Formalize-started session creates no binding "session-start" freeze reasons. ES-2's preset stays per step (slice 2's step limits), and the start banner is presentational. Real session-start reasons are left as a hook for slice 4's transform sessions.

The work splits into 10 sub-slices: 5 core ones in strict order, the probe, and 4 runner/host ones.
- **current_state:** WHAT EXISTS
- No FROZEN code at all. grep finds no freeze store, no `telelean.frozen` theme colour and no FreezeAddress.
- The `.telelean/frozen/` path is a gitignored, unused M1 leftover:
  - runner/src/workspace/initialize.ts:39 GITIGNORE_LINES;
  - extension/src/logic/modelPaths.ts:89 IGNORED_SIDECARS;
  - docs/project-report.md:810 says it is unused.
  It must not be reused for freezes.json.
- "Frozen" today means D-19's statement freeze, which FZ-12 renames "statements fixed":
  - core/src/gate/types.ts:184 FrozenSnapshot;
  - core/src/run.ts:317 RunView.frozen;
  - runner/src/run/manager.ts:2011-2046 toolFreeze, with the activity text "freeze_statements: statements frozen (round N)" at :2042;
  - runner/src/gate/types.ts FreezeRecord;
  - GateFindingCodes `statement-changed` and `not-frozen`.

PATTERNS SLICE 3 REUSES
- Meaning comparison:
  - core/src/gate/rules.ts:359-399 `existing-changed` compares B's declarations by text, then by facts `type`/`value` (pp.fullNames printing);
  - slice-2 plan D2-41 (§7.2 item 41) extends it with valueConsts/typeConsts sets, and §4.9 uses it as the step limits against S₀.
- The value probe: runner/src/semantic/checkFile.ts:97-143 valueProbeLines.
  - It is one `#eval show Lean.CoreM Unit` that walks `Expr.getUsedConstants` and prints one JSON line.
  - 2b3 adds typeConsts to it (§2.1).
  - The pinned toolchain v4.35's Lean/Expr.lean:514 has `deriving Repr` on Expr; I checked locally, read-only. So a faithful serialisation of an elaborated term is available inside the probe.
- Closures: core/src/review/closure.ts (2a1, built). `constsOf(f,'meaning')` uses type only for theorem/axiom/opaque/Prop-valued declarations and type ∪ value for definitions; `reach()` is memoised per model. That is exactly Appendix B's "held sets".
- Ownership: core/src/review/items.ts (2a1, built; lines ~690-800) makes UNOWNED, so Apply is disabled:
  - a removed card;
  - a removed existing declaration;
  - a moved block;
  - card field changes other than the statement;
  - `premises:` removals;
  - new blocks other than ledger premises.
  These are exactly slice 3's Delete, Change(fields), Remove arrow and Add items.
- The pause pattern: manager.ts:2048-2094 toolAskUser (pendingAsk, `waiting-for-answer`, an abort listener) and :1327-1390 answerNow (live delivery, or the next user turn on resume).
- Attempt counting: manager.ts:2215-2288 toolFinish (`counters.gateAttempts = attempt` after the environment checks).
- Storage boundaries:
  - runner/src/shadow/types.ts:1-25: ws/ holds only model files, with no `.telelean`;
  - runner/src/llm/confinement.ts HIDDEN_SEGMENTS blocks `.telelean`;
  - run.json sits in `<globalStorage>/runs/...` (extension/src/vscode/host.ts:460-467).
- Board Undo: runner/src/workspace/undo.ts UndoEntry holds whole-file changes plus `layoutOnly` (no History snapshot); modelWorkspace.ts:891-895 sets `snapshot: !layoutOnly`.
- History sidecars: runner/src/workspace/files.ts:146 isSubjectSidecarFile covers layout.json and the attic, plus endorsements.json in 2f.
- Board actions: core/src/actions.ts:36 BoardAction; core/src/edit/planAction.ts. markup/edits.ts writes a derived id together with any field edit.

THE SLICE-2 PLAN (final; the interface slice 3 builds on)
- Deferred to slice 3:
  - :37-41: no Freeze/Unfreeze, held set, request, banner or keep tick; Accept freezes nothing; accepted content is protected by the step limits and the accepted content key;
  - :42 and D2-12 (:2469): the whole-model and add-cards switches;
  - :46: Add/Change/Delete/Remove arrow/Proof broken are defined but cannot be produced;
  - :393: `card:<node>` add items for cards Claude creates;
  - :1630: b5, the "meaning changed" item of an axiom;
  - :1728: the base mask's third bullet is to be revisited;
  - :1846: the backstop's "Slice 3 hook: frozen and held declarations still elaborate to their frozen terms";
  - :2036 (§5.9): no freeze list or keep tick;
  - :2523 (D2-62): freezing while Claude works comes with slice 3;
  - §5.6: proof-broken Accept is disabled.
- Contracts reused:
  - §2.2: ItemKind (already lists add, remove-arrow, change, delete, proof-broken), ItemRecord, LedgerEntry, SessionAction;
  - §2.6: PersistedSession and its write order;
  - §2.7: StepScope and JudgeInput;
  - §2.9: StateJudgement, ItemDraft, ReviewState/ReviewAction/ReviewOutcome, applyBackstop, planItemRevert, SessionRecords, SessionViewInput;
  - §3.1 the working-copy invariant; §3.3-3.4 steps and rollbacks; §3.5 reconcile; §3.6 decisions and judging; §3.10 the end;
  - §4.1 closures; §4.2 ownership; §4.4 classes; §4.5 dependencies; §4.6 the reducer; §4.7 the mask and RV-6; §4.9 judgeState; §4.10 the backstop.
- The change log's latest entry is fixer 2a1. In core/src/review/, types.ts, closure.ts, items.ts, keys.ts, hash.ts, texts.ts and view.ts are built. classify, deps, reveal, reconcile, reducer, permitted, judge, backstop, revert, formalize, submit and mask are still stubs (12-36 lines). So slice 3 must target the plan's contracts, not the code.
- AP-24's rules hold: one reveal per stage (D2-61); nothing decided while a step runs (D2-62); a queue runs to its end before its stage opens (D2-63).

THE SPEC
- §5 FZ-1-FZ-13; ES-2 (preset, switches); RV-4, RV-5, RV-7 (b5); DO-0; EN-2/EN-3; UN-2/UN-4/UN-5; §14.3.
- Appendix A: A2, A3, A5, A6, A10, A22, A23.
- Appendix B: Replaced (the frozen and held check); Held sets; Backstop; Storage.
- The user's words outrank simplifications: prompt20.md lines 26-59 (FROZEN 1-5, REVIEW 3/5/7/8, INITIATING 2) and prompt21_midturn.md m1 D3.
- **design:** # Slice 3 design: the freeze engine and the checks (core + runner)

## 0. Principles
- **One mechanism.** Freezes are turned into one table of frozen addresses with their expected values (`effectiveFreezes`). Every judged state is compared against it (`frozenFindings`), and so is Apply's backstop. Nothing is incremental. A state that differs is refused, never repaired.
- **Reuse slice 2:**
  - computeItems' ownership and content keys (accepted content);
  - reach() closures (held sets);
  - judgeState's global findings;
  - the reducer and session stack (freeze actions are stack steps);
  - the write queue (a freeze is a records-only write);
  - Cancel step (FZ-10);
  - the end confirmation (keep ticks).
- **Claude never sees or writes a freeze.**
  - freezes.json sits in the user's `.telelean/` (never in ws/; the guard refuses `.telelean`).
  - Session freezes sit in run.json (VS Code storage).
  - Claude only reads lists in its turns, and requests unfreezes through a tool whose answer telelean computes from the store.
- **The user's words win.**
  - Only the user removes a freeze; FZ-8 at the session's end is the one exception.
  - Freeze and Unfreeze work at all times, during steps too. The only exceptions are the spec's ES-9 lock on the Current view during a session, and the two narrowings logged as decisions below.

## 1. What a freeze addresses (core `freeze/types.ts`, `freeze/address.ts`)
```ts
export type CardField = 'sentence'|'kind'|'why'|'stance'|'source'|'statement'|'dependencies'|'proof';
export type VocabField = 'declaration'|'gloss';
export type FreezeAddress =
  | { kind: 'field'; card: string; field: CardField }      // CF-2
  | { kind: 'vocab'; name: string; field: VocabField }      // vocabulary card, by Lean name
  | { kind: 'arrow'; source: string; target: string }       // FZ-13: may not be removed
  | { kind: 'mark'; card: string }                          // AR-5 mark: no premise may replace it
  | { kind: 'card'; card: string };                         // existence; RV-4 Delete only (never in freezes.json)
export function addressKey(a: FreezeAddress): string;   // field:<c>:<f> | vocab:<n>:<f> | arrow:<s>><t> | mark:<c> | card:<c>
export function parseAddressKey(k: string): FreezeAddress | undefined;
/** Freeze card = all 8 fields (both kinds' fields, so a later kind change by the user keeps them frozen). */
export function cardAddresses(card: string): FreezeAddress[];
/** RV-4: what an accepted item freezes (also what Freeze on a review item freezes). */
export function addressesOfItem(rec: ItemRecord, draft?: ItemDraft): FreezeAddress[];
```
`addressesOfItem` maps each item kind to the addresses it freezes:
- `card:` formalize or change: sentence and statement, plus each other field the item changes.
- `card:` add: all 8 fields, plus `card:` existence.
- `card:` delete: `card:` existence (absent).
- `premise:`: the new card's 8 fields, plus its arrow into T.
- `arrow:`: the arrow.
- `unarrow:`: the arrow (absent).
- `proof:` result or proof-broken: the proof field.
- `vocab:` and `decl:`: declaration and gloss; for a presupposition, its helper instance's declaration too.
- `meaning:`: nothing (its holder is already frozen).

## 2. Values (core `freeze/value.ts`), pure
```ts
export interface AddressValue { key: string; approx: string; exact: boolean; show: string; decls: string[]; present: boolean }
export interface HeldValue { key: string; approx: string; exact: boolean; show: string }
export function addressValue(m: ProjectModel, a: FreezeAddress): AddressValue;
export function heldValue(m: ProjectModel, name: string): HeldValue;
```
- `key` is the sha256 of the canonical JSON of the address's value (core `review/hash.ts`).
- `approx` is the same with D2-41's meaning fields instead of meaningKey: normalised type/value plus sorted valueConsts/typeConsts.
- `exact` holds when every covered declaration has a meaningKey.

What each address's value contains:
- **Text fields** (sentence, kind, why, stance, source): the block's raw field values exactly as G5 reads them (`raws(block,key)`). Absent means empty.
- **statement**: the binding mode, the statement's full name, and each bound declaration (statement abbrev with its docstring mirror; for an AXIOM also its `.holds`) as `{name, text (exact; trailing spaces trimmed), meaningKey}`. With no binding the value is "empty", which is how keep-empty works (FZ-2).
- **dependencies**: the sorted `premises:` entries plus `fromNothing`.
- **proof**: the state (empty, pending or proved) plus the `.holds` text. Its decls are `[T.holds]`, so the closure holds T's statement through the type only.
- **vocab declaration**: its text without the docstring, its kind and its meaningKey. Constructors and fields are covered by meaningKey.
- **gloss**: the docstring.
- **arrow, mark, card**: presence.
- **show**: the text Claude and the person are told it must be, e.g. "(empty)", the sentence, or the Lean text.

heldValue:
- for a theorem, axiom, opaque or Prop-valued declaration: type only (meaningKey);
- otherwise: its text without the docstring (whitespace collapsed), its kind and its meaningKey;
- `absent` when the declaration is missing.

**meaningKey** is a new facts field, `DeclFacts.meaningKey?: string`. Its probe is in §10.4 and sub-slice 3c.
- What the probe serialises:
  - `reprStr` of the elaborated type, plus the value for `defnInfo` only, plus each constructor's name and type for inductives, plus levelParams;
  - plus the same, sorted by name, for every non-probed model-library constant the existing value walk reaches (auxiliaries such as `match_1` count toward their parent).
- The runner turns that text into a sha256.
- So same text with a different elaborated term (an instance, `open` or attribute placed before it) gives a different key.
- Missing meaningKey on either side: compare `approx` and record the name as inexact. Steps proceed, but Apply is refused with `frozen`/`facts` (D2-25's fail-closed pattern).
- When base-facts.json lacks meaningKeys (a pre-slice-3 session), the next judge re-runs `checkBase` once and replaces the file. B never changes, so this is safe.

## 3. The store
### 3.1 Standing freezes: `.telelean/subjects/<S>/freezes.json` (core `freeze/store.ts`, `paths.ts freezesPath(S)`)
```ts
export interface FreezesFile { format: 'telelean-freezes'; version: 1; freezes: StandingRecord[] }
export type StandingRecord =
  | { card: string; fields: CardField[]; at: string }
  | { vocab: string; fields: VocabField[]; at: string }
  | { arrow: [string, string]; at: string }
  | { mark: string; at: string };
export function parseFreezesFile(text: string | null): { records: StandingRecord[]; problems: string[] };  // hand validator; unknown fields dropped; duplicates merged
export function serialiseFreezes(r: readonly StandingRecord[]): string;   // sorted, stable
```
- **Value.** A standing freeze stores no value: its value is "your files' value" (FZ-3), which is B during a session.
- **Keys.** Records are keyed by written card id: the freeze action writes a derived id first, through markup/edits.ts. They are also keyed by fully qualified vocabulary name (other subjects' items allowed), or by arrow ids.
- **Not in Claude's reach.** The file is not in ws/; the guard denies `.telelean`; G0 refuses paths outside the subject.
- **Board actions** (core actions.ts, additive):
  - `{kind:'freeze'|'unfreeze'; subject; addresses: FreezeAddress[]; allOthers?: {selection; alsoUnaccept?}; confirmed?}`;
  - planAction gives `{changes: [freezes.json, plus id write-backs], layoutOnly: idWrites.length===0}`, so a pure freeze change makes no History snapshot (FZ-9) and is one board Undo step (UN-2).
- **ES-9.** Board actions are already refused during a session.
- **History.** freezes.json is NOT added to `isSubjectSidecarFile`, so History restores never touch it. A record whose card, declaration or arrow is gone is listed under "Frozen items not found" (A6). `ModelWorkspace` gains `freezes(subject)` and reads the file on load, on change (a sidecar event) and after Apply or its Undo.
- **Survival.** It survives reloads and VS Code restarts (it is on disk).
- **Not gitignored.** Like layout.json, the model's own metadata is committed.

### 3.2 Session freezes: `PersistedSession.freezes?: SessionFreezes` (run.json v2, additive)
```ts
export interface SessionFreezes {
  format: 'telelean-session-freezes'; version: 1;
  standing: StandingRecord[];          // freezes.json at the session's start (FZ-8 restore point)
  standingCleared: string[];           // standing address keys the person unfroze in the session
  entries: FreezeEntry[];              // reasons 'yours' (and slice 4's 'transform' / 'session-start')
  allowances: Allowance[];             // FZ-5 Allow this change
  requests: UnfreezeRequestRecord[];   // FZ-5
  deferredReview: Array<{ items: string[]; action: number; at: string }>;   // unfreezes of accepted content during a queue
  start: { wholeModel: boolean; mayAddCards: boolean; openStatements: string[]; openProofs: string[]; openDependencies: string[] };  // banner, EN-2 summary
}
export interface FreezeEntry { address: FreezeAddress; reasons: FreezeReason[]; value: StoredValue | { from: 'base' } | { from: 'pending' }; duringStep?: string; revalue?: true }
export interface StoredValue { from: 'state'; commit: string; value: AddressValue; held: Record<string, HeldValue> }
export type FreezeReason =
  | { kind: 'standing' } | { kind: 'accepted'; item: string; at: string }
  | { kind: 'yours'; at: string; action: number }
  | { kind: 'session-start'; at: string } | { kind: 'transform'; at: string; action: number };   // slice-4 hooks
export interface Allowance { name: string; request: string; at: string; holders: string[]; closed?: { at: string; how: 'accepted'|'declined' } }
```
- **Start.** The session's first run.json write snapshots freezes.json into `standing`.
- **Old sessions.** A slice-2 session without `freezes` is upgraded in `recover()`: freezes.json then becomes its snapshot. It cannot have changed, since nothing wrote it before slice 3.
- **freezes.json during a session.** Nothing writes it until the end. A hand edit is ignored by the session and merged by address at the end (§8).
- **Accepted reasons** are not stored as entries. A new additive field `ItemRecord.frozen?: { fingerprint: string; meaning: Record<string,string>; partners?: Record<string,string>; at: string }` holds them. It records:
  - the content key and the owned declarations' meaningKeys at Accept;
  - for an item in a cycle of items (an SCC), the content keys of the cycle's other members (`partners`).
  - Setting and clearing: the reducer sets it on Accept. It is cleared ONLY by the person's later status change of that item (decline, back to review, un-accept by Unfreeze), or at the session's end.
  - reconcile never clears it (D2-23 badge growth, RV-11, the defensive RV-5 rule). Such an item is "in review · frozen (you accepted it)". That is FZ-6 and the user's FROZEN 3: telelean never unfreezes.
  - The premise write's step 4, which re-keys the written item, also sets `frozen.fingerprint`.

### 3.3 What each event does to freezes
| Event | Effect |
|---|---|
| Reload / VS Code restart | Both stores are persisted. A pending request comes back like a pending question. |
| Board Undo/Redo (outside sessions) | Standing freeze steps are ordinary UndoEntries (freezes.json before/after). Apply's step includes freezes.json (§8). |
| History restore | freezes.json is not touched; orphans are listed (A6). |
| Session Undo | Freeze actions are session-stack steps (UN-4). |

## 4. Reasons and the effective table (core `freeze/table.ts`)
```ts
export interface FreezeTableEntry { address: FreezeAddress; reasons: FreezeReason[];
  expect: { from: 'base' } | StoredValue | { from: 'pending' } | { from: 'item'; item: string } }
export interface FreezeTable { entries: ReadonlyMap<string, FreezeTableEntry>; notFound: FreezeAddress[]; allowed: ReadonlySet<string> }
export function effectiveFreezes(i: { standing: readonly StandingRecord[]; session?: SessionFreezes; items: readonly ItemRecord[];
  drafts: readonly ItemDraft[]; base: ProjectModel; current: ProjectModel }): FreezeTable;
```
How the table is built:
- **Standing**: the snapshot minus `standingCleared`, expected value from B. ES-7: B never changes, and freezes.json is not written during a session.
- **Accepted**: items with `frozen` set give `addressesOfItem`.
  - An address the item's content owns (its draft's provides and fields) is checked as `item`: its content key equals `frozen.fingerprint`, and its owned declarations' meaningKeys equal `frozen.meaning`.
  - Its other addresses (e.g. a Formalize item's sentence) are checked against B.
- **Yours**: the stored value, computed from the state the person sees: the judged commit, unmasked.
  - While a judge or write is pending, the value is `pending` and is computed by the next `judge-apply`.
  - Pending entries and entries marked `revalue` are not checked until then.
- **Merging.** Several reasons on one address merge into one entry. FZ-7's reasons all agree on the value: once frozen, nothing but the person changes it.
- **Outside a session** the table is standing-only and serves the board's marks.

**AUTOPILOT DECISION D3-1** (simplicity, user's REVIEW 5 and D3):
- A Formalize-started session creates no binding "session-start" FZ-7 reasons. ES-2's preset is enforced per step by slice 2's step limits.
- The session's first preset is recorded in `SessionFreezes.start`, which only feeds FZ-11's banner and EN-2's one-line summary.
- So a mid-stage Formalize runs "at once" on its own targets without first unfreezing the first preset, and Unfreeze applies only to real reasons (standing, accepted, yours).
- `'session-start'` stays in the type for slice 4's "Transform cards…" start (INITIATING 2), where it is a real reason.
- Alternative: make the first preset a real reason, stored as a predicate over B plus a cleared list. Every later Formalize would then need "Unfreeze these and formalize" for its target's proof and fuzzy statements.

## 5. The check (core `freeze/check.ts`; called by `judgeState` for every purpose, and by `applyBackstop`)
```ts
export interface FrozenCheck { findings: GateFinding[]; held: Record<string, string[]>; inexact: string[] }
export function frozenFindings(i: { base: ProjectModel; current: ProjectModel; table: FreezeTable; drafts: readonly ItemDraft[];
  items: readonly ItemRecord[]; since?: string /* FZ-10: Claude's previous tool result */ }): FrozenCheck;
```
1. **Accepted items.** For each item with `frozen`: its draft on `current` (by key) must exist with `contentKey === frozen.fingerprint`, and with every name of `frozen.meaning` keeping its meaningKey; its `partners` keep their keys. Otherwise: finding `frozen` (token `accepted`).
2. **Every other entry.** `addressValue(current,a)` is compared with B's value or the stored value: exact keys when both sides are exact, else `approx`, and the name is recorded inexact. The tokens by case:
   - `field`;
   - `keep-empty` (expected empty);
   - `meaning` (texts equal, key differs);
   - `arrow`, `dependencies`, `mark`;
   - `deleted` (the card of a frozen field is gone);
   - `moved` (computeItems reports a frozen declaration or block moved).
3. **Held (FZ-4).**
   - Roots:
     - H_B = `reach(base, decls of base-expected entries,'meaning')`;
     - H_X = `reach(current, provides.decls of accepted items,'meaning')`;
     - plus the keys of stored held maps.
   - Taken out: the roots themselves, names covered by any entry, names owned by an item with `frozen` (checked in step 1), and open allowances.
   - Expected value: the stored held value (if two stored maps disagree: finding `held`/`conflict`, fail closed), else B's heldValue when the name exists in B.
   - A name in H_X that is new and owned by a non-accepted item that is not an SCC partner gives `held`/`new`. RV-5 should make that impossible; this is the defensive check.
   - `held` findings name their holders, and the holder chain feeds the view's "held by ‹card›" marks.
   - FZ-4's exceptions are automatic: a target's proof (a `.holds` holds only its type), empty statements (no declaration) and Dependencies additions (not Lean) are never in a held closure.
   - Slice-5 hook: `heldFields(model, entries)` returns `[]` here; # references join H later.
4. **FZ-10 freshness.** A finding is `fresh` (new additive `GateFinding.fresh?: true`) when every reason of its address, or of each of its holders, has `at > since`.

**GateFindingCode** gains `'frozen' | 'held' | 'intermediate'` (step G3), with board sentences in `describeFinding`. Messages for Claude:
- frozen: "“‹sentence›” (‹id›): its ‹field› is frozen (‹reasons›). Leave it exactly as it was: ‹show›. To change it, ask the person first with request_unfreeze."
- keep-empty: "…its ‹field› is frozen empty: leave it empty (remove what you wrote)…"
- meaning: "‹name› is frozen: its text is unchanged, but what it means in Lean changed (something placed before it, or something it uses, elaborates differently): restore what it meant."
- arrow: "The arrow “‹s›” → “‹t›” is frozen: put it back."
- dependencies: "“‹t›”'s Dependencies are frozen: add no arrow into it and remove none."
- deleted: "“‹c›” has frozen fields, so it cannot be deleted: restore it."
- accepted: "The person accepted “‹label›”: it is frozen as accepted; restore it exactly."
- held: "‹name› is held by frozen ‹cards›: frozen Lean relies on it, so its text and meaning may not change. Restore it, or ask with request_unfreeze (the person can allow this change)."
- fresh findings add: "(The person froze this while you were working; this failure is not counted.)"

**judgeState integration** (`JudgeInput.freezes?: { standing; session?; since? }`; the table is built after computeItems):
- Findings join `global`, so they are refusals in every step purpose.
- At `stage` they become `StateJudgement.problems` code `frozen`: Apply is disabled and the problem never names a hidden item. That is fail closed only; it cannot arise when the rules below hold.
- At `final`, `inexact` is not empty means refused.
- `existing-changed` (step limits) drops its finding for a name that has a `frozen`/`held` finding (one message).

Composition: what a step may change is (scope exceptions, slice 2) ∩ (not FZ-frozen) ∩ (not held unless allowed). Any FZ reason wins over fuzzy and open, ES-2's "standing wins" generalised (FZ-1).

## 6. Freezing and unfreezing (core `freeze/reducer.ts`, pure)
```ts
export type FreezeAction =
  | { kind: 'freeze'; addresses: FreezeAddress[]; version?: 'proposal'|'yours' }
  | { kind: 'unfreeze'; addresses: FreezeAddress[] }
  | { kind: 'freeze-all-others'; selection: SelectionItem[] }
  | { kind: 'unfreeze-all-others'; selection: SelectionItem[]; alsoUnaccept: boolean }
  | { kind: 'allow'; request: string; name: string }
  | { kind: 'revalue'; addresses: FreezeAddress[] };            // slice-4 hook (TR-15)
export interface FreezeState { phase: SessionPhase; session: SessionFreezes; review: ReviewState; judgement: StateJudgement;
  base: ProjectModel; current: ProjectModel; judgedCommit: string; resultsShown: boolean; judging: boolean;
  queue?: Array<{ step: string; state: StepState; scope: StepScope }>; running?: string; subject: string }
export type FreezeOutcome =
  | { ok: true; session: SessionFreezes; review?: ReviewOutcome; action: SessionAction; events: Array<{text: string; items: string[]}>;
      cancelFrom?: string; notices: string[] }
  | { ok: false; code: 'needs-confirmation'; confirm: FreezeConfirmation }
  | { ok: false; code: 'refused'|'conflict'; error: string };
export interface FreezeConfirmation { standing?: number;
  unaccept?: { items: string[]; cascade: CascadeEntry[]; deferred: boolean };
  version?: { items: string[]; yoursDisabled?: string };
  claudeWorking?: { text: string; cancels?: { from: string; steps: string[] } };
  hiddenProposal?: string[] }
export function reduceFreeze(s: FreezeState, a: FreezeAction, confirmed: boolean, at: string): FreezeOutcome;
// SessionAction gains: { kind: 'freeze'; label; request: FreezeAction; before: FreezeDelta; after: FreezeDelta;
//   items: Array<{ item: string; before: ItemState; after: ItemState }>; unfrozenValues: Record<string, string>; at }
```
- **Unfreeze** removes every reason (FZ-7):
  - standing: the address goes into `standingCleared`;
  - yours: the entry is removed;
  - accepted: each accepted item covering the address goes back to review through `reduceReview(decide in-review)` with RV-5's confirmation of accepted dependents.
- **During a queue** (phases step and interrupted), the item records must not change (D2-63), so the return to review goes into `deferredReview` and is applied, confirmed, before reconcile at the queue's end. The freeze table changes at once.
- **Unfreeze all other cards** asks first with the number of standing freezes it removes, and leaves accepted reasons unless `alsoUnaccept`.
  - "Other cards" are the subject's cards and vocabulary that contain none of the selected items; an arrow or mark counts in both of its end cards.
  - Freeze all other cards freezes all their fields, Dependencies included.
- **Freeze** stores the value from `judgedCommit` (unmasked), or `pending` while judging.
  - FZ-10's version choice for an address an item in review owns:
    - `proposal`: the stored value; the item stays in review.
    - `yours`: Reject the item, then expect B. It is disabled while a step runs, with "You can reject it when Claude's step ends."
  - A hidden target's Proof or Dependencies while the results are hidden: the dialog says "The results are not shown yet: this freezes whatever Claude proposed for “T”, unseen; to keep your own version instead, show the results first." The value is the unmasked one. The text is the same in both outcomes (AUTOPILOT DECISION D3-7).
  - Accepted reasons of Results and Results' parts are withheld from the view while the results are hidden (D2-64).
- **FZ-10 while a queue runs.** The value is J, the queue-start view.
  - `queueScope(step)` gives the addresses a step may change:
    - the target's proof and Dependencies;
    - its fuzzy statements;
    - its openItems' addresses (via `addressesOfItem`);
    - its intermediates;
    - `wholeModel` means everything.
  - If an ENDED step of the running queue has the address in its scope, the freeze asks "Claude's step for “‹T›”, which may have changed this, is done; freezing now discards this queue's work from that step on (Retry step later)", and returns `cancelFrom`.
    - The rule depends on scope only, so the dialog never reveals what Claude did (RV-6).
  - Else, if the running step's scope contains it: "Claude is working on this: freezing it keeps your version now", with notices for Claude.
  - Queued steps need nothing: their checks read the store when they run.
  - Every freeze or unfreeze made during a step adds a notice for Claude's next tool result.
- **Decisions that change own-frozen content** are a hook in `reduceReview`:
  - Trigger: a decide whose write (revert or reapply set, through ownership in the judgement's drafts) touches a `yours` entry.
  - It answers `needs-confirmation { frozen: [...] }`; the dialog reads "This is frozen (you froze Claude's proposal): keep it frozen at the restored version, or unfreeze it" (FZ-10).
  - New field `ReviewAction.decide.frozenChoice?: 'keep'|'unfreeze'`. `keep` marks the entries `revalue`, and the next judge-apply recomputes their value from its state.
  - An item's own accepted reason simply ends with the person's status change (FZ-7).
- **Undo/Redo** (D2-73 rules):
  - Undo of an unfreeze is refused when the address's current value differs from `unfrozenValues` ("‹x› changed since you unfroze it: freeze it again to freeze its new version").
  - Undo of a freeze is always possible in a stage.
  - Redo resends the request through `reduceFreeze`.
  - Undo is unavailable while a step runs (D2-62); seals stop Undo (UN-5).

## 7. Unfreeze requests (FZ-5)
**Tool** `request_unfreeze`:
```
{ items: Array<{card,field}|{name}|{arrow:{source,target}}|{mark}> (1-20); change: string; why: string }
```
- Validated at once by core `unfreezeRequestProblems({table, scope, current, items})`. Refusals:
  - "‹x› is not frozen: you may change it (within your step's limits)";
  - "‹x› is fixed by this step's question, not frozen: unfreezing would not let you change it in this step; finish and say what you need (the person can open the whole model)";
  - CF-3 data is never requestable.
- Then the step pauses exactly like ask_user: `run.p.pendingUnfreeze = {id,args,askedAt}`, state `waiting-for-answer`, the agent clock paused, the same abort listener. Only one question or request is open at a time.
- `SessionView.request?: UnfreezeRequestView` lists each item with its state (frozen with reasons / held by ‹cards› / no longer frozen).
- The answer, through `answerUnfreeze {runId, request, answer: 'continue'|'keep-frozen'}`:
  - **Continue**: the tool returns `{answer:'continue', unfrozen, stillFrozen, allowed, note}`, computed from the table at that moment, never from Claude's text. Keep frozen is disabled once any requested item was unfrozen, so the answer is always true.
  - **Keep frozen**: `{answer:'keep-frozen', unfrozen: [], stillFrozen: all}`.
- **Withdrawn** (the CLI went away): delivered as the next user turn on resume, like answers today.
- A request still open when its step ends (cancel, cap, failure) is listed in the stage report.
- `UnfreezeRequestRecord = {id, step, items, change, why, askedAt, answer?, unfrozen?, allowed?, answeredAt?}` is kept in `SessionFreezes.requests`.
- **Allow this change** (`allowChange {runId, request, name}`):
  - Only for a held name whose expected held value is B's (AUTOPILOT DECISION D3-11), and only in a whole-model step. In a narrow step the preset fixes B content anyway, so a held item is never changeable there.
  - Creates an `Allowance`: the name is exempt from the held check.
  - computeItems then makes one item per frozen holder card H whose held closure in B contains X: `meaning:<X>><H>`, kind `meaning-changed` (new ItemKind).
    - Its content: X's current heldValue, the holder, and the keys of everything reached from X's current version that is not otherwise frozen. So any later change to X, or below X, makes it "updated".
  - The rules:
    - Class: always own-Accept; b5 (belief) when H is an axiom card, otherwise new reason c5 (changes what is proved).
    - RV-5 edge X → each MC item: X can be accepted only after all of them.
    - Declining an MC item Rejects X (DO-1) and closes the allowance; the reducer does it in the same action.
    - Accepting X sets X's `frozen` and closes the allowance, so X is then checked as frozen at its accepted value.
- **Add premise for a target whose Dependencies or mark are frozen**: the draft is allowed, but its Accept is gated with "“‹T›”'s Dependencies are frozen: unfreeze them to accept this premise." [Unfreeze them]. No automatic request, which also avoids a mid-step signal (AUTOPILOT DECISION D3-12).

## 8. RV-4, FZ-7 and FZ-8 at the end
- **Accept** sets `ItemRecord.frozen`, so the item's addresses become frozen (RV-4).
- **A status change by the person** (or Unfreeze) clears it. Since `frozen` lasts until then, an Unfreeze of a covering field returns the item to "in review", and RV-5's accepted dependents follow with confirmation.
- **The end confirmation** (`EndConfirmationView.freezes`, built from the store):
```ts
freezes: { rows: Array<{ id: string; address: FreezeAddressView; change: 'freeze'|'unfreeze'; reasons: string[]; keep: boolean; available: boolean; why?: string }>;
           startSummary: string /* "Formalize's limits end with the session" / "the other N cards return to how they were" */ }
```
- **Rows**:
  - every address frozen at the end with an accepted, yours or transform reason that freezes.json does not hold, offered as "keep frozen";
  - every `standingCleared` address, offered as "keep unfrozen".
  - Keep defaults off (FROZEN 3).
  - Exit: `available` only when the frozen value equals B's (EN-2: content in your files).
- `endSession` gains `keep: string[]`. Keep ticks never change the final check's id.
- **Apply**: `planApply` adds one FileChange for freezes.json: the current disk content, merged by address with the ticked changes. A written id is added to F for kept cards whose id is still derived.
  - `ModelWorkspace.applyChanges` accepts freezes.json as a third sidecar, so Apply's one Undo step also restores freezes.json.
- **Exit**: when anything is ticked, one board step (`perform` with a freeze-only plan) writes freezes.json, plus id writes into the person's files when needed.
- **Failure or crash end**: nothing is written, so the standing state is the start snapshot (FZ-8).
- **Freezing during the confirmation** (FZ-9): a freeze is valued on F and adds a row. An Unfreeze that un-accepts first goes back to review: the session needs every item decided.

## 9. Start checks, turns, FZ-12
- **`frozenNeeds(table, inferences, options)`** (core `freeze/needs.ts`, used by the host and runner beside `formalizeStartProblems`): lists FZ-frozen addresses inside the request's exceptions:
  - target proofs ("Claude cannot prove “T”: its proof is frozen (standing)");
  - fuzzy statements frozen empty;
  - target Dependencies or marks frozen.
  - The dialog offers [Unfreeze these and formalize], [Formalize anyway] and [Cancel].
  - At a start, the unfreeze is a board step before the session (so the snapshot excludes it). Mid-stage, it is a session freeze action before the queue's seal.
  - `formalize` gains `unfreezeFirst?: FreezeAddress[]` and `options?: {wholeModel?: boolean; mayAddCards?: boolean}`.
- **Turns.** Each step turn gains a "FROZEN BY THE PERSON" section:
  - the frozen addresses inside the step's scope, with values; with the whole model open, all of them, capped at 100 lines with "and N more";
  - a "HELD" list with holders.
  - The system prompt gains: "telelean refuses any state that changes what the person froze, or what frozen Lean means (held). To change one, call request_unfreeze and wait; never assume an answer."
- **FZ-12**: every user-facing "statements frozen" becomes "statements fixed", including manager.ts:2042's activity text, the step chips and its own icon.
  - The MCP tool keeps its name `freeze_statements` (FakeBackend fixtures), but its description and the prompt say "fix the statements; unrelated to what the person froze" (AUTOPILOT DECISION D3-14).

## 10. Slice-2 deferrals: opening the whole model safely
### 10.1 Switches and scope
- `SessionInference.options?: {wholeModel: boolean; mayAddCards: boolean}`, copied into `StepScope.wholeModel?`/`mayAddCards?`; Submit steps inherit them. The switches reset after each session (UI).
- **With `wholeModel` on, the step limits fix only:**
  - every `.holds` that is not this step's target's, together with the proof material of other inferences;
  - CF-3 block data (G5);
  - the selected arrows (B.3);
  - B.4.
  Everything else is left to the frozen and held check (§5).
- **G5 in whole-model steps** allows `natural_name`, `rationale`, `stance` and `source` on existing unfrozen cards, and statement text (never the binding). Normalise writes `worded_by: agent` when a sentence changed (CF-6).
### 10.2 New tools and ledger entries (Claude asks; telelean writes at the next normalise, as with propose_arrow, D2-1)
```ts
| { kind: 'unarrow'; source: string; target: string; step: string; why: string; written?: string }
| { kind: 'delete'; card: string; step: string; why: string; written?: string }
| { kind: 'card'; card: string; target: string; step: string; sentence: string; written?: string }   // add_card: id written by telelean
| { kind: 'proof-broken'; card: string; step: string; error: string; written?: string }
```
Each tool has a core validator (`freeze/tools.ts`), whose refusal is the tool result's text:
- `remove_arrow{source,target,why}` (`removeArrowProblems`):
  - only with the whole model open;
  - only an existing arrow into a proposition;
  - not selected by any inference's question;
  - neither the arrow nor the target's Dependencies frozen;
  - source ∉ direct(target) in the working copy (B.3: no proof uses it).
- `delete_card{card,why}` (`deleteCardProblems`):
  - only with the whole model open, except for this step's own intermediate card;
  - not a card with any frozen field, frozen incoming Dependencies or frozen arrow out of it (FZ-1);
  - not a session target, nor at either end of a selected arrow.
  - telelean removes the block, its bound declarations, its outgoing arrows and its mark.
- `add_card{sentence,lean_name?,why}` (`addCardProblems`):
  - only with mayAddCards;
  - the card is a PROPOSITION, worded and originated by the agent, with `session:` and a written id;
  - at most 10 per step.
- `mark_proof_broken{card}` (`proofBrokenProblems`):
  - only with the whole model open;
  - only a proposition that is not this step's target, whose B theorem `.holds` is unchanged and has a Lean error in the last check;
  - telelean takes that `.holds` out.
- `propose_arrow` is extended:
  - refused into frozen Dependencies ("ask with request_unfreeze") and for a frozen arrow;
  - with the whole model open, it may target any unfrozen proposition;
  - the step's intermediates may be sources into their parent target and targets themselves, an exception to D2-50's `other-target` (and to `other-result` for E(T) intermediates).
### 10.3 Items (computeItems, classify, deps, reducer, revert)
- **Ownership:**
  - card field changes → `card:<c>` Change (the field entries in the content key);
  - a ledger `delete` → `card:<c>` Delete (block, declarations, arrows, mark);
  - a ledger `unarrow` → `unarrow:<s>><t>`;
  - a ledger `card` → `card:<I>` Add, plus `proof:<I>` Result (I is an inference with an empty question; intermediate inferences are derived from the ledger, so the records do not change mid-queue);
  - a ledger `proof-broken` → `proof:<c>` proof-broken;
  - a removed existing vocabulary declaration → `decl:<n>` vocabulary-change, with absent content;
  - an open allowance with X changed → MC items.
  - Anything else stays unowned.
- **Classes:**
  - Delete: c1;
  - Proof broken: c1;
  - MC: b5 or c5;
  - Remove arrow: no RV-7 class;
  - Add of an intermediate: a statement item;
  - arrows into an intermediate: c4.
- **Dependencies (RV-5):**
  - an arrow item → the Add item of a card at either end;
  - A17 cycle edges;
  - a breaking change D → PB(c) for each proof it breaks (c's B proof mentions a name D changes or removes), so D waits for PB(c), and Reject PB(c) cascades to D;
  - X → MC.
- **Proof broken:**
  - Accept means the card loses its proof (unproved; own Accept, c1). §5.6's disabled Accept goes.
  - Reject restores the proof: its write reverts PB together with its dependents (the breaking change).
  - Re-prove: a mid-stage Formalize's Result takes the same `proof:<c>` key.
  - "Make it pending" is deferred (D3-8).
- **Intermediates:** at every finish, each intermediate added in the step must be proved (its inference passes, verdict proved or established) or deleted, else `intermediate` (`not-proved`).
- **planItemRevert:**
  - Delete: puts B's block, declarations, arrows and mark back;
  - Remove arrow: puts the entry back;
  - Add: removes the card, its declarations and its arrows;
  - Proof broken: B's `.holds`;
  - MC: nothing (its revert is X's).
### 10.4 Probe, mask, backstop
- **Probe (3c).** The `#eval` gains a `meaningOf(ci)` built with `reprStr`, printed one JSON line per declaration as `{"telelean-meaning-of":"<name>","text":"…"}`. The runner computes sha256 and drops the text; a text over 2 MB gives no key (fail closed).
  - Cost is measured the way 2b3 measures typeConsts, on Spyro under capped.sh; above 1.5× of 2b3's cost, the integrator decides.
- **Base mask.** The third bullet of §4.7 needs no change. With the whole model open, a same-text declaration's meaning can differ only through statement-phase items, which are visible: `other-result` keeps proof material out of statements. Proof broken items are statement-level and visible; a PB card's `.holds` is absent in W, so the mask shows W.
- **Backstop.** `applyBackstop` gains:
  - `frozen` (frozenFindings on F, never reused; `inexact` refuses);
  - `allowance` (an allowed X that changed in F needs X and all its MC items accepted);
  - ownership of the new kinds through the ledger;
  - `kind` (intermediates are PROPOSITIONs; no arrow into an AXIOM).
  - `BackstopRefusal.code` gains `'frozen' | 'held' | 'allowance' | 'intermediate'`.

## 11. Runner flows
- **`RunManager`** gains:
  - `freeze(runId, action, confirmed, choices?)`;
  - `answerUnfreeze(runId, request, answer)`;
  - `allowChange(runId, request, name)`.
- **Host routing.** Run messages `freeze`, `answerUnfreeze` and `allowChange` are in RUN_MESSAGE_TYPES, so ES-9 never refuses them; board actions `freeze`/`unfreeze` are used outside sessions.
- **The write.** In a stage, `freeze` is a records-only write through the write queue, as Accept is. During a step, it changes `session.freezes` in memory and is saved by `writeStateChecked`; ws/ and the item records are untouched (D2-51, D2-63).
- **Notices** go to `run.p.freezeNotices` and are drained by `makeToolHost`'s wrap() into every tool result as `personFroze?: string[]`.
- **Attempt counting.** `toolFinish` does not count an attempt when every finding is `fresh` (since = `run.p.lastToolResultAt`). So the first failure after a mid-step freeze is free; later ones count.
- **Step end.** After a passing gate, frozenFindings is run again with the latest store on the gate's model. Any finding makes it gave-up. A rollback goes to S₀ whenever any reason was added during the step (`duringStep`); S₀ equals J on such an address by the cancelFrom rule.
- **`cancelQueueFrom(step)`** generalises Cancel step:
  - revert to that step's S₀;
  - drop the ledger entries, created entries and premise drafts of steps from it on;
  - mark them cancelled or not-run, put them in `retry`, and end the queue.
  Nothing was decided during the queue, so nothing else is undone.
- **Queue end.** Apply `deferredReview`, then reconcile (with MC items and allowance closures).
- **Engine.** `judge`, `finalCheck`, `check` and `gate` pass `JudgeInput.freezes`. checkBase is re-run when B's facts lack meaningKey.

## 12. Hooks
- **Slice 4:**
  - reasons `session-start` and `transform`;
  - `reduceFreeze` `revalue` (TR-15: the person's own change to frozen content makes their version the value);
  - `SessionFreezes.start` has room for the transform banner;
  - D2-15 stays (no Shaky splits).
- **Slice 5:** `heldFields()` for # references (FZ-4, RF-5).
- **Views.** core `freeze/view.ts` builds:
  - `FreezeMarksView`: per card, its frozen fields with reasons; frozen arrows and marks; held names with holders; the banner text; notFound;
  - for the board (standing) and for `SessionView.freezes`.

## 13. Tests (no real Claude; FakeBackend scripts in `packages/runner/test/run/fixtures/sessions/frozen-*`; the same states built by hand in `core/test/freeze/cheats.test.ts`)
- **Cheats**, each refused with its token and counted unless fresh:
  1. Claude edits a frozen sentence or statement, with the whole model open.
  2. It fills a keep-empty statement at a selected arrow's end (the freeze beats fuzzy).
  3. It removes a frozen arrow, through the tool (refused at once) or by editing `premises:` (G5 and frozen); it removes a frozen mark.
  4. It proposes an arrow into frozen Dependencies (refused at once); a premise for a frozen-Dependencies target leaves its Accept gated.
  5. It changes a held definition (`def HasDarkPast := False`), refused. Then request_unfreeze → Allow → it passes, with MC items; X's Accept is gated by them; declining an MC Rejects X.
  6. It changes a held card's statement mentioned by a frozen statement.
  7. It inserts an instance, `@[instance]` or `open` before a frozen statement: same text, `meaning` (the `open` is also a stray command). Real Lean once, capped.
  8. It deletes a card that has a frozen field (tool refused; a raw block removal fails G5 and `deleted`).
  9. It edits frozen content and restores it before the check: passes.
  10. Freeze races:
      - (a) a freeze before the next check: that check fails fresh, not counted; the next tool result tells Claude; it restores and passes;
      - (b) a freeze during the gate's Lean job: the gate passes, then the step-end recheck makes it gave-up and rolls back to S₀;
      - (c) a freeze on an ended step's scope: cancelFrom, Retry.
  11. It changes accepted content in a later whole-model step or re-ask (`accepted`).
  12. A whole-model change breaks a non-target proof: `build`, then mark_proof_broken gives a PB item; Reject PB cascades to the breaking change.
  13. remove_arrow on a used arrow or a selected arrow is refused.
  14. add_card without the switch is refused; an unproved intermediate at finish gives `intermediate`.
  15. It writes `.telelean/...` (guard, G0).
- **Unit tests:**
  - addressValue per kind; heldValue; approx versus exact;
  - freezes.json parse and serialise; effectiveFreezes merging;
  - reduceFreeze: every action; a sequence followed by Undo of all gives the store back; the D2-73 refusals;
  - the deferred review; frozenNeeds; queueScope;
  - the reducer hooks: accepted `frozen` survives reconcile's returns; Reject of own-frozen content asks keep or unfreeze;
  - the backstop on tampered records (accepted content changed in F, a standing address changed in F, an allowance without its MC items accepted).
- **Twins** (§4.7 non-interference): add freeze actions to the paired working copies. Freezing a hidden target's proof, Freeze or Unfreeze all others, and a freeze during a queue give byte-identical SessionView JSON in both outcomes.
- **Runner:** persistence round trip; reload during a pending request; Apply and Exit with and without keep; Undo of Apply restores freezes.json; a History restore leaves it alone; a failure end writes nothing.
- **sub_slices:**
  - [1]
    - **id:** 3a1
    - **scope:** Freeze contracts and values (core, pure). Implemented here: the core freeze/ module's types, address keys, addressesOfItem (RV-4 map), addressValue and heldValue (exact/approx), freezes.json parse/serialise, freezesPath, effectiveFreezes, FREEZE_TEXTS. Contracts only (additive): DeclFacts.meaningKey; ItemKind 'meaning-changed'; ItemRecord.frozen; the LedgerEntry kinds unarrow/delete/card/proof-broken; StepScope wholeModel/mayAddCards; SessionInference.options; JudgeInput.freezes; PersistedSession/SessionRecords.freezes; GateFindingCode frozen/held/intermediate plus GateFinding.fresh; BoardAction freeze/unfreeze; BackstopRefusal codes. The functions of later sub-slices are stubbed in freeze/index.ts and exported from core/src/index.ts, so no later sub-slice edits an index.
    - **files:**
      - packages/core/src/freeze/types.ts
      - packages/core/src/freeze/address.ts
      - packages/core/src/freeze/value.ts
      - packages/core/src/freeze/store.ts
      - packages/core/src/freeze/table.ts
      - packages/core/src/freeze/texts.ts
      - packages/core/src/freeze/index.ts
      - packages/core/src/facts.ts
      - packages/core/src/paths.ts
      - packages/core/src/actions.ts
      - packages/core/src/review/types.ts
      - packages/core/src/gate/types.ts
      - packages/core/src/index.ts
      - packages/core/test/freeze/address.test.ts
      - packages/core/test/freeze/value.test.ts
      - packages/core/test/freeze/store.test.ts
      - packages/core/test/freeze/table.test.ts
    - **tests:** addressValue for every address kind: keep-empty (absent binding), statement text versus a meaning-only change (meaningKey differs, texts equal), the approx fallback when one side lacks meaningKey, arrow/mark/card presence. heldValue: type-only for theorems and .holds. RV-4 map per item kind. freezes.json: invalid records listed, unknown fields dropped, duplicates merged, stable sorted output, a missing file means no freezes. effectiveFreezes: merging standing, accepted and yours; standing minus cleared; accepted fields split into item-checked and B-checked; A6 notFound. fakeFacts gains meaningKey and noMeaningKey overrides. Core suite green; no existing test changes.
    - **risk:** Low. Additive contract churn on review/types.ts while slice 2's later sub-slices may still be landing: run strictly after 2h, as one core builder.
  - [2]
    - **id:** 3a2
    - **scope:** Freeze and unfreeze actions and their hooks into the review reducer (core, pure). reduceFreeze covers freeze, unfreeze, all-others, the version choice (proposal or yours = Reject), the hidden-proposal dialog, allow, and revalue as a slice-4 hook. It returns confirmations: the standing count, un-accept with its RV-5 cascade, deferred un-accept during a queue, and the FZ-10 claudeWorking/cancelFrom rule via queueScope. SessionAction 'freeze' with Undo and Redo checks (unfrozenValues). Hooks in reduceReview: Accept sets ItemRecord.frozen and the person's status changes clear it; reconcile never clears it; a decide that touches own-frozen content needs confirmation (frozenChoice keep or unfreeze); declining an MC item Rejects X and closes the allowance. frozenNeeds for Formalize starts. planAction plans the board freeze/unfreeze (freezes.json plus id write-back, no snapshot unless ids are written).
    - **files:**
      - packages/core/src/freeze/reducer.ts
      - packages/core/src/freeze/scope.ts
      - packages/core/src/freeze/needs.ts
      - packages/core/src/review/reducer.ts
      - packages/core/src/review/reconcile.ts
      - packages/core/src/edit/planAction.ts
      - packages/core/test/freeze/reducer.test.ts
      - packages/core/test/freeze/needs.test.ts
      - packages/core/test/edit/freeze.test.ts
    - **tests:** Property tests: any sequence of freeze actions followed by Undo of each gives the store and records back (F4-style); no reconcile output clears ItemRecord.frozen; Undo of an unfreeze is refused after the value changed. FZ-10: each scope case (ended step gives cancelFrom, running step gives notices only, queued steps nothing), outcome-independent texts. Unfreeze of accepted content in a stage (immediate, cascade listed) versus during a step (deferred). Unfreeze all others: the standing count and alsoUnaccept. Freeze all others: selection containment, arrows counted in both end cards. Reject of own-frozen content: keep (revalue) or unfreeze. frozenNeeds lists frozen target proofs, keep-empty fuzzy statements and frozen Dependencies. planAction writes freezes.json and a derived id.
    - **risk:** Medium: interplay with slice 2's reducer and cascades. The builder must read 2a2's reducer as built and record any contract change in the plan's change log.
  - [3]
    - **id:** 3b1
    - **scope:** The frozen and held check (core). frozenFindings: accepted items by content key, frozen.meaning and SCC partners; addresses against B or stored values; the held closure via reach() on B and on X plus stored maps, minus allowances; fresh tagging; inexact names. judgeState integration for every purpose: global findings, StateJudgement.problems 'frozen' at stage (fail closed, never naming a hidden item), inexact refused at final, existing-changed dedup. applyBackstop gains frozen/held/allowance. describeFinding sentences and the messages for Claude.
    - **files:**
      - packages/core/src/freeze/check.ts
      - packages/core/src/review/judge.ts
      - packages/core/src/review/backstop.ts
      - packages/core/src/gate/describe.ts
      - packages/core/src/freeze/texts.ts
      - packages/core/test/freeze/check.test.ts
      - packages/core/test/freeze/cheats.test.ts
      - packages/core/test/review/backstopFrozen.test.ts
    - **tests:** Hand-built states for every cheat of plan §13 (1-9, 11): each gives the expected token and message. A held change through another card's statement and through a definition. An instance before a frozen statement (meaningKey differs, printed type equal). Restored-before-check passes. FZ-4 exceptions: a target proof, a fuzzy fill and Dependencies additions are never held. Fresh tagging by reason time. Stored held maps that disagree fail closed. Backstop: tampered records refused (accepted content changed in F, a standing address changed, an allowance without its MC items accepted, inexact facts).
    - **risk:** Medium. Performance of reach over B (memoised per model; B is fixed per session). Correctness of the expected-value rules for accepted content: the RV-5 argument, with SCC partners as the edge case.
  - [4]
    - **id:** 3b2a
    - **scope:** The deferred item kinds in the item model (core): computeItems ownership for card field Changes, Delete (ledger delete), Remove arrow (ledger unarrow), Add of intermediate cards (ledger card, with their Result and derived inferences), Proof broken (ledger proof-broken), removed vocabulary declarations, and meaning-changed items from open allowances. classify: Delete and PB c1, MC b5/c5, intermediates. deps: arrow → Add of its end card, A17, breaking change → PB, X → MC. planItemRevert for each new kind. Reducer rules: PB Accept and Reject semantics.
    - **files:**
      - packages/core/src/review/items.ts
      - packages/core/src/review/classify.ts
      - packages/core/src/review/deps.ts
      - packages/core/src/review/revert.ts
      - packages/core/src/review/reducer.ts
      - packages/core/src/review/view.ts
      - packages/core/test/review/itemsSlice3.test.ts
      - packages/core/test/review/revertSlice3.test.ts
    - **tests:** Ownership is total and deterministic for each new kind; keys and content keys are stable across working copies. Revert then re-apply gives the same text for Delete, Remove arrow, Add and PB. Classes per kind. Dependency edges, including Reject PB cascading to the breaking change and declining an MC Rejecting X. ItemDetailView data for delete, remove-arrow, proof-broken and meaning-changed. Twins: PB and MC items never depend on hidden outcomes.
    - **risk:** Medium-high: items.ts is large (1,054 lines) and subtle. Fallback split: (i) ownership and keys, (ii) classes, deps, revert and reducer.
  - [5]
    - **id:** 3b2b
    - **scope:** The rules for the whole model open and for added cards (core): StepScope wholeModel step limits (only non-target .holds and other inferences' proof material, CF-3 data, selected arrows and B.4 stay fixed); G5 allowing card field and statement-text changes in whole-model steps (worded_by by normalise); B.3 for unarrow, delete and card entries; B.4 exemption for proof-broken ledger take-outs; the intermediate rule at every finish; D2-50 exceptions for intermediates. Tool validators: removeArrowProblems, deleteCardProblems, addCardProblems, proofBrokenProblems, unfreezeRequestProblems; proposeArrowProblems extended. Normalise's ledger writes for the new entries.
    - **files:**
      - packages/core/src/freeze/tools.ts
      - packages/core/src/review/judge.ts
      - packages/core/src/review/formalize.ts
      - packages/core/src/gate/rules.ts
      - packages/core/src/gate/normalise.ts
      - packages/core/test/freeze/tools.test.ts
      - packages/core/test/review/wholeModel.test.ts
    - **tests:** Each validator's exact refusal texts. Whole-model step limits accept sentence and statement changes of unfrozen cards and refuse type/id/binding/premises edits. Removing an arrow a proof uses, or a selected arrow, is refused. An unproved intermediate at finish gives 'intermediate'. The other-target/other-result exceptions apply only to a step's own intermediates. Narrow-preset steps unchanged (every slice-2 gate suite green).
    - **risk:** Medium: G5 relaxations must stay inside CF-3. A wrong exemption would let Claude change the person's kept data.
  - [6]
    - **id:** 3c
    - **scope:** The meaning probe (runner): valueProbeLines gains meaningOf(ci) (reprStr of type, value for defnInfo, constructors, levelParams, non-probed library auxiliaries sorted), one JSON line per declaration. parseValueProbe hashes with SHA-256 and drops texts over 2 MB. The ghost/scratch check file stays unchanged. checkBase output gains meaningKey; the engine re-runs checkBase when base-facts.json lacks it. Peak RSS and time measured as 2b3 does. Recordings regenerated by the integrator.
    - **files:**
      - packages/runner/src/semantic/checkFile.ts
      - packages/runner/src/semantic/refresh.ts
      - packages/runner/src/gate/engine.ts
      - packages/runner/test/semantic/checkFile.test.ts
      - packages/runner/test/semantic/meaningProbe.real.test.ts
      - test-fixtures/semantic/recorded/*
    - **tests:** Unit: generated Lean lines and the parse of meaning lines (old recordings without them give no meaningKey). Real Lean (capped, only above the 12 GB rule): an instance or attribute placed before a statement changes its meaningKey while the printed type stays equal; changing a match auxiliary changes the parent key; an identical rebuild gives identical keys; a definition body change changes the key, a theorem proof change does not. Cost report against 2b3's measurement.
    - **risk:** Medium. Probe output size and time on large definitions (cap and fail closed). If the cost exceeds 1.5× of 2b3's, the integrator decides (alternative: probe meaning only for declarations of the subject's cards and their closure).
  - [7]
    - **id:** 3d1
    - **scope:** Standing freezes on disk and on the board (runner workspace + host): ModelWorkspace reads freezes.json (load, sidecar change events, after Apply and its Undo) and exposes freezes(subject) with notFound. Board freeze/unfreeze actions go through perform, with no snapshot for freeze-only plans; History labels for the new kinds; isSubjectSidecarFile unchanged (not a History sidecar). Host routes outside sessions, refused during a session by the ES-9 lock; the board's standing marks are posted with the graph or workspace state.
    - **files:**
      - packages/runner/src/workspace/modelWorkspace.ts
      - packages/runner/src/workspace/types.ts
      - packages/runner/src/workspace/history.ts
      - packages/extension/src/logic/boardSession.ts
      - packages/core/src/protocol.ts
      - packages/runner/test/workspace/freezes.test.ts
      - packages/extension/test/unit/freezeRoutes.test.ts
    - **tests:** Freeze and unfreeze write freezes.json atomically; Undo and Redo restore it (all or nothing); a derived id is written once, with a snapshot; a History restore leaves freezes.json untouched, and orphans are listed; a hand edit of freezes.json is re-read; the ES-9 lock refuses board freezes during a session; Unfreeze all other cards asks with the standing count.
    - **risk:** Low-medium. protocol.ts is core: the message types and validators must be written in a core sub-slice (put them in 3a1 or 3a2) so that 3d1 changes no core file.
  - [8]
    - **id:** 3d2
    - **scope:** Session freezes, unfreeze requests and FZ-10 (runner + host routing): PersistedSession.freezes (start snapshot, upgrade of slice-2 sessions in recover()); RunManager.freeze/answerUnfreeze/allowChange through the write queue in a stage, in-memory plus writeStateChecked during a step; the request_unfreeze tool (pause like ask_user, live delivery or resume turn); notices drained into tool results; fresh findings not counted in toolFinish; the step-end frozen recheck and rollback to S₀; cancelQueueFrom(step); deferredReview applied at queue end; JudgeInput.freezes passed by check, freeze, gate, judge and finalCheck; the turns' FROZEN/HELD sections; system prompt; FZ-12 texts.
    - **files:**
      - packages/runner/src/run/session.ts
      - packages/runner/src/run/step.ts
      - packages/runner/src/run/manager.ts
      - packages/runner/src/run/persist.ts
      - packages/runner/src/run/types.ts
      - packages/runner/src/run/prompts.ts
      - packages/runner/src/run/systemPrompt.ts
      - packages/runner/src/llm/toolSchemas.ts
      - packages/runner/src/llm/types.ts
      - packages/runner/src/gate/engine.ts
      - packages/extension/src/logic/runs.ts
      - packages/runner/test/run/fixtures/sessions/frozen-*.jsonl
      - packages/runner/test/run/frozenSession.test.ts
    - **tests:** FakeBackend: request_unfreeze with Continue (unfrozen list computed from the store), Keep frozen, and Allow (MC items after the queue); a pending request across a reload; races 10a/10b/10c of design §13; Unfreeze of accepted content during a step deferred and applied at queue end; persistence round trip; every phase accepts freeze messages, except the Current view lock; the RunView/SessionView JSON of twins identical under freeze actions.
    - **risk:** High: concurrency between the step's own run.json writes and freeze changes, and the cancelFrom rollback. Fallback split: (i) the store, routing and request tool; (ii) FZ-10 (notices, fresh, recheck, cancelFrom).
  - [9]
    - **id:** 3d3
    - **scope:** The whole model open and Claude may add cards (runner): formalize options and unfreezeFirst plumbing (start and mid-stage), StepScope from the inference's options, the turn and system prompt for whole-model and intermediate cards; the tools remove_arrow, delete_card, add_card and mark_proof_broken with ledger entries written at normalise; rollback dropping their ledger entries; intermediate inferences derived from the ledger; the Proof broken flows (Accept unproved, Reject cascade, re-prove by mid-stage Formalize).
    - **files:**
      - packages/runner/src/run/session.ts
      - packages/runner/src/run/step.ts
      - packages/runner/src/run/prompts.ts
      - packages/runner/src/llm/toolSchemas.ts
      - packages/runner/src/llm/types.ts
      - packages/runner/src/gate/engine.ts
      - packages/extension/src/logic/boardSession.ts
      - packages/runner/test/run/fixtures/sessions/whole-*.jsonl
      - packages/runner/test/run/wholeModel.test.ts
    - **tests:** FakeBackend cheats 12-14 of design §13; a whole-model Change of an axiom's statement gives a belief item with the proves-changed flag; delete_card refused on frozen or target cards; an intermediate card proved and used through its arrow (B.1 session proof) gives Add, Result and arrow items; an unproved intermediate is refused; Retry and Cancel drop the tools' ledger entries.
    - **risk:** Medium-high: many new interactions with B.1, B.2, RV-6 and rollbacks. Real-Lean coverage only in the capped engine tests.
  - [10]
    - **id:** 3d4
    - **scope:** FZ-8 at the end (runner + host): EndConfirmationView.freezes rows (keep frozen, keep unfrozen, availability at Exit) and startSummary; endSession keep; planApply adds the freezes.json change (merged with the disk content, ids written for kept derived-id cards) and applyChanges accepts freezes.json as a sidecar; Exit writes ticked keeps as one board step; failure or crash ends write nothing; Undo of Apply restores freezes.json.
    - **files:**
      - packages/runner/src/run/sessionEnd.ts
      - packages/runner/src/proposal/service.ts
      - packages/runner/src/workspace/modelWorkspace.ts
      - packages/runner/src/workspace/types.ts
      - packages/core/src/review/view.ts
      - packages/extension/src/logic/boardSession.ts
      - packages/runner/test/run/sessionEndFreezes.test.ts
    - **tests:** Apply with no keep: freezes.json equals the start snapshot (a hand edit made during the session is kept). Apply with keeps: the new standing records, including for Claude's accepted cards. Exit: keep offered only for B-valued content. A failure end leaves freezes.json untouched. Undo of Apply restores freezes.json. A crash during Apply recovers without double-writing. Freeze or unfreeze in the confirmation (an un-accept goes back to review).
    - **risk:** Low-medium. view.ts is core: put the EndConfirmationView field in 3a1's contracts and its builder in 3b2a, so 3d4 changes no core file.
- **open_questions:**
  - D3-1 (Formalize sessions' starting freezes): RECOMMEND that ES-2's preset stays per step (slice 2's step limits), with the first preset recorded only for the banner and EN-2's summary line. A mid-stage Formalize then runs at once on its own targets (the user's REVIEW 5), and Unfreeze applies to real reasons only. ALTERNATIVE: the spec's literal reading, where the first preset is a binding FZ-7 'session-start' reason, stored as a predicate over B plus a cleared list. Every later Formalize would then need 'Unfreeze these and formalize' for its target's proof and fuzzy statements. To reverse: set real session-start entries at the start; frozenNeeds already lists them.
  - D3-2 (meaning in Lean): RECOMMEND DeclFacts.meaningKey = sha256 of the derived Repr of the elaborated Expr (type, value for definitions, constructors, level params, non-probed library auxiliaries), compared exactly, with D2-41's printed+consts comparison as a fallback that refuses Apply. ALTERNATIVE: D2-41's comparison alone (cheaper probe, leaves a residual where two different terms print the same), or comparator exports per frozen declaration (exact, but one heavy Lean job per check).
  - D3-3 (held content): RECOMMEND that held non-theorems keep both their text (without docstring, whitespace collapsed) and their meaning, while held theorems and .holds keep their type only. ALTERNATIVE: meaning only, so Claude may reformat held definitions freely.
  - D3-4 (lifetime of Accept's freeze): RECOMMEND ItemRecord.frozen, set at Accept and cleared only by the person's own later status change or Unfreeze. reconcile's automatic returns to review (badge growth D2-23, RV-11, the defensive RV-5 rule) keep the content frozen, so telelean never unfreezes (FROZEN 2-3). ALTERNATIVE: the reason ends with any status change, as FZ-7's sentence reads literally.
  - D3-5 (a freeze during a queue that conflicts with an ended step): RECOMMEND cancelling the queue from the earliest ended step whose scope contains the address (scope-based, so it never reveals an outcome), with Retry later; the running step is told and must keep the frozen value. ALTERNATIVE: apply such freezes only at the queue's end and take out the conflicting items then (a repair, and planItemRevert restores B rather than the frozen version).
  - D3-6 (Unfreeze of accepted content while Claude works): RECOMMEND that the unfreeze applies at once to Claude's checks and the item's return to review is deferred to the queue's end, so the records stay constant (D2-63) and FZ-9's 'at any time' holds. ALTERNATIVE: refuse such an unfreeze while a step runs (narrows FZ-9).
  - D3-7 (freezing a hidden target's Proof or Dependencies while the results are hidden): RECOMMEND freezing Claude's unseen proposal, after a dialog whose text is the same whatever the outcome. ALTERNATIVE: refuse until the results are shown (narrows FZ-9), or freeze B's version and ask at the reveal.
  - D3-8 (Proof broken): RECOMMEND that Claude marks a broken non-target proof with mark_proof_broken and telelean takes it out; Accept means the card loses its proof (own Accept, c1); Reject restores it and cascades to the breaking change; re-proving is a mid-stage Formalize. 'Make it pending' is deferred to slice 4. ALTERNATIVE: the gate takes broken proofs out itself (a repair loop with two builds), and/or a hold-as dialog on Accept that writes axiom c.holds (a belief item).
  - D3-9 (structural changes by Claude): RECOMMEND new tools remove_arrow, delete_card, add_card and mark_proof_broken, written by telelean through ledger entries as D2-1 does for arrows. ALTERNATIVE: G5 exceptions so Claude edits blocks and premises: itself in whole-model steps, with ownership inferred from the diff.
  - D3-10 (classes of meaning-changed items): RECOMMEND that they always need their own Accept: b5 belief when the holder is an axiom card, otherwise a new reason c5 (changes what is proved). ALTERNATIVE: only axiom holders' items are RV-7 items, as FZ-5's sentence names.
  - D3-11 (where Allow this change applies): RECOMMEND only held declarations whose held value is B's, in whole-model steps. ALTERNATIVE: also held Claude content in review (needs restoring earlier item versions rather than B).
  - D3-12 (Add premise into frozen Dependencies or a frozen mark): RECOMMEND that the draft is allowed and its Accept is gated with an [Unfreeze them] action. ALTERNATIVE: an automatic unfreeze request record listed in the stage report (RV-1's wording); it would pause or signal mid-step.
  - D3-13 (freezes.json and History): RECOMMEND that it is not a History sidecar, so restores never touch it and orphans are listed (A6), while Apply's Undo step includes freezes.json so one Undo takes a whole session back. ALTERNATIVE: make it a History sidecar, so restoring History also restores freezes.
  - D3-14 (FZ-12): RECOMMEND renaming only the user-facing texts to 'statements fixed' and keeping the MCP tool name freeze_statements, with its description reworded, to avoid fixture churn. ALTERNATIVE: rename the tool to fix_statements and regenerate the FakeBackend fixtures and the system-prompt fixture.
  - D3-15 (the start dialog): RECOMMEND that frozenNeeds offers [Unfreeze these and formalize] / [Formalize anyway] / [Cancel] when a Formalize's own exceptions are frozen (the unfreeze is the person's explicit action). ALTERNATIVE: the spec's silent 'a standing freeze always wins', where Claude must ask with request_unfreeze inside the step.
  - D3-16 (intermediate cards): RECOMMEND that every card added with add_card must be proved by the step's finish or deleted ('It must be proved in the step'). ALTERNATIVE: allow it to stay unproved, as an Add item plus a not-proved Result.
  - D3-17 (where Claude may delete cards): RECOMMEND delete_card only with the whole model open (plus a step's own intermediates), never on targets, ends of selected arrows or cards with any frozen field; D2-15 stays, so Shaky steps still cannot split or merge. ALTERNATIVE: also allow deletes and splits in Shaky steps (DO-3), with the transform rules.
  - D3-18 (moving frozen declarations): RECOMMEND refusing moves of frozen declarations or blocks (token 'moved'). ALTERNATIVE: allow them, since position is not part of the value.
  - D3-19 (attempt exemption): RECOMMEND that only checks failing solely on freezes made after Claude's previous tool result are not counted, so Claude gets one free failure per mid-step freeze. ALTERNATIVE: never count failures caused by a mid-step freeze (Claude could loop until a cap).
  - D3-20 (where the run messages' types live): RECOMMEND putting the protocol messages (freeze, answerUnfreeze, allowChange, endSession keep, formalize options/unfreezeFirst) and EndConfirmationView.freezes in 3a1's contracts, so the runner and host sub-slices change no core file (slice 2's one-builder-in-core rule). ALTERNATIVE: a separate small core sub-slice 3a3 for protocol and view types.
- **safety_notes:**
  - S3, freezes out of Claude's reach: standing freezes are in .telelean/subjects/<S>/freezes.json, which is never copied into ws/, denied by the path guard (HIDDEN_SEGMENTS) and outside G0's allowed paths. Session freezes are in run.json in VS Code storage. Claude learns of freezes only through turn text and tool results, and request_unfreeze's answer is computed from the store. Tested by a FakeBackend script that tries to write .telelean/… (guard refusal plus G0), and by checking that the shadow's ws/ never contains freezes.json.
  - FZ-3, every judged state, mechanically: frozenFindings runs inside judgeState for every purpose (check, freeze, gate-proved, gate-other, stage, final) and inside applyBackstop, which is never reused. It compares texts directly and meaning in Lean (meaningKey). Claude's compliance is never trusted. Tested with hand-built cheat states in core and the same as FakeBackend scripts, one per cheat of design §13.
  - FZ-4, frozen meaning and not just frozen text: held sets come from reach(model, frozen decls, 'meaning') over typeConsts/valueConsts (a .holds by its type only), and a frozen declaration's own meaningKey catches an instance, open or attribute placed before it. Tested with S2's HasDarkPast := False definition cheat and the instance-before-statement cheat (real Lean once, capped).
  - Missing meaning facts fail closed: steps fall back to D2-41's comparison, but any inexact comparison refuses the final check and Apply. A pre-slice-3 session's base facts are rebuilt from the base commit, which never changes. Tested with fakeFacts noMeaningKey: the step passes, Apply is refused.
  - Only the user unfreezes (FZ-6, FROZEN 2-3): reasons are removed only by Unfreeze actions, the user's status changes of the covering item, explicit dialog choices ([Unfreeze these and formalize], Reject→unfreeze, Unfreeze all others) and FZ-8 at the session's end. reconcile never clears ItemRecord.frozen. Tested by a property test: no reconcile, judge-apply or Claude step output removes a reason; the list of paths that remove reasons is closed.
  - Freeze and Unfreeze at all times (FZ-9): accepted in every phase (stage, step, interrupted, waiting for an answer, confirming). The only refusals are ES-9's Current view during a session, plus the logged narrowings (no 'your version'/Reject while a step runs; returns to review deferred to the queue's end). Tested in every phase.
  - FZ-10 soundness: a freeze's value is the version the user sees (the queue-start view). Later checks enforce it. A gate that passed before it is re-checked at the step's end, and the rollback then goes to S₀. A conflict with an ended step of the queue cancels the queue from that step. So no state reaching a stage or Apply violates a freeze. Tested by the three race scenarios (a/b/c) with FakeBackend timing hooks.
  - RV-6 non-interference: freeze dialogs, queueScope, frozenNeeds, cancelFrom, freeze marks and notices depend only on visible scope and records, never on hidden outcomes. Accepted reasons of hidden Results are withheld, and freezing a hidden target's fields uses an outcome-independent text. Tested by adding freeze actions to slice 2's paired twin working copies, with byte-identical SessionView and RunView JSON.
  - FZ-8 restore: at Apply, Exit, failure or crash end, freezes.json equals the start snapshot merged with the ticked keep changes, applied onto the disk content by address (a hand edit is never lost). Undo of Apply restores it, and History restores never touch it. Tested in 3d4.
  - The base never moves (ES-7): nothing writes the user's folder during a session. Session freezes stay in run.json; freezes.json and any id writes happen only at Apply or after Exit. Tested by asserting no write under the model root during a FakeBackend session until endSession.
  - Accepted items stay a self-contained whole (RV-5, §14.4): unfreezing accepted content returns the item and its accepted dependents to review with confirmation. Accepted content is checked by content key plus meaningKeys, so Claude cannot change it in a later step, even with the whole model open (cheat 11).
  - Keep-empty (FZ-2): an empty frozen field's value is 'empty/absent', and any fill is refused. A freeze, from any reason, overrides ES-2's fuzzy and open exceptions. Held content never does, because those exceptions are never in a held closure (FZ-4). Tested by cheat 2 and by unit tests of the exceptions.
  - CF-3 data never changes: the whole-model G5 relaxations cover only natural_name, rationale, stance, source and statement text (never type, id, provenance, premises, follows_from, the binding or positions). worded_by is written only by telelean's normalise. Tested by 3b2b's whole-model rule tests, which refuse each CF-3 field.
  - Proof integrity with the whole model open: a non-target proof is never edited by Claude. A broken one becomes a Proof broken item through telelean's take-out. Every judged state builds, B.2 holds, and the final check builds exactly F. Rejecting a Proof broken item also takes out the change that broke it. Tested by cheat 12 and the backstop tests.
  - Undo safety: undoing an unfreeze is refused when the content changed since. Freeze actions are session-stack steps sealed at Claude steps (UN-5) and discarded at the end (UN-6). Standing freeze steps are ordinary board Undo entries, all or nothing. Tested in 3a2's property tests and 3d1's workspace tests.
  - Unfreeze requests pause the step like questions, and their answers are computed from the store. 'Keep frozen' is disabled once a requested item was unfrozen, so Claude is never told something false; Claude's checks read the store whatever it was told. Tested in 3d2.
  - Test discipline: no test calls real Claude (FakeBackend, recorded streams, TELELEAN_NO_REAL_CLAUDE=1). Real-Lean probe tests run only under capped.sh, one file at a time, above the 12 GB rule. packages/extension/dist and out are never written by builders.
