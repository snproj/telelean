# design:slice4-ui

Agent `a30dd23a88b82d650` of workflow `wf_824d854d-064`. Verbatim output (JSON alongside).

- **summary:** Slice 4's transform window, UI and protocol, built on slices 2 and 3. Five entry points open one large modal window in the board webview: "Transform cards…" (a labelled Context Menu button and the right-click entry), Decline → Transform (single item and group), "Ask me instead", and Edit… on a queued transform. The window holds a draft:
- exact copies of the cards and new cards (axiom, proposition, vocabulary);
- a trash you can drag back from;
- per-field states (frozen, open, fuzzy "Claude fills this", kept empty) and a Kind control that shows its impact first, naming the frozen arrows it removes (G6);
- Dependencies edited as card chips found by searching sentences (★D6; slice 5 reuses this), and a keep/clear-only Proof;
- the "Claude may add cards" tick, an Instructions box, and a "Before you submit" panel (TR-13 dependents with per-card choices, sentence/Lean disagreement, cycles, typed-Lean problems, "Claude must define").

With no session, opening the window starts ES-3's provisional session as a real runner session in a new phase `transform`, with no Claude, consent or Lean until needed. The ES-9 lock, the fixed base, session freezes, the session stack, reload and slice 3's Exit dialog then apply unchanged. Cancel is Exit, with no dialog unless a freeze action was made. Submit transform does one of three things: starts an empty session, starts Claude's first step (consent first), or applies the edits directly as one board Undo step. In a stage, Submit queues the transform as one session step, carried out at Submit review.

Mechanics:
- Six run messages, each with a hand validator.
- The webview owns the live draft and autosaves it to run.json, with a crash copy in the webview state, so drafts survive a reload (ES-6).
- The host decides what the person typed by comparing with its own stored copy, never with the webview's marks.
- While a window is open, the working copy is fixed (no stale drafts) and no Claude step starts.
- A target whose Result is hidden never enters a window, and TR-13's lists use the masked view.

Plan: 8 sub-slices (4w1 core contracts → 4w2 host → 4w3 store → 4w4a/4w4b window → 4w5 entry points and session integration → 4w6 Playwright; 4w7 only under D3-43's fallback). 24 AUTOPILOT DECISIONS (D4W-1 to D4W-24) and 18 open questions for the integrator.
- **current_state:** Read-only survey, 2026-11-20. No code was changed.

**Slice 1 (built)**
- Context Menu section: header/ContextSection.tsx and board/contextActions.ts, with the labelled Formalize button and card actions. The right-click menu is board/menu.ts and runAction.ts.
- Dialogs use common/Modal.tsx (native <dialog>, showModal; Esc fires its cancel event). Popovers (common/Popover.tsx) are portalled to document.body, so they are inert behind a modal. Toasts render inside .tl-main.
- The A|P box (prompt/PromptBox.tsx) has a ChipChoice for stance and source. Drags use @atlaskit/pragmatic-drag-and-drop (board/dnd.ts).
- state/store.ts is one 2,637-line zustand store:
  - editLock = runLocksBoard(run) or a start in flight;
  - boardView switches Current/Proposed through the M2 overlay;
  - the persisted webview state goes through host.updateState.
- main.tsx's installShortcuts skips Ctrl+Z inside text entries and whenever any dialog[open] exists.
- There is no Transform entry anywhere in the webview.
- Test harness: test/harness/harness.js is the mock host. It records posted messages, auto-answers a MUTATIONS list, and keeps getState/setState in sessionStorage so page.reload() keeps the webview state.

**Core protocol** (packages/core/src/protocol.ts)
- Has the M1/M2 messages plus slice 1's arrow edits, RUN_MESSAGE_TYPES, hand validators (fresh objects, LIMITS) and RUN_TOKEN_PATTERN.
- It has no slice-2 messages yet (2c1 is not built).
- actions.ts still has keepLean (slice 2's 2i is not built). ActionOutcome already has slice 2's review/cascade fields.
- The slice-1 core helpers I reuse exist: kindChangeImpact, glowingDependents, formalizeCycleProblem (core/formalize.ts), and gate/g0.ts's termProblems (the single-term rule, worded for suggested premises, exported as ghostProblems).

**Slice 2 (being built now; the plan is final)**
- core/review/ has types, items, classify, deps, reducer and reconcile (2a1/2a2) and judge (2b1b).
- backstop, revert, submit and formalize are 12–27-line stubs (2b2 is in progress). mask and buildSessionView throw notImplemented (2c1/2c2).
- DeclineOption already includes 'transform'. The reducer refuses it with REVIEW_TEXTS.transformLater (D2-14). D2-13's interim makes "Ask me instead" a Shaky decline.
- Not yet built: the webview session UI (state/session.ts, run/review/*, SessionBar, the decline menu, EndConfirmation), the `session` message, the RunManager session methods, and the slice 2 §5.12 undoScope.

**Slice 3 (plan reviewed and amended, not built)**
- FreezeReason already types 'session-start' and 'transform', which are "never made". §3.12 leaves a `revalue` hook, the Transform banner and CF-6 for sentences typed in the window. D3-1 makes start freezes real only in transform-started sessions.
- The plan provides `sessionFreeze`, planFreeze, FieldLock, SessionFreezesView (frozen reasons, mode, start, changes rows with keep ticks), the Exit dialog with freeze rows, the toast action, and Formalize's ▾ with D3-43's fallback for "Claude may add cards".

**Extension host**
- logic/boardSession.ts routes run messages to the root's RunManager through runs.ts. runs.ts has isRunRequest, busyRefusal, and the egress consent asked once per root before a start.
- The ES-9 lock refuses board edits while runLocksBoard holds, and orders board edits that arrive before a start ahead of it.

**Coverage audit**
- 73 slice-4 rows plus the follow-ups G4/G5/G6, D2-13, D2-15, D3-1, D3-43's fallback and D3-49.
- Four rows need references (slice 5) first, or a stub.
- **design:** DESIGN: slice 4, the transform window (webview, extension host, and the core contracts they share)

Clause ids refer to spec v4.1. D2-n and D3-n are decisions in the slice-2 and slice-3 plans. D4W-n are this design's AUTOPILOT DECISIONS (§9). "Engine" means the slice-4 runner and core-semantics design: transform steps, carrying a transform out, direct apply, persistence and recovery. This design fixes the contract the engine must meet (§4) and builds the UI, the protocol, the host routing and the pure functions both sides share.

§0 Principles and invariants
- **P1. The host owns everything durable:** the session, the open window's saved draft, the queued transforms, provenance, outcomes and problems. The webview owns only the live draft between autosaves, plus its UI state. It previews each rule with the same core function the host enforces it with (slice 2 §5.1); a preview decides enablement and texts only.
- **P2 (TW-2). At most one transform window per session** (ES-1). A window is never open while a Claude step runs or is queued, or while the session is judging.
- **P3 (TW-1). While a window is open, the working copy W does not change and no Claude step starts** (D4W-5). A draft therefore never goes stale, so no fingerprints, merges or re-copies are needed.
- **P4. Provenance is the host's** (D4W-4). The host compares every submitted field with the copy it stored when the window opened (`original`) and with its item records:
  - a field equal to its original keeps the original's owner: your files, or Claude's item (accepted or not);
  - a field that differs was typed by you.

  The webview's marks are display only. Typing Claude's exact text back keeps it Claude's, which is the safe direction.
- **P5. Nothing hidden enters a window (RV-6).** No window holds a target whose Result is hidden (D4W-8). TR-13's lists are computed on the masked view (RV-6 bullet 4).
- **P6. Claude is contacted only after two conditions** (D4W-24):
  - the person saw "needs Claude", either on the outcome line or in a needs-confirmation that gives the reasons, "Claude must define: …" included;
  - the egress consent was given.
- **P7. Prefer refusing.** Each of these refuses Submit with its text, and nothing is repaired:
  - a stale rev;
  - a cycle;
  - a dependent with no choice;
  - typed Lean that fails a rule;
  - a fuzzy field that a session freeze keeps empty;
  - drift.
- **P8. Reuse, never a parallel mechanism.** The design reuses:
  - from slice 2: sessions and phases, the write queue and its records-only writes, the session stack (UN-4, D2-73), the cascade dialog (RV-5), Gate, CardRef, the decline menu and the session bar;
  - from slice 3: sessionFreeze with its dialogs, the Exit dialog with its keep rows, and FieldLock;
  - from slice 1: Modal, Popover and pragmatic-dnd. No new dependency (AP-5).

§1 Lifecycle

**1.1 Provisional start** (ES-3, CM-4 row 3, D4W-1)
- "Transform cards…" with no session: on the Current view, with ≥1 card of the board's subject selected, no run of the folder active, and no provisional (unwritten) card in the selection.
- The webview posts `openTransform { subject, from: { kind: 'cards', cards, vocab } }`.
- The host:
  - first applies the board edits that reached it before the message (slice 1e's order);
  - refuses while any run of the folder is active (busyRefusal, ES-1);
  - calls `manager.openTransform`.
- The engine:
  - makes the run, its shadow and the base commit. RunState is `review`, so runLocksBoard locks every board of the folder at once (ES-9).
  - sets session phase `transform` (new) and stage 0.
  - adds the session-start freezes: every card of the subject outside the selection, with reason `session-start` (D3-1's hook made real).
  - builds the window record with core draftFromCards on B.
- No Claude, no consent and no Lean job happen here.
- The answer carries transform.window. `session` and `run` are posted before `actionResult`.

**1.2 In-stage window on cards** (RV-9 b2, ES-9 b3)
- In phase `stage`, on the Proposed view: `openTransform { runId, stage, subject, from: { kind: 'cards', … } }`.
- The copies come from the stage's W (the judged commit).
- Refused:
  - while a step runs or is queued (D2-62's text);
  - while the session is judging;
  - while another window is open;
  - in confirming and in applying;
  - when a card is a target with a hidden Result (D4W-8).
- On the Current view the webview disables the entry.

**1.3 Decline → Transform** (DO-2, RV-8 b2, TR-9 b)
- Opened from the detail's Decline ▾, from the D-key menu (T), from the list's group Decline…, and from the Context Menu's "N review items".
- Message: `openTransform { runId, stage, from: { kind: 'decline', items: [{ item, rev }] } }`.
- Item kinds that take Transform: formalize, change, add, delete, vocabulary-term, declaration.
  - Results and arrow items: never (§10's preamble).
  - add-premise and proof-broken: not offered (D4W-9).
- A group decline applies Transform to the items it fits and names the others, each with its reason (G12, D4W-10).
- The window holds each item's card as it is in W, with "Previous version" (as in B) beside it. A Delete item's card starts in the trash.
- A field copied from content you did not author reads "Claude's proposal".
- The items' statuses change only at Submit transform, so Cancel has nothing to undo (TR-9 b).

**1.4 Ask me instead** (RV-10 b2; D2-13 retired; D4W-19)
- Opens a decline window on the "Assumed without asking" row's items that take Transform.
- The instructions are prefilled "Ask me about: ‹choice›" (`from.instructions`).
- When none of the items takes Transform, D2-13's Shaky decline remains.

**1.5 Queued transforms** (UN-4 4a, D4W-15)
- The review panel lists each queued transform: its label, its outcome text, its cards and items, and two buttons.
- **Edit…** sends `openTransform { from: { kind: 'edit', transform } }`. Submit replaces the queued transform in one step, "Edit transform: ‹label›"; Cancel leaves it queued.
- **Drop** sends `dropTransform`, one step "Drop transform: ‹label›"; its items return to "in review".
- An item declined with Transform has "Back to review" disabled (D4W-11).

**1.6 Submit transform**
- The window computes its outcome live (core transformOutcome) and posts `submitTransform { runId, window, rev, draft, expect, confirmed? }`.
- The host re-derives everything:
  - an outcome that differs from `expect` → `needs-confirmation` with the outcome and its reasons (usually TR-12 (c)'s "Claude must define");
  - typed Lean that fails a check → `invalid`, with per-field problems;
  - dependents without a choice → `needs-confirmation` with the host's full list (M2 carry-over 3's rule).

| Context | Outcome | Effect (engine) | Undo |
|---|---|---|---|
| provisional | start-session: nothing changed, nothing for Claude (TR-1) | phase `stage`, stage 1, no items. The fields you explicitly froze in the window become `yours` freezes, as one freeze action (D4W-7). | session stack |
| provisional | claude-step (TR-15) | Host consent first. The first step (kind `transform`) starts and the stack is sealed (UN-5). | — |
| provisional | direct: changed, no Claude | TR-12's checks only. Your files must equal B (ES-7). One history entry and one board Undo step of kind `transform`, labelled "Transform: ‹label›" (D4W-20). Typed and window-frozen fields become standing freezes in the same step (D4W-7). The session's own freeze actions are dropped (ES-3). The run ends and is dismissed, so no ended-run line remains. | board stack |
| stage | queue / queue-claude | One session step, "Queue transform: ‹label›". A decline window's items become declined (option transform) in the same step, after RV-5's cascade is confirmed (D4W-12). Carried out at Submit review (RV-12). | session stack |
| decline window | back-to-review: nothing changed, nothing for Claude | Same as Cancel (D4W-10). | — |

**1.7 Cancel**
- **Provisional:** Cancel is Exit (EN-2).
  - With window.freezeActions = 0: `endSession exit` is sent at once, with no dialog.
  - Otherwise slice 3's Exit dialog opens, with its keep rows, led by: "Cancel the transform? The edit session it started ends; your files are not changed. Your ‹n› freeze changes in this session are dropped, except those you keep."
- **In a stage:** `cancelTransform`. No step and no dialog. Freeze actions made meanwhile stay: they are session freezes.
- **Esc** never cancels the window (D4W-14).

**1.8 Reload** (ES-6)
- The draft autosaves (§6.1).
- After a reload, `session.transform.window` brings back the window with its draft and rev.
- Queued transforms live in run.json.

**1.9 Phases** (adds to slice 2 §5.13 and slice 3 §4.9)

| Phase | Transform cards… | Decline → Transform | Window | Queued Edit/Drop |
|---|---|---|---|---|
| transform | — (its window is open) | — | Submit, Cancel(=Exit), freeze | — |
| step, interrupted | off (D2-62) | off | none can be open | off |
| stage | Proposed view; no hidden-result target; not judging; no other window | same | yes | yes, while no window is open |
| confirming | off: "Back to review first." | off | — | off |
| applying | off | off | — | off |

While a window is open (minimized or not), the runner refuses the following with TW-1's text, "A transform window is open: finish or cancel it first.":
- decideItems, revealResult and submitReview;
- a mid-stage formalize, retryStep and moveProposed;
- openSessionDiff with confirmed;
- sessionUndo or sessionRedo of anything but a freeze action.

These stay allowed: sessionFreeze, endSession exit, the window's own messages, and looking.

§2 Contracts (core/src/transform/, 4w1; pure, webview-safe)
```ts
import type { Evidential, NodeType, Stance } from '../model.js';
import type { CardField, VocabField } from '../freeze/types.js';   // slice 3
import type { CardRef, Gate } from '../review/view.js';            // slice 2
/** `card:<id>` (an axiom/proposition of the session's subject), `vocab:<Lean name>` (a vocabulary item of that
 *  subject), `new:<n>` (a new card; n from nextNew, never reused within the window). */
export type DraftKey = string;
/** CF-2's fields (TR-6), named as slice 3's CardField/VocabField; Kind is never a field state (D4W-21). */
export type DraftFieldName = Exclude<CardField, 'kind'> | VocabField;
/** TR-4: frozen or not; empty+unfrozen = fuzzy, filled+unfrozen = open, empty+frozen = keep empty (FZ-2). */
export interface DraftField<V> { value: V; frozen: boolean }
export type FieldState = 'frozen' | 'open' | 'fuzzy' | 'keep-empty';
export interface DraftDependencies { sources: DraftKey[]; fromNothing: boolean }
export interface DraftCard {
  key: DraftKey;
  kind?: NodeType;                 // AXIOM | PROPOSITION; absent for vocabulary; chosen, never fuzzy (TR-2, TR-11, CF-4)
  leanName?: string;               // a new vocabulary card's short Lean name, chosen at creation (TR-2), fixed
  sentence?: DraftField<string>; why?: DraftField<string>;
  stance?: DraftField<Stance | null>; source?: DraftField<Evidential | null>;
  statement?: DraftField<string>;  // the Lean statement's term (the body of `abbrev n : Prop := …`)
  dependencies?: DraftField<DraftDependencies>;  // kept while kind is AXIOM, so switching back restores it
  proof?: 'keep' | 'clear';        // always frozen (TR-4, TR-14); only on a copied proposition with a proof or pending claim
  declaration?: DraftField<string>; gloss?: DraftField<string>;  // vocabulary (CF-2)
  trashed: boolean;
}
export type DependentChoice = 'rewrite' | 'delete' | 'claude' | 'break';
export interface TransformDraft {
  format: 'telelean-transform-draft'; version: 1;
  cards: DraftCard[]; nextNew: number;
  mayAddCards: boolean;            // TR-7 (a), default false
  instructions: string;            // TR-8; slice 5 adds `#` references
  dependents: Record<string, DependentChoice>;  // TR-13, by card id (or `vocab:` key) of a card outside the window
}
export type OpenTransformFrom =
  | { kind: 'cards'; cards: string[]; vocab: string[] }
  | { kind: 'decline'; items: Array<{ item: string; rev: number }>; instructions?: string }
  | { kind: 'edit'; transform: string };
export type TransformOutcomeKind = 'start-session' | 'claude-step' | 'direct' | 'queue' | 'queue-claude' | 'back-to-review';
export interface TransformOutcome { kind: TransformOutcomeKind; reasons: string[] }  // reasons: why Claude (TR-15)
export interface TransformConfirmed { outcome?: true; cascade?: true }             // the lists the person was shown
export interface TransformProblem { card?: DraftKey; field?: DraftFieldName | 'kind' | 'leanName'; text: string }
export interface DependentView {
  card?: CardRef; vocab?: string;
  via: Array<{ kind: 'arrow' | 'proof' | 'statement' | 'reference'; of: DraftKey }>;
  frozen: boolean; choices: DependentChoice[];
}
export interface FieldProvenance { by: 'you' | 'claude'; item?: string; accepted?: boolean; wordedBy?: 'user' | 'agent' }
export interface TransformWindowView {
  id: string; mode: 'start' | 'cards' | 'decline' | 'edit';
  items: Array<{ item: string; rev: number; label: string }>;  // decline windows
  edits?: string;                  // edit windows: the queued transform
  rev: number; draft: TransformDraft; original: TransformDraft;
  provenance: Record<DraftKey, Partial<Record<DraftFieldName, FieldProvenance>>>;
  previous: Record<DraftKey, Partial<Record<DraftFieldName, string>>>;   // decline: the version before the proposal
  sessionFrozen: Record<DraftKey, Partial<Record<DraftFieldName, string[]>>>;  // reasons as texts (D4W-6)
  freezeActions: number;           // freeze actions on the stack since it opened (ES-3's Cancel rule)
  submit: Gate; openedAt: string;
}
export interface QueuedTransformView { id: string; label: string; from: 'cards' | 'decline'; items: string[];
  cards: CardRef[]; outcome: TransformOutcome; edit: Gate; drop: Gate }
export interface TransformSessionView { window: TransformWindowView | null; queued: QueuedTransformView[];
  start: { cards: string[]; vocab: string[] } | null }   // ES-3: the selection that started the session
```
Additive fields elsewhere. 4w1 writes the types, and buildSessionView fills them with empty placeholders, as slice 3's 3a did:
- **SessionView:**
  - `transform: TransformSessionView`, empty (`{ window: null, queued: [], start: null }`) until the engine builds it;
  - `transformCards: Gate`, the host's gate for opening a window from cards;
  - `consented: boolean` (D4W-24);
  - `submit.work` + `transforms` and `claudeTransforms`.
- **SessionPhase** + 'transform'; **StepView.kind** + 'transform'.
- **EndConfirmationView.typed:** `Array<{ card?: CardRef; vocab?: string; field: DraftFieldName | 'kind' | 'new' | 'deleted'; before?: string; after?: string; transform: string }>` (EN-2 bullet 2).
- **ItemMarker** + 'typed-by-you' (RV-7 bullet 5). The engine sets `accepted.how: 'typed'` (on its ItemRecord).
- **Slice 3:**
  - FreezeReasonView + `{ kind: 'session-start' }` and `{ kind: 'transform' }`;
  - SessionFreezesView.mode + `transform: boolean`;
  - SessionFreezesView.start + `transform?: { cards: number; others: number }`.
- **ActionOutcome** (both branches) + `transform?: { window?; outcome?: TransformOutcome; mustDefine?: string[]; problems?: TransformProblem[]; dependents?: DependentView[]; queued?: string; rev?: number }`.
- **SessionAction** (type only; the engine implements it):
  - `{ id; kind: 'transform'; op: 'queue' | 'edit' | 'drop'; label; transform; request: { window?; draft; items }; before?; after?; changes: Array<{ item; rev; before: ItemState; after: ItemState }>; takenOut; at }`;
  - Redo re-sends `request` (D2-73).
- **HistoryActionKind** + 'transform' (D4W-20). One-line label entries go in webview labels.ts and runner workspace/history.ts, as 3a did for set-freezes.
- A new union member that meets an exhaustive switch in already-built code gets a case there, so every package compiles (slice 3 §1.1 3a's rule).

§3 Protocol (core protocol.ts, 4w1; routing in 4w2)
- Every message takes `requestId` and is answered by `actionResult`.
- Every message is in RUN_MESSAGE_TYPES, so the ES-9 lock never refuses it.
- Every message has a hand validator that returns a fresh object, drops unknown fields and refuses `__proto__` keys.

| Message | Payload | Validator rules |
|---|---|---|
| openTransform | { subject, from, runId?, stage? } | subject is a subject name; cards: 0–LIMITS.transformCards ids; vocab: 0–LIMITS.transformCards Lean names (slice 3's leanName()); cards and vocab ≥ 1 together, distinct; decline.items: 1–LIMITS.transformCards, distinct, rev 0–LIMITS.revision; decline.instructions ≤ textLength, may span lines; edit.transform a RUN_TOKEN_PATTERN token; runId and stage both or neither, and neither only with `cards` (the provisional start) |
| saveTransformDraft | { runId, window, rev, draft } | window a token; rev 0–LIMITS.revision; draft by transformDraft() below |
| submitTransform | { runId, window, rev, draft, expect, confirmed? } | as save; expect is one of the six outcome kinds; confirmed keeps only outcome/cascade = true |
| cancelTransform | { runId, window } | token. In a stage only: the provisional Cancel is endSession exit (D4W-1) |
| dropTransform | { runId, stage, transform } | token |
| makeProofPending | { runId, stage, item, rev } | TR-14 (d) (D4W-23) |
| submitReview + | confirmed?: { transforms: true } | D4W-12 |

transformDraft() checks:
- format and version are exact;
- cards: 1–LIMITS.draftCards (60), keys match `card:‹id›`, `vocab:‹leanName›` or `new:‹0–9999›`, all distinct;
- a vocabulary key has only `declaration` and `gloss`; an axiom or proposition key has `kind` (AXIOM or PROPOSITION) and only CF-2 fields;
- leanName is a Lean identifier of ≤ 200 characters, and only on a new vocabulary card;
- sentence, why and gloss are one line of ≤ textLength; a frozen sentence is not blank;
- stance and source are their enums, or null;
- statement and declaration are ≤ LIMITS.leanText (20 000), may span lines, and contain no NUL;
- dependencies.sources: ≤ listLength, distinct, never the card itself, never together with fromNothing;
- proof is 'keep' or 'clear'; trashed is a boolean;
- nextNew is above every `new:` key;
- instructions are ≤ textLength;
- dependents has ≤ listLength entries, each value a DependentChoice.

Fields called `origin`, `provenance` or `consented` never survive validation (P4, P6). LIMITS gains transformCards: 50, draftCards: 60 and leanText: 20 000.

Host → webview: no new message. `session.transform` gets a light check when present: `queued` is an array, and `window` is null or has `draft.cards` as an array.

When each call resolves (D2-74's rules):
- openTransform, saveTransformDraft, cancelTransform, dropTransform and makeProofPending: after their run.json write.
- submitTransform:
  - direct: after its history entry, with `graph` and `workspace` posted before `actionResult`, so the Undo toast's label matches `workspace.undo`;
  - start-session: after its stage write;
  - claude-step: once the step is working (as formalize does);
  - queue and queue-claude: after their write.

Consent (D4W-24). Before forwarding a message that would start Claude in a session whose `consented` is false, the host asks the egress modal (once per root, as today). Such messages are:
- submitTransform with expect = claude-step;
- in a transform-started session that took the start-session path: a mid-stage formalize, a submitReview whose `submit.next` is claude-steps, and retryStep.

After the modal, the host passes `consented: true`, and the runner never starts Claude without it. If the person declines, the answer is CONSENT_DECLINED and nothing is sent.

§4 Engine-facing contract (built by the engine design; the UI relies on it)
- **RunManager:**
  - `openTransform(r: { subject; from; runId?; stage? })`;
  - `saveTransformDraft(runId, window, rev, draft)`;
  - `submitTransform(runId, { window, rev, draft, expect, confirmed, consented })`;
  - `cancelTransform(runId, window)`;
  - `dropTransform(runId, stage, transform)`;
  - `makeProofPending(runId, stage, item, rev)`;
  - `submit(…, confirmed?: { transforms?: true })`.

  Each refuses with §7's texts (TW-1, D2-62, judging, hidden results); a stale rev answers `conflict`.
- **run.json:**
  - `PersistedSession.transform { window?: { id, mode, items, edits?, rev, draft, original, previous, provenance, openedAt, openedAtAction }; queued: QueuedTransformRecord[]; start?: { cards, vocab }; nextWindow; nextQueued }`;
  - `PersistedSession.consented`;
  - a save is a records-only write in the session's write queue, and raises no viewVersion.
- **buildSessionView** builds:
  - `transform`, `transformCards` and `consented`;
  - `EndConfirmationView.typed` and the typed-by-you markers;
  - the session-start and transform reason views and the banner mode;
  - `window.sessionFrozen`, from the session's freeze table on the masked model.
- **Semantics the engine decides; the UI only states them:**
  - the transform step's limits (Q2);
  - what the window's freezes become (D4W-7);
  - D-11 follow-on edits for "rewrite";
  - Proof broken for proofs a transform breaks (TR-14);
  - carrying queued transforms out at Submit review (RV-12);
  - copied content staying Claude's (TR-15);
  - worded_by: user for a typed sentence (G5).

§5 Pure functions (core 4w1; the webview previews with them, the host enforces with them)

**`fieldState(f)`** derives a field's state from its value and frozen flag.

**`draftFromCards(model, keys, { items?, base?, sessionFrozen? }) → { draft, provenance, previous, sessionFrozen }`** applies TR-4's starting states:
- sentence, Why, stance and source start open;
- statement and Dependencies start frozen (S11), and Proof starts as `keep`;
- a vocabulary card's declaration starts frozen and its gloss open;
- an empty field starts kept empty;
- a field frozen in the session starts frozen;
- a Delete item's card starts in the trash.

**`draftChanges(original, draft)`** lists value changes only.

**`typedLeanProblems(field, text)`** is the live check:
- a statement gets g0's termProblems, exported here with statement wording;
- a declaration gets only the cheap textual check: one declaration, no command words;
- the shape rule and the scratch elaboration run on the host only.

**`transformImpact({ graph, original, draft, frozen, context, references? })`** returns `{ dependents, kinds, sentenceLean, cycles, trashedSources }`:
- **Dependents** (TR-13 b1, S9, G4): cards outside the window that rely on a trashed or changed window card through one of:
  - an arrow from it;
  - a proof that uses its `.holds` (verified edges);
  - a statement that mentions it (lean-ref edges);
  - a `#` reference, from the `references` input, empty until slice 5 (RF-5 b).

  It reads the view's graph, which is masked while results are hidden (RV-6 b4). Each dependent's choices:
  - **rewrite:** only where core can redo it mechanically (dropping the arrow; D-11's P→A conditional rewrite);
  - **delete:** always;
  - **claude:** only when the dependent has no frozen field;
  - **break:** only in the provisional context with a direct outcome (TR-13's "Delete anyway", outside a session).
- **Kinds** (TR-11, G6), per window card whose kind changed:
  - P→A: kindChangeImpact's texts; the incoming arrows that will be removed, by source sentence, each marked frozen from `frozen(key)` (`graph.freezes` outside a session, `session.freezes.frozen` in one); its mark; "its proof is dropped (kept in History)"; how many cards will then rest on it;
  - A→P: "pending proof: ‹n› cards that rest on it lose their green glow until it is proved" (from glowingDependents).
- **sentenceLean** (TR-13 b2): cards whose sentence changed while their statement stays frozen and unchanged.
- **cycles** (AR-3): over the drawn arrows, the solid arrows and the draft's dependencies, new cards included.

**`transformOutcome({ original, draft, impact, context: 'provisional' | 'stage' | 'decline' })`** applies TR-15. Claude is needed for any of:
- a fuzzy field with no session freeze on it;
- non-blank instructions;
- the "Claude may add cards" tick;
- an open, filled statement on a card whose sentence changed;
- a dependent left to Claude.

The host adds the last TR-15 reason itself: typed Lean that names something not yet defined (TR-12 c). The outcome is then:
- provisional: claude-step, start-session (nothing changed), or direct;
- stage: queue-claude or queue;
- decline: back-to-review when nothing changed and nothing needs Claude, else queue or queue-claude.

**`draftProblems(…)`** blocks Submit on:
- a cycle;
- a new vocabulary name that is not an identifier, or clashes with the subject's names or with another draft card;
- a dependent with no choice;
- a fuzzy field that a session freeze keeps: "you asked Claude to fill it, but it is frozen in this session (‹reason›): unfreeze it, or freeze it here";
- a typedLeanProblems failure;
- a frozen empty sentence on a card that is not new.

A source in the trash is a warning, not a block: "“‹s›” is in the trash: its arrow into “‹t›” goes with it".

**`transformLabel(draft, nodes)`** builds labels such as "“‹first sentence›” and ‹n› more · +‹k› new · −‹m› deleted".

§6 Webview (4w3–4w5)

**6.1 Store and draft model**

The store gets a new `state/transform.ts`, wired into store.ts and 2g's state/session.ts:
```ts
interface TransformUi { window: null | {
  runId: string; id: string; mode: TransformWindowView['mode'];
  draft: TransformDraft; rev: number; dirty: boolean; saving: string | null; minimized: boolean;
  selection: Array<{ card: DraftKey; field?: DraftFieldName }>;
  problems: TransformProblem[];   // the host's last refusal, cleared field by field on edit
  confirm: null | { kind: 'outcome'; outcome: TransformOutcome; mustDefine: string[] }
    | { kind: 'cascade'; cascade: CascadeEntry[]; hiddenResults?: true } | { kind: 'dependents'; dependents: DependentView[] };
  busy: 'submit' | 'cancel' | null } }
// openTransformFromSelection, declineWithTransform(items), askMeInstead(row), editQueuedTransform, dropQueuedTransform,
// transformEdit(DraftEdit), transformSelect, transformFreeze(op), submitTransform, cancelTransform,
// answerTransformConfirm, setTransformMinimized, makeProofPending(item)
```

**The draft model** (`model/transformDraft.ts`, pure) is `applyDraftEdit(draft, edit)`. Its edits are set, freeze, kind, dependencies, proof, new, trash, restore, previous, may-add-cards, instructions, dependent and dependents-all. The rules:
- Typing a non-empty value freezes the field; emptying it makes it fuzzy (TR-5).
- A stance or source chip, once chosen, freezes the field; deselecting it makes it fuzzy.
- Freeze and Unfreeze set the flag. They never act on Proof: "A transform never writes proofs: keep the proof, or clear it."
- A kind change keeps the card's dependencies and proof in the draft.
- Adding or removing a dependency freezes the field; "clear" makes it fuzzy.
- "new" makes `new:<nextNew>` with every field fuzzy except Kind and the Lean name, and no proof (TR-4).
- "previous" copies the previous version into the field (DO-2) and freezes it.

**Autosave** (D4W-3):
- every edit marks the draft dirty;
- a crash copy goes into the webview state, debounced 150 ms: `updateState({ transformDraft: { runId, window, rev, draft } })`;
- `saveTransformDraft` is posted 400 ms after the last edit, one in flight, coalesced;
- the draft is flushed at once on Minimize, on visibilitychange (hidden), and on Submit and Cancel;
- an ok answer sets `rev`;
- `conflict` loads the host's draft, with the toast "The transform draft changed in another board: reloaded."

**When `session` arrives:**
- a window the store lacks is opened, with the host's draft, or with the crash copy when it has the same runId and window id and a rev ≥ the host's (it is then saved again);
- a window the host closed is closed;
- `session: null` closes the window;
- each window's minimized state is kept per window in the webview state.

**Submit:**
- `expect` = transformOutcome of the live draft;
- disabled while draftProblems is not empty, while a save is in flight (it waits), or while window.submit is closed (its reason);
- a needs-confirmation opens the matching sub-dialog: the outcome with its reasons and "Claude must define"; slice 2's cascade dialog (RV-5); or the dependents, merged into the panel;
- confirming re-sends with `confirmed` naming every list shown (slice 3's FreezeConfirmed rule).

**Cancel:** provisional → endSession exit (§1.7); in a stage → cancelTransform.

**Freeze actions in the window** (D4W-6):
- Freeze and Unfreeze on the window's cards and fields change only the draft, and post nothing, with one exception: Unfreeze of a field listed in `sessionFrozen` also posts one `sessionFreeze { op: 'unfreeze', subjects: [{ kind: 'field', card, field }] }` (slice 3's rules; phase `transform` accepts it).
- "Freeze all other cards" and "Unfreeze all other cards" go through slice 3's freezeSelection, with every copied card of the window as a contained `{ kind: 'card' }` subject: `sessionFreeze { op: 'freeze-others' | 'unfreeze-others' }`, with slice 3's counts dialog and, in a stage, its "also un-accept" tick.

**`transformCardsState`** (board/contextActions.ts, pure):
- It applies to the part of the selection it fits, and says so (G12): "Transform 2 of 3 selected…", with a tooltip naming what it leaves out (arrows, marks, another subject's vocabulary (TR-10 c), provisional cards).
- It is disabled, with the reason:
  - while a session runs on another subject (RunElsewhere);
  - while a start is on its way;
  - on the Current view during a session;
  - when session.transformCards is closed;
  - when the selection includes a hidden-result target;
  - while a window is already open.

**6.2 The window** (`transform/TransformWindow.tsx`; D4W-2)
- It is a native modal `<dialog>` (common/Modal) sized to the board area: inset 16 px, one column below 720 px.
- It carries `data-undo-scope="session"`. Its title is "Transform cards", "Decline with Transform: ‹labels›" or "Edit transform: ‹label›".
- common/Popover gains `container?: HTMLElement`, so the window's menus and searches render inside the dialog (the top layer makes everything else inert). The window renders its own `<Toasts/>`.

Its rows, top to bottom:
1. **Title and [Minimize].** Minimize hides the dialog; the session bar then reads "Transform window open · ‹n› cards [Return to it]".
2. **Banner** (FZ-11 5a, D4W-17).
   - In a transform-started session: "Everything except the selected cards is frozen" · "‹n› frozen by you · ‹k› standing".
   - In a stage: "Claude may change only the open and fuzzy fields of these cards", plus "and add cards" when ticked.
3. **The window's own Context Menu row** (WindowContextRow; `tl-context` look).
   - The summary names the selection: "2 fields", "“X” › Why", "3 cards".
   - Actions: Freeze, Unfreeze, Freeze all other cards, Unfreeze all other cards, each disabled with its reason (CM-3). Freeze reads "Freeze (keep empty)" when every selected field is empty. Also Move to trash / Restore.
   - A right click on a card header or a field's lock slot opens the same actions at the cursor (CM-7). Over text fields VS Code's own menu stays.
4. **The draft area**, in three groups: Axioms, Propositions and Vocabulary. A card moves between the first two with its Kind.
   - Each card is a DraftCardEditor.
   - [+ New card ▾] offers Axiom, Proposition or Vocabulary…, as an inline form: an optional sentence (Enter creates the card), or a required Lean name, checked live.
   - The Trash column sits beside it, below it on narrow panels: "Trash: deleted when the result is applied" (TR-3). Its cards are compact, with [Restore]. Cards drag in and out with pragmatic-dnd. Delete on a focused card header trashes the card.
   - There is no "delete permanently" (TR-3 c, ★D4).
5. **Options.** ☐ "Claude may add cards", with its hint (TR-7 a, b). The Instructions box (common/ProseField: a textarea that may span lines, ≤ 4 000 characters; slice 5 adds `#`; TR-8).
6. **ImpactPanel, "Before you submit":**
   - dependents, each with its choice, "Set all to …", frozen ones marked with the lock (TR-13 b1, D4W-13). "Delete it too" puts the card in this window's trash.
   - "sentence and Lean may disagree" rows, with [Unfreeze its Lean statement] [Clear it] (TR-13 b2);
   - kind changes;
   - cycles;
   - typed-Lean problems, live and then from the host;
   - "Claude must define: …" (TR-12 c).
7. **OutcomeLine**, then the footer [Cancel] [Submit transform]. Submit's tooltip is the outcome sentence.

**6.3 A draft card** (DraftCardEditor)

The header:
- the kind glyph and the Kind control [Axiom | Proposition], with no field state (D4W-21); a vocabulary card shows "Vocabulary · ‹name›";
- a provenance badge: "copy of your card", "Claude's proposal: ‹item›" or "new";
- Move to trash;
- KindImpact under the header when the kind changed (G6's list of removed arrows, frozen ones marked).

Then one DraftFieldRow per CF-2 field of its kind (TR-6). Each row has a label, a FieldLock slot (slice 3's component; a click on it, or Alt-click on the field, selects the field: CM-2), a state chip and an editor.

The states (TR-4):
- **frozen:** a closed lock in `--tl-frozen`, with its reason: "you typed it", "copied Lean starts frozen: unfreeze it to let Claude change it", or "frozen in this session (‹reason›)";
- **keep-empty:** the lock and "— kept empty";
- **open:** an open lock and "open: Claude may change it";
- **fuzzy:** codicon-sparkle and "Claude fills this", never italic, dashed or translucent (TR-4).

An unchanged value whose provenance is Claude's shows in AgentText (italic) with the chip "Claude's proposal". Once typed, it is plain (G5).

The editors:
- Sentence, Why and gloss: one-line inputs (pasteOneLine).
- Stance and source: common/ChipChoice, extracted from PromptBox.
- Statement and declaration: LeanField, a monospace textarea that never opens a `#` dropdown (RF-3), with typedLeanProblems shown live.
- Dependencies: DependenciesEditor.
- Proof: ProofChoice, [Keep] [Clear], never fuzzy. Clear reads "Clear: deletes the proof; the card becomes unproved (never pending). Prove it again with Formalize for dependencies."

A decline window adds PreviousVersion beside each card, read-only, with "Use this" per field.

**6.4 DependenciesEditor** (TR-4, AR-4, D4W-18)
- Each source is a CardChip (glyph and sentence) with × to remove it.
- [+ Arrow from…] opens common/CardSearch, a search by sentence (RF-4, ★D6):
  - it covers the subject's axioms and propositions and the window's other cards;
  - it matches word prefixes first, then substrings, ignoring case;
  - it never offers the card itself or a card in the trash;
  - a source that would close a cycle is shown disabled, with the cycle named (AR-3).
- The "follows from nothing" switch is available only when there are no sources (AR-5).
- Clearing the list makes the field fuzzy: "Claude proposes what it follows from".
- While the card's kind is Axiom, the field is struck through: "removed by the kind change".
- Slice 5's `#` dropdown reuses CardSearch and CardChip.

**6.5 Entry points and the session (4w5)**

Context Menu:
- the labelled button "Transform cards…" beside Formalize (CM-3 b1b);
- the right-click entry on cards and on vocabulary cards (menu.ts, runAction.ts).

Review UI (2g's run/review/*):
- Decline's Transform follows ItemView.decline.options, the host's gate per kind. D2-14's text is retired, and D4W-9's reasons apply.
- The T key in the D menu (D2-37).
- The group decline with its left list (D4W-10).
- Ask me instead (D4W-19).
- A "Queued transforms (N)" section with Edit… and Drop.
- An item declined with Transform reads "✗ Declined (Transform) · queued: ‹label›", and its Back to review is disabled.
- The Proof broken detail gains [Make it pending…] (TR-14 d), which asks: "Make “‹card›” pending? Its proof is replaced by `axiom ….holds`: assumed until proved, never green. It is a belief: it needs its own Accept."
- The typed-by-you marker (RV-7 b5).

Submit review:
- Its tooltip counts transforms: "Carries out your ‹k› transforms first (‹j› need Claude), then …" (EN-1).
- A needs-confirmation about transforms opens slice 2's cascade dialog, led by "Your transforms change accepted items:", and re-sends with `confirmed.transforms`.

Session bar:
- In phase transform: "Edit session · Transform cards…: the window is open (nothing has started yet)", with [Return to the window] and [Cancel…].
- The banner (D4W-17).
- For a transform step: "Claude's step for your transform: working · ‹counts›".
- RunBadge: "Edit session: transform window · ‹subject›".

End confirmation:
- A section "What you typed yourself (N)" (EN-2 b2), grouped by card, "‹field›: before → after", each row a link.
- In a transform-started session, the summary line reads "Started with Transform cards…: the other ‹N› cards of ‹subject›, frozen for this session, return to how they were."
- The Exit dialog adds "and ‹k› transforms you made".

Undo (UN-1, UN-4, D4W-16):
- undoScope routes focus inside the window to the session stack.
- main.tsx no longer counts the open transform window as a blocking dialog; only a dialog above it blocks.
- Text fields keep the browser's own undo (UN-4 4b).
- While a window is open, Undo and Redo act only when `session.undo` names a freeze action; otherwise they are disabled with TW-1's text.

Formalize (RV-9 b1 s3): "“‹T›” has a transform waiting for Submit review: formalize it after."

docs/user-guide.md gains a "Transform cards…" section.

§7 Texts (core transform/texts.ts, TRANSFORM_TEXTS)

4w1 writes every text; host and webview use them verbatim.

**Labels and states:**
- button: "Transform cards…"; banner: "Everything except the selected cards is frozen" (FZ-11's own words).
- fuzzy: "Claude fills this"; open: "open: Claude may change it"; kept empty: "kept empty".
- frozen: "frozen: you typed it"; "frozen: copied Lean starts frozen; unfreeze it to let Claude change it"; "frozen in this session (‹reason›): Claude may not change it".
- proof: "A transform never writes proofs: keep the proof, or clear it."
- "Claude's proposal".
- trash: "Trash: deleted when the result is applied".
- "Claude may add cards"; its hint: "New axiom or proposition cards to fill gaps. Off: Claude sticks to the cards here. New plain vocabulary is always allowed. Everything comes back for review."
- "Instructions for Claude (optional)".

**Outcomes:**
- start-session: "Nothing changed: starts the edit session with an empty first stage. Everything except the selected cards stays frozen; from there you can run Formalize for dependencies."
- claude-step: "Needs Claude (‹reasons›): starts the edit session with Claude's first step."
- direct: "Applies your edits to your files as one Undo step, with no edit session. The fields you typed or froze here stay frozen, as board edits do.", plus, when there are any, "The ‹n› freeze changes you made in this session are dropped."
- queue: "Queued for Submit review: telelean carries it out then (no Claude)."
- queue-claude: "Queued for Submit review: Claude's step carries it out then (‹reasons›)."
- back-to-review: "Nothing changed: the items stay in review."

**Reasons Claude is needed:**
- "‹n› fields for Claude to fill"
- "your instructions"
- "Claude may add cards"
- "Lean statement open on “‹card›”, whose sentence you changed"
- "‹n› cards left to Claude"
- "Claude must define: ‹names›"

**Refusals:**
- D2-62's text, while a step runs.
- "Re-checking the working copy: transform in a moment."
- "A transform window is open: finish or cancel it first."
- "During an edit session, Transform cards… works on the Proposed view: switch to Proposed."
- "“‹T›”'s result is not shown yet: decide the statements, or show the results, first."
- "Vocabulary of another subject can be frozen and referenced, but not transformed."
- "Accept it (choosing how you hold it), then transform its card; or Reject it."
- "A transform writes no proofs: re-prove it after the session, make it pending, or Reject it."
- "Transform applies to cards: decline arrows and results on their own."
- "It is part of a queued transform: drop the transform to bring back its ‹n› items."
- "“‹T›” has a transform waiting for Submit review: formalize it after."
- the stale-draft text (above);
- "Back to review first.";
- ES-7's drift text.

**Dependents panel:**
- lead: "These rely on cards you delete or change:"
- choices: "Rewrite it (telelean)", "Delete it too", "Leave it to Claude", "Leave it broken (Delete anyway)"
- "frozen: Claude may not change it"
- the sentence/Lean warning: "You changed the sentence of “‹card›”, but its Lean statement stays as it was: the two may disagree. Unfreeze its Lean statement to let Claude reformalise it, or clear it."

**Toasts:** "Transform cancelled: nothing changed."; "Applied: ‹label›" (undoable); "Transform queued: ‹label›"; "Started the edit session: ‹label›".

**Undo and history labels:** "Queue transform: ‹label›", "Edit transform: ‹label›", "Drop transform: ‹label›", "Make pending: ‹card›"; History: "Transform: ‹label›".

§8 Tests (detail per sub-slice in sub_slices)
- core unit tests, each with a mutation check (AP-27);
- extension unit tests with a fake RunManager;
- webview vitest, one worker, with fake timers;
- Playwright against the harness's mock host, run by the integrator only when RAM allows.

No test in this area contacts Claude or Lean; the engine's tests use FakeBackend.

§9 AUTOPILOT DECISIONS (each with its alternative and how to reverse it)

**D4W-1 (ES-3, EN-2, ES-6, ES-9): the provisional session is a real session.**
- Chosen: the session exists from the moment the window opens: a run in a new phase `transform` at stage 0, with no Claude, no consent and no Lean until Submit needs them. So slices 2–3's lock, base, freezes, stack, reload and Exit dialog apply unchanged. Cancel is Exit, with a dialog only when a freeze action was made since the window opened. A session dropped by Cancel or by a direct apply is dismissed at once and writes no attempt record.
- Alternative: a host-held draft with a host lock, and the session created only at Submit, which needs a second freeze model for the provisional window.
- To reverse: keep the messages, and replace phase `transform` with a host draft store and lock.

**D4W-2 (TR-1, FZ-9, CM-1): the window is a large native modal dialog in the board webview.**
- Chosen: with its own Context Menu row, its own right-click menu and its own toasts (Popover gains a container), plus Minimize.
- Alternative: a non-modal pane that shares the header's Context Menu (a third selection origin), or a second VS Code panel (a second bridge).
- To reverse: render the same components in a pane.

**D4W-3 (ES-6): the webview owns the live draft.**
- Chosen: the webview autosaves the whole draft into run.json (400 ms after the last edit, and at once on minimize, hide, Submit and Cancel), with a crash copy in the webview state.
- Alternative: one message per edit, with the host owning the draft.
- To reverse: post each DraftEdit and render the host's draft.

**D4W-4 (TR-15, RV-7 b5, App B baseline, G5): the host decides what you typed.**
- Chosen: it compares each field with its own stored copy; the webview's marks are display only; Claude's exact text typed back stays Claude's.
- Alternative: trust per-field origin marks sent by the webview.
- To reverse: add `origin` to DraftField and its validator.

**D4W-5 (TW-1/TW-2; narrows RV-3 and RV-9, as D2-62 and D2-65 do): while a window is open, the working copy is fixed and no Claude step starts.**
- Chosen: §1.9's list of actions is refused. A window opens only at the provisional start, or in a stage with no step running, nothing judging and no other window.
- Alternative: allow those actions, and refuse a stale Submit by per-card fingerprints.
- To reverse: drop the refusals, and add fingerprints plus a "stale" refusal.

**D4W-6 (FZ-9 para 1, TR-4, TR-5, ES-2's "a freeze always wins"): freezing inside the window.**
- Chosen:
  - Freeze and Unfreeze on the window's cards and fields set the draft's states.
  - A field frozen in the session shows that, and stays frozen whatever the draft says. The window's Unfreeze of it also posts one sessionFreeze. A fuzzy field so frozen refuses Submit.
  - "Freeze all other cards" and "Unfreeze all other cards" act on the cards outside the window.
  - Narrowing: "all other cards" here excludes the window's own cards.
- Alternative: also act on the window's other cards (two effects, only one of them undoable), or make all four actions draft-only.
- To reverse: extend transformFreeze to the window's other cards.

**D4W-7 (FZ-7 r2/r4, TR-5, FROZEN 1, D3-44, D3-1; for the engine): what the window's freezes become.**
- Chosen:
  - When the transform takes effect, a typed field gets the `transform` reason, revalued to your text (FZ-3 2e), and a field you froze in the window gets `yours`.
  - TR-4's starting states limit only the transform's own step, so an unchanged Submit never blocks a later Formalize.
  - When the transform is applied directly, the typed and frozen fields become standing freezes in the same Undo step, as D3-44 does for board edits.
- Alternative: the starting states become session freezes; or a direct apply freezes nothing.
- To reverse: change the engine's carrying-out; the UI texts follow.

**D4W-8 (RV-6, D2-65): no window holds a target whose Result is hidden.**
- Chosen: such a window is refused, and TR-13's lists are computed on the masked view.
- Alternative: copy masked versions, and apply only the fields that changed.
- To reverse: lift the refusal once the engine applies only changed fields over W.

**D4W-9 (DO-2, TR-10 a, narrowed): Transform is not offered on Add premise items or unaccepted premise drafts, nor on Proof broken items.**
- Chosen: for a premise, accept it (choosing how you hold it) and then transform its card, or reject it. Proof broken items fall under TR-14 (transforms write no proofs).
- Alternative: a two-card window holding the premise and its target, with the arrow kept as Claude's proposal.
- To reverse: allow add-premise items in openTransform with that window.

**D4W-10 (RV-8 b2, G12, TR-9, TR-1): group declines, and decline windows that change nothing.**
- Chosen:
  - A group Decline → Transform takes the items it fits. Arrow items, Results and D4W-9's kinds are left, each named with its reason, and keep their status.
  - A decline window submitted unchanged, with nothing for Claude, acts as Cancel.
- Alternative: plain-decline the arrow items in the same step; and queue a no-op transform.
- To reverse: add the DO-0 decisions to the queue step, and return the queue outcome for an unchanged window.

**D4W-11 (RV-3): an item declined with Transform cannot return to review on its own.**
- Chosen: the person drops its whole transform instead.
- Alternative: Back to review drops the transform after a confirmation.
- To reverse: route Back to review to dropTransform behind a confirmation.

**D4W-12 (RV-5 b3): the RV-5 list is confirmed when the transform is queued.**
- Chosen: the list of accepted items a transform takes out of "accepted" is confirmed at Submit transform. Submit review asks again only for a transform whose list has grown since.
- Alternative: report the list after the fact, at Submit review.
- To reverse: drop the confirmation at queueing time.

**D4W-13 (TR-13): each dependent gets its own choice.**
- Chosen: a choice among those core offers, with a "Set all to" helper. Submit waits until every dependent has one. "Delete it too" puts the card in the window's trash. "Leave it broken" is offered only for direct applies outside a session.
- Alternative: one choice for the whole transform.
- To reverse: collapse `dependents` into one choice.

**D4W-14 (CM-2, TR-9): Esc never cancels the window.**
- Chosen: Esc closes a menu, then clears the window's selection. Only the Cancel button cancels.
- Alternative: Esc cancels, which loses typed text whenever no freeze changed.
- To reverse: route the dialog's cancel event to Cancel.

**D4W-15 (UN-4 4a): a queued transform can be edited.**
- Chosen: Edit… reopens it; Submit replaces it as one step; Cancel leaves it queued.
- Alternative: Drop only.
- To reverse: remove the `edit` origin.

**D4W-16 (UN-1, UN-4 4b): how Undo works inside the window.**
- Chosen:
  - Text fields keep the browser's own undo.
  - Elsewhere in the window, Ctrl+Z acts on the session stack: on freeze actions only while the window is open.
  - Structural draft edits are not undo steps; each has its inverse gesture, and a kind change keeps the removed fields so that switching back restores them.
- Alternative: a window-local draft history, a third stack in one window.
- To reverse: add a draft history to state/transform.ts and route Ctrl+Z to it first.

**D4W-17 (FZ-11 5a, D3-1): the banner in transform-started sessions.**
- Chosen: the banner reads "Everything except the selected cards is frozen" while any session-start reason remains; during a queue, slice 3's text for that queue's step shows beneath it.
- Alternative: slice 3's newest-queue rule only.
- To reverse: read the banner from freezes.mode alone.

**D4W-18 (TR-4, TR-8, RF-4, ★D6; slice-5 hooks): Dependencies before references exist.**
- Chosen: until slice 5, Dependencies is edited as card chips with a search by sentence, and the Instructions box is plain prose. Slice 5's `#` dropdown reuses CardSearch and CardChip.
- Alternative: wait for slice 5, or type card ids.
- To reverse: not applicable (slice 5 builds on it).

**D4W-19 (RV-10 b2, D2-13): Ask me instead opens a decline window.**
- Chosen: the window covers the row's items that take Transform, with "Ask me about: ‹choice›" prefilled; when none takes it, D2-13's Shaky decline is used.
- Alternative: always use Shaky.
- To reverse: keep D2-13 only.

**D4W-20 (UN-2, ★D1): a direct transform's history entry.**
- Chosen: one history entry and one board Undo step, of a new kind `transform`.
- Alternative: reuse D2-67's `accept-proposal` with a label.
- To reverse: map the entry to accept-proposal.

**D4W-21 (CF-3, CF-4, TR-2, TR-14): Kind, Lean name and Proof in the window.**
- Chosen: Kind and a new card's Lean name have no field state in the window, and Proof is always frozen (keep or clear).
- Alternative: show Kind as a frozen field.
- To reverse: add `kind` to DraftFieldName.

**D4W-22 (TR-12): checking typed Lean.**
- Chosen: the single-term rule runs live in the window (advisory). The vocabulary shape rule and the scratch elaboration run on the host at Submit, per field.
- Alternative: a separate "Check Lean" message before Submit.
- To reverse: add a checkTransform message.

**D4W-23 (TR-14 d, D3-10): Make it pending.**
- Chosen: "Make it pending…" on a Proof broken item is a session step. telelean writes `axiom ….holds` (B.4), and the item becomes a belief that needs its own Accept.
- Alternative: keep D3-10's deferral.
- To reverse: remove the message and the button.

**D4W-24 (S6, egress consent): when Claude is contacted.**
- Chosen: only after the person saw "needs Claude", and after the egress consent. The host asks for consent before any message that would start Claude in a session that has not consented.
- Alternative: ask for consent when the provisional session opens.
- To reverse: ask in openTransform.
- **sub_slices:**
  - [1]
    - **id:** 4w1
    - **scope:** Core contracts and the pure functions shared by host and webview. Runs alone in core (one builder at a time, slice 2 §0), after slices 2 and 3 are built.

- transform/ types and TRANSFORM_TEXTS.
- fieldState, draftFromCards (TR-4's starting states and provenance), draftChanges, typedLeanProblems (g0's termProblems exported with statement wording), transformImpact (TR-13 dependents, TR-11/G6 kind impacts, TR-13 b2, AR-3 cycles), transformOutcome (TR-15), draftProblems and transformLabel.
- The six messages with their validators, LIMITS and RUN_MESSAGE_TYPES; submitReview.confirmed.
- Additive types for SessionView, phase, step kind, end confirmation, markers, freeze reasons, ActionOutcome.transform, SessionAction 'transform' and HistoryActionKind 'transform', each filled with an empty placeholder in buildSessionView.
- One-line labels in webview labels.ts and runner history.ts, so every package compiles.
    - **files:**
      - packages/core/src/transform/types.ts
      - packages/core/src/transform/texts.ts
      - packages/core/src/transform/draft.ts
      - packages/core/src/transform/impact.ts
      - packages/core/src/transform/outcome.ts
      - packages/core/src/transform/problems.ts
      - packages/core/src/transform/validate.ts
      - packages/core/src/transform/index.ts
      - packages/core/src/index.ts
      - packages/core/src/protocol.ts
      - packages/core/src/actions.ts
      - packages/core/src/review/view.ts
      - packages/core/src/review/types.ts
      - packages/core/src/review/texts.ts
      - packages/core/src/freeze/types.ts
      - packages/core/src/gate/g0.ts
      - packages/webview/src/labels.ts
      - packages/runner/src/workspace/history.ts
      - packages/core/test/transform/validate.test.ts
      - packages/core/test/transform/draft.test.ts
      - packages/core/test/transform/impact.test.ts
      - packages/core/test/transform/outcome.test.ts
      - packages/core/test/transform/problems.test.ts
    - **tests:** Every validator rule:
- card and key limits; key shapes; kind versus fields; one-line sentence and Why; the leanText limit;
- sources: not itself, distinct, never with fromNothing; proof only keep or clear; nextNew above every new key; dependents' enum;
- the returned object is fresh, unknown fields (origin, provenance, consented) are dropped, and `__proto__` is refused;
- openTransform's runId/stage pairing, and the provisional start allowed only with cards.

draftFromCards on Spyro-fixture ProjectModels:
- prose open; statement, dependencies and proof frozen; empty fields kept empty;
- a vocabulary card's declaration frozen and gloss open;
- a Delete item's card trashed; a session-frozen field starts frozen;
- provenance from items.

transformOutcome: each TR-15 bullet alone switches to Claude; no change gives start-session or back-to-review; a fuzzy field that is frozen in the session counts as a problem, not as Claude.

transformImpact:
- dependents via arrow, proof and statement, with frozen flags;
- the choices per context ('break' only in a provisional, direct transform);
- a masked graph leaves out a hidden proof's use (RV-6 b4);
- P→A names the frozen arrows and the mark (G6); A→P lists the glow loss; sentenceLean; cycles through new cards.

typedLeanProblems refuses the S10 cases: `True` then a newline and `axiom evil : False`; `#eval`; `/-`; `:=` outside brackets; unbalanced brackets.

draftProblems: vocabulary name rules, a dependent with no choice, a session-frozen fuzzy field.

A mutation check for each key rule (AP-27). Every package's tsc and its existing tests stay green.
    - **risk:** Depends on slice 2 (review/view.ts) and slice 3 (freeze/types.ts) being built. Changes are additive only. The engine design may want the same pure functions; the integrator assigns them to one owner. The exhaustive-switch placeholders must not change any slice-2 or slice-3 behaviour.
  - [2]
    - **id:** 4w2
    - **scope:** Host routing in the extension.

- The six messages go to the RunManager methods: openTransform, saveTransformDraft, submitTransform, cancelTransform, dropTransform, makeProofPending.
- `not-yet` ("Not built yet (slice 4)") answers until the engine's runner methods exist.
- openTransform without a runId: busyRefusal, plus slice 1e's rule that board edits which reached the host before it are applied first.
- Egress consent before any Claude-starting message in an unconsented session (submitTransform with claude-step; formalize, submitReview and retryStep when session.consented is false). `consented: true` is passed only by the host.
- Post order: session, then run (plus graph and workspace for a direct apply), then actionResult.
    - **files:**
      - packages/extension/src/logic/boardSession.ts
      - packages/extension/src/logic/runs.ts
      - packages/extension/test/unit/transformRouting.test.ts
      - packages/extension/test/unit/boardSession.test.ts
    - **tests:** With a fake RunManager:
- each message reaches the manager with its validated payload, or is answered not-yet while the method is missing;
- a provisional open applies the board edits queued before it, and is refused (conflict) while another run of the root is active;
- consent is asked exactly when expect is claude-step in an unconsented session, and before formalize, submitReview with claude-steps, and retry in an unconsented session;
- declining gives CONSENT_DECLINED and the manager is never called; accepting calls it with consented: true;
- a `consented` field sent by the webview never reaches the manager;
- post order is session → run → actionResult, with graph and workspace first for a direct apply;
- board edits are refused while a phase-transform run is active (runLocksBoard).

No Claude, no Lean. The extension's vitest runs with --no-cache, one worker.
    - **risk:** Needs the engine's RunManager additions (it can start with not-yet stubs, as 2c2 and 3b did). The consent rule touches slice 2's formalize, submitReview and retry routing, so slice 2's host tests must stay green.
  - [3]
    - **id:** 4w3
    - **scope:** Webview store and the draft model.

- state/transform.ts, wired into store.ts and 2g's state/session.ts.
- The pure model/transformDraft.ts (applyDraftEdit and every DraftEdit rule).
- Autosave: 400 ms idle, one save in flight, coalesced, flushed on minimize, hide, Submit and Cancel; a crash copy in the webview state; conflict reload; restore precedence on `session` arrival.
- Opening, submitting, cancelling, dropping and editing, with needs-confirmation states and resends that carry `confirmed`.
- The window's freeze actions: draft-local, plus sessionFreeze for session-frozen fields and for the other cards.
- transformCardsState in board/contextActions.ts (G12 partial labels and every disabled reason).
    - **files:**
      - packages/webview/src/state/transform.ts
      - packages/webview/src/state/store.ts
      - packages/webview/src/state/session.ts
      - packages/webview/src/model/transformDraft.ts
      - packages/webview/src/board/contextActions.ts
      - packages/webview/test/unit/transformDraft.test.ts
      - packages/webview/test/unit/store-transform.test.ts
      - packages/webview/test/unit/contextActions.test.ts
    - **tests:** applyDraftEdit:
- typing freezes and clearing makes fuzzy (TR-5); chips;
- freeze and unfreeze, with Proof refused; a kind change keeps dependencies and proof;
- new-card states (TR-4); trash and restore; previous; the options.

Autosave with fake timers:
- one save per idle period, coalescing, never two in flight;
- flushes on minimize, visibilitychange, Submit and Cancel; the crash copy is written;
- conflict reloads the host's draft.

Restore: a crash copy with the same window and a rev ≥ the host's wins, otherwise the host's draft; a window the host closed closes.

Submit: posts expect = transformOutcome; blocked by draftProblems or a save in flight; needs-confirmation opens its state and the resend names every list shown.

Cancel: provisional with freezeActions = 0 posts endSession exit at once; with > 0 it opens the Exit dialog; in a stage it posts cancelTransform.

Freezes: draft freeze toggles post nothing; Unfreeze of a session-frozen field posts exactly one sessionFreeze; Freeze/Unfreeze all other cards post one sessionFreeze with the window's copied cards as contained.

transformCardsState: other-subject vocabulary left, Current view during a session, hidden-result target, window open, step running, judging, RunElsewhere.

No posted draft contains origin, provenance or consented.
    - **risk:** store.ts is a 2,637-line monolith: keep the slice in its own module with a small wiring diff, as slices 2 and 3 do. Depends on 2g's state/session.ts and slice 3's freezeSelection.
  - [4]
    - **id:** 4w4a
    - **scope:** The window shell and the draft cards.

- TransformWindow: Modal-based, data-undo-scope=session, title by mode, Minimize, the banner, its own Toasts.
- WindowContextRow with the four freeze actions and Move to trash/Restore, and the right-click menu inside the window.
- DraftCardEditor (Kind control, provenance badge) and DraftFieldRow, with field states and looks (FieldLock, `--tl-frozen`, sparkle for fuzzy, never italic, dashed or translucent).
- LeanField (no `#` dropdown; live typedLeanProblems) and ProofChoice.
- TrashColumn (pragmatic-dnd, Restore, the Delete key), NewCardControl (Axiom, Proposition, Vocabulary with its Lean name), and TransformBar for the minimized window.
- common/ChipChoice extracted from PromptBox; Popover gains `container`.
- The pure view model model/transformView.ts, and the styles.
    - **files:**
      - packages/webview/src/transform/TransformWindow.tsx
      - packages/webview/src/transform/WindowContextRow.tsx
      - packages/webview/src/transform/DraftCardEditor.tsx
      - packages/webview/src/transform/DraftFieldRow.tsx
      - packages/webview/src/transform/LeanField.tsx
      - packages/webview/src/transform/ProofChoice.tsx
      - packages/webview/src/transform/TrashColumn.tsx
      - packages/webview/src/transform/NewCardControl.tsx
      - packages/webview/src/transform/TransformBar.tsx
      - packages/webview/src/common/ChipChoice.tsx
      - packages/webview/src/common/Popover.tsx
      - packages/webview/src/prompt/PromptBox.tsx
      - packages/webview/src/model/transformView.ts
      - packages/webview/src/styles/transform.css
      - packages/webview/src/main.tsx
      - packages/webview/src/App.tsx
      - packages/webview/test/unit/transformView.test.ts
    - **tests:** View model:
- each state maps to its chip text, icon and aria-label ("‹field›: Claude fills this. Select");
- fuzzy never maps to italic, dashed or translucent classes (TR-4);
- AgentText only for an unchanged value of Claude's provenance;
- Kind has no state; Proof offers keep/clear and no Unfreeze;
- trash labels; no "delete permanently" text anywhere.

Popover with a container renders inside the given element. PromptBox's existing tests stay green after the ChipChoice extraction.

Drafts s4-window.spec.ts (not run by the builder).
    - **risk:** Native modal inertness is handled by the Popover container and the window's own Toasts. pragmatic-dnd inside a dialog must be confirmed in Playwright. This is the largest webview sub-slice; if needed, split off TrashColumn and NewCardControl.
  - [5]
    - **id:** 4w4b
    - **scope:** Dependencies, impact, outcome and the flows.

- DependenciesEditor with common/CardSearch (search by sentence; self, trashed and cycle-closing sources disabled with their reasons) and CardChip; the "follows from nothing" switch; the struck-through state while the kind is Axiom.
- KindImpact (TR-11, G6), and ImpactPanel (dependents with per-card choices and Set all, the sentence/Lean warning with quick actions, cycles, typed-Lean and host problems, Claude must define).
- OutcomeLine with Submit's label and tooltip; InstructionsBox via common/ProseField (the slice-5 hook); PreviousVersion with Use this.
- The window's confirmation sub-dialogs: outcome, cascade (reusing slice 2's), dependents.
    - **files:**
      - packages/webview/src/transform/DependenciesEditor.tsx
      - packages/webview/src/transform/KindImpact.tsx
      - packages/webview/src/transform/ImpactPanel.tsx
      - packages/webview/src/transform/OutcomeLine.tsx
      - packages/webview/src/transform/InstructionsBox.tsx
      - packages/webview/src/transform/PreviousVersion.tsx
      - packages/webview/src/transform/TransformDialogs.tsx
      - packages/webview/src/common/CardSearch.tsx
      - packages/webview/src/common/CardChip.tsx
      - packages/webview/src/common/ProseField.tsx
      - packages/webview/src/model/cardSearch.ts
      - packages/webview/test/unit/cardSearch.test.ts
      - packages/webview/test/unit/transformView.test.ts
    - **tests:** cardSearch: word-prefix before substring ranking, case folding, never the card itself or a trashed card, a cycle-closing source disabled with the cycle named, only this subject's cards.

ImpactPanel rows from transformImpact fixtures: frozen marks, the choices offered, break only for direct.

KindImpact texts for P→A (removed arrows by source sentence, frozen marked, the mark, the dropped proof) and for A→P (glow loss).

OutcomeLine sentence for each of the six outcome kinds, with its reasons.

Sub-dialog models re-send `confirmed` with exactly the lists they showed.

Drafts more of s4-window.spec.ts.
    - **risk:** CardSearch must stay generic: slice 5's `#` dropdown reuses it. Keep its API free of transform types.
  - [6]
    - **id:** 4w5
    - **scope:** Entry points and session integration.

- The Context Menu's labelled "Transform cards…" button and the right-click entry.
- The decline menu's Transform per kind (D2-14's disabled entry retired), the T key, the group decline with its left list, and Ask me instead (D2-13 retired).
- A "Queued transforms" section (Edit…, Drop) and the declined-with-Transform row text; Back to review disabled.
- Make it pending on a Proof broken item (TR-14 d); the typed-by-you marker.
- Submit review's transform counts and its re-confirmation.
- The session bar for phase transform and transform steps, the banner (FZ-11 5a), the minimized-window line, RunBadge.
- EndConfirmation's "What you typed yourself" section and the transform-start summary line; the Exit dialog's count.
- undoScope and main.tsx's shortcut exception for the window.
- Formalize's queued-transform reason.
- The user guide's "Transform cards…" section.
    - **files:**
      - packages/webview/src/header/ContextSection.tsx
      - packages/webview/src/board/menu.ts
      - packages/webview/src/board/runAction.ts
      - packages/webview/src/run/review/DeclineMenu.tsx
      - packages/webview/src/run/review/ItemDetail.tsx
      - packages/webview/src/run/review/StageReport.tsx
      - packages/webview/src/run/review/QueuedTransforms.tsx
      - packages/webview/src/run/review/EndConfirmation.tsx
      - packages/webview/src/run/SessionBar.tsx
      - packages/webview/src/run/RunBadge.tsx
      - packages/webview/src/run/RunPanel.tsx
      - packages/webview/src/dialogs/Dialogs.tsx
      - packages/webview/src/state/session.ts
      - packages/webview/src/main.tsx
      - packages/webview/src/header/legend.ts
      - docs/user-guide.md
      - packages/webview/test/unit/menu.test.ts
      - packages/webview/test/unit/contextActions.test.ts
      - packages/webview/test/unit/review-transform.test.ts
    - **tests:** - Menu and Context Menu entries with their disabled reasons, and the G12 partial label.
- The decline menu model: Transform enabled for formalize, change, add, delete, vocabulary-term and declaration; D4W-9's reasons on add-premise and proof-broken; T key; a group left list naming each item.
- Ask me instead opens a decline window, with the fallback to Shaky.
- Queued transforms: Edit… and Drop gates.
- Back to review is disabled on a transform-declined item.
- Make it pending: dialog text and message.
- undoScope routes focus in the window to the session stack, and Undo is disabled with TW-1's text when the top action is not a freeze.
- main.tsx: Ctrl+Z inside a window text field is native; Ctrl+Z on a window button reaches the session stack.
- End confirmation typed-section model; session bar texts for phase transform; the banner rule (D4W-17).

Drafts s4-session.spec.ts.
    - **risk:** Needs slice 2's 2g/2h review UI and session bar, and slice 3's 3f/3g, in place. Its file names follow 2g's actual layout, which may differ from this list.
  - [7]
    - **id:** 4w6
    - **scope:** Playwright with the mock host.

- The harness's MUTATIONS gain the six messages, plus canned session replies for windows and queued transforms.
- Fixtures: test/shared/transforms.ts.
- Specs: s4-window, s4-session, s4-look (light, dark and high-contrast themes).
- Run only by the integrator, when RAM allows (AP-6).
    - **files:**
      - packages/webview/test/harness/harness.js
      - packages/webview/test/shared/transforms.ts
      - packages/webview/test/e2e/s4-window.spec.ts
      - packages/webview/test/e2e/s4-session.spec.ts
      - packages/webview/test/e2e/s4-look.spec.ts
    - **tests:** s4-window:
- Context Menu → openTransform posted; the window shows exact copies with their starting states;
- typing freezes and clearing gives "Claude fills this"; the trash drag and drag back; Restore by keyboard;
- new axiom, proposition and vocabulary cards;
- a kind change shows the impact with frozen arrows named;
- the Dependencies picker finds cards by typing part of a sentence;
- the outcome line changes as instructions are typed;
- Esc closes a menu and never closes the window;
- Cancel posts endSession exit with no dialog, and shows the Exit dialog after a freeze action;
- page.reload() restores unsaved edits from the crash copy.

s4-session:
- Decline → Transform with the previous version alongside and Claude's proposal marked;
- the group decline's left list;
- queued transform Edit and Drop;
- Ctrl+Z on a window button posts sessionUndo only for a freeze action;
- the end confirmation's typed section.

s4-look: computed style of fuzzy fields (font-style normal, solid border, opacity 1), lock colours per theme, screenshots.
    - **risk:** Heavy on RAM: the integrator runs it only when RAM allows, otherwise it is listed as not run. Chrome runs with the isolated HOME (harness chrome-tmp, home-guard).
  - [8]
    - **id:** 4w7
    - **scope:** Conditional: built only if D3-43's fallback fires (3c2 or 3e3 kept a blocker or major finding). Adds the "Claude may add cards" item to Formalize's ▾ (slice 3 §4.8's second item), beside TR-7's checkbox in the window, with its user-guide paragraph. The engine half is slice 3's §3.10 plan for 3c2/3e3, built by the engine design.
    - **files:**
      - packages/webview/src/header/ContextSection.tsx
      - packages/webview/src/board/useFormalize.ts
      - packages/webview/src/state/store.ts
      - docs/user-guide.md
      - packages/webview/test/unit/contextActions.test.ts
    - **tests:** The ▾ item toggles formalizeOptions.mayAddCards with slice 3's runId rules (reset at session end); formalize.options carries it; the label and tooltip texts; the host answers not-yet until the engine half lands.
    - **risk:** Only under the fallback. Depends on the engine's add-card sub-slices; if they are not built, the item must stay hidden.
- **open_questions:**
  - Q1 Provisional session (ES-3). Recommended (D4W-1): a real runner session from the moment the window opens: a new phase `transform`, stage 0, RunState review (so runLocksBoard locks the board), and no Claude, consent or Lean job until Submit needs one. Cancel is Exit, and the session is dismissed when dropped. Alternative: a host-held draft with a host-level lock, and the session created only at Submit; that needs a second freeze model and its own reload path.
  - Q2 The transform step's limits (for the engine design). Recommended: Claude may change only:
- the open and fuzzy fields of the window's cards (never Kind or Proof);
- the dependents the person left to Claude;
- new cards, when ticked, and new plain vocabulary;
- arrows into the window cards' unfrozen Dependencies.

Freezes win over all of these. "Unfreeze all other cards" from the window then matters only for later steps of the session, and its tooltip says so. Alternative: a frozen-only scope, where anything unfrozen may change; that is far too wide in sessions started by Formalize, which have no start freezes (D3-1).
  - Q3 What the window's freeze states become (D4W-7, for the engine). Recommended: typed fields get the `transform` reason, revalued; fields frozen in the window get `yours`; TR-4's starting states are limits on the step only; a direct apply makes typed and window-frozen fields standing freezes in the same Undo step (D3-44). For start-session, the explicit window freezes become one freeze action on the stack. Alternative: the starting states become session freezes, which blocks a later Formalize from filling a kept-empty statement; or direct applies freeze nothing, which departs from FROZEN 1.
  - Q4 Consent in sessions that never consented. Recommended (D4W-24): add SessionView.consented; the host asks the egress modal before any Claude-starting message (submitTransform claude-step, a mid-stage formalize, a submitReview with Claude steps, retryStep) in a session where it is false. Alternative: ask for consent whenever a provisional session opens, which asks even when no Claude is ever needed.
  - Q5 How strict TW-1 is. Recommended (D4W-5): while a window is open, refuse every action that changes W or starts Claude, and also Accept and Show results, to keep the rule simple to state and test. Alternative: also allow the records-only decisions (Accept, Show results) while a window is open, refusing only declines, un-rejects, judges and steps.
  - Q6 Transform on Add premise items and drafts. Recommended (D4W-9): not offered; accept it (choosing how you hold it) and then transform its card, or reject it. Alternative: a two-card window (the premise as a new card from Claude's proposal, plus its target with the arrow as Claude's proposal), with engine rules for what the arrow and the premise item become.
  - Q7 Group Decline → Transform with arrow items. Recommended (D4W-10): leave arrow items and Results, each named with its reason. Alternative: plain-decline the arrow items (DO-0) at Submit transform, in the same session step.
  - Q8 Back to review on an item declined with Transform. Recommended (D4W-11): disabled, with "drop the transform to bring back its ‹n› items". Alternative: Back to review drops the whole transform after a confirmation that lists its items.
  - Q9 When RV-5 bullet 3's list is confirmed. Recommended (D4W-12): at Submit transform, when the transform is queued, using slice 2's cascade dialog; Submit review re-asks only if that list has grown since. Alternative: report it after the fact at Submit review, which contradicts "Cancelling the list cancels the change".
  - Q10 History kind for a direct transform. Recommended (D4W-20): a new kind `transform`, with one-line entries in labels.ts and history.ts. Alternative: D2-67's reuse of `accept-proposal` with a label, so no kind is added.
  - Q11 TR-13's choice granularity. Recommended (D4W-13): one choice per dependent card, from those core offers, with "Set all to"; "Delete it too" moves the card into the window's trash. Alternative: one choice for the whole transform, which cannot express that rewrite fits arrows but not proofs.
  - Q12 Esc in the window. Recommended (D4W-14): never cancels; it closes a menu, then clears the window's selection. Alternative: Esc = Cancel, following ES-3's confirmation rule, which loses typed text with no question.
  - Q13 Editing a queued transform. Recommended (D4W-15): Edit… reopens it, Submit replaces it as one step, Cancel keeps it queued. Alternative: Drop only, and redo the transform from scratch.
  - Q14 Form of the window. Recommended (D4W-2): a native modal <dialog> with its own Context Menu row, an in-dialog Popover container and its own Toasts, plus Minimize. Alternative: a non-modal overlay with the rest of the app made `inert`, sharing the header's Context Menu through a third selection origin (`FieldRef.from: 'window'`).
  - Q15 Autosave cadence. Recommended (D4W-3): 400 ms after the last edit, plus immediate flushes, plus a 150 ms crash copy in the webview state. Alternative: save only on blur and minimize, which risks losing typing on a reload.
  - Q16 Make it pending (TR-14 d), which D3-10 deferred to slice 4. Recommended (D4W-23): a separate makeProofPending message and session step on the Proof broken detail, giving a belief item that needs its own Accept. Alternative: a new decline option on Proof broken items, or keep deferring.
  - Q17 Should a provisional Submit whose only changes are explicit window freezes count as unchanged? Recommended: yes. TR-1 is about values: the session starts, and those freezes become `yours`. Alternative: count them as changed, which makes the outcome direct, with the freezes written as standing ones.
  - Q18 Banner in transform-started sessions. Recommended (D4W-17): "Everything except the selected cards is frozen" while any session-start reason remains, with slice 3's step text for the running queue beneath. Alternative: slice 3's newest-queue rule only, which drops the transform banner as soon as a Formalize queue runs.
- **safety_notes:**
  - Nothing of Claude's is accepted by submitting a window (TR-15, DO-2, S5/S6).
- The host derives what the person typed by comparing with its own stored copy (D4W-4).
- Copied proposal fields stay Claude's, and their item keeps its id and RV-7 class.
- The draft validator drops any origin or provenance a webview sends.

Tests: the core validator drops these fields (4w1); the store never posts them (4w3); the engine applies the ownership rule.
  - Typed Lean is checked (S10, TR-12).
- The single-term rule runs live in the window (advisory).
- The host is authoritative: the single-term rule, the vocabulary shape rule, and a scratch elaboration against the current vocabulary.
- Undefined names come back as "Claude must define" in a needs-confirmation.

Tests: the S10 cases in typedLeanProblems (4w1); Submit is blocked while live problems exist (4w3); the host-side checks are the engine's tests.
  - Copied Lean starts frozen (S11, TR-4): draftFromCards freezes the statement, the declaration and Dependencies, keeps the Proof, and keeps empty fields empty. Tests on Spyro-fixture models (4w1).
  - Transforms never write proofs (S8, TR-14).
- Proof is always frozen in the window, keep or clear only.
- Clear never yields a pending claim.
- Make it pending is the person's explicit action and becomes an own-Accept belief item.

Tests: the validator accepts only keep or clear; applyDraftEdit refuses to unfreeze Proof (4w1, 4w3).
  - Only the person changes a card's kind (CF-4, §14 item 10).
- Kind is a chooser with no field state, and is never fuzzy.
- The validator refuses a kind on vocabulary.
- The impact is shown first, naming the frozen arrows that will be removed (G6).

Tests: transformImpact's kind impacts, and the view model (4w1, 4w4a).
  - Meaning before proof (RV-6).
- No window holds a target whose Result is hidden: openTransform is refused, and the entries are disabled with the reason.
- TR-13's lists are computed on the masked graph (RV-6 bullet 4).

Tests: transformImpact on a masked fixture leaves out the hidden proof's use (4w1); transformCardsState's disabled reason (4w3); the engine's refusal test.
  - No stale drafts (TW-1/TW-2). While a window is open, W never changes and no step starts.
- The runner refuses decisions, reveal, Submit, Formalize, Retry, moves, and the Undo or Redo of anything but freeze actions.
- A window opens only with no step running and nothing judging.
- A save or submit carrying a stale rev gets `conflict`, and the webview reloads the host's draft.

Tests: the store's conflict reload and its disabled controls (4w3); the engine's per-message refusals.
  - The base never moves, and the board is locked (ES-7, ES-9).
- The provisional session is a real run, so runLocksBoard locks every board of the folder from the window's opening.
- A direct apply requires the files to equal B, and is refused on drift.

Tests: board edits are refused during phase transform (4w2); the drift refusal is the engine's test.
  - Claude is never contacted without consent, or without the person having seen "needs Claude" (P6, D4W-24).
- The host asks the egress modal before any Claude-starting message in an unconsented session.
- Only the host sets `consented`; a webview's value is dropped.
- An outcome that differs from `expect` comes back as needs-confirmation.

Tests: extension unit tests show the manager is never called when consent is declined (4w2); validator tests (4w1). No test in this area contacts Claude (FakeBackend in the engine's tests).
  - Drafts survive a reload, and nothing is lost silently (ES-6).
- The draft autosaves to run.json, with a crash copy in the webview state, and is restored with a precedence rule.
- Esc never cancels the window.
- Cancel of a provisional window asks first whenever freeze actions were made (ES-3, EN-2).

Tests: autosave and restore with fake timers (4w3); Playwright reload test and Esc test (4w6).
  - Freezes change only by a gesture (FZ-6, FROZEN 2).
- Draft-field toggles post nothing.
- A session freeze from the window is exactly one sessionFreeze, through slice 3's rules and dialogs.
- A field frozen in the session wins over the draft's open or fuzzy state, and a fuzzy field so frozen refuses Submit.

Tests: the store's message assertions; draftProblems (4w1, 4w3).
  - Inside a session nothing is left broken (TR-13, S9).
- "Leave it broken" (Delete anyway) is offered only for direct applies outside a session.
- Every dependent needs a choice before Submit.
- The host re-lists dependents the preview missed.

Tests: transformImpact's per-context choices; the store's dependents confirmation (4w1, 4w3).
  - Cycles are refused (AR-3, §14 item 9): draftProblems checks cycles over drawn arrows, solid arrows and the draft's dependencies; CardSearch disables sources that would close a cycle. Tests in 4w1 and 4w4b.
  - The fuzzy look never reads as Claude's wording, declared or suggested (TR-4, D-15): no italics, dashing or translucency. Tests: the view model in 4w4a, and the computed-style check in Playwright (4w6).
  - Protocol hygiene. Every new message has a hand validator that:
- returns a fresh object;
- drops unknown fields and refuses `__proto__`;
- enforces LIMITS (draft cards ≤ 60, Lean text ≤ 20 000, text fields ≤ textLength, lists ≤ listLength).

Tests: the 4w1 validator suite, with a mutation check for each rule.
- **coverage:**
  - §1 Fuzzy (slice-4) — the 'fuzzy' FieldState (empty and unfrozen), shown as "Claude fills this" with the sparkle icon, never italic, dashed or translucent (§2, §6.3; 4w1, 4w4a). Claude filling it is the engine's step.
  - §1 Transform (slice-4) — the transform window (§6.2; 4w4a/4w4b), opened by openTransform (§3; 4w1, 4w2, 4w5).
  - CF-1 (transform) — Transform cards… on any card of the subject, vocabulary cards and proposed cards in W included (transformCardsState, 4w3/4w5). Premise drafts are narrowed by D4W-9.
  - CF-1 exception (TR-10) — another subject's vocabulary is left out with TRANSFORM_TEXTS.otherSubject (G12), and openTransform refuses it (4w1/4w3).
  - CF-4 bullet 1 (in a transform) — the Kind control in DraftCardEditor (4w4a); the engine carries it out by D-11.
  - FZ-3 bullet 2e — a typed field is the person's (host-derived, D4W-4); it is revalued to their text when the transform takes effect (D4W-7; the engine's use of slice 3's revalue hook).
  - FZ-7 reason 4 — typed fields get the `transform` reason (D4W-7, engine), shown as "frozen: you typed it"; FreezeReasonView gains 'transform' (4w1); keep rows in the end confirmation (4w5).
  - FZ-9 para 1 (transform window) — the window's own Context Menu row and right-click menu with the four actions (§6.1, §6.2; D4W-6; 4w3/4w4a). "All other cards" is narrowed to the cards outside the window (D4W-6).
  - FZ-11 bullet 5a — the banner "Everything except the selected cards is frozen" in the window and the session bar (D4W-17; 4w4a/4w5).
  - CM-3 bullet 1b — the labelled "Transform cards…" button in the Context Menu section (4w5).
  - CM-4 row 3 — openTransform without a session starts the provisional session (ES-3); in a session it opens an in-stage window that queues (RV-9) (§1.1–1.2; 4w1/4w2/4w5).
  - ES-3 bullet 1 — phase `transform`, with non-selected cards session-frozen (D4W-1; engine). The window opens at once (4w3).
  - ES-3 Submit unchanged — outcome start-session (transformOutcome, 4w1; OutcomeLine, 4w4b). The engine opens stage 1, empty.
  - ES-3 Submit needs Claude — outcome claude-step, with consent first (4w2, D4W-24). The engine runs the transform step.
  - ES-3 Submit changed, no Claude — outcome direct: one board Undo step (D4W-20); the toast offers Undo (4w3/4w5). The engine applies it.
  - ES-3 Cancel — endSession exit, with a dialog only when freezeActions > 0 (D4W-1; 4w3).
  - ES-6 sentence 3 (transform drafts) — autosave to run.json plus a crash copy in the webview state, restored from `session` (D4W-3; 4w3); Playwright reload test (4w6).
  - ES-9 bullet 3 (transforms) — in-stage windows queue until Submit review; the entry is disabled on the Current view during a session, with its text (4w3/4w5).
  - TR-1 (a) — draftFromCards makes exact copies (4w1), shown in the window (4w4a).
  - TR-1 (b) — unchanged gives start-session, or back-to-review for a decline window (draftChanges and transformOutcome, 4w1; D4W-10).
  - TR-2 (a) — NewCardControl offers Axiom, Proposition and Vocabulary (4w4a).
  - TR-2 (b) — Kind and the vocabulary Lean name are chosen at creation and never fuzzy (validator, 4w1; D4W-21).
  - TR-2 (c) — new cards carry `new:<n>` keys; telelean assigns real ids when it carries the transform out (engine, using D3-54's taken rule). RF-2's never-reused ids come with slice 5.
  - TR-3 (a) — TrashColumn: drag in and back, Restore, the Delete key (4w4a).
  - TR-3 (b) — trashed copied cards are deleted when the result is applied (engine); the trash's title says so (4w4a).
  - TR-3 (c) — no "delete permanently" anywhere; a test asserts its absence (4w4a).
  - TR-4 bullet 1 (fuzzy) — look and text as for §1 Fuzzy (4w4a); Playwright computed-style check (4w6).
  - TR-4 bullet 2 (open) — the 'open' chip, "open: Claude may change it" (4w4a). What Claude may change is the engine's step limit (Q2).
  - TR-4 starting states (new card) — applyDraftEdit 'new': every field fuzzy except Kind and the Lean name; no Proof (4w3).
  - TR-4 starting states (copied card) — draftFromCards: prose open; statement, Dependencies and Proof frozen; empty fields kept empty (4w1).
  - TR-4 fuzzy Dependencies — DependenciesEditor: clearing makes the field fuzzy, and CardSearch finds cards by sentence (D4W-18; 4w4b). The `#` list waits for slice 5, which reuses CardSearch.
  - TR-4 Proof field — ProofChoice, keep or clear, always frozen, clearing never gives pending (4w4a; D4W-21).
  - TR-5 — applyDraftEdit 'set': typing freezes the field, clearing makes it fuzzy (4w3).
  - TR-6 — only CF-2 fields are rendered per kind, and the validator refuses any other field (4w1/4w4a).
  - TR-7 (a) — the "Claude may add cards" checkbox, off by default (draft.mayAddCards; 4w4b).
  - TR-7 (b) — the hint says plain vocabulary is always allowed and reviewed; the engine allows it.
  - TR-7 (c) — narrowed by D2-15, which stays: no Shaky splits. The person can split a card themselves with new cards and the trash.
  - TR-8 — InstructionsBox via ProseField (4w4b); `#` comes with slice 5 (D4W-18).
  - TR-9 (a) — Submit transform → submitTransform (§1.6; 4w3/4w4b).
  - TR-9 (b) — Cancel; a decline window's items keep "in review", because their statuses change only at Submit (§1.3, §1.7).
  - TR-10 (a) — any card, vocabulary and Claude-added cards in W included (4w5). Premise drafts are narrowed by D4W-9.
  - TR-10 (c) — another subject's vocabulary is not transformable (same as the CF-1 exception); referencing it is slice 5.
  - TR-11 (window) — the Kind control and KindImpact, impact shown first (4w4a/4w4b); carried out by D-11 (engine).
  - TR-12 (a) — typedLeanProblems runs live (4w1/4w4a); the host is authoritative for the single-term and shape rules (engine) (D4W-22).
  - TR-12 (b) — the host's scratch elaboration (engine); failures come back per field and are shown in ImpactPanel (4w4b).
  - TR-12 (c) — "Claude must define: …" comes back in a needs-confirmation and on the OutcomeLine (4w3/4w4b; D4W-24).
  - TR-13 bullet 1 — ImpactPanel dependents, frozen ones marked, with rewrite / delete too / leave to Claude choices (transformImpact, 4w1; D4W-13; 4w4b).
  - TR-13 (nothing left broken) — 'break' is offered only for direct applies outside a session (transformImpact's choices, 4w1).
  - TR-13 bullet 2 — the sentence/Lean warning with quick actions (transformImpact.sentenceLean; 4w4b).
  - TR-14 (a) — Proof is never fuzzy or open, and the validator accepts only keep or clear (4w1). Transform steps writing no proofs is the engine's rule.
  - TR-14 (b) — Proof broken items are made by the engine; slice 2/3's item views show them.
  - TR-14 (d) — "Make it pending…" on the Proof broken detail, with the makeProofPending message (D4W-23; 4w1/4w5; engine).
  - TR-15 (needs-Claude test) — transformOutcome with its reasons (4w1); the typed-Lean bullet is the host's.
  - TR-15 (outside a session) — outcome direct: TR-12's checks only, one Undo step (D4W-20).
  - TR-15 (inside a session) — outcomes queue and queue-claude; the Queued transforms section (4w5); carried out at Submit review (engine).
  - TR-15 (copied content) — host-derived provenance (D4W-4), marked "Claude's proposal" (4w4a). The engine keeps the item's id and class, and marks it "updated" if changed.
  - TR-15 (follow-on edits) — listed under the rewrite choice in ImpactPanel (4w4b); the engine counts them as the person's.
  - RV-5 bullet 3 (your change) — the cascade is confirmed at Submit transform and re-asked at Submit review if it grew (D4W-12; 4w3/4w5).
  - RV-7 bullet 5 — the typed-by-you marker and accepted.how 'typed' (4w1 types, 4w5 rendering; the engine sets them).
  - RV-8 bullet 2 (Transform) — group Decline → Transform opens one window, and lists the items it leaves (D4W-10; 4w5).
  - RV-9 bullet 2 — in-stage transforms wait in the queue until Submit review (4w5).
  - RV-12 bullet 1 — the engine carries out no-Claude transforms first; Submit's tooltip counts transforms (4w5).
  - DO-2 — the decline window on the proposal, with the previous version alongside, Claude's fields marked, and Submit not accepting them (§1.3; 4w4b/4w5).
  - EN-2 Apply, bullet 2 — EndConfirmation's "What you typed yourself" section, from EndConfirmationView.typed (4w1 type, 4w5 UI; the engine builds the list).
  - UN-4 bullet 4a — queueing, editing and dropping a transform are session steps (SessionAction 'transform'; labels; Ctrl+Z) (4w1/4w5; engine).
  - UN-4 bullet 4b — text fields keep the browser's undo; elsewhere in the window Ctrl+Z acts on the session stack (D4W-16; 4w5).
  - §14 item 10 (transform) — kind changes only through the window's Kind control (4w4a).
  - S8 fix (transform) — as TR-14 (a): Proof always frozen in the window.
  - S9 fix (dependents) — TR-13's ImpactPanel; this is G4's other half.
  - S10 fix — TR-12: live checks plus the host's checks.
  - S11 fix (copied Lean frozen) — draftFromCards (4w1).
  - B.3 transform — open Dependencies show "open: Claude may add arrows". Claude's arrows into unfrozen Dependencies are engine work (Q2).
  - App B Baseline (transforms) — the engine commits typed content as the baseline; the UI's typed list and provenance show it.
  - App B Baseline (copied content) — host-derived provenance keeps copied proposal content Claude's (D4W-4).
  - G4 (S9 dependents) — TR-13 ImpactPanel (transformImpact; 4w1/4w4b).
  - G5 (worded_by) — a typed sentence is the person's (D4W-4); the window shows italics only for unchanged Claude-worded values. The engine writes worded_by: user (CF-6).
  - G6 (frozen arrows named) — KindImpact lists the incoming arrows that P→A removes by source sentence, frozen ones marked, plus the mark (transformImpact.kinds; 4w4b).
  - D2-13 — retired: Ask me instead opens a decline window with "Ask me about: …", falling back to Shaky (D4W-19; 4w5).
  - D2-15 — unchanged (no Shaky splits); the window offers splitting by the person through new cards and the trash.
  - D3-1 — session-start freezes become real in transform-started sessions: SessionFreezesView.start.transform, the banner (D4W-17), and EN-2's summary line "Started with Transform cards…" (4w5). The engine creates the reasons.
  - D3-43 fallback — conditional sub-slice 4w7 (Formalize ▾'s "Claude may add cards" item, beside TR-7's checkbox).
  - D3-49 — not touched by the window. The engine applies D3-49's keep set to the take-out that follows carrying out queued transforms; the window adds no take-out.
  - RV-6 bullet 4 (slice-4 part) — TR-13's lists are computed on the masked graph, and no window opens on a hidden-result target (D4W-8; 4w1/4w3).
  - RV-9 bullet 1 sentence 3 (slice-4 part) — Formalize's reason "“‹T›” has a transform waiting for Submit review: formalize it after." (4w5); the engine fixes such content in the step.
  - EN-1 sentence 1 / EN-2 sentence 1 (slice-4 parts) — Submit's next step and tooltip count transforms that need Claude (4w5); the Cancel exception (D4W-1, §1.7).
  - A2, A3 (slice-4 parts) — "Claude must define" for undefined typed names is shown (4w4b). Unfreeze requests and the stage report's unfollowed instructions are the engine's and slice 3's views.
  - TR-13 "Delete anyway" for direct transforms — the 'break' choice, offered only for direct outcomes (4w1/4w4b).
  - Change items, RV-7 "changes what is proved" 2, RV-1 Result sub-bullet 5, S11's own-Accept rule (slice-4 parts) — engine; slice 2's item views render them unchanged.
  - Needs references: TR-4 fuzzy Dependencies as # references — stubbed by CardSearch and CardChip (D4W-18).
  - Needs references: TR-8 (# in the instructions) — the ProseField hook; slice 5 adds the dropdown.
  - Needs references: TR-10 (c) (referencing other subjects' vocabulary) — slice 5.
  - Needs references: TR-2 (c) (new ids respect RF-2) — engine plus slice 5; the window uses `new:` keys only.
  - ES-1 (one session per folder, for provisional starts) — busyRefusal on openTransform without a runId (4w2).
