/**
 * Slice 2 (docs/slice2-plan.md section 0, "Texts"): every user-facing text the plan quotes, verbatim, shared by the
 * host (runner, extension) and the webview. A sub-slice that runs beside 2g reports a missing text instead of adding
 * it; the integrator adds it between sub-slices. ‹placeholders› are function parameters; a quoted card or item
 * (“‹T›”) gets its quotes here.
 *
 * `CLAUDE_SESSION_TEXTS` holds the texts the plan quotes for Claude (tool refusals, gate messages, turn lines, the
 * system prompt's new lines), which the person never reads on the board.
 *
 * A few texts the plan does not quote are builder 2a1's wording; each says so (docs/slice2-plan.md section 8).
 */
import type { DeclKind, DeclineOption, ItemKind, ItemMarker, ItemStatus, ResultFlag } from './types.js';

const joined = (items: readonly string[]) => items.join(', ');

// ---------------------------------------------------------------------------------------------
// Items: kinds, statuses, markers, flags, decline options (RV-1, RV-2, §5.5-5.7)

/** The kinds' short labels (`ItemView.label`, §2.3: "Formalize", "Add arrow", "Vocabulary term", "Definition", "Result" …). */
export const ITEM_KIND_LABELS: Readonly<Record<ItemKind, string>> = {
  add: 'Add',
  'add-premise': 'Add premise',
  'add-arrow': 'Add arrow',
  'remove-arrow': 'Remove arrow',
  formalize: 'Formalize',
  change: 'Change',
  delete: 'Delete',
  'vocabulary-term': 'Vocabulary term',
  declaration: 'Definition',
  result: 'Result',
  'proof-broken': 'Proof broken',
};

/** A declaration item's label by its DeclKind (`definition` is "Definition", as ITEM_KIND_LABELS.declaration). */
export const DECL_KIND_LABELS: Readonly<Record<DeclKind, string>> = {
  definition: 'Definition',
  instance: 'Instance',
  coercion: 'Coercion',
  presupposition: 'Presupposition',
  'vocabulary-change': 'Vocabulary change',
};

/** §5.5: the status as glyph and word, never colour alone. */
export const ITEM_STATUS_TEXTS: Readonly<Record<ItemStatus, { glyph: string; word: string }>> = {
  'in-review': { glyph: '●', word: 'in review' },
  accepted: { glyph: '✓', word: 'accepted' },
  declined: { glyph: '✗', word: 'declined' },
  'to-be-redone': { glyph: '↻', word: 'to be redone' },
  withdrawn: { glyph: '–', word: 'withdrawn' },
};
/** §4.7, §5.5: a Result while the results are hidden: a neutral row with no status. */
export const HIDDEN_RESULT_ROW = { glyph: '◌', word: 'result after the review' } as const;

export const ITEM_MARKER_TEXTS: Readonly<Record<ItemMarker, string>> = {
  updated: 'updated',
  'no-alternative-found': 'no alternative found',
  'seen-early': 'you saw this result early',
  'meaning-differs-in-place': 'meaning differs in place',
  'completion-not-checked': 'completion not checked',
  'unused-premise': 'unused premise',
  'adds-no-new-basis': 'adds no new basis',
  'sentence-lean-may-disagree': 'sentence and Lean may disagree',
  'no-longer-builds': 'no longer builds',
  'no-longer-closes-gap': 'no longer closes the gap',
};

/** §5.6: a shown Result's flags (S18, S21); "proved from nothing" carries "check what the statement says". */
export const RESULT_FLAG_TEXTS: Readonly<Record<ResultFlag, string>> = {
  'proved-from-nothing': 'proved from nothing',
  'replaces-your-proof': 'replaces your proof',
  'proves-changed-statement': 'proves a statement changed in this session',
};
export const PROVED_FROM_NOTHING_HINT = 'check what the statement says';

/** §5.7: the decline menu's entries. `plain` is the one "Decline" of an arrow item (DO-0). */
export const DECLINE_OPTION_TEXTS: Readonly<Record<DeclineOption, string>> = {
  plain: 'Decline',
  reject: 'Reject',
  shaky: 'Shaky',
  transform: 'Transform…',
};

// ---------------------------------------------------------------------------------------------
// Everything else the person reads

export const REVIEW_TEXTS = {
  // ---- refusals and conflicts (§2.3, §2.6, §3.5, §3.6, §3.8, §4.6, §5.1)
  /** D2-62: a review action while Claude's step runs (`refused`), and every review control disabled then. */
  stepRunning: "Claude's step is running: you can review when it ends.",
  /** A stale `rev`, `stage`, Undo `step` or check id (`conflict`). */
  conflict: (item: string) => `“${item}” changed since you looked at it: look again.`,
  /** §2.6: a failed run.json write at a write's step 1, or twice at its step 4. */
  saveFailed: (error: string) => `telelean could not save the session: ${error}`,
  /** 2c2: the host's `not-yet` answer to a valid message it does not route yet. */
  notBuiltYet: 'Not built yet (slice 2)',
  /** §3.6: un-reject refused, Claude proposed a newer version. */
  unrejectNewer: 'Claude proposed a newer version: review that one.',
  /** §3.6: un-reject refused, the inverse merge conflicts. */
  unrejectConflict: (file: string) => `This version can't be restored any more: ${file}.`,
  /** §3.6: un-reject of a Result or a Result's part while the results are hidden. */
  showResultsFirst: 'The results are not shown yet: show them first.',
  /**
   * §4.6 (2j1, D2-76, D2-84; it replaces D2-60's `contentTakenOut`): to be redone -> in review by hand, refused, its
   * content kept or taken out. The item comes back by itself with what took it down, or by Undo.
   */
  redoneByClaude: 'Claude redoes it at Submit review. To review it yourself now, set back to review what it depends on, or use Undo.',
  /**
   * §4.6 (fixer 2b1b r1, S-F5): un-reject of an item declined by a decision that also un-rejected another item. Its
   * inverse merge would take that other item's content out too, so it is refused: Undo undoes the whole decision.
   */
  unrejectMixed: (label: string) =>
    `“${label}” was declined in the same decision that un-rejected another item, so it cannot be un-rejected alone: undo that decision instead, then decide again.`,
  /** UN-5: Undo stops at the newest seal. */
  sealed: "Undo stops at Claude's step: it has already acted on what came before. To change an earlier decision, set the item's status directly.",
  /** §3.8, AF12: `holdAs: 'pending'` on an Add premise already written as an AXIOM card. */
  writtenAsAxiom: (sentence: string) => `“${sentence}” is already written as an axiom card: accept it as an axiom, or decline it.`,
  /** §3.8: a premise write that failed for another reason than a meaning mismatch (a stage problem). */
  premiseWriteFailed: (item: string, error: string) =>
    `“${item}” was accepted, but telelean could not write it: ${error}. Reload the window to try again, or decline it.`,
  /** §3.5: a record with no draft that no decision explains (a stage problem; Apply is disabled). */
  disappeared: (item: string) => `“${item}” disappeared, and no decision removed it`,
  /** D2-14: Transform in the decline menu, disabled until slice 4. */
  transformLater: 'The transform window comes with a later slice: use Reject, or Shaky to let Claude try something else.',

  // ---- ownership (§4.2, §4.10): an unowned difference (a stage problem, and the backstop's `unowned`)
  /** §4.10 `unowned`: "‹decl› changed, but no review item covers it." */
  unowned: (what: string) => `${what} changed, but no review item covers it.`,
  /** Builder 2a1's subjects for `unowned` when the difference is not a declaration (the plan quotes only the template). */
  unownedCard: (sentence: string) => `The card “${sentence}”`,
  unownedField: (field: string, sentence: string) => `The ${field} line of “${sentence}”`,
  unownedArrow: (source: string, target: string) => `The arrow “${source}” → “${target}”`,
  unownedText: (line: string, file: string) => `\`${line}\` in ${file}`,
  unownedBlock: (file: string) => `A telelean block in ${file}`,

  // ---- the end: the final check and the backstop (§2.1, §4.10)
  /** §2.1, §4.10 `facts`: F's facts lack valueConsts or typeConsts where they are needed (D2-25). */
  factsMissing: 'telelean could not see what the final statements rely on',
  /** §4.10 `not-accepted`. */
  notAccepted: (decl: string, item: string) => `${decl} belongs to ${item}, which is not accepted.`,
  /** §4.10 `not-written`. */
  notWritten: (item: string) => `“${item}” was accepted, but telelean has not written it: reload the window to write it, or decline it.`,
  /** §4.10 `content-changed`. */
  changedAfterAccept: (item: string) => `${item} changed after you accepted it.`,
  /**
   * The backstop's other refusals (§4.10; builder 2b2's wording: the plan quotes none). Each names what it refuses;
   * ‹item› is an item's label, ‹card› a card's sentence.
   */
  /** `own-accept`: Appendix B (a)-(c), accepted only with a group. */
  backstopOwnAccept: (decl: string, item: string) => `${decl} belongs to ${item}, which needs its own Accept, but it was accepted with a group.`,
  /** `class`: RV-7 on the final state, accepted only with a group. */
  backstopClass: (item: string) => `${item} needs its own Accept, but it was accepted with a group.`,
  /** `arrow`: an added arrow with no accepted Add arrow or Add premise. */
  backstopArrowAdded: (source: string, target: string) => `The arrow “${source}” → “${target}” was added, but no item you accepted adds it.`,
  /** `arrow`: a removed arrow with no accepted Remove arrow or Delete. */
  backstopArrowRemoved: (source: string, target: string) => `The arrow “${source}” → “${target}” was removed, but no item you accepted removes it.`,
  /** `arrow`: an arrow into an axiom card. */
  backstopArrowIntoAxiom: (source: string, target: string) => `The arrow “${source}” → “${target}” goes into an axiom card.`,
  /** `mark`: "follows from nothing" changed outside an accepted premise's mark removal. */
  backstopMark: (card: string) => `The "follows from nothing" mark of “${card}” changed, but no premise you accepted removes it.`,
  /** `b2` (B.2 restated on the final state): a card a proof uses directly with no arrow into its target. */
  backstopUnselected: (target: string, card: string) => `The proof of “${target}” uses “${card}”, which is not one of its arrows.`,
  /** `b2`: B.2's cross-check. */
  backstopUnseen: (target: string, card: string) => `The proof of “${target}” rests on “${card}” in a way its arrows do not show.`,
  /** `cycle` (B.3 restated): a new cycle of drawn and solid arrows, named. */
  backstopCycle: (cards: readonly string[]) => `The arrows, drawn and used by proofs, form a cycle: ${cards.map((c) => `“${c}”`).join(' → ')}.`,
  /** `kind` (B.4 restated), by the gate's token. */
  backstopKind: (token: string, card: string) => {
    switch (token) {
      case 'theorem-to-axiom':
        return `The proof of “${card}” became an axiom.`;
      case 'axiom-for-proposition':
        return `“${card}” is assumed by an axiom that no premise you accepted wrote.`;
      case 'type-changed':
        return `The proof of “${card}” proves another statement than its pending claim.`;
      case 'axiom-to-theorem':
        return `The claim of “${card}” became a proof, though no inference of this session proves it.`;
      default:
        return `There is a proof of “${card}”, which no inference of this session proves.`;
    }
  },

  // ---- cascades (§3.6, §5.12): the dialog's lead-ins; the board lists the items after them
  cascadeReject: 'These accepted items lose their Accept and are taken out to be redone:',
  cascadeShaky: 'These accepted items lose their Accept and will be redone:',
  cascadeBackToReview: 'These accepted items return to review with it:',
  /** D2-64: added to every confirmation that takes an Accept away while the results are hidden. */
  cascadeHiddenResults:
    'The results are hidden now: a result you accepted that rests on these loses its Accept too. You will see it when the results are shown.',
  /** §5.12: undoing an Accept. */
  cascadeUndoAccept: 'Undoing it also returns these accepted items to review:',

  // ---- the reveal (§4.5, §4.7, §5.4, §5.6, §5.8)
  resultAfterReview: 'result after the review',
  /** §4.5: a listed item with a hidden dependency. */
  waitsForResults: 'waits for the results to be shown',
  /** §4.6: a hidden Result left by a group decision. */
  resultsNotShown: 'results not shown',
  showResults: 'Show results',
  showClaudesActivity: "Show Claude's activity",
  /** §4.7: the dialog of Show results (and of Raw Lean diff… and Show Claude's activity). */
  showResultsConfirm: (undecided: number) =>
    `Show the results now? You have not decided ${undecided} statement and belief items. The results will be marked as seen early.`,
  /** §5.8: Raw Lean diff… while the results are hidden. */
  rawDiffReveals: "The raw diff shows Claude's proofs: opening it shows the results (noted as seen early).",
  /** §5.6: a hidden Result's detail. */
  hiddenResultDetail: (items: readonly string[]) => `The results are shown once you have decided every statement and belief item: ${joined(items)}.`,
  seenEarly: 'you saw this result early',

  // ---- Formalize: the start checks (§4.12) and the board's reasons (§5.11)
  /** Check 2 (D2-65); also Formalize's reason while the results are hidden (§3.2, §5.11). */
  formalizeResultsHidden: 'The results are not shown yet: decide the statements, or show the results, first.',
  /** Check 3: an arrow still in review (D2-20). */
  acceptArrowFirst: 'Accept this arrow first.',
  /** Check 3: a target with a Shaky item (D2-53). */
  shakyTarget: (target: string) => `“${target}” has items you declined as Shaky: Claude reworks them at Submit review.`,
  /** Check 3: a new target at the source of Claude's arrow into another target (D2-50). */
  claudeArrowSource: (source: string, target: string) =>
    `“${source}” is the source of Claude's arrow into “${target}”: select that arrow too, or decline it first.`,
  /** Check 1 (builder 2b2's wording; the protocol's validator refuses such a request too): a target asked twice. */
  askedTwice: (target: string) => `“${target}” is asked about twice: select its arrows once.`,
  /** Check 4, outside a session (as slice 1's `FORMALIZE_START_TEXTS.notProved`). */
  notProvedMarkPending: (source: string) => `“${source}” is not proved: mark it pending first.`,
  /** Check 4, in a session (AR-8: no pending mark during a session). */
  notProvedSelectArrows: (source: string) => `“${source}” is not proved: select the arrows into “${source}” too.`,
  /** Check 5 (D2-53). */
  shakySource: (source: string) => `“${source}”'s result is Shaky: Claude reworks it at Submit review; set it back to review to use it now.`,
  redoneSource: (source: string) => `“${source}”'s result is to be redone: select the arrows into “${source}” too, or Submit review first.`,
  formalizeStepRunning: "Claude's step is running: Formalize again when it ends.",
  formalizeConfirming: 'Back to review first.',
  formalizeCurrentView: 'During a session, Formalize asks about the Proposed view: switch to Proposed.',
  /** §5.11, the AR-8 question in a session. */
  notPendableInSession: (source: string) => `“${source}” is not proved; during a session it can't be marked pending.`,
  selectArrowsInto: (source: string) => `Select the arrows into “${source}” too`,
  formalizeForDependencies: 'Formalize for dependencies',

  // ---- steps, headings and the stage report (§3.2-3.4, §5.4, D2-59)
  /** ES-4. */
  didNotPass: (reason: string) => `Claude's step did not pass: ${reason}`,
  /** §5.8: the session bar's second line under that heading. */
  didNotPassBar: (text: string) =>
    `Claude's step did not pass: ${text}. You can decline, formalize again or exit; nothing can be accepted until a later step passes.`,
  stepCancelled: 'Step cancelled',
  stepFailed: (reason: string) => `Step failed: ${reason}`,
  /** A gave-up step's Result: not proved. */
  stepDidNotFinish: "Claude's step did not finish",
  /** A statements-only step's Result (A12, D2-4): not proved. */
  sourceNotProved: (source: string) => `“${source}” was not proved`,
  /** RV-13 (shown with the results). */
  proposedNothing: (reason: string) => `Claude's step proposed nothing: ${reason}`,
  /** §3.2: a re-ask that was not proved (shown with the results). */
  reaskNotProved: (target: string) => `The new question for “${target}” was not proved: your earlier result stands.`,
  /** D2-59: a source that left a question (shown with the results). */
  leftQuestion: (source: string, target: string) => `“${source}” left the question for “${target}”: you declined its arrow.`,
  /** §5.3: the steps' chips (never a verdict). */
  stepChips: { queued: 'queued', running: 'running', ended: 'ended', cancelled: 'cancelled', failed: 'failed', notRun: 'not run' },
  /** §5.4. */
  reportSummaryShown: (stage: number, targets: number) => `Stage ${stage} · ${targets} targets · results shown · consistency unchecked`,
  reportSummaryHidden: (stage: number, targets: number, toDecide: number) =>
    `Stage ${stage} · ${targets} targets · results after the review (${toDecide} items to decide) · consistency unchecked`,
  throughProof: (source: string) => `through ${source}'s proof (this session)`,
  notNeeded: 'Not needed',
  whatIsMissing: 'What is missing',
  selectTooHint: (card: string, target: string) => `select ${card} → ${target} too`,
  selectTheseArrows: 'Select these arrows',
  consistencyUnchecked: 'Consistency unchecked',
  consistencyUncheckedLower: 'consistency unchecked',
  assumedWithoutAsking: 'Assumed without asking',
  askMeInstead: 'Ask me instead',
  askMeAbout: (choice: string) => `Ask me about: ${choice}`,

  // ---- the panel (§5.3) and the list (§5.5)
  panelLabel: 'Edit session',
  inferenceArrows: (target: string, arrows: number) => `“${target}” ← ${arrows} ${arrows === 1 ? 'arrow' : 'arrows'}`,
  inferenceFromNothing: (target: string) => `“${target}” ← follows from nothing`,
  /** §3.12: the run panel while a step runs. */
  progress: (target: string, index: number, of: number, toolCalls: number, checks: number) =>
    `Claude is working on “${target}” (step ${index} of ${of}): ${toolCalls} tool calls · ${checks} checks`,
  eventsLead: 'Since your last action:',
  rejectedInSession: 'Rejected in this session',
  counts: (inReview: number, accepted: number, declined: number, toBeRedone: number) =>
    `${inReview} in review · ${accepted} accepted · ${declined} declined${toBeRedone > 0 ? ` · ${toBeRedone} to be redone` : ''}`,
  onlyInReview: 'Only in review',
  selectAllInReview: 'Select all in review',
  acceptN: (n: number) => `Accept ${n}`,
  acceptKOfN: (k: number, n: number) => `Accept ${k} of ${n}`,
  declineEllipsis: 'Decline…',
  /** §5.5: the note after a group Accept, its parts joined by " · ". */
  leftNote: (parts: readonly string[]) => `Left ${parts.length}: ${parts.join(' · ')}`,
  leftOwnAccept: (item: string) => `${item} needs its own Accept (belief)`,
  leftDepends: (item: string, dependency: string) => `${item} depends on ${dependency} (in review)`,
  leftHiddenResult: (item: string) => `${item}: results not shown`,
  /** Builder 2a1's wording (the plan quotes no text for these two reasons). */
  leftBlocked: (item: string) => `${item} can't be accepted now`,
  leftNotInReview: (item: string) => `${item} is not in review`,
  vocabularyGroup: (n: number) => `Vocabulary (${n})`,
  vocabularyAccepted: (k: number, n: number) => `${k} of ${n} accepted`,
  definitionsGroup: 'Definitions',
  badgeBelief: 'belief',
  badgeChangesProved: 'changes what is proved',
  badgeDependsOn: (n: number) => `depends on ${n}`,
  /** §4.5: SCC members accepted one by one. */
  acceptedTogetherWith: (items: readonly string[]) => `accepted together with ${joined(items)}`,
  allItems: '◀ All items',

  // ---- the item detail (§5.6)
  position: (index: number, of: number) => `${index} of ${of}`,
  showOnBoard: 'Show on board',
  fullyExplicit: 'Fully explicit',
  whatTheLeanUses: 'What the Lean uses',
  mentionedBy: 'Mentioned by',
  closesGapChecked: 'closes the gap (checked)',
  mayRestateTarget: 'may simply restate the target',
  replacesFromNothing: 'replaces follows from nothing',
  completionNotChecked: 'completion not checked',
  meaningDiffersWritten: 'meaning differs where it was written',
  addsNoNewBasis: 'adds no new basis',
  relyOnIt: 'Your statements rely on it:',
  reproveWithFormalize: 'Re-prove it with Formalize for dependencies',
  previousProposal: 'Previous proposal',
  accept: 'Accept',
  acceptAndNext: 'Accept & next',
  declineMenu: 'Decline ▾',
  backToReview: 'Back to review',
  selectThem: 'Select them',
  acceptedFooter: '✓ Accepted · Back to review',
  declinedFooter: (option: string) => `✗ Declined (${option}) · Back to review`,
  acceptNotProved: (target: string) => `Accept the outcome: “${target}” stays as it was`,
  holdAsQuestion: (sentence: string) => `How do you hold “${sentence}”?`,
  holdAsAxiom: 'As an axiom (you hold it)',
  holdAsPending: 'As a proposition, pending proof (assumed until proved; never green)',

  // ---- the decline menu (§5.7)
  declineArrow: 'The arrow is taken away at once; results that use it are redone.',
  rejectResult: 'keeps the previous proof; Claude may not offer this exact proof again',
  shakyResult: 'Claude tries again at Submit review',
  noteForClaude: 'Note for Claude (optional)',
  /**
   * 2j2 (D2-92, D2-94): the decline menu's confirm button once an option is chosen: "Decline (Reject)", "Decline
   * (Shaky)", and an arrow item's "Decline".
   */
  declineConfirm: (option: DeclineOption) => (option === 'plain' ? DECLINE_OPTION_TEXTS.plain : `${DECLINE_OPTION_TEXTS.plain} (${DECLINE_OPTION_TEXTS[option].replace('…', '')})`),
  /** 2j2 (D2-92): a decided item's note in the detail: "Note for Claude: ‹note›" (the label before the note). */
  noteLabel: 'Note for Claude',
  /** 2j2 (D2-92, D2-95): the footer of an item to be redone: its note's button, and the editor's buttons. */
  noteForClaudeEdit: 'Note for Claude…',
  noteSave: 'Save',
  noteCancel: 'Cancel',
  /** 2j2 (D2-95): the `note` action on an item that is not to be redone. */
  noteOnlyRedo: 'Only an item to be redone takes a note here; a decline takes its note in the decline menu.',
  reviewItems: (n: number) => `${n} review item${n === 1 ? '' : 's'}`,

  // ---- Submit review (§3.7, §5.8)
  submitReview: 'Submit review',
  /** §3.7: a cycle whose members are partly accepted. */
  acceptOrRejectTogether: (items: readonly string[]) => `Accept or reject all of ${joined(items)} together.`,
  submitToConfirm: 'Leads to the end confirmation: every item is accepted or rejected (no Claude step)',
  submitSteps: (shaky: number, redo: number) => `Starts Claude's next steps for ${shaky} Shaky items and ${redo} to be redone; accepted items carry over`,
  /** 2j2 (D2-92, D2-98): Submit's panel when it starts Claude's steps: the comment field, and its buttons. */
  commentForClaude: 'Comment for Claude (optional)',
  submitPanelSubmit: 'Submit',
  submitPanelCancel: 'Cancel',
  /** 2j2 (D2-92, D2-96): the stage report's line for the comment given at the Submit review that started the stage. */
  reportComment: (stage: number) => `Your comment at Submit review (stage ${stage}):`,
  goToFirst: 'Go to the first one',

  // ---- the session bar (§5.8), the badge and RunElsewhere
  sessionTitle: (targets: readonly string[]) =>
    targets.length === 1 ? `Edit session · Formalize for dependencies: “${targets[0]}”` : `Edit session · Formalize for dependencies · ${targets.length} targets`,
  stage: (n: number) => `Stage ${n}`,
  stepPhase: (target: string, index: number, of: number, state: string) => `Claude's step for “${target}” (${index} of ${of}): ${state}`,
  stepWorking: (stage: 'formalise' | 'prove') => `working · ${stage === 'formalise' ? 'formalising' : 'proving'}`,
  stepWaiting: 'waiting for your answer',
  stepChecking: "checking Claude's result",
  reviewWaits: 'The review waits until the last step ends.',
  reviewPhase: (inReview: number, accepted: number, resultsHidden: boolean) =>
    `Review: ${inReview} in review · ${accepted} accepted${resultsHidden ? ' · results after the review' : ''}`,
  confirmingPhase: 'Confirm the end of the session',
  interruptedPhase: 'Interrupted: the window reloaded while Claude was working',
  cancelStep: 'Cancel step',
  resume: 'Resume',
  retryStep: 'Retry step',
  rawDiff: 'Raw Lean diff…',
  cancelStepRest: (n: number) => `Cancels this step and the ${n} after it; Retry step runs them later.`,
  exitSessionEllipsis: 'Exit session…',
  reviewN: (n: number) => `Review (${n})`,
  drift: (files: readonly string[]) =>
    `Your files changed since the session started: ${joined(files)}. Apply stays disabled until they match again (undo those edits in the editor), or until you exit the session.`,
  judging: 'Re-checking the working copy…',
  badgeWorking: (subject: string, checks: number, maxChecks: number) => `Edit session: Claude working · ${subject} · ${checks}/${maxChecks} checks`,
  badgeReview: (subject: string) => `Edit session: review · ${subject}`,
  runElsewhere: (subject: string) => `An edit session is active on ${subject}: the boards of this folder are read-only until it ends.`,
  showIt: 'Show it',

  // ---- the end confirmation, Apply and Exit (§3.10, §5.9)
  changesN: (n: number) => `Changes (${n})`,
  rejectedNotApplied: (n: number) => `Rejected, not applied (${n})`,
  notRun: 'not run',
  endorseTitle: 'Definitions and presuppositions you endorse',
  finalCheck: 'Final check',
  finalCheckRunning: 'build · checks · backstop',
  finalCheckPassed: 'every check passed on exactly this state; every new assumption, definition and instance was accepted individually',
  fileChecksReused: 'file checks reused the last result',
  apply: 'Apply',
  applyWrites: 'Writes the changes as one history entry and one Undo step',
  applyRecords: 'Records the outcome: nothing in your files changes',
  exitConfirm: (accepted: number, inReview: number, stepRunning: boolean) =>
    `Exit the edit session? This discards ${accepted} accepted items and ${inReview} items in review${stepRunning ? ", and stops Claude's step" : ''}. Your files are not changed; your answers to Claude's questions stay recorded. Exit cannot be undone.`,
  exitSession: 'Exit session',
  back: 'Back',
  applied: "Applied: the session's changes are in your files. One Undo takes the whole session back.",
  /** 2k1 (D2-100 D2, D2-105): the runner's Exit notice, and the run panel's line once a session ended by Exit. */
  exited: "You exited the edit session: your files were not changed. Your answers to Claude's questions stay recorded.",
  /** §3.10, D2-67: Apply's history label (M2's kind `accept-proposal`). */
  applyLabel: (targets: readonly string[]) => `Apply: Formalize for dependencies → ${joined(targets)}`,
  /** §3.10 step 4 (coverage audit G1; builder 2f): History's entry for an Apply, the heading of Claude's arrows it wrote. */
  arrowsFromClaude: 'Arrows from Claude',
  /** §3.10 step 4 (G1; builder 2f): one of them, "‹source› → ‹target› (step ‹n›)"; `step` is the step's id (`s3` reads "step 3"). */
  arrowFromClaude: (source: string, target: string, step: string) => `${source} → ${target} (step ${step.replace(/^s(?=\d)/u, '')})`,

  // ---- the Proposed view in a session (§5.10)
  markNewInReview: '+ new · in review',
  markLabel: (glyph: string, label: string, status: string) => `${glyph} ${label} · ${status}`,
  arrowAccepted: "Claude's arrow, accepted: written to your files at Apply",
  claudeSuggests: 'Claude suggests',
  reviewIt: 'Review it',
  openInEditorTip: "Opens your file; Claude's version is in the raw diff",
  openInEditorDisabled: "Claude's version is in the raw diff",
  legendProposed: 'proposed by Claude: + adds, − removes',
  showReviewItem: 'Show its review item',

  // ---- session Undo (§5.12)
  undoAccept: (label: string) => `Accept: ${label}`,
  undoAcceptN: (n: number) => `Accept ${n} items`,
  /** "Decline: ‹label› (Reject)"; builder 2a1: the option word in brackets, none for an arrow's plain decline. */
  undoDecline: (label: string, option: DeclineOption) =>
    option === 'plain' ? `Decline: ${label}` : `Decline: ${label} (${DECLINE_OPTION_TEXTS[option].replace('…', '')})`,
  undoBackToReview: (label: string) => `Back to review: ${label}`,
  /** "Accept: Add premise ‹card› (as an axiom)"; builder 2a1: "(pending proof)" for the other hold-as choice. */
  undoAcceptPremise: (card: string, holdAs: 'axiom' | 'pending') => `Accept: Add premise ${card} (${holdAs === 'axiom' ? 'as an axiom' : 'pending proof'})`,
  undoMove: (card: string) => `Move: ${card}`,
  /** 2j2 (D2-92, D2-95): a note on an item to be redone, set, replaced or cleared. */
  undoNote: (label: string) => `Note for Claude: ${label}`,
  /** UN-1, D2-38: the board's Undo during a session. */
  boardUndoLocked: "Your files can't change during an edit session; Undo in the Proposed view undoes your review steps.",

  // ---- builder 2a2's wording (the plan quotes no text for these; docs/slice2-plan.md section 8, builder 2a2)
  /** RV-5: an Accept whose dependencies outside its cycle are not all accepted (the gate's reason; "Select them"). */
  acceptNeedsDependencies: (item: string, missing: readonly string[]) =>
    `${item} depends on ${joined(missing)}: accept ${missing.length === 1 ? 'it' : 'them'} first.`,
  /** §4.5: an Accept that waits for the results (a dependency on a Result's part while the results are hidden). */
  acceptWaitsForResults: (item: string) => `${item} waits for the results to be shown.`,
  /** ES-4: an Accept under the "did not pass" heading. */
  acceptDidNotPass: "Claude's step did not pass: nothing can be accepted until a later step passes.",
  /** RV-7, §5.5: the group note's reason for an item that changes what is proved (`leftOwnAccept` says "(belief)"). */
  leftOwnAcceptProved: (item: string) => `${item} needs its own Accept (changes what is proved)`,
  /** §3.8: an Add premise's Accept without the hold-as choice (it is never defaulted). */
  holdAsMissing: (sentence: string) => `Choose how you hold “${sentence}”: as an axiom, or as a proposition pending proof.`,
  /** DO-0: the plain decline is the arrow items' only option, and theirs alone. */
  plainOnlyArrows: (item: string) => `${item}: only an arrow item is declined without an option; choose Reject or Shaky.`,
  /** §4.6: a declined item declined again (its option changes only through Back to review). */
  declinedAlready: (item: string) => `${item} is declined already: set it back to review first.`,
  /** §4.6: a withdrawn item set back to review (only a later proposal of the same key brings it back). */
  withdrawnStays: (item: string) => `${item} was withdrawn by Claude's step: it comes back only when Claude proposes it again.`,
  /** §5.12, a group's stack labels. */
  undoDeclineN: (n: number, option: DeclineOption) =>
    option === 'plain' ? `Decline ${n} items` : `Decline ${n} items (${DECLINE_OPTION_TEXTS[option].replace('…', '')})`,
  undoBackToReviewN: (n: number) => `Back to review: ${n} items`,
  undoDecideN: (n: number) => `Decide ${n} items`,
  undoMoveN: (n: number) => `Move: ${n} cards`,
  /** A CascadeEntry's `why` (§2.3). */
  cascadeWhy: (item: string) => `it depends on ${item}`,
  /** D2-23: an accepted item whose badges grew. */
  cascadeWhyOwnAccept: 'it now needs its own Accept',
  /** Events (§2.3 `SessionView.events`): lead-ins, each followed by its linked items. */
  eventRedoneWith: 'To be redone with it, since they depend on it:',
  eventBadgesGrew: 'Back in review, since they now need their own Accept:',
  eventDependencyNotAccepted: 'Back in review, since something they depend on is not accepted:',
  eventChanged: 'Changed in the working copy, so back in review:',
  eventChangedWith: 'Back in review with them, since they depend on them:',
  eventRedoneAtOnce: 'To be redone at once, since they depend on items to be redone:',
  eventNoLongerBuilds: 'No longer build, so telelean took them out to be redone:',
  eventNoLongerPasses: 'No longer pass their checks, so telelean took them out to be redone:',
  eventNoLongerClosesGap: 'No longer close the gap, so they are to be redone:',
  eventWithdrawn: "Withdrawn by Claude's step:",

  // ---- fixer 2a's wording (the plan quotes no text for these; docs/slice2-plan.md section 8, fixer 2a round 1)
  /** `conflict` for a known item: its label already quotes what it names (`Formalize “T”`), so no quotes are added. */
  conflictLabel: (label: string) => `${label} changed since you looked at it: look again.`,
  /** `conflict` for an Undo or Redo whose action is no longer the one the stack would act on. */
  historyChanged: 'The review changed since you looked at it: look again.',
  /** RV-11 (V2A-S5): a Result's Accept before telelean judged it (its record has no `judged`). */
  resultNotJudged: (item: string) => `${item} has not been checked yet: wait for the check to finish.`,
  /** ADV-3: an Accept of an item whose declarations have no facts in the judged state (their file did not build). */
  acceptFactsMissing: (item: string) => `${item} can't be checked now: its file did not build. Wait for the check to finish.`,
  /**
   * §2.1, AP30-5 (2b2): an Accept in a stage whose probe failed: `probeFailure`'s sentence, then what to do. No check
   * is coming that would lift it (the same files fail the same way).
   */
  acceptProbeFailed: (sentence: string) => `${sentence} Decline what caused it, or Exit.`,
  /** §2.1 (2b2): the stage's `facts` problem when the judged state's probe failed: `probeFailure`'s sentence, then this. */
  factsProbeFailed: (sentence: string) => `${sentence} Apply stays disabled until telelean can read it.`,
  /** RV-8, DO-0 (V2A-N2): a group's plain decline leaves an item that is no arrow item. */
  leftNeedsOption: (item: string) => `${item} needs Reject or Shaky: only arrow items are declined without an option`,
  /** RV-11 (V2A-S1): accepted Results whose verdict, Rests on or dependencies changed. */
  eventResultChanged: 'Checked again with another outcome, so back in review:',
  /** §3.5 (V2A-C2): declined, withdrawn or taken-out items that a step of the queue proposed again. */
  eventProposedAgain: "Proposed again by Claude's step, so back in review:",
  /** §3.5 (V2A-C2, fail closed): declined or taken-out items whose content came back without a step proposing it. */
  eventTakenOutAgain: 'Back in the working copy although declined or taken out, so telelean took them out again:',

  // ---- builder 2c2's wording (the plan quotes no text for these; docs/slice2-plan.md section 8, builder 2c2): the
  // session view's gates and lines (`buildSessionView`)
  /** Back to review on an item that is in review already (its `review` gate: nothing to go back to). */
  inReviewAlready: (item: string) => `${item} is in review already.`,
  /** §3.7, RV-12: Submit review while listed items are in review (the gate's `missing` lists them, "Go to the first one"). */
  submitInReview: (n: number) => `${n === 1 ? '1 item is' : `${n} items are`} still in review: decide ${n === 1 ? 'it' : 'them'} first.`,
  /** §3.4: Retry step with no cancelled or failed step to run again (`retry` is empty). */
  nothingToRetry: 'There is no cancelled or failed step to run again.',
  /** §3.10: phase `applying`: every control waits for Apply to end. */
  applyingNow: 'Apply is running: the session ends when it is done.',
  /** §5.9: Apply while the final check runs. */
  applyWaitsForCheck: 'Apply waits for the final check to finish.',
  /** §5.9: Apply after the final check failed (the failures are listed). */
  applyCheckFailed: 'The final check failed: Apply stays disabled. The failures are listed here.',
  /**
   * §2.3 StepView `outcome`, shown with the results: a step whose gate passed, proved or not (its Result's verdict says
   * which), so it reads as no verdict (fixer 2c2 r1, A-V2C2-ADV-9: "passed its checks" read as a green beside a target
   * that was not proved).
   */
  stepPassed: "Claude's step finished",
  /** §2.3 StepView `outcome`, shown with the results: a statements-only step (A12, D2-4). */
  stepStatementsOnlyOutcome: (source: string) => `Claude's step formalised the statements only: “${source}” was not proved`,
  /** §5.4 "What is missing": a card the proof uses whose arrow into the target is not drawn. */
  drawTooHint: (card: string, target: string) => `draw ${card} → ${target}, then select it too`,
  /** §2.3 ItemView `classes.reasons`: a class that is incomplete (D2-25). */
  classIncomplete: 'telelean could not see everything it relies on, so it counts as a belief',

  // ---- 2j1 (D2-76, the user's decision of turn 25; builder 2j1's wording where the decision gives an example, D2-82,
  // D2-83): the automatic return's events and why an item is to be redone (`ItemView.redo.why`)
  /** §4.6's automatic return (D2-82): items back in review with what took them down. */
  eventBackWith: 'Back in review with it, since they depend on it:',
  /** The same, for items that kept a Shaky decline while a Reject cascade took them out: back to declined Shaky. */
  eventBackShakyWith: 'Back to Shaky with it, since they depend on it:',
  /** D4: one line of `ItemView.redo.why`: "↻ to be redone: ‹why›". */
  redoLine: (why: string) => `${ITEM_STATUS_TEXTS['to-be-redone'].glyph} ${ITEM_STATUS_TEXTS['to-be-redone'].word}: ${why}`,
  /** D4: one listed cause, "it depends on ‹label›, ‹state›" (`redoCauseState`). */
  redoDependsOn: (label: string, state: string) => `it depends on ${label}, ${state}`,
  /** D4: the cause's state: "declined Shaky", "rejected", "declined" (an arrow's plain decline), else its status word. */
  redoCauseState: (status: ItemStatus, option?: DeclineOption): string =>
    status === 'declined' ? (option === 'shaky' ? 'declined Shaky' : option === 'reject' ? 'rejected' : 'declined') : ITEM_STATUS_TEXTS[status].word,
  /** D4: when no listed item caused it, "telelean took it out: ‹reason›" (the reasons below). */
  redoTookOut: (reason: string) => `telelean took it out: ${reason}`,
  /** The judge's reverts (§3.6): its declarations no longer build ("no longer builds" marker). */
  redoReasonBuilds: 'it no longer builds',
  /** A premise re-check (§3.8): "no longer closes the gap" marker. */
  redoReasonGap: 'it no longer closes the gap',
  /** The judge's reverts (§3.6): a Result whose inference fails B.1, B.2 or its footprint. */
  redoReasonChecks: 'it no longer passes its checks',
  /** The judge's reverts (§3.6): a dependent of what the judge took out. */
  redoReasonJudged: 'something it depends on no longer builds or passes its checks',
  /** Submit's take-out (D2-57). */
  redoReasonTakeOut: 'another step of Submit review reworks what it depends on',
  /** RV-3 at a queue's end (§3.5). */
  redoReasonQueue: 'it depends on items that are Shaky or to be redone',
  /** DO-0's question change (D2-59, D2-81): ‹source›, the arrow's source card. */
  redoReasonQuestion: (source: string) => `“${source}” left its question when you declined its arrow`,
  /** A cascade whose listed causes are all hidden while the results are (D2-64): none is named. */
  redoReasonHidden: 'it depends on items that are shown with the results',
  /**
   * A cascade (or a record saved before 2j1) with no cause left in `because`. Past tense (builder 2j2, carry-over R1-1):
   * the cause may be back in review now (D2-89), so the line says what took it out, not what holds it now.
   */
  redoReasonDeclined: 'it depended on something that was declined',
} as const;

/**
 * Builder 2c2's wording (the plan quotes none): why an item is RV-7 (§4.4), one line per reason of its class in force
 * (`ItemView.classes.reasons`). `name`: the declaration the reason names, when it names one; `cards`: card names.
 */
export const CLASS_REASON_TEXTS: Readonly<Record<'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'c1' | 'c2' | 'c3' | 'c4', (name?: string, cards?: string) => string>> = {
  b1: (_name, cards) => (cards !== undefined ? `belief: it adds an axiom card or a premise (${cards})` : 'belief: it adds an axiom card or a premise'),
  b2: (_name, cards) => (cards !== undefined ? `belief: it formalises or changes an axiom card (${cards})` : 'belief: it formalises or changes an axiom card'),
  b3: (name) => (name !== undefined ? `belief: it adds or changes a Lean axiom, ${name}` : 'belief: it adds or changes a Lean axiom'),
  b4: (name) => (name !== undefined ? `belief: a statement relies on ${name}` : 'belief: a statement relies on what it adds or changes'),
  b5: () => 'belief: it changes what an axiom means',
  c1: (name, cards) => (cards !== undefined ? `changes what is proved: it changes ${cards}, which existed when the session started` : name !== undefined ? `changes what is proved: it changes ${name}, which existed when the session started` : 'changes what is proved: it changes what existed when the session started'),
  c2: () => 'changes what is proved: it proves a statement changed in this session',
  c3: () => 'changes what is proved: sentence and Lean may disagree',
  c4: () => 'changes what is proved: it adds an arrow into a proposition',
};

// ---------------------------------------------------------------------------------------------
// Texts for Claude (never on the board): tool refusals, gate messages, turns, the system prompt's new lines

export const CLAUDE_SESSION_TEXTS = {
  // ---- turns (§2.8; their first lines are fixed, so FakeBackend scripts can match them)
  stepFormalize: (index: number, of: number, target: string) => `Step ${index} of ${of}: formalize and prove “${target}”`,
  stepRework: (index: number, of: number, target: string) => `Step ${index} of ${of}: rework “${target}” after the review`,
  stepStatementsOnly: (index: number, of: number, target: string, source: string) =>
    `Step ${index} of ${of}: formalize the statements of “${target}” (no proof: “${source}” was not proved)`,
  reviewSubmitted: (stage: number) => `Review submitted (stage ${stage})`,
  decisionsSince: 'Your decisions since the last step:',
  /** §3.3: propose_arrow and propose_assumption in a statements-only step. */
  statementsOnly: (source: string) => `This step only formalises the statements: “${source}” was not proved.`,

  // ---- the system prompt's new lines (§2.8)
  workInSteps: 'You work in steps: one target per step.',
  arrowRule:
    'If the proof needs an existing card that is not a selected premise and has a `.holds`, propose its arrow with propose_arrow (the person reviews it as an item), then use it. If that card has no `.holds`, finish not_proved and name it in gap. Never edit `premises:`, `follows_from:` or any other field of a block yourself.',
  otherTargets:
    "Never propose an arrow from another target of this session, and never use a lemma from another target's proof unless that target is a selected premise. A statement may never use a declaration you wrote after fixing the statements.",
  declarationsOnly:
    'Write only declarations: no `open`, `variable`, `universe`, `attribute` or `#check` lines, and no `open … in` before a declaration. Write fully qualified names (e.g. `Classical.em`), and put `@[…]` on the declaration itself.',

  // ---- propose_arrow's refusals (§4.9; 1b's texts for a cycle, another subject, vocabulary, a self-arrow and an arrow drawn already stay 1b's)
  arrowNotTarget: (target: string) => `You may add arrows only into “${target}” in this step.`,
  arrowIntoAxiom: (card: string) => `“${card}” is an axiom: an arrow into it would make it a proposition, which only the person decides.`,
  arrowMark: (target: string) => `The person marked “${target}” as following from nothing: propose a missing premise with propose_assumption instead.`,
  arrowNoHolds: (card: string) => `“${card}” has no proof and no claim: the proof cannot use it.`,
  arrowDeclined: (source: string, target: string) => `The person declined “${source}” → “${target}” in this session: do not propose it again.`,
  arrowOtherTarget: (source: string, target: string) =>
    `“${source}” is another target of this session: “${target}” may use it only through an arrow the person selected.`,
  /** 1b's texts (`edit/planArrows.ts`), restated for propose_arrow and B.3 (builder 2b1b). */
  arrowSelf: 'A card cannot have an arrow into itself.',
  arrowUnknown: (id: string) => `No card "${id}" (it may have been deleted).`,
  arrowVocabulary: (name: string) => `${name} is vocabulary: arrows join axioms and propositions only.`,
  arrowOtherSubject: (sentence: string, subject: string) => `“${sentence}” belongs to subject ${subject}: arrows stay within one subject.`,
  arrowDrawn: 'That arrow is drawn already.',
  arrowCycle: (names: readonly string[]) => `This arrow would make a cycle: ${names.join(' → ')}.`,
  /**
   * B.3's `declined` at a step, when the step itself drew the declined arrow by editing `premises:` (builder 2b2,
   * carry-over R2-2): what Claude must do, as G5's message said before R1-4 left the finding to B.3.
   */
  arrowDrawnByHand: 'You drew it by editing `premises:`: never edit `premises:`; remove it.',

  // ---- gate messages (§4.9)
  /** `existing-changed`, token `session`. */
  leaveAsIs: 'leave it exactly as it is in this step',
  /** The step-limit message. */
  stepLimit: (name: string) =>
    `${name} existed when this step started and was changed: in this step only the target's proof, the empty Lean statements at the selected arrows and new arrows into the target may change; restore it.`,
  /** B.2's message gains this. */
  proposeTheArrow: 'propose the arrow with propose_arrow (it becomes an item for the person), or prove the target without it',
  /** `stray-command` (D2-52). */
  strayCommand: (file: string, line: number, command: string) =>
    `${file}:${line}: \`${command}\` stands outside any declaration: in a session, write only declarations, with fully qualified names instead of \`open\` (e.g. \`Classical.em\`), and \`@[…]\` on the declaration itself; remove it.`,
  /** `stray-command` for a new comment no new or changed declaration is next to (AP-26, §4.9). */
  strayComment: (file: string, line: number) =>
    `${file}:${line}: this comment is not next to a declaration this step wrote or changed: put it directly above the declaration it describes, or remove it.`,
  /**
   * `stray-command`, token `comment` (builder 2b2, carry-over R2-1): a comment the step added that the review would
   * attach to a declaration the step may not change (computeItems attaches a comment to the new or changed declaration
   * directly below it, else directly above it), so that declaration's item would change.
   */
  strayCommentOwner: (file: string, line: number, name: string) =>
    `${file}:${line}: this comment would go with ${name}, which existed when this step started and which this step may not change: put it directly above a declaration this step wrote or changed, or remove it.`,
  /**
   * `existing-changed`, token `unowned` (fixer 2b1b r1, A-ADV-3): a difference the step made that no review item can
   * hold (computeItems reports it unowned), which no other rule named. `what`: computeItems' problem text.
   */
  unownedChange: (what: string) =>
    `${what} In a session every change must belong to an item the person can accept or decline, and this one cannot: write only the target's proof, the empty Lean statements at the selected arrows, new declarations next to what they serve, and arrows through propose_arrow; restore it.`,
  /**
   * `existing-changed`, token `session` (fixer 2b2 r1, A-V2B2-ADV-4): an item that existed when the step started and
   * that the step may not change now holds something else, which no other rule named: typically a comment that goes
   * with the declaration directly below it, else directly above it, now goes with another one. `what`: its names.
   */
  frozenItemChanged: (what: string) =>
    `${what} was proposed earlier in this session, and the person reviews it as it was when this step started, but this step's edits change what goes with it: a comment next to it now goes with another declaration, or one now goes with it (a comment goes with the declaration directly below it, else directly above it). Write new declarations away from the comments of others, keep comments where they were, and leave it exactly as it is.`,
  /** `undeclared-premise`, token `other-result` (D2-50), in a proof. */
  otherResultProof: (lemma: string, owner: string, target: string) =>
    `${lemma} belongs to the proof of “${owner}”, which is not a premise of “${target}”: prove what you need here.`,
  /** The same, in a statement. */
  otherResultStatement: (name: string, owner: string) =>
    `${name} was written for the proof of “${owner}”: a statement may not use it; define what you need before fixing the statements.`,
  /**
   * The same, in a statement (a card's, whatever phase wrote it), when `name` was written by the running step, which
   * has no freeze (fixer 2c1 r2, R1-1): a finish without freeze_statements records everything the step wrote as proof
   * material (D2-43, §3.4). Builder 2c2 (carry-over R2-1): the late freeze it asks for would hold everything the step
   * wrote but proofs, so it first asks Claude to remove what it wrote only for its proof attempt, which a step frozen
   * before its attempt keeps hidden with the Result (§4.7's residuals).
   */
  otherResultNotFrozen: (name: string) =>
    `${name} was written in this step, which has not called freeze_statements: until it does, everything the step wrote counts as material for its proof, and a statement may not use that. Remove what you wrote only for the proof attempt, call freeze_statements, then finish again.`,
} as const;
