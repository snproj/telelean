# design:ui-protocol

Agent `a28d77c0267c98b22` of workflow `wf_d355dac3-0d9`. Verbatim output (JSON alongside).

- **summary:** Design for slice 3's freeze UI, protocol and Undo (webview, extension host, core protocol). The host owns all freeze state. The webview renders it from two read-only sources: `graph.freezes` (standing freezes, on the Current view) and `session.freezes` (the session's reasons, on the Proposed view and every session window). Each gesture becomes one validated message.

**The four actions.** Freeze, Unfreeze, Freeze all other cards and Unfreeze all other cards are one Context Menu and right-click model. They act on everything selectable:
- cards, including vocabulary cards (new: selectable);
- single fields (new: a lock slot on each CF-2 field, or Alt-click);
- arrows, ∅ marks, the Dependencies field;
- review items (RV-4's covered set, at Claude's proposal).

A pure core planner, `planFreeze`, gives the enablement, counts, dialogs and the "all other cards" rule (FZ-9). The webview previews with it and the host enforces with it, as slice 2 does with `planGroupAccept`.

**Routing.**
- Outside a session: `setFreezes`, a new BoardAction `set-freezes`. It goes through today's edit path (core plan → runner sidecar `freezes.json` → UndoStacks) as a sidecar-only plan: one board Undo step, no History snapshot, no model file.
- Inside a session: `sessionFreeze`, a run message reduced by slice 2's reducer into a new session-stack action `freeze`. Freezes work in every phase but applying, including while Claude works (FZ-10).
- The Current view during a session is disabled (ES-9).
- So the two stacks never share a step.

**Unfreeze requests.** They arrive like Claude's questions (`RunView.pendingUnfreeze`) and show as request cards with:
- Select them (selection only);
- Continue (reports the host's true state, never unfreezes);
- Keep frozen;
- Allow this change, on held items.

Answering seals the session stack (UN-5).

**End and Formalize.** The end confirmation and the Exit dialog list the freeze changes as rows with keep ticks, sent as `endSession.keep`. Formalize gets a ▾ with "Open the whole model" and "Claude may add cards" (`formalize.options`). They stay on for the session and reset when it ends.

**The look (FZ-11).**
- A new theme colour `telelean.frozen` (rose; never blue or green), drawn as an inner overlay so it combines with the glows and diff halos.
- Lock badges on cards, fields, arrows and marks (through 2h's `EdgeEngine.setBadges`), and where arrows enter frozen Dependencies, with a "dependencies frozen" chip.
- A "kept empty" placeholder for frozen empty fields, and a chain mark "held by ‹card›".
- High contrast: a chip and the lock badge replace the aura. The legend gets an entry.
- A session banner per start mode. Starting freezes get no aura; while a step runs, "may change" marks show what Claude may change.

**FZ-12.** User-facing "statements frozen" becomes "statements fixed", with the `milestone` icon.

**Narrowings.** Every narrowing is logged as a D3U decision with its alternative:
- "your version" in FZ-10's dialog is disabled while a step runs;
- a target's Proof can't be frozen while the results are hidden;
- freezing in a stage waits while the working copy is re-checked.

**Build.** Seven sub-slices: 3U1 core contracts, protocol, planner and texts; 3U2 reducer and Undo; 3U3 host routing; 3U4 webview selection, Context Menu and dialogs; 3U5 the look; 3U6 session UI and Undo wiring; 3U7 the FZ-12 rename, the user guide and the Playwright runs.
- **current_state:** TODAY (slice 1, built):
- Context Menu section: packages/webview/src/header/ContextSection.tsx (fixed-height row; Formalize as a labelled button with its disabled reason; other actions as icons with an overflow "…" menu). Its model, packages/webview/src/board/contextActions.ts:
  - `formalizeState` l.78-97;
  - `selectionSummary` l.107-130;
  - `SECTION_CARD_ACTIONS` l.174-184;
  - `CONTEXT_ICONS` l.186-211;
  - `contextActions` l.214-239.
- Right-click menu: packages/webview/src/board/menu.ts (`menuSelection` l.45-64, `MenuAction` l.66-90, `cardActions` l.156-202, `menuEntries` l.214-257), rendered by board/ContextMenu.tsx. Both run through board/runAction.ts `runBoardAction`.
- None of these has freeze actions. legend.ts l.5 says "frozen … comes with FROZEN".
- Selection (packages/webview/src/state/store.ts BoardUi l.300-340): `selected` (cards), `selectedArrows`, `selectedMarks`.
  - Actions: `clickCard` l.1767, `selectArrow` l.2138, `selectMark` l.2156, `selectForMenu` l.2170, `selectIncomingArrows` l.2188, `selectArea` l.2239.
  - There is no field or vocabulary selection. Vocabulary items (board/Vocabulary.tsx) are not selectable.
  - The Proposed view selects nothing (l.2143, 2159, 2241) until slice 2's 2h.
- Locks: `editLock` l.670 (core `EDIT_SESSION_ACTIVE`, `runLocksBoard`), `arrowLock` l.675, `undoLock` l.683, `PROPOSED_NO_UNDO` l.661.
- Board Undo/Redo post `undo`/`redo` (l.2534-2545). Keys: main.tsx `installShortcuts` l.109-125 and model/format.ts `shortcutFor`/`selectionKeyFor`.
- Board Undo stack: runner packages/runner/src/workspace/undo.ts `UndoStacks`: per subject, in memory, 100 entries, whole-file changes applied backwards (refuses on conflict).
  - modelWorkspace.ts `performNow` l.879-897 records each plan.
  - `EditPlan.layoutOnly` (core actions.ts) gives `snapshot: false`: undoable but no History snapshot. Sidecars are written by workspace/sidecars.ts `materialisePlan` (layout.json, attic).
- Host: packages/extension/src/logic/boardSession.ts `handle` l.212-255.
  - Action messages are queued and refused during a run with `EDIT_SESSION_ACTIVE` (`editLock` l.417-425; `LOCKED_NON_ACTIONS` l.167).
  - Run messages go through `enqueueRun`; `cancelRun` is unqueued.
  - `finishRun` l.432-444 posts `actionResult` before publishing the run.
  - actionMapping.ts `ACTION_MESSAGE_TYPES` l.13-26; runs.ts `isRunRequest`.
- Protocol: packages/core/src/protocol.ts (hand-written validators that return fresh objects; `RUN_MESSAGE_TYPES` l.262-274; `LIMITS` l.300-315). It has no freeze messages.
- Look:
  - board.css card glows are outer box-shadows (l.563-573); diff halos are outer box-shadows (l.1872-1878).
  - `.tl-card::before` is the kind stripe (l.547); `.tl-card[data-drop-edge]::after` is the drop edge (l.576).
  - High contrast replaces halos with outlines (l.2014-2020).
  - Colours: packages/extension/package.json `contributes.colors` l.187-218 (kindAxiom purple, kindProposition orange, proved green, formalizedAura blue, vocabulary teal, highlight amber). There is no `telelean.frozen`.
  - webview/test/unit/theme.test.ts whitelists M0/M1 colours; board/diagnostics.ts `themeColors` l.42-58.
  - EdgeEngine: setEdges, setSelection, setMarks, setBands (Board.tsx l.184-213). There are no badges yet.
- FZ-12 today:
  - runner gate/engine.ts:626 commit label "Statements frozen (round N)". The person sees it through manager.ts:808's revert notice.
  - manager.ts:2042 activity "freeze_statements: statements frozen (round N)", and manager.ts:1625.
  - toolSchemas.ts:100 TOOL_TITLES "Freeze statements"; :250 Claude-facing "Statements frozen…".
  - webview run/RunPanel.tsx:244 `freeze: 'lock'` icon (it would clash with the FROZEN lock).
  - model/run.ts:367 G4 tooltip "frozen before the proof".
  - docs/user-guide.md l.222, 265, 271, 279, 304, 310.

SLICE-2 PLAN (docs/slice2-plan.md; being built; only 2a1 done, the reducer and views are stubs, no state/session.ts or run/review/* yet):
- Contracts I build on:
  - SessionView/ItemView/EndConfirmationView (§2.3; built types in core/src/review/view.ts l.32-80, 275-292);
  - protocol §2.4 (`session`, `decideItems`, `sessionUndo`/`sessionRedo`, `endSession`, `formalize`, `moveProposed`; every review message refused while a step runs, D2-62);
  - SessionAction/SealBy/ItemDecision/ReviewAction (core/src/review/types.ts l.202-251, 445-451; `SealBy = 'submit'|'formalize'|'retry'`);
  - the reducer and Undo/Redo rules (§3.6, §4.6, D2-73: Undo restores recorded effects after checking, Redo re-sends the request);
  - §5.12 `undoScope` (D2-38; `data-undo-scope="session"`);
  - §5.10 `EdgeEngine.setBadges` "which FZ-13's lock badges will share later" (l.2051);
  - §5.9 "There is no freeze list and no keep tick in slice 2" (l.2036);
  - D2-12: Formalize's ▾ waits for slice 3;
  - D2-62: "(freezing comes with slice 3)";
  - RV-4 "Accept freezes nothing" (l.37);
  - b5 "meaning changed" item (l.1630);
  - §4.7 "Slice 3 … revisits the third bullet" (l.1728);
  - §4.10 "Slice 3 hook" (l.1846);
  - key `card:<node>` Add for cards Claude creates (l.393).
- The SessionView during a queue is the stage as at the queue start (D2-63), built from the judged commit. `viewVersion` rises on visible changes. `SessionView.undo` is null while a step runs.
- **design:** ## 0. Principles and reuse
- **P1 The host owns freeze state.**
  - The webview renders two sources:
    - `graph.freezes`: standing freezes, on the Current view;
    - `session.freezes`: the session's reasons, on the Proposed view, the review panel, the session dialogs, the end confirmation and request cards.
  - Each gesture becomes one message.
  - The webview previews rules (enablement, disabled reasons, counts, dialogs) with the same pure core function the host enforces with (`planFreeze`), as slice 2 does with `planGroupAccept`.
- **P2 Not optimistic.** A lock or aura appears only when the host's graph or session shows it. A lock the host then refused would mislead the person about what Claude may change. The pressed control shows a spinner until `actionResult` (`freezeBusy`).
- **P3 The webview never changes a freeze by itself.** Every `setFreezes`/`sessionFreeze` is a gesture (FZ-6). Session-end restores are the host's (FZ-8).
- **P4 Routing by view (UN-1, ES-9):**
  - no session: board (`setFreezes`, board stack);
  - session, Proposed view or focus inside `data-undo-scope="session"`: `sessionFreeze`, session stack;
  - session, Current view, any other board of the folder, or phase `applying`: disabled, with the reason.
- **P5 RV-6 by construction.** The host builds every freeze view and every freeze plan on the same model the session view shows (base-masked while the results are hidden). So a plan or a view never names hidden content.
- **P6 Reuse:**
  - the board edit path (BoardAction → core `planAction` → runner sidecar → `UndoStacks`);
  - slice 2's reducer and session stack, cascade dialog and end confirmation;
  - the base mask;
  - 2h's `EdgeEngine.setBadges` and `undoScope`.

## 1. What can be frozen and selected (core `freeze/types.ts`, `freeze/keys.ts`)
```ts
/** CF-2's fields. A whole card = every field of its kind (FZ-1); an axiom has no dependencies/proof. */
export type CardFieldName = 'sentence' | 'kind' | 'why' | 'stance' | 'source' | 'statement' | 'dependencies' | 'proof';
export type VocabFieldName = 'declaration' | 'gloss';
export const CARD_FIELDS: Readonly<Record<NodeType, readonly CardFieldName[]>>; // AXIOM: 6, PROPOSITION: 8
/** What is frozen (the unit of state, views and keep ticks). */
export type FreezeTarget =
  | { kind: 'field'; card: string; field: CardFieldName }
  | { kind: 'vocab'; name: string; field: VocabFieldName }   // any subject's vocabulary (TR-10)
  | { kind: 'arrow'; source: string; target: string }        // FZ-13: Claude may not remove it
  | { kind: 'mark'; card: string };                          // FZ-13: no premise item may replace it
export type FreezeKey = string;                              // freezeKey(t) = canonicalJson([kind, ...parts]): unambiguous for any Lean name
/** What the person selected (protocol unit); planFreeze expands it into targets. */
export type FreezeSubject =
  | { kind: 'card'; card: string } | { kind: 'field'; card: string; field: CardFieldName }
  | { kind: 'vocab'; name: string } | { kind: 'vocab-field'; name: string; field: VocabFieldName }
  | { kind: 'arrow'; source: string; target: string } | { kind: 'mark'; card: string }
  | { kind: 'item'; item: string; rev: number }               // session only: RV-4's covered set, at Claude's proposal
  | { kind: 'held'; name: string; request: string };          // session only, ops allow/disallow (FZ-5)
export type FreezeOp = 'freeze' | 'unfreeze' | 'freeze-others' | 'unfreeze-others' | 'allow' | 'disallow';
```

**Expansion rules:**
- A card expands to every field of its kind. Its Dependencies field covers every arrow into it and its mark; arrows out of it are not covered (FZ-1).
- A vocabulary card expands to its declaration and gloss.
- An item expands to `acceptCovers(item)` (core `freeze/covers.ts`, RV-4):
  - Add: every field of the new card;
  - Add premise: that, plus its arrow;
  - Add arrow: the arrow;
  - Change or Formalize: sentence and statement, plus the other changed fields;
  - Result: the proof;
  - Vocabulary term or declaration: declaration and gloss;
  - Delete, Remove arrow, Proof broken: nothing.
- CF-7: derived data is never a subject. TL107 warning arrows, statuses, Used by and bands are not selectable for freezing.

**Selection** (store, new `state/freeze.ts`):
- New state: `selectedFields: FieldRef[]` (with `FieldRef = {card, field} | {vocab, field}`) and `selectedVocab: string[]`.
- Gestures:
  - click a field's lock slot, or Alt-click the field;
  - click a vocabulary item's header; the chevron still opens it;
  - Ctrl adds;
  - a plain click on any board thing replaces the whole board selection;
  - Esc clears it;
  - the selection rectangle selects cards, arrows and marks only.
- Right-click (CM-7): on a lock slot, or Alt+right-click on a field, the field's menu; elsewhere on the card, the card's menu. `MenuThing` gains `{kind:'field'}` and `{kind:'vocab'}`. Shift+F10 on a focused lock slot opens the field menu.
- Review items keep 2g's own checkbox selection. Freeze actions act on the board selection when it is non-empty, else on the item selection (D3U-28). The summary says which.
- `selectionSummary` gains:
  - "2 fields", "1 field: “X” › Lean statement";
  - "1 vocabulary card: InGame";
  - "3 review items";
  - one tooltip line per thing.

## 2. The four actions: semantics, planner, enablement
```ts
// core freeze/plan.ts: pure; the webview previews with it, the host enforces with it.
export function planFreeze(i: {
  board: FreezeBoard;        // cards (id, kind, which CF-2 fields are empty), drawn arrows, marks, this subject's vocabulary
  state: FreezeStateForPlan; // reasons per key: board = standing only; session = standing/start/accepted/own (+ allowed)
  op: FreezeOp; subjects: readonly FreezeSubject[];
  session?: { resultsHidden: boolean; hiddenTargets: readonly string[]; phase: SessionPhase;
              items: ReadonlyArray<{ id: string; rev: number; kind: ItemKind; status: ItemStatus | null; covers: FreezeTarget[]; cards: string[] }> };
  unaccept?: boolean;
}): FreezePlan;
export interface FreezePlan {
  add: FreezeTarget[];                 // gain the op's reason: standing (board) or own (session)
  remove: FreezeTarget[];              // lose every reason (FZ-7); accepted reasons only with unaccept, or a plain Unfreeze
  unaccept: string[];                  // items returned to review (FZ-7 + RV-5; the host adds the cascade)
  counts: { standing: number; own: number; accepted: number; start: number };
  versions: Array<{ card: string; item: string; kind: ItemKind; offers: Array<'proposal' | 'yours'> }>; // FZ-10 (session)
  left: Array<{ subject: FreezeSubject; reason: string }>;
  label: string;                       // the Undo label
  changes: boolean;                    // false = nothing to do (disables the entry)
}
```

**"All other cards" (FZ-9):**
- The containing cards are:
  - the selected cards;
  - the cards of selected fields;
  - both ends of each selected arrow;
  - marked cards;
  - selected vocabulary cards;
  - the cards of selected items (`ItemView.cards`).
- "Others" are every axiom, proposition and current-subject vocabulary card outside that set, each expanded as a whole card. Their Dependencies include the arrows into them and their marks.
- Unfreeze all other cards removes standing and own reasons. It removes accepted reasons only with "also un-accept".

**Entries and enablement** (`freezeEntries(selection, context, source)` in contextActions.ts). Every action appears, disabled with the reason on hover, whenever the selection holds anything freezable (CM-3).

| Entry (icon) | Enabled when | Disabled reason (`FREEZE_TEXTS`) |
|---|---|---|
| Freeze (`lock`); label "Freeze (keep empty)" when every selected field is empty | the plan adds something | "Already frozen." / in a session: "You froze it already." |
| Unfreeze (`unlock`) | some subject has an FZ-7 reason | "Not frozen." / preset only: "Only this step's limits keep it fixed, and Unfreeze does not lift them: open the whole model when you formalize." |
| Freeze all other cards (`lock` + `layers` badge) | an other card is not wholly frozen | "Every other card is frozen already." |
| Unfreeze all other cards (`unlock` + `layers`) | an other card has a reason | "No other card is frozen." |

Context-wide reasons:
- Current view during a session: "During an edit session your files can't change: freeze on the Proposed view."
- Another subject's board during a session: slice 2's RunElsewhere text.
- Phase `applying`: "Applying…".
- A provisional card: `MENU_PROVISIONAL`.
- A target's Proof while the results are hidden: "“‹T›”'s proof can be frozen once the results are shown." (D3U-8). Freeze on such a card freezes its other fields, and `left` says so in a toast.
- In a stage while `session.judging`: "Re-checking the working copy… freezing waits a moment." (D3U-29).
- A not-yet-accepted Add premise draft: "Accept it first: a suggested premise is not in the working copy."

The right-click menus list the same four entries, in a group:
- after a card's own actions;
- in the arrow and mark menus after Formalize and Remove;
- on fields and vocabulary items.

**Confirmations** (one combined `freeze` dialog, opened by the webview's preview first and by the host's `needs-confirmation` otherwise; Confirm resends with `confirmed` and the choices):
- **Unfreeze all other cards always asks (D3U-9).** "Unfreeze ‹N› other cards?", with:
  - "This removes ‹n› standing freezes (made outside a session)", when n > 0;
  - "‹m› of your freezes from this session";
  - in a session, the tick "Also un-accept: ‹k› accepted items return to review (with what depends on them)". It is off by default and sends `unaccept: true`.
- **A plain Unfreeze of accepted content** opens slice 2's cascade dialog, with the new lead-in `cascadeUnfreeze`: "Unfreezing returns these accepted items to review:". While the results are hidden, D2-64's sentence and rule apply.
- **FZ-10 version choice** (a card with an item in review): "“‹card›” has an item in review: ‹label›. Freeze which version?" The options are:
  - [Claude's proposal (the item stays in review)];
  - [Your version (rejects ‹label›)], disabled during a step: "Rejecting waits until Claude's step ends: freeze Claude's proposal now, or wait." (D3U-7).

  Offers per kind:

  | Item kind | Offers |
  |---|---|
  | Add card | proposal only, so no dialog |
  | Formalize/Change | both |
  | Delete | yours only: "Freeze and reject the deletion" |
  | Remove arrow | yours only |
  | Add arrow | proposal only |
  | Result | both while shown; never while hidden |
  | Proof broken | proposal only |
  | new vocabulary | proposal only |
  | changed vocabulary | both |

  "Yours" is sent as `decideItems` Reject with `freeze: 'yours'` (§10). The rest of the selection is sent as one `sessionFreeze`.
- **Keep-empty while Claude fills it** (FZ-10). The host answers `needs-confirmation` with `freeze.fillingNow` (only the runner knows the running step's scope). The dialog: "Claude is filling “‹card›” › ‹field› now. Freeze it empty? Claude will be told that it must stay empty."
- **Reject of a proposal you froze** (FZ-10 bullet 3; the `reject-frozen` dialog, in the decline flow): "You froze Claude's proposal of “‹card›”. Rejecting restores your version." [Reject and unfreeze it] [Reject and keep it frozen (your version)] [Cancel]. It is sent as `ItemDecision.freeze: 'unfreeze' | 'yours'`. It applies to plain arrow declines too (DO-0).

## 3. Where (FZ-9) and when
- **Current view, no session:** cards, field slots, vocabulary, arrows, marks, Dependencies.
- **Proposed view** (any phase but applying): the same, plus cards Claude added. Claude's proposed arrows are frozen through their item (2h makes their click focus the item), D3U-20.
- **Review list and item detail** (2g §5.5–5.6):
  - every field the detail shows gets a lock slot, which selects that card's field;
  - the row shows a lock when the item's covered content has an own or accepted reason;
  - the detail gets an RV-4 hint under Accept: "Accepting freezes: the sentence and the Lean statement", "Accepting freezes nothing, but Claude may not re-add it" (Delete/Remove arrow), and "Frozen while accepted: …" after the Accept.
  - Accept gates blocked by freezes carry `Gate.unfreeze?: FreezeTarget[]` (e.g., RV-1 "Add premise for a target whose Dependencies are frozen"). Their "Select them" selects those targets.
  - "Meaning changed by ‹X›" items (FZ-5; kind and detail from the item area) render the frozen card's sentence and unchanged Lean, with X's before → after, a `link` glyph, and the belief badge for an axiom.
- **End confirmation and Exit dialog:** the rows are selectable (§7).
- **Request cards:** "Select them" (§6).
- **Transform window (slice 4):** hooks only. `FieldLock` is reusable there, and `FreezeReasonView` has `transform`.
- **While Claude works** (phases step and interrupted):
  - freeze actions and their Undo/Redo stay enabled (FZ-10, D3U-5);
  - every other review control stays read-only (D2-62);
  - slice 2's §5.13 table gains a "Freeze" column: yes in step, interrupted, stage and confirming; no in applying.
- **Confirming:** Freeze and Unfreeze change only the freeze list. An Unfreeze that would un-accept is refused: "Back to review first: unfreezing it returns “‹item›” to review." (D3U-10). F's content does not change, so the final check stays valid.
- **"The version you see"** (FZ-3, FZ-10). `sessionFreeze` carries `stage` and `view` (the SessionView's version). The host refuses `conflict` when the view changed, and freezes the values of the judged state the view was built from:
  - in a stage that state equals the head (no freezing while judging, D3U-29);
  - during a step it is the queue-start state (D2-63), so Claude must restore anything it changed, and that check does not count as an attempt (runner area);
  - the host posts `session` before the `actionResult` of every session action, so the re-enabled control holds the current version (D3U-23).

## 4. The look (FZ-11), webview `model/freezeLook.ts` (pure) + CSS
```ts
export type FreezeSource =
  | { mode: 'board'; frozen: ReadonlySet<FreezeKey>; held: Readonly<Record<FreezeKey, readonly string[]>> }        // Current view
  | { mode: 'session'; view: SessionFreezesView; phase: SessionPhase; resultsHidden: boolean };                   // Proposed view
export interface CardFreezeLook {
  whole: boolean;                                   // every current field has a shown reason: aura + card lock badge
  fields: ReadonlyMap<CardFieldName, FreezeReasonView[]>;   // field locks; face badge "🔒 n" when not whole
  keptEmpty: ReadonlySet<CardFieldName>;            // frozen while empty: "kept empty" placeholder
  dependencies: boolean;                            // entry lock + chip "dependencies frozen"
  held: ReadonlyMap<CardFieldName, readonly string[]>; // chain mark "held by “A”" (+ "and 2 more")
  open: ReadonlyArray<'fuzzy' | 'proof' | 'arrows'>;   // while a step runs (preset mode only)
  title: string;                                    // aria/tooltip: "Frozen: sentence, Lean statement (you froze them)…"
}
export function cardFreezeLook(node: TlNode, source: FreezeSource): CardFreezeLook;
```

**Shown reasons:**
- On the board, standing.
- In a session, every reason except `start`. Starting freezes appear as the banner only, and per field in the details (D3U-15).
- Accepted content shows field locks. A card gets the aura only when every field has a non-start reason.

**Colour (D3U-13).** `contributes.colors` gains `telelean.frozen`, described as "The aura and locks of frozen cards, fields and arrows (Claude may not change them). Never blue or green: those mean formalised and proved." Its defaults are rose (dark #F07CB8, light #B4236E, hc #FF8FD2, hcLight #9E1A5F). In board.css it is read as `--tl-frozen: var(--vscode-telelean-frozen, #e070b0)`.

**Card aura:**
- A child `<span class="tl-card__frost" aria-hidden>` sits absolutely positioned, `inset:0`, `border-radius:inherit`, `pointer-events:none`, with `box-shadow: inset 0 0 0 2px var(--tl-frozen), inset 0 0 10px 1px color-mix(…40%)`.
- Glows and diff halos are outer box-shadows on `.tl-card`, so they combine.
- Not `::after`, which the drop edge uses (D3U-14).
- Never dashing or translucency.

**Lock badges:**
- **Card:** `codicon-lock` badge next to the kind glyph when whole. Otherwise a chip "🔒 n" (`tl-chip--frozen`), whose title lists the frozen fields.
- **Field locks** (`board/FieldLock.tsx`, a 14 px button with `data-field`):
  - closed lock in `--tl-frozen`, always visible when frozen;
  - open lock in descriptionForeground, shown on card hover or focus-within (`opacity`, so it stays focusable), when not frozen;
  - `aria-pressed` = selected; a click selects the field (never freezes, D3U-17).
  - Slots: on the card face for sentence and Why; in the details for Kind, Stance, Source, Lean statement, Proof (a small header row above the code: "Lean statement 🔒 · Proof 🔓"), and Dependencies (the "Depends on" heading).
- **Keep-empty:** "because: — kept empty 🔒" on the face, only for individually frozen empty fields (a whole frozen card shows the aura only). In the details: "Lean statement: none · kept empty 🔒" and the same for Proof and Dependencies.
- **Arrows and marks:** EdgeEngine badges (2h `setBadges(badges)`). Slice 3 adds:

  ```ts
  { kind: 'lock'; edge: string }        // at the path midpoint
  { kind: 'lock-mark'; card: string }   // at the ∅ stub's midpoint
  { kind: 'deps'; card: string }        // at the card's left edge, just above the topmost arrival slot (the band bracket stays clear)
  ```

  An SVG circle with a padlock path, stroke `--tl-frozen`. It sits next to a "+"/"−" badge when both apply, and has no pointer events (the arrow's wide hit stroke is under it).
- **Chips:** "dependencies frozen" (`tl-chip--frozen`); "frozen", shown only in high contrast.
- **Held** (FZ-4): a `link` glyph and the chip "held by “A”". Its colour is descriptionForeground, not the frozen colour, since held content is not frozen. It shows on vocabulary items in the band, on a card's statement field, and on review items that change held content (shown only under an FZ-5 allowance: "allowed change, held by …").
- **High contrast** (`body.vscode-high-contrast*`): `.tl-card__frost` hidden; the "frozen" chip shown; badges outlined with contrastBorder (FZ-11).

**Legend** (`legend.ts`): `LegendSwatch` gains `frozen`. Label "frozen"; title "Claude may not change it: a lock on frozen fields, arrows and marks; a whole frozen card also has an inner aura in its own colour. “held by …”: frozen Lean relies on it, so Claude may not change that either." The swatch is a lock glyph with the inset aura.

**Session banner** (2g SessionBar, a new second line, both views), text by `freezes.start.by` (FZ-11 table):
- "Only empty Lean statements at the selected arrows, the targets' proofs, and new arrows into the targets may change";
- "Whole model open: only your own freezes and the selected arrows are kept";
- "Everything except the selected cards is frozen" (`transform`, a slice-4 hook).

Each is followed by "· ‹N› cards frozen at the start · ‹m› by you · ‹k› standing".

**"May change" marks** (board marks what Claude may change):
- Only while a step runs in preset mode (`freezes.open`; null with the whole model open), D3U-15.
- Chips with `codicon-sparkle`: "Claude fills this" (empty statements at the selected arrows), "proof open" (target), "arrows may be added" (target, unless its question is the mark).

**Other subjects and diagnostics:**
- The Current view during a session shows the standing freezes, with the actions disabled.
- `board/diagnostics.ts themeColors` gains `frozen`; theme.test's whitelist gains `telelean.frozen` (a slice-3 colour list, literal fallback allowed).

## 5. FZ-12: "statements fixed"
- **User-facing:**
  - shadow commit label "Statements fixed (round N)" (shown in revert notices, manager.ts:808);
  - activity "Statements fixed (round N)" and "statements fixed again with it selected";
  - `TOOL_TITLES.freeze_statements` = "Fix statements";
  - webview `ACTIVITY_ICON.freeze` = `milestone` (never `lock`);
  - G4 tooltip "…the one fixed before the proof";
  - user-guide wording.
- The tool name `freeze_statements` stays (FakeBackend scripts, recorded streams).
- Its Claude-facing description and result say "fix"/"fixed", plus a system-prompt line: "freeze_statements only fixes this step's statements; FROZEN content is what the person froze". This is an open question for the runner and prompt area.
- A test greps the user-facing texts for "statements frozen".

## 6. Request cards (FZ-5)
```ts
// core run.ts, RunView (additive), like pendingQuestions: live during a step
pendingUnfreeze?: UnfreezeRequestView;
export interface UnfreezeRequestView {
  id: string;                       // RUN_TOKEN_PATTERN
  step: string; askedAt: string;
  what: string; why: string;        // Claude's words (AgentText)
  targets: Array<{ target: FreezeTarget | { kind: 'held'; name: string; by: string[] }; label: string; card?: string }>;
}
// core review/view.ts StageReportView (additive): requests open when their step ended (RV-10)
requests: Array<{ id: string; what: string; targets: UnfreezeRequestView['targets']; ended: 'cancelled' | 'failed' | 'step-ended' }>;
```

**Card** (`run/UnfreezeRequest.tsx`, shown with Claude's pending questions, §5.3 item 3; `data-undo-scope="session"`). The panel opens by itself. The RunBadge reads "Edit session: Claude asks to unfreeze · ‹subject›".
- Header: "Claude asks to change frozen content (step i of n: “T”)", then Claude's what and why.
- One row per target. Its state is derived live from `session.freezes`, never from RunView:
  - "frozen (you froze it / standing / accepted ‹item› / the session's start)";
  - "unfrozen now";
  - "held by “A”" with [Allow this change], or "allowed · [Withdraw]".
- Buttons:
  - **Select them:** switches to Proposed, puts every target in the selection (cards, fields, arrows, marks, vocabulary; a held declaration selects its vocabulary card or the card whose statement it is), and reveals the first. The person then uses the Context Menu's Unfreeze (FZ-6: mechanical).
  - **Continue:** sends `answerUnfreeze {answer:'continue'}`. The host tells Claude exactly which requested targets are unfrozen or allowed now. The tooltip lists them ("none" when none).
  - **Keep frozen:** enabled only while every target is still frozen and nothing is allowed; otherwise "You unfroze some of them: Continue tells Claude which." (D3U-11).
- **Allow this change** sends `sessionFreeze {op:'allow', subjects:[{kind:'held',name,request}]}`; Withdraw sends `disallow`. Allow is offered only on open requests; Withdraw is possible any time (D3U-12).
- Answering seals the session stack (`SealBy` gains `'answer'`, UN-5, D3U-6). Allowances and freezes before it can no longer be undone, but can be redone by hand.
- After a reload the card comes back, and its answer is delivered on Resume, as Claude's questions are.
- Requests left open when the step ends are listed in the stage report, with Select them.
- The request texts are an accepted residual channel, like questions (§4.7).

## 7. End confirmation and Exit (FZ-8, EN-2)
```ts
// core review/view.ts: SessionView.freezes (always computed; the Exit dialog reads it too)
export interface SessionFreezesView {
  start: { by: 'formalize' | 'formalize-whole-model' | 'transform'; cards: number };
  frozen: Record<FreezeKey, FreezeReasonView[]>;            // every key with an FZ-7 reason
  held: Record<FreezeKey, { by: string[]; allowed?: true }>;
  open: { fuzzy: string[]; proof: string[]; arrowsInto: string[] } | null;  // while a step runs, preset mode
  changes: FreezeChangeRow[];
  notFound: Array<{ key: FreezeKey; label: string }>;      // A6
}
export type FreezeReasonView = { kind: 'standing' } | { kind: 'start' } | { kind: 'accepted'; item: string }
  | { kind: 'own'; proposal?: string /* item id: Claude's proposal frozen */ } | { kind: 'transform' };
export interface FreezeChangeRow {
  row: string;                      // stable id (card id, `arrow:s>t`, `vocab:name`)
  label: string; card?: string;
  targets: FreezeTarget[];          // what one keep tick keeps
  change: 'frozen' | 'unfrozen';    // frozen now but not standing at the start / standing at the start but unfrozen now
  why: string[];                    // "you accepted Formalize “…”", "you froze it", "you unfroze a standing freeze", "created in this session"
  after: string;                    // without keep: "unfrozen after the session" | "frozen again after the session (standing)"
  keep: { apply: boolean; exit: boolean; reason?: string }; // Exit: only content in your files ("Claude's proposal is not in your files")
}
```

**The section "Freezes after the session":**
- Rows grouped by card, each with a [keep] tick. Ticked rows read "stays frozen (standing)" or "stays unfrozen".
- A "Keep all" checkbox.
- The line "The other ‹N› cards return to how they were (the session's starting freezes)".
- Rows are links (Show on board) and selectable.
- Ticks default off (FZ-8, D3U-25). They are kept in the webview state per runId (ES-6) and carried in `endSession { decision:'apply'|'exit', …, keep: FreezeTarget[] }`. The host refuses any target not in an offered row.
- The Exit dialog (D2-36) gains the same list with exit ticks only.
- **Kept freezes:**
  - At Apply they are written inside Apply's change set, so one board Undo takes the session back with them.
  - At Exit they become one board step after the run ends, "Keep ‹n› freezes from the session" (D3U-22).

## 8. Formalize's ▾ (ES-2, D3, D2-12)
- ContextSection's button becomes a split button: [Formalize for dependencies][▾].
- The ▾ menu holds two checkable items:
  - **Open the whole model**: "Claude may change any card, arrow, definition or vocabulary item that is not frozen; every change comes back as an item, belief and proof changes with their own Accept. Your standing freezes and the selected arrows still hold.";
  - **Claude may add cards** ("intermediate steps").
- While on, the ▾ also shows "Your standing freezes still hold (‹n›). To lift them: Unfreeze all other cards" (no new op).
- With the whole model on, the label reads "Formalize for dependencies (whole model)", and the title mentions both switches. The right-click Formalize entry uses the same state.
- Store: `formalizeOptions {runId|null, wholeModel, mayAddCards}`, persisted. The switches stay on for the session's mid-stage Formalizes and reset when `session` goes from a run to null, or when a different runId appears (D3U-18).
- They are sent as `formalize { …, options?: { wholeModel?: true; mayAddCards?: true } }`. The banner reads the session's recorded start mode.

## 9. Undo
**Board stack** (outside a session; UN-2):
- `setFreezes` maps to BoardAction `{ kind: 'set-freezes'; subject; op; subjects; confirmed? }`. Core `planAction` runs `planFreeze` on the standing file (PlanContext gains `freezes`) and returns an EditPlan with `changes: []`, a new optional sidecar `freezes?: { subject; file: FreezeFile }`, and `layoutOnly: true` (doc: "only telelean's sidecars change: undoable, not snapshotted").
- The runner's `materialisePlan` writes `.telelean/subjects/<S>/freezes.json`. `UndoStacks` records it: one step, labelled e.g. "Freeze: “X”", "Unfreeze 3 fields", "Freeze all other cards (12)". The toast offers Undo.
- No History snapshot, and freezes.json stays outside History's scope (neither snapshotted nor reverted, D3U-2). Undo applies the whole-file change backwards. The file is serialised one target per line, sorted, so patches rarely conflict; a conflict is refused with "freezes.json changed since: freeze or unfreeze by hand".
- An open question: the first freeze of a card with a derived id writes its `id:` line (Appendix B). That one plan changes a model file and is snapshotted.
- These steps are in-memory, like all board steps, and are lost on reload (the person can still freeze or unfreeze by hand).

**Session stack** (UN-4):
```ts
// core review/types.ts (additive)
export type SealBy = 'submit' | 'formalize' | 'retry' | 'answer';
// ReviewAction +
| { kind: 'freeze'; request: SessionFreezeRequest; plan: FreezePlan; values: Record<FreezeKey, FrozenValueRef>; confirmed: boolean }
| { kind: 'answer'; request: string; answer: 'continue' | 'keep-frozen' }   // seals
// SessionAction +
| { kind: 'freeze'; label: string; request: SessionFreezeRequest;
    before: SessionFreezeState; after: SessionFreezeState;              // whole state (coarse, D3U-4)
    changes: Array<{ item: string; before: ItemState; after: ItemState }>; at: string }
// 'decide' SessionAction gains: freezes?: { before: SessionFreezeState; after: SessionFreezeState } (ItemDecision.freeze)
// undo ReviewAction gains: freezeCheck: Record<FreezeKey, { now: string; frozen: string }> (content keys, from the runner)
```

**Rules:**
- **Undo restores `before`** (freeze state and item statuses) through slice 2's checks (RV-5, RV-7 and the rest). It is refused when a key it would freeze again no longer holds its recorded frozen value in the judged state: "“‹label›” changed since: freeze it again by hand (that freezes the new version)."
- **Redo re-sends `request`** through the reducer, with the values now (AF13).
- **During a step:** only freeze actions can sit above the queue's seal, so Undo or Redo is allowed exactly when the top is a freeze action. The view does not change during a step (D2-63), so the value check passes. Otherwise D2-62's text applies.
- **Seals:** answering a request seals (`answer`). Any new action clears Redo.
- `SessionView.undo` and `redo` become non-null during a step when the top is a freeze action. The webview's Undo button and Ctrl+Z read them through 2h's `undoScope`.
- The session stack is discarded at the end, and keep ticks become board state only at Apply or Exit.

**Why the stacks never interact:**
- `setFreezes` reaches only the board stack and only outside sessions (the host's ES-9 lock refuses it during one, before planning).
- `sessionFreeze` reaches only the session stack.
- The board stack is locked during a session (UN-3).
- Nothing moves between the stacks except kept freezes, inside Apply's step or Exit's own step after the session.

## 10. Protocol (core `protocol.ts`)
```ts
export type SetFreezesMessage = Envelope<'setFreezes', { op: FreezeOp; subjects: FreezeSubject[]; confirmed?: boolean; requestId?: string }>;
export type SessionFreezeMessage = Envelope<'sessionFreeze', { runId: string; stage: number; view: number; op: FreezeOp;
  subjects: FreezeSubject[]; unaccept?: boolean; confirmed?: boolean; requestId?: string }>;
export type AnswerUnfreezeMessage = Envelope<'answerUnfreeze', { runId: string; request: string; answer: 'continue' | 'keep-frozen'; requestId?: string }>;
// additive: endSession.keep?: FreezeTarget[]; formalize.options?: { wholeModel?: true; mayAddCards?: true };
//           decideItems.decisions[].freeze?: 'yours' | 'unfreeze'
```

**Validator rules:**
- **Fresh objects:** unknown fields are dropped.
- **`op`:** an enum.
- **`subjects`:** 1..LIMITS.freezeSubjects (2000), distinct by canonical key.
  - Card ids use `id()`; field names come from the CARD_FIELDS/VOCAB_FIELDS lists.
  - Lean names use a new `leanName()`: 1..LIMITS.leanName (1024), no control characters.
  - An arrow joins two different cards. An item needs a token and an integer rev. `held` needs a name and a request token.
- **`setFreezes`:** freeze, unfreeze and the two "others" ops only; never item or held subjects.
- **`allow`/`disallow`:** exactly held subjects. Other ops take no held subjects.
- **`unaccept`:** only with unfreeze-others.
- **`view`:** an integer 0..1e9. **`stage`:** 0..LIMITS.stages.
- **`keep`:** only with apply or exit, ≤2000, distinct FreezeTargets.
- **`options`:** only the two keys; true stays, false is dropped.
- **`freeze` on a decision:** only with `declined` + `reject`|`plain`.
- No `__proto__` keys anywhere.

**Routing lists:** `RUN_MESSAGE_TYPES` gains `sessionFreeze` and `answerUnfreeze` (never ES-9-locked). The extension's `ACTION_MESSAGE_TYPES` gains `setFreezes` (ES-9-locked).

**Host → webview (additive):**
- `TlGraph.freezes?: BoardFreezesView` `{ frozen: FreezeTarget[]; held: Record<FreezeKey,string[]>; notFound: Array<{key,label}> }`. Core `subjectGraph` builds it from the sidecar input. graph.json never exports it (FZ-3: Claude can neither see nor change freezes).
- `SessionView.freezes: SessionFreezesView`.
- `RunView.pendingUnfreeze?`.
- `StageReportView.requests`.
- `Gate.unfreeze?: FreezeTarget[]`.
- `parseHostToWebview` light checks: when present, `graph.freezes.frozen` is an array; `session.freezes.frozen` is an object and `changes` an array; `run.pendingUnfreeze.targets` is an array.
- `ActionOutcome`, needs-confirmation (additive): `freeze?: { standing?: number; own?: number; accepted?: number; fillingNow?: Array<{card: string; field: CardFieldName}>; versions?: Array<{card; item; label; offers; yoursDisabled?}>; frozenProposal?: Array<{item; card}> }`, plus slice 2's `cascade` and `hiddenResults`. The ok branch gains `freeze?: { left: Array<{ label: string; reason: string }> }`.

**Texts:** a new `core/src/freeze/texts.ts` `FREEZE_TEXTS` (every string quoted in this design, used verbatim). `review/texts.ts` gains `cascadeUnfreeze` and Undo labels: "Freeze: ‹x›", "Unfreeze: ‹x›", "Freeze all other cards (‹n›)", "Allow change: ‹name›", "Withdraw allowance: ‹name›", "Keep ‹n› freezes from the session".

## 11. Webview store (new `state/freeze.ts`, wired into store.ts and 2g's state/session.ts)
```ts
interface FreezeUi {
  selectedFields: readonly FieldRef[]; selectedVocab: readonly string[];
  formalizeOptions: { runId: string | null; wholeModel: boolean; mayAddCards: boolean };
  keep: { runId: string; rows: readonly string[] } | null;
  freezeBusy: string | null;   // requestId in flight
}
// PersistedState + formalizeOptions?, keep?
// DialogState +
| { kind: 'freeze'; op: FreezeOp; subjects: FreezeSubject[]; where: 'board' | 'session'; counts: FreezePlan['counts'];
    unaccept: boolean; fillingNow?: Array<{card: string; field: CardFieldName}>;
    versions?: Array<{ card: string; item: string; label: string; offers: Array<'proposal'|'yours'>; yoursDisabled?: string; choice: 'proposal'|'yours' }>;
    cascade?: CascadeEntry[]; hiddenResults?: true; left?: Array<{ label: string; reason: string }> }
| { kind: 'reject-frozen'; decisions: ItemDecision[]; items: Array<{ item: string; label: string; card: string }> }
// BoardActions +
freezeSelection(op: FreezeOp): void;           // preview -> dialog or post (setFreezes | sessionFreeze), never optimistic
selectField(ref: FieldRef, additive: boolean): void; selectVocab(name: string, additive: boolean): void;
confirmFreeze(answers: { unaccept?: boolean; versions?: Record<string, 'proposal'|'yours'> }): void;
answerUnfreeze(request: string, answer: 'continue'|'keep-frozen'): void;
allowHeldChange(request: string, name: string, allow: boolean): void;
selectRequestTargets(request: string): void;
setKeep(row: string, keep: boolean): void; setKeepAll(keep: boolean): void;
setFormalizeOption(option: 'wholeModel'|'mayAddCards', on: boolean): void;
// selectors: freezeContext(state, focusInSession) -> {where:'board'} | {where:'session',runId,stage,view,phase} | {where:'locked',reason};
//            freezeSource(state); cardFreezeLook (memoised per node)
```

**Changes elsewhere in the webview:**
- `Pending` gains `{kind:'freeze', op, subjects, where}`, which reopens the dialog on `needs-confirmation`.
- `MenuAction` and `ContextAction` gain freeze, unfreeze, freeze-others and unfreeze-others; `runBoardAction` routes them to `freezeSelection`.
- `ContextEntry` gains `badge?: string`.
- `applyGraph` and the `session` handler drop selected fields and vocabulary that no longer exist.

## 12. Extension host
- `actionMapping.toBoardAction` adds `setFreezes` → `set-freezes` with the board's subject.
- `boardSession.handle`: `sessionFreeze` and `answerUnfreeze` go to `enqueueRun` → RunManager:

  ```ts
  freeze(runId: string, r: { stage: number; view: number; op: FreezeOp; subjects: readonly FreezeSubject[]; unaccept?: boolean; confirmed: boolean }): Promise<ActionOutcome>;
  answerUnfreeze(runId: string, request: string, answer: 'continue' | 'keep-frozen'): Promise<ActionOutcome>;
  // end(...) + keep?: readonly FreezeTarget[]; formalize(r) + options?; decide(...) decisions carry `freeze`
  ```

  They are `not-yet` ("Not built yet (slice 3)") until the runner area lands.
- `finishRun` for session messages publishes the session and run before posting `actionResult` (D3U-23).
- `withDependentCards` also names the cards in `freeze.fillingNow`, `versions` and `frozenProposal`.
- Board edits are not queued behind run messages, and `sessionFreeze` waits only behind earlier run messages (D2-74 keeps that queue free during steps).

## 13. Assumed from other areas (proposed shapes; the integrator reconciles)
- **Model and storage:**
  - the `FreezeFile` sidecar (a per-subject `.telelean/subjects/<S>/freezes.json` with `{format,version,frozen: FreezeTarget[] with labels}`);
  - the session's `SessionFreezeState`: `{ standingAtStart: FreezeTarget[]; unfrozenStanding: FreezeKey[]; start: FreezeKey[]; own: Record<FreezeKey,{ value: FrozenValueRef; proposal?: string }>; allowed: Record<string,{ request: string }> }`. Accepted reasons are derived from item records and `acceptCovers`, never stored;
  - values read from the view's judged state;
  - FZ-8 restore with keep;
  - the A6 not-found list;
  - the delete plan removing records.
- **Check:** FZ-3 and FZ-4 on every judged state and in the backstop; held sets for the views.
- **Runner:**
  - request lifecycle and the step pause;
  - telling Claude in the next tool result;
  - records-only freeze writes allowed during a step (they never touch ws/ or the step's records);
  - `buildSessionView` input `freezes`, republished during a step;
  - `pendingUnfreeze`.
- **Deferrals:** Add, Change, Delete, Remove arrow, Proof broken and meaning-changed items and their detail views; whole-model and may-add-cards engine behaviour.

## 14. Tests (no real Claude; webview/extension vitest single worker; Playwright only by the integrator when RAM allows)
- **Core:**
  - `freeze/keys` (canonical keys, CARD_FIELDS);
  - `planFreeze`: expansion; the "others" rule (an arrow counts in both ends; vocabulary cards; items); counts; un-accept; versions per kind; hidden target proofs left; derived subjects refused; idempotence; webview preview = host plan for the same inputs;
  - `acceptCovers` per kind;
  - protocol validators (every rule above, fresh objects, `__proto__`, limits, the retired/forbidden combinations);
  - reducer: freeze/unfreeze/allow; cascade from un-accept; Undo restores the exact records of every generated sequence; Undo refused after the value changed; Redo through the reducer; seals stop Undo; during a step only freeze Undo; Reject with `freeze:'yours'|'unfreeze'` is one action; `needs-confirmation` without it.
- **Extension:**
  - `setFreezes` → `perform(set-freezes)`; refused with EDIT_SESSION_ACTIVE during a session (before planning);
  - `sessionFreeze` and `answerUnfreeze` → RunManager (not ES-9-locked); `session` posted before `actionResult`;
  - `keep` and `options` passed through;
  - a board Undo of a freeze step republishes the graph.
- **Webview unit:**
  - `freezeMenu` (entries, enablement, every disabled reason, labels "keep empty", icons);
  - `store-freeze`:
    - selection gestures;
    - routing by view and focus;
    - nothing posted from the Current view during a session;
    - dialogs and resends;
    - not optimistic (no lock before the host's message);
    - busy gating;
    - keep ticks persisted per runId;
    - options reset when a session ends;
  - `freezeLook` (whole, partial, keep-empty, held, start-only = no aura, accepted locks, open marks);
  - `edges` badges;
  - `legend`; `theme` whitelist;
  - request card states and buttons (Continue never posts a freeze);
  - session Undo during a step only for freeze tops;
  - the RV-6 fixed pairs (proved / not proved, results hidden) give byte-equal freeze views and equal lock DOM.
- **Playwright against the mock host harness** (harness gains the `--vscode-telelean-frozen` var; 2g adds `session`):
  - `s3-look.spec.ts`:
    - aura (computed inset shadow in the frozen colour), lock badges, field locks, Dependencies lock and chip, arrow and mark badges at midpoints;
    - keep-empty placeholders;
    - HC chip and no aura;
    - legend; banner texts per mode.
  - `s3-freeze.spec.ts`:
    - select, Freeze, Unfreeze, others with the dialog and counts, the posted payloads;
    - Alt-click and lock-slot selection; right-click field and vocabulary menus;
    - Undo toast posts `undo`.
  - `s3-session.spec.ts`:
    - Proposed-view freezes post `sessionFreeze` with stage and view; the Current view is disabled with its reason;
    - freezing during a step works, and the version dialog's "yours" is disabled then;
    - fillingNow dialog; request card flow; end confirmation keep ticks and the Exit list;
    - Formalize ▾ label and options;
    - "Statements fixed" with the milestone icon.
  - `s3-undo.spec.ts`: board vs session Undo routing; during a step only freeze Undo; sealed text after Continue.
- **Optional VS Code instance test:** a freeze persists across a reload.
- **sub_slices:**
  - [1]
    - **id:** 3U1
    - **scope:** Core contracts, protocol, planner and texts. Pure, one builder in core (serialised with the other areas' core sub-slices; best merged into the integrator's single slice-3 contracts sub-slice).
- Freeze types and keys (FreezeTarget, FreezeSubject, FreezeOp, FieldRef, CARD_FIELDS, `freezeKey`).
- `planFreeze` (expansion, the "all other cards" rule, counts, versions per item kind, left reasons, labels) and `acceptCovers` (RV-4).
- View types: BoardFreezesView, SessionFreezesView, FreezeReasonView, FreezeChangeRow, UnfreezeRequestView, `StageReportView.requests`, `Gate.unfreeze`.
- Additive fields: `TlGraph.freezes?`, `RunView.pendingUnfreeze?`, `ActionOutcome.freeze` (both branches), the `set-freezes` BoardAction kind and `EditPlan.freezes?`, `ItemDecision.freeze`.
- Type-only additions for 3U2: SealBy 'answer', ReviewAction and SessionAction 'freeze'/'answer'.
- Protocol: setFreezes, sessionFreeze, answerUnfreeze, `endSession.keep`, `formalize.options`, `decideItems` `freeze`; their validators, LIMITS (freezeSubjects, leanName), RUN_MESSAGE_TYPES, `parseHostToWebview` light checks.
- FREEZE_TEXTS; graph.json leaves freezes out.
    - **files:**
      - packages/core/src/freeze/types.ts
      - packages/core/src/freeze/keys.ts
      - packages/core/src/freeze/plan.ts
      - packages/core/src/freeze/covers.ts
      - packages/core/src/freeze/view.ts
      - packages/core/src/freeze/texts.ts
      - packages/core/src/freeze/index.ts
      - packages/core/src/index.ts
      - packages/core/src/protocol.ts
      - packages/core/src/actions.ts
      - packages/core/src/model.ts
      - packages/core/src/run.ts
      - packages/core/src/review/view.ts
      - packages/core/src/review/types.ts
      - packages/core/src/review/texts.ts
      - packages/core/src/export/graphJson.ts
    - **tests:** - core/test/freeze/keys.test.ts: canonical keys; unambiguous for Lean names with ':' and «»; CARD_FIELDS per kind.
- core/test/freeze/plan.test.ts:
  - expansion of each subject kind;
  - the "others" rule (selected arrows count in both end cards; vocabulary cards; item cards);
  - counts (standing/own/accepted/start); un-accept only with the tick or a plain Unfreeze;
  - FZ-10 offers per item kind;
  - a target's Proof left out while the results are hidden, with its reason;
  - derived subjects refused; `changes:false` when there is nothing to do;
  - the same plan from the webview's view data and the host's records.
- core/test/freeze/covers.test.ts: RV-4 per kind.
- core/test/protocol-freeze.test.ts: every validator rule (fresh objects, unknown fields dropped, duplicates, limits, op/subject combinations, keep only with apply/exit, options true-only, decision `freeze` only on reject or plain declines, `__proto__` keys) and the light host checks.
- contracts.test.ts: the new exports; graphJson has no freezes.
    - **risk:** Contract churn with the model, check and runner areas. Keep everything additive and optional, and record any change in the plan's change log. It conflicts with slice-2 core builders if slice 2 is not finished: run only after 2h.
  - [2]
    - **id:** 3U2
    - **scope:** Core reducer: freeze actions on the session stack (UN-4).
- `reduceReview` handles ReviewAction 'freeze': it applies the FreezePlan to SessionFreezeState with values from the runner, cascades un-accepts through slice 2's back-to-review logic, and records the SessionAction 'freeze' with the whole before/after state and the item changes.
- ReviewAction 'answer' records the 'answer' seal.
- 'decide' with `ItemDecision.freeze` ('yours' | 'unfreeze') updates the freeze state atomically with the Reject; without it, a Reject of a proposal you froze is `needs-confirmation` with `frozenProposal`.
- Undo restores the recorded effects after slice 2's checks plus the frozen-value check; Redo re-sends the request.
- During a step, the reducer accepts only freeze actions and Undo/Redo of a freeze top; `SessionView.undo` and `redo` follow (built in 2c2's view builder).
    - **files:**
      - packages/core/src/review/reducer.ts
      - packages/core/src/freeze/state.ts
      - packages/core/src/review/view.ts
    - **tests:** - core/test/review/reducer-freeze.test.ts:
  - Freeze, Unfreeze, the two "others" ops, allow and disallow, each one stack action with its label;
  - Unfreeze of accepted content returns the item and its accepted dependents to review (RV-5), recorded and undone together;
  - property test: Undo of every generated sequence restores the exact records (F4);
  - Undo refused when a re-frozen key's value changed since, with its text;
  - Redo through the reducer with today's values;
  - seals stop Undo ('answer' included), and a new action clears Redo;
  - during a step, a decide is refused (D2-62) while freeze and its Undo are allowed;
  - Reject with 'yours' or 'unfreeze' is one action; a Reject without it is needs-confirmation;
  - while the results are hidden, no event, label or cascade entry names a Result or a Result's part (D2-64).
    - **risk:** The reducer is 2a2's largest piece and the freeze state is the model area's, so the interface (FrozenValueRef, freezeCheck) must be fixed in 3U1 first. Medium risk of interaction bugs with slice 2's Undo rules; the property test is the guard.
  - [3]
    - **id:** 3U3
    - **scope:** Extension host routing.
- `setFreezes` becomes an action message (ACTION_MESSAGE_TYPES → `set-freezes` with the board's subject). The ES-9 lock refuses it during a session, before planning.
- `sessionFreeze` and `answerUnfreeze` are run messages through `enqueueRun`, calling the RunManager's `freeze` and `answerUnfreeze`. They answer `not-yet` ("Not built yet (slice 3)") until the runner area lands.
- `endSession.keep`, `formalize.options` and `decideItems` `freeze` are passed through.
- `finishRun` publishes session and run before `actionResult` for session messages.
- `withDependentCards` names the cards of `freeze.*` lists.
    - **files:**
      - packages/extension/src/logic/actionMapping.ts
      - packages/extension/src/logic/boardSession.ts
      - packages/extension/src/logic/runs.ts
    - **tests:** - extension/test/unit/boardSession-freeze.test.ts, with a fake workspace and RunManager:
  - `setFreezes` maps to `perform` and the outcome toast offers Undo;
  - refused with EDIT_SESSION_ACTIVE while a run is active, and while a start is on its way;
  - `sessionFreeze` and `answerUnfreeze` are never ES-9-locked and reach the RunManager with exact payloads;
  - the session message is posted before `actionResult` (order assertion);
  - keep, options and decision freeze are forwarded;
  - `not-yet` with no RunManager method;
  - a board Undo of a freeze step republishes the graph.
- actionMapping tests.
    - **risk:** Low. Depends only on 3U1's types and the RunManager signatures; keep the not-yet fallback so it can land before the runner area.
  - [4]
    - **id:** 3U4
    - **scope:** Webview selection, Context Menu, store and dialogs.
- `state/freeze.ts`: selectedFields and selectedVocab; FieldRef gestures (lock slot, Alt-click, Ctrl, Esc, right-click field and vocab menus, Shift+F10); vocabulary items selectable.
- `freezeContext`/`freezeSource` selectors, and `freezeEntries` in contextActions.ts and menu.ts (cardActions, arrow, mark, field and vocab menus), with every disabled reason. `runBoardAction` routing.
- `freezeSelection`: preview with `planFreeze`, then the dialog or the post. Never optimistic; `freezeBusy`.
- The combined freeze dialog (counts, also un-accept, versions, fillingNow, slice 2's cascade with `cascadeUnfreeze`) and the reject-frozen dialog. Resend on `needs-confirmation`.
- Item-selection fallback (D3U-28); the selection summary texts.
- `FieldLock.tsx` placed in NodeCard (sentence, Why), CardDetails (kind, stance, source, statement, proof, dependencies) and Vocabulary (declaration, gloss), selection behaviour only.
    - **files:**
      - packages/webview/src/state/freeze.ts
      - packages/webview/src/state/store.ts
      - packages/webview/src/board/contextActions.ts
      - packages/webview/src/board/menu.ts
      - packages/webview/src/board/runAction.ts
      - packages/webview/src/board/ContextMenu.tsx
      - packages/webview/src/board/BoardInput.ts
      - packages/webview/src/header/ContextSection.tsx
      - packages/webview/src/board/FieldLock.tsx
      - packages/webview/src/board/NodeCard.tsx
      - packages/webview/src/board/CardDetails.tsx
      - packages/webview/src/board/Vocabulary.tsx
      - packages/webview/src/dialogs/Dialogs.tsx
      - packages/webview/src/main.tsx
      - packages/webview/test/shared/graphs.ts
    - **tests:** - webview/test/unit/freezeMenu.test.ts: entries and enablement for cards, fields, vocab, arrows, marks, items and mixed selections; every disabled reason (Current view during a session, other subject, applying, provisional, already frozen, not frozen, preset only, hidden target proof, judging, premise draft); the "keep empty" label; icons and badges.
- webview/test/unit/store-freeze.test.ts:
  - selection gestures, and Esc clearing all kinds;
  - routing: setFreezes outside a session, sessionFreeze with runId, stage and view in the Proposed view or session focus, nothing from the Current view during a session (toast reason);
  - previewed dialogs and host needs-confirmation each resend once with `confirmed` and the choices; Cancel posts nothing;
  - 'yours' sends `decideItems` Reject with `freeze:'yours'`;
  - no lock is shown before the host's graph or session (not optimistic); busy blocks double sends;
  - stale selections are dropped on a new graph or session.
- contextActions.test.ts and menu.test.ts updated.
    - **risk:** Touches the same files 2g and 2h rewrite (store.ts, ContextSection, menu.ts, NodeCard, CardDetails): run strictly after 2h. NodeCard and CardDetails layout changes may shift slice-1 Playwright snapshots; list the affected specs.
  - [5]
    - **id:** 3U5
    - **scope:** The look (FZ-11).
- `telelean.frozen` in package.json; the theme whitelist and the packageJson test.
- board.css: `--tl-frozen`, `.tl-card__frost` inset overlay, lock badges, field locks, `tl-chip--frozen`, the high-contrast chip that replaces the aura, keep-empty placeholders, the held chain mark, may-change chips, reduced motion.
- `model/freezeLook.ts` (`cardFreezeLook`, vocabulary look).
- NodeCard and Vocabulary render the overlay, badges and chips.
- EdgeEngine and edges.ts: lock, lock-mark and deps badges through 2h's `setBadges` (merged with the +/− badges); Board.tsx feeds them.
- The legend's frozen entry and swatch; `diagnostics.ts themeColors`.
- 2g's SessionBar gets the banner line per start mode, with counts.
- The may-change marks while a step runs.
    - **files:**
      - packages/extension/package.json
      - packages/extension/test/unit/packageJson.test.ts
      - packages/webview/src/styles/board.css
      - packages/webview/src/model/freezeLook.ts
      - packages/webview/src/board/NodeCard.tsx
      - packages/webview/src/board/Vocabulary.tsx
      - packages/webview/src/board/EdgeEngine.ts
      - packages/webview/src/board/edges.ts
      - packages/webview/src/board/Board.tsx
      - packages/webview/src/header/legend.ts
      - packages/webview/src/header/Header.tsx
      - packages/webview/src/board/diagnostics.ts
      - packages/webview/src/run/SessionBar.tsx
      - packages/webview/test/harness/harness.js
    - **tests:** - webview/test/unit/freezeLook.test.ts:
  - whole versus partial; keep-empty only for individually frozen empty fields;
  - Dependencies; held with "and n more";
  - start-only freezes give no aura and no lock; accepted content gets locks, and the aura only when every field has a non-start reason;
  - open marks only in preset mode during a step;
  - while the results are hidden, no lock from a hidden Result or a target Proof.
- theme.test.ts, legend.test.ts, edges.test.ts (badge positions at midpoints and at the deps edge above the arrival slots; merged with +/−).
- Playwright s3-look.spec.ts in dark, light and hc:
  - the computed inset shadow uses the frozen colour and coexists with the blue and green glows and the diff halo;
  - lock badge, field locks, arrow and mark badges, the deps lock and chip;
  - the hc chip and no aura;
  - legend entry; banner texts.
    - **risk:** CSS stacking: the overlay must stay under content and handles, and above the background. The EdgeEngine badge layer is shared with 2h, so coordinate the `setBadges` shape. Rose must stay distinguishable from error red: check in the harness themes.
  - [6]
    - **id:** 3U6
    - **scope:** Session UI and Undo wiring.
- `run/UnfreezeRequest.tsx` request cards in RunPanel: Select them, Continue, Keep frozen enablement, Allow and Withdraw; RunBadge text; auto-open.
- The stage report's open requests.
- Item rows and details: lock slots, RV-4 hints, `Gate.unfreeze` Select them, meaning-changed items.
- End confirmation: the "Freezes after the session" list with keep ticks and Keep all, sent with Apply.
- Exit dialog: the list with Exit ticks only.
- Formalize ▾ split button (whole model, may add cards): label, title, the standing-freezes hint; options persisted and reset; sent with `formalize`.
- Undo: 2h's `undoScope` and UndoRedo buttons honour freeze tops during a step and the sealed text after an answer.
- Session fixtures with freeze states.
    - **files:**
      - packages/webview/src/run/UnfreezeRequest.tsx
      - packages/webview/src/run/RunPanel.tsx
      - packages/webview/src/run/RunBadge.tsx
      - packages/webview/src/run/review/ItemDetail.tsx
      - packages/webview/src/run/review/ReviewList.tsx
      - packages/webview/src/run/review/StageReport.tsx
      - packages/webview/src/run/review/EndConfirmation.tsx
      - packages/webview/src/dialogs/Dialogs.tsx
      - packages/webview/src/header/ContextSection.tsx
      - packages/webview/src/board/useFormalize.ts
      - packages/webview/src/state/session.ts
      - packages/webview/src/model/sessionBoard.ts
      - packages/webview/src/header/Header.tsx
      - packages/webview/test/shared/sessions.ts
    - **tests:** - Webview unit:
  - requestCard.test.ts: row states derived from `session.freezes`; Continue posts `answerUnfreeze` and never a freeze; Keep frozen disabled after any unfreeze or allowance; Allow and Withdraw post allow/disallow; Select them selects every kind and switches to Proposed.
  - endConfirmation-keep.test.ts: rows, ticks and Keep all; Exit offers only `keep.exit`; ticks persisted per runId and dropped for another run; Apply and Exit carry exact keep targets.
  - formalizeOptions.test.ts: label "(whole model)"; options posted; reset when the session ends or a new runId appears.
  - store-undo-freeze.test.ts: Ctrl+Z during a step posts `sessionUndo` only when `session.undo` is a freeze action; otherwise nothing, with D2-62's text; the sealed text after an answer.
- Playwright s3-session.spec.ts and s3-undo.spec.ts as described in the design.
    - **risk:** Depends on 2g and 2h component names and file layout (run/review/*); adjust the file list to what 2g actually built. RV-6 leaks through the Exit list or request rows while results are hidden are guarded by the fixed-pair tests.
  - [7]
    - **id:** 3U7
    - **scope:** FZ-12 rename, user guide, and the slice's browser runs.
- User-facing "statements frozen" becomes "statements fixed":
  - runner: the engine commit label, the manager's activity lines, TOOL_TITLES "Fix statements";
  - webview: the milestone icon for activity kind freeze, and the G4 tooltip.
- The Claude-facing description, result text and system-prompt line, per the open question's outcome.
- docs/user-guide.md: a "Frozen" section (freezing anywhere, field selection, the four actions, the look, request cards, keep ticks, Formalize ▾, the two Undo stacks), plus the rename.
- The integrator runs the s3 Playwright specs, and slice 1 and 2 specs affected by the NodeCard and CardDetails changes, one at a time when RAM allows.
    - **files:**
      - packages/runner/src/gate/engine.ts
      - packages/runner/src/run/manager.ts
      - packages/runner/src/llm/toolSchemas.ts
      - packages/webview/src/run/RunPanel.tsx
      - packages/webview/src/model/run.ts
      - docs/user-guide.md
    - **tests:** - Runner and webview tests that assert the renamed strings, updated.
- A grep test (webview unit plus a runner unit) that no user-facing text says "statements frozen", and that the activity icon for freeze is not 'lock'.
- If the Claude-facing text changes: the system-prompt fixture and the FakeBackend scripts that match result text.
- Playwright: the run panel shows "Statements fixed" with the milestone icon.
    - **risk:** Touches runner/run/manager.ts, which the slice-3 runner area also edits: schedule after it, or fold into its first sub-slice. Changing Claude-facing text affects recorded streams only if they match those strings (check).
- **open_questions:**
  - D3U-1 (my recommendation): standing freezes are board-stack steps, a BoardAction `set-freezes` planned as a sidecar-only EditPlan (`.telelean/subjects/<S>/freezes.json`, `layoutOnly` semantics: undoable, no History snapshot). FZ-9's "change no file" is read as "no model file". Alternative: a separate in-memory freeze stack in the webview or host. To reverse: replace the plan with that stack.
  - D3U-2: freezes.json stays outside History (neither snapshotted nor reverted), so a History revert never changes what is frozen. Alternative: include it in the subject's snapshot scope, so a revert restores old freezes. To reverse: let `isSubjectSidecarFile` count freezes.json.
  - D3U-3 (storage area decides): the first freeze of a card with a derived id writes its `id:` line (Appendix B) in the same board step. That one step is snapshotted, since it changes a model file. Alternative: key by the derived id without writing it, and list orphans after a hand edit (A6). That fails open until the person notices.
  - D3U-4: a session freeze action records the whole session freeze state before and after (coarse), plus the item statuses it changed. Undo restores it only when every re-frozen key still holds its recorded value; otherwise it is refused with "freeze it again by hand". Alternative: per-key deltas with repair.
  - D3U-5: freeze actions are allowed in phases step, interrupted, stage and confirming, and their Undo and Redo are allowed during a step (only freeze actions sit above the queue's seal then). Every other review action stays read-only (D2-62). Alternative: no Undo during a step.
  - D3U-6: answering an unfreeze request (Continue or Keep frozen) seals the session stack (`SealBy` gains 'answer'), as UN-5 lists. Alternative: no seal. That is safe too, since the inverse of a freeze change is always allowed by hand.
  - D3U-7 (narrowing of FZ-10): in the version dialog, "Your version (rejects the item)" is disabled while Claude's step runs, because a Reject changes the working copy (D2-62). Alternative: queue the Reject until the step ends (the withdrawn D2-3 machinery). To reverse: re-enable it once deferred decisions exist.
  - D3U-8 (narrowing of FZ-9): while the results are hidden, a target's Proof cannot be frozen (Freeze freezes the card's other fields and says so), and no view shows a freeze whose only reason is a hidden Result's or Result part's Accept. Alternative: freeze whatever the working copy holds, silently. The person would then freeze a proof they cannot see.
  - D3U-9: "Unfreeze all other cards" always confirms, with counts: standing, yours, and accepted with the "also un-accept" tick. Alternative: ask only when standing freezes would go (FZ-9's minimum); the un-accept tick then needs another place.
  - D3U-10: in the end confirmation, Freeze and Unfreeze only change the freeze list. An Unfreeze that would un-accept is refused ("Back to review first …"). Alternative: such an Unfreeze returns the session to the stage by itself.
  - D3U-11: "Keep frozen" on a request card is enabled only while every requested target is still frozen and nothing is allowed; Continue always reports the host's true state. Alternative: Keep frozen re-freezes what the person unfroze.
  - D3U-12: "Allow this change" is offered only on open request cards; withdrawing an allowance works any time, like Freeze. Alternative: allow from any held mark through the Context Menu.
  - D3U-13: the `telelean.frozen` colour is rose (dark #F07CB8, light #B4236E, hc #FF8FD2, hcLight #9E1A5F): never blue or green, and apart from the purple axiom stripe, orange propositions, teal vocabulary, amber highlight and the git diff colours. Alternative: a frost silver or slate, which reads as "disabled".
  - D3U-14: the aura is an inner overlay child (`.tl-card__frost`) with inset shadows, so it combines with the outer glows and halos. Partial freezes get no aura: field locks plus a "lock n" chip. Alternative: an aura for partial freezes too, at lower intensity.
  - D3U-15: during a session, starting freezes get no aura and no locks (banner only; per-field reasons in the details). Accepted content shows field locks. While a step runs in preset mode, the board marks what Claude may change. Alternative: a "Show frozen" toggle that puts the aura on start-frozen cards.
  - D3U-16 (model area decides): a whole-card freeze freezes every CF-2 field of the card at that moment (per-field records); the aura shows when every current field is frozen. Alternative: a card-level record that also covers fields a later kind change adds (Dependencies and Proof).
  - D3U-17: a field's lock slot selects the field and never freezes it directly; Freeze and Unfreeze come only from the Context Menu or right-click menu (FZ-6, the user's FROZEN 2). Alternative: clicking the lock toggles the freeze.
  - D3U-18: Formalize's ▾ switches stay on for the session's mid-stage Formalizes and reset when the session ends. They are kept in the webview state with the runId, so a reload keeps them. Alternative: reset after every Formalize.
  - D3U-19 (runner and prompt area decides): keep the Claude tool name `freeze_statements` (recorded streams, FakeBackend scripts). Rename only the user-facing words to "fixed" and the activity icon to `milestone`; also make its Claude-facing description and result say "fix", with a system-prompt line separating it from FROZEN. Alternative: rename the tool to `fix_statements` everywhere.
  - D3U-20: Freeze on a selected review item freezes what its Accept would cover (RV-4) at Claude's proposal; the item stays in review. Claude's proposed arrows are frozen through their item. Alternative: map items to their cards and always ask FZ-10's version question.
  - D3U-21: unfreeze requests travel in RunView (`pendingUnfreeze`), like Claude's questions, and their words are an accepted residual channel while the results are hidden (§4.7). Alternative: hold the request's words until the results are shown. The step would then pause with no explanation.
  - D3U-22: kept freezes are written inside Apply's change set (one Undo takes the session back with them). Exit's kept freezes become one board step after the session ("Keep n freezes from the session"). Alternative: Exit's kept freezes not undoable.
  - D3U-23: `sessionFreeze` carries `stage` and the SessionView version; a changed view gives `conflict`. The host posts `session` before `actionResult` for every session action. Alternative: no version check; the host freezes its current values.
  - D3U-25: keep ticks default off, so everything returns to its standing state (FZ-8). Alternative: default on for the person's own freezes.
  - D3U-28: with both a board selection and a review-item selection, freeze actions act on the board selection; the summary says so. Alternative: act on their union.
  - D3U-29 (small narrowing): in a stage, freezing waits while the working copy is re-checked (`judging`, after a Reject or a premise write), so a freeze never takes a value a pending revert is about to change. Alternative: queue the freeze behind the judge in the runner.
  - Ownership question for the integrator: `planFreeze` and `acceptCovers` (core `freeze/plan.ts`, `freeze/covers.ts`) are proposed in this area's 3U1, because the UI previews with them and the host enforces with them. Recommendation: keep them here, with the model area consuming them. Alternative: the model area writes them and 3U4 waits for them.
- **safety_notes:**
  - Freezes change only through the person's own gestures (Freeze, Unfreeze, the two "all other cards" actions, Allow/Withdraw, their Undo/Redo, Accept/decline statuses, keep ticks) and the host's FZ-8 restore at the session's end. The webview has no code path that posts setFreezes or sessionFreeze without a gesture. Tested: a store test spies on `post` across every `receive()` message kind and every dialog's Cancel path.
  - Continue on a request card never unfreezes anything. It only reports the host's mechanical state, so Claude may change content only because it is no longer frozen (the user's FROZEN 2). Tested in the webview (Continue posts only `answerUnfreeze`) and on the host (the RunManager computes the reported set from the freeze state, not from the button).
  - Not optimistic: no lock or aura appears, and none disappears, before the host's graph or session shows it, so the board never claims a protection the host did not record. Tested in the store (no view change until the host's message; refusal leaves the view unchanged).
  - The webview is untrusted. Every freeze message is validated into a fresh object (enumerations, limits, distinct canonical keys, no `__proto__`, op/subject combinations), and the host recomputes the plan from its own state with `planFreeze`. Webview previews are advisory. Tested: core validator tests; a host test that a forged subject (unknown card, another subject's card in a session, a hidden item) is refused or left with its reason.
  - ES-9: no freeze change on the Current view during a session, and none on any board of the folder. `setFreezes` is an action message that the host's lock refuses before planning. Tested in the extension unit test (during a run, and while a start is on its way) and the webview test (controls disabled with the reason, nothing posted).
  - The two Undo stacks never share a step:
- `setFreezes` reaches only the board stack, outside sessions;
- `sessionFreeze` reaches only the session stack;
- the board stack is locked during a session;
- kept freezes cross only at Apply (inside its step) or after Exit (its own step).

Tested: sequences in the extension and reducer tests; Playwright s3-undo checks Ctrl+Z routing by view and focus.
  - Undo never crosses Claude: queue starts and request answers seal, and during a step only freeze actions are undoable. Undo of an Unfreeze is refused when the content changed since, so Undo never re-freezes a value the working copy no longer has. Tested: the reducer property test and refusals.
  - RV-6 (meaning before proof):
- freeze views and freeze plans are built on the host from the masked model while the results are hidden;
- a target's Proof is not freezable then;
- no lock, reason, list row, label or cascade entry derives from a hidden Result or its parts;
- version dialogs never mention Results while they are hidden.

Tested: slice 2's fixed outcome pairs extended with freeze states give byte-identical SessionView JSON (freezes included), equal lock DOM, and equal ActionOutcomes for every freeze action.
  - "Freezes the version you see" (FZ-3, FZ-10): the host freezes the values of the judged state the person's view was built from, refuses a stale view (`conflict`), and posts the session before `actionResult`. In a stage, freezing waits while judging. Tested: host ordering test; store test of conflict handling; reducer test of the values passed.
  - Keep ticks: the host accepts only targets from rows it offered for that decision. At Exit, rows are offered only for content in the person's files, so Claude's proposals never become standing freezes through Exit. Tested: core validator plus host refusal of unoffered targets; webview test that Exit shows only `keep.exit` rows.
  - FZ-3's "Claude can neither see nor change": freezes are never exported to graph.json and never enter Claude's working copy. The protocol carries them only host to webview. Tested: a graphJson export test.
  - The UI never overstates protection:
- content frozen only by a step's preset shows no lock, and its Unfreeze says the step's limits still apply;
- held marks come only from the host's elaborated held sets;
- keep-empty is shown explicitly.

Tested in the freezeLook and freezeMenu unit tests.
  - Never colour alone: lock badges, chips ("frozen" in high contrast, "dependencies frozen", "kept empty", "held by"), a legend entry, and no dashing or translucency for frozen. Tested: legend.test, theme.test, and Playwright in the hc theme.
  - Resources and process: tests never call real Claude (FakeBackend, `TELELEAN_NO_REAL_CLAUDE=1`); no new dependencies (AP-5); webview test builds go to a scratch folder, never `packages/extension/dist`; Playwright and the VS Code suite only by the integrator, when RAM allows, one spec at a time.
