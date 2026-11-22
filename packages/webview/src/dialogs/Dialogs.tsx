/**
 * The board's confirmations (one at a time, from the store's `dialog`):
 *  - dependents: a kind change whose Lean change breaks other proofs, listing them, with core's explanation: P->A of a
 *    proof that takes hypotheses makes `.holds` an axiom without them (rewrite them to use it directly; the rewrite
 *    needs fresh Lean facts), or keep them marked broken, or cancel (spec v4: no other kind change breaks a proof);
 *  - rationale: the optional "Why do you hold it?" of a change to Axiom (D-14: Skip is fine), titled like the action,
 *    "Move to axioms" (slice 1f carry-over 4);
 *  - delete: who declares it, which proofs use it, which statements mention it (D-18); delete the card with its Lean
 *    code, or cancel (Cancel has the focus, so Delete then Enter deletes nothing). When other declarations use that
 *    Lean code, the dialog opens again listing them (they would stop compiling): "Delete anyway", or cancel. Slice 2i
 *    (spec v4 S9, ES-9): there is no "card only" choice, since it left `axiom ….holds` behind as an unmarked axiom;
 *  - revert: "Revert to this" in the history dropdown (D-33);
 *  - arrows (spec v4 slice 1b): an arrow change's impact, confirmed before it is sent (an axiom becomes a proposition,
 *    AR-6; arrows that proofs use, A16);
 *  - formalize (spec v4.1 AR-8, slice 1e): Formalize for dependencies asks about a source that is a proposition with
 *    neither a proof nor a pending claim: mark it pending and continue, or cancel; without a Lean statement, Cancel only.
 *    Slice 2h (§5.11): during a session it can't be marked pending (`in-session`); `in-session` and `no-statement`
 *    offer "Select the arrows into ‹L› too" when L has arrows or its mark; `results-hidden` (D2-65) offers Show results.
 * The host's lists name cards by id and other declarations by their Lean names: a card shows by its sentence (this
 * subject's from the board, another subject's from the host's `dependentCards`, with its subject), anything else by
 * its Lean name in code font.
 *
 * M2 carry-overs: (1) the first delete question also lists what uses the card outside the board
 * (`LeanBinding.externalUsers`: lemmas without a card, other subjects' cards) and says "Nothing else refers to it."
 * only when nothing does; (2) the dialogs' own words are singular for one dependent ("Rewrite that proof …", "Keep
 * that proof …") and plural otherwise; (3) a kind change re-asked by the host lists the host's dependents and says
 * that it found more than the dialog showed before.
 *
 * Slice 2g (docs/slice2-plan.md 5.2, 5.6, 5.9; §3.6): an edit session's dialogs, each inside `data-undo-scope="session"`:
 *  - cascade: a decision (or Undo) that takes Accepts away lists them first, with the hidden-results sentence while the
 *    results are hidden (D2-64); Continue sends it again, `confirmed`; Cancel sends nothing;
 *  - reveal: Show results, Raw Lean diff… while the results are hidden, and Show Claude's activity: every result of the
 *    stage is shown, noted as seen early (D2-61, D2-10);
 *  - hold-as: Accept on an Add premise asks how the user holds it, never defaulted (as an axiom, or as a proposition
 *    pending proof), with an optional one-line Why; one already written offers only "as an axiom" (AF12);
 *  - exit-session: what Exit discards (listed items only), and that Claude's step stops; it cannot be undone (D2-36).
 */
import { LIMITS, REVIEW_TEXTS, type DependentCard, type ItemView } from '@telelean/core';
import { useMemo, useState } from 'react';
import { ExternalUserItem } from '../common/ExternalUser';
import { InlineCode } from '../common/InlineCode';
import { Modal } from '../common/Modal';
import { pasteOneLine } from '../common/OneLineInput';
import { KIND_GLYPH, KIND_NOUN } from '../labels';
import { deleteDependents } from '../model/cardData';
import { formatTime, oneLine } from '../model/format';
import { itemLabelParts, markAgent, agentPhrases, wordsIn } from '../model/review';
import { Label } from '../run/review/parts';
import { useBoard, useBoardActions } from '../state/context';
import type { SessionDialogState } from '../state/session';
import { boardView, type DialogState } from '../state/store';

/**
 * A dependent: a card by its sentence (a card of this board from the board itself, any other from the host's `card`,
 * then with its subject), anything else (a declaration without a card) by its Lean name.
 */
function Dependent({ id, card }: { id: string; card?: DependentCard | undefined }) {
  const node = useBoard((s) => s.nodes[id]);
  const subject = useBoard((s) => s.subject);
  const shown = node ? { type: node.type, naturalName: node.naturalName, subject: node.subject } : card;
  if (!shown) {
    return (
      <li className="tl-dialog__item" data-dependent={id}>
        <code>{id}</code>
      </li>
    );
  }
  const elsewhere = !node && shown.subject !== subject;
  return (
    <li className="tl-dialog__item" data-dependent={id} {...(elsewhere ? { 'data-subject': shown.subject } : {})}>
      <span className="tl-glyph" data-kind={shown.type} aria-hidden="true">
        {KIND_GLYPH[shown.type]}
      </span>
      {elsewhere ? (
        <span>
          {shown.naturalName} <span className="tl-dialog__from">(subject {shown.subject})</span>
        </span>
      ) : (
        shown.naturalName
      )}
    </li>
  );
}

/**
 * The dependents dialog's own words (carry-over 2): for exactly one dependent "that proof" / "it", otherwise "them".
 * Every dependent of a `.holds` is a proof (a card's or a lemma's), so "proof" fits both kinds of entry. Since spec v4
 * the dialog is only for a change to Axiom (a proof that takes hypotheses becomes an axiom that states it directly, so
 * its users stop passing it arguments; the change to Goal, with its hypothesis rewrite, is gone).
 */
export function dependentsTexts(count: number): { intro: string; rewrite: string; keep: string } {
  const one = count === 1;
  return {
    intro: one ? 'This passes it arguments:' : 'These pass it arguments:',
    rewrite: one ? 'Rewrite that proof to use it directly' : 'Rewrite them to use it directly',
    keep: one ? 'Keep that proof, marked broken' : 'Keep them, marked broken',
  };
}

function DependentsDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'dependents' }> }) {
  const node = useBoard((s) => s.nodes[dialog.id]);
  const actions = useBoardActions();
  const texts = dependentsTexts(dialog.dependents.length);
  return (
    <Modal labelledBy="tl-dialog-title" testId="dialog-dependents" onCancel={() => actions.closeDialog()}>
      <h2 id="tl-dialog-title" className="tl-dialog__title">
        <InlineCode text={dialog.summary} />
      </h2>
      {node ? <p className="tl-dialog__subject">“{node.naturalName}”</p> : null}
      {dialog.relisted ? (
        <p className="tl-dialog__note tl-dialog__note--attention" data-testid="dependents-relisted">
          <span className="codicon codicon-info" aria-hidden="true" /> The extension found more that uses it than this dialog listed before. Check the list, then
          choose again: your choice applies to exactly these.
        </p>
      ) : null}
      <p className="tl-dialog__detail" data-testid="dependents-detail">
        <InlineCode text={dialog.detail} />
      </p>
      {dialog.dependents.length > 0 ? <p data-testid="dependents-intro">{texts.intro}</p> : null}
      <ul className="tl-dialog__list" data-testid="dependents">
        {dialog.dependents.map((id) => (
          <Dependent key={id} id={id} card={dialog.cards?.[id]} />
        ))}
      </ul>
      {!dialog.rewriteAvailable ? <p className="tl-dialog__note">Rewriting needs fresh Lean facts: refresh Lean first (the badge in the header).</p> : null}
      <div className="tl-dialog__buttons">
        <button type="button" className="tl-button" disabled={!dialog.rewriteAvailable} onClick={() => actions.confirmDependents('rewrite')}>
          {texts.rewrite}
        </button>
        <button type="button" className="tl-button tl-button--secondary" onClick={() => actions.confirmDependents('mark-broken')}>
          {texts.keep}
        </button>
        <button type="button" className="tl-button tl-button--secondary" data-autofocus onClick={() => actions.closeDialog()}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function RationaleDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'rationale' }> }) {
  const node = useBoard((s) => s.nodes[dialog.id]);
  const actions = useBoardActions();
  const [reason, setReason] = useState(dialog.initial ?? '');
  // Spec v4: the only change to a kind left is P->A, the board's "Move to axioms" (AR-7).
  const action = dialog.to === 'AXIOM' ? 'Move to axioms' : `Make ${KIND_NOUN[dialog.to]}`;
  return (
    <Modal labelledBy="tl-dialog-title" testId="dialog-rationale" onCancel={() => actions.closeDialog()}>
      <h2 id="tl-dialog-title" className="tl-dialog__title">
        {action}
      </h2>
      {node ? <p className="tl-dialog__subject">“{node.naturalName}”</p> : null}
      <p className="tl-dialog__detail">
        <InlineCode text={dialog.detail} />
      </p>
      <label className="tl-dialog__field">
        <span>Why do you hold it? (optional)</span>
        <input
          className="tl-input"
          type="text"
          data-autofocus
          aria-label="Why do you hold it?"
          placeholder="e.g. known from gaming news"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onPaste={(event) => pasteOneLine(event, setReason)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              actions.confirmRationale(reason);
            }
          }}
        />
      </label>
      <div className="tl-dialog__buttons">
        <button type="button" className="tl-button" data-testid="rationale-confirm" onClick={() => actions.confirmRationale(reason)}>
          {action}
        </button>
        <button type="button" className="tl-button tl-button--secondary" onClick={() => actions.confirmRationale(null)}>
          Skip
        </button>
        <button type="button" className="tl-button tl-button--secondary" onClick={() => actions.closeDialog()}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function DeleteDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'delete' }> }) {
  const node = useBoard((s) => s.nodes[dialog.id]);
  const nodes = useBoard((s) => s.nodes);
  const edges = useBoard((s) => s.edges);
  const order = useBoard((s) => s.order);
  const actions = useBoardActions();
  const affected = useMemo(() => deleteDependents(dialog.id, { nodes, edges, order }), [dialog.id, nodes, edges, order]);
  if (!node) return null;
  const hasLean = node.lean.statement !== undefined || node.lean.code !== undefined;

  if (dialog.dependents) {
    // The host refused to delete the Lean code: these declarations (cards, lemmas without a card, other subjects'
    // proofs) use it and would stop compiling. Ask again, listing them.
    const breaks = dialog.dependents;
    const count = breaks.length;
    const explanation =
      count === 0
        ? 'Other declarations use its Lean code. They stop compiling if the code is deleted.'
        : count === 1
          ? 'This declaration uses its Lean code. It stops compiling if the code is deleted:'
          : `These ${count} declarations use its Lean code. They stop compiling if the code is deleted:`;
    return (
      <Modal labelledBy="tl-dialog-title" testId="dialog-delete" onCancel={() => actions.closeDialog()}>
        <h2 id="tl-dialog-title" className="tl-dialog__title">
          Delete it anyway?
        </h2>
        <p className="tl-dialog__subject">“{node.naturalName}”</p>
        <p data-testid="delete-breaks-explanation">{explanation}</p>
        {count > 0 ? (
          <ul className="tl-dialog__list" data-testid="delete-breaks">
            {breaks.map((id) => (
              <Dependent key={id} id={id} card={dialog.cards?.[id]} />
            ))}
          </ul>
        ) : null}
        <p className="tl-dialog__note">
          “Delete anyway” deletes the card and its Lean code; {count === 1 ? 'that declaration then shows' : 'those declarations then show'} Lean
          errors until you change {count === 1 ? 'it' : 'them'}. Undo brings the code back.
        </p>
        <div className="tl-dialog__buttons">
          <button type="button" className="tl-button tl-button--danger" onClick={() => actions.deleteNode(node.id, true)}>
            Delete anyway
          </button>
          <button type="button" className="tl-button tl-button--secondary" data-autofocus onClick={() => actions.closeDialog()}>
            Cancel
          </button>
        </div>
      </Modal>
    );
  }

  // Carry-over 1: users the board does not show as cards (lemmas without a card, other subjects' cards) count too.
  const external = node.lean.externalUsers ?? [];
  const nothing = affected.declaredBy.length + affected.proofs.length + affected.mentions.length + external.length === 0;
  const section = (title: string, ids: string[], testId: string) =>
    ids.length > 0 ? (
      <div data-testid={testId}>
        <h3 className="tl-dialog__heading">{title}</h3>
        <ul className="tl-dialog__list">
          {ids.map((id) => (
            <Dependent key={id} id={id} />
          ))}
        </ul>
      </div>
    ) : null;
  return (
    <Modal labelledBy="tl-dialog-title" testId="dialog-delete" onCancel={() => actions.closeDialog()}>
      <h2 id="tl-dialog-title" className="tl-dialog__title">
        Delete this {KIND_NOUN[node.type].toLowerCase()}?
      </h2>
      <p className="tl-dialog__subject">“{node.naturalName}”</p>
      {nothing ? <p>Nothing else refers to it.</p> : null}
      {section('Declared as a premise by', affected.declaredBy, 'delete-declared')}
      {section('Used by the proofs of', affected.proofs, 'delete-proofs')}
      {section('Mentioned in the statements of', affected.mentions, 'delete-mentions')}
      {external.length > 0 ? (
        <div data-testid="delete-external">
          <h3 className="tl-dialog__heading">Also used outside this board</h3>
          <ul className="tl-dialog__list">
            {external.map((user) => (
              <li key={`${user.where}:${user.name}`} className="tl-dialog__item" data-dependent={user.name}>
                <ExternalUserItem user={user} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="tl-dialog__buttons">
        <button type="button" className="tl-button tl-button--danger" onClick={() => actions.deleteNode(node.id)}>
          {hasLean ? 'Delete card and its Lean code' : 'Delete card'}
        </button>
        <button type="button" className="tl-button tl-button--secondary" data-autofocus onClick={() => actions.closeDialog()}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/**
 * Spec v4 slice 1b: an arrow change whose impact the user confirms first (core's or the board's words): an axiom that
 * becomes a proposition, with the cards that lose their green glow (AR-6), or arrows that proofs use (A16). Cancel
 * has the focus, so Enter right away changes nothing.
 */
function ArrowsDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'arrows' }> }) {
  const node = useBoard((s) => s.nodes[dialog.id]);
  const actions = useBoardActions();
  return (
    <Modal labelledBy="tl-dialog-title" testId="dialog-arrows" onCancel={() => actions.closeDialog()}>
      <h2 id="tl-dialog-title" className="tl-dialog__title">
        <InlineCode text={dialog.summary} />
      </h2>
      {node ? <p className="tl-dialog__subject">“{node.naturalName}”</p> : null}
      <p className="tl-dialog__detail" data-testid="arrows-detail">
        <InlineCode text={dialog.detail} />
      </p>
      {dialog.dependents.length > 0 ? (
        <div data-testid="arrows-dependents">
          <h3 className="tl-dialog__heading">{dialog.listTitle}</h3>
          <ul className="tl-dialog__list">
            {dialog.dependents.map((id) => (
              <Dependent key={id} id={id} card={dialog.cards?.[id]} />
            ))}
          </ul>
        </div>
      ) : null}
      <p className="tl-dialog__note">Undo takes it back.</p>
      <div className="tl-dialog__buttons">
        <button type="button" className="tl-button" data-testid="arrows-confirm" onClick={() => actions.confirmArrows()}>
          {dialog.confirm}
        </button>
        <button type="button" className="tl-button tl-button--secondary" data-autofocus onClick={() => actions.closeDialog()}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/**
 * Spec v4.1 AR-8 (★D7 (b); slice 1e): before Formalize for dependencies starts, a source that is a proposition with
 * neither a proof nor a pending claim is asked about, one at a time. With a Lean statement: "Mark pending and continue"
 * (assumed until proved: `axiom n.holds`, the user's own edit, one Undo step, made before the run starts) or Cancel.
 * Without one it must be formalised and proved first: Cancel only (AP-10). Cancel has the focus, so Enter right away
 * changes nothing.
 */
function FormalizeDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'formalize' }> }) {
  const node = useBoard((s) => boardView(s).nodes[dialog.id]);
  const actions = useBoardActions();
  const name = node?.naturalName ?? dialog.id;
  const sentence = `“${name}”`;
  const asked = dialog.confirmed.length + 1;
  const total = asked + dialog.queue.length;
  const mode = dialog.mode;
  // Slice 2h (§5.11): the question per mode; D2-65's `results-hidden` names no card and never says proved or not.
  const question =
    mode === 'results-hidden'
      ? REVIEW_TEXTS.formalizeResultsHidden
      : mode === 'mark-pending'
        ? `${sentence} is not proved. Mark it pending (assumed until proved), or cancel?`
        : mode === 'in-session'
          ? REVIEW_TEXTS.notPendableInSession(name)
          : `${sentence} has no Lean statement and no proof yet: formalize and prove it first.`;
  return (
    <Modal labelledBy="tl-dialog-title" testId="dialog-formalize" onCancel={() => actions.closeDialog()}>
      <h2 id="tl-dialog-title" className="tl-dialog__title">
        Formalize for dependencies{mode !== 'results-hidden' && total > 1 ? ` (${asked} of ${total})` : ''}
      </h2>
      <p className="tl-dialog__detail" data-testid="formalize-question" data-mode={mode}>
        {question}
      </p>
      {mode === 'mark-pending' ? (
        <p className="tl-dialog__note">
          Marking it pending adds an axiom for its statement to your files before the session starts (your own edit: Undo takes it back). Cards that rest on it are
          not established until it is proved.
        </p>
      ) : null}
      <div className="tl-dialog__buttons">
        {mode === 'mark-pending' ? (
          <button type="button" className="tl-button" data-testid="formalize-mark-pending" onClick={() => actions.confirmFormalizePending()}>
            Mark pending and continue
          </button>
        ) : null}
        {dialog.selectToo === true ? (
          <button type="button" className="tl-button" data-testid="formalize-select-too" onClick={() => actions.confirmFormalizeSelectToo()}>
            {REVIEW_TEXTS.selectArrowsInto(name)}
          </button>
        ) : null}
        {mode === 'results-hidden' ? (
          <button
            type="button"
            className="tl-button"
            data-testid="formalize-show-results"
            onClick={() => {
              actions.closeDialog();
              actions.openReveal('show-result');
            }}
          >
            {REVIEW_TEXTS.showResults}
          </button>
        ) : null}
        <button type="button" className="tl-button tl-button--secondary" data-testid="formalize-cancel" data-autofocus onClick={() => actions.closeDialog()}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function RevertDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'revert' }> }) {
  const subject = useBoard((s) => s.subject);
  const actions = useBoardActions();
  return (
    <Modal labelledBy="tl-dialog-title" testId="dialog-revert" onCancel={() => actions.closeDialog()}>
      <h2 id="tl-dialog-title" className="tl-dialog__title">
        Revert {subject} to this state?
      </h2>
      <p className="tl-dialog__subject">
        {formatTime(dialog.entry.time)} · {dialog.entry.label}
      </p>
      <p>The subject's files are written back to how they were then. The current state is snapshotted first, so the revert can be undone.</p>
      <div className="tl-dialog__buttons">
        <button type="button" className="tl-button" onClick={() => actions.revertHistory(dialog.entry.id)}>
          Revert
        </button>
        <button type="button" className="tl-button tl-button--secondary" data-autofocus onClick={() => actions.closeDialog()}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function CascadeDialog({ dialog }: { dialog: Extract<SessionDialogState, { kind: 'cascade' }> }) {
  const session = useBoard((s) => s.session);
  const actions = useBoardActions();
  const items = session?.items ?? NO_ITEMS;
  const phrases = useMemo(() => (session !== null ? agentPhrases(session) : []), [session]);
  return (
    <Modal labelledBy="tl-dialog-title" testId="dialog-cascade" onCancel={() => actions.closeDialog()}>
      <div data-undo-scope="session">
        <h2 id="tl-dialog-title" className="tl-dialog__title">
          {dialog.lead}
        </h2>
        {dialog.cascade.length > 0 ? (
          <ul className="tl-dialog__list" data-testid="cascade-list">
            {dialog.cascade.map((entry) => (
              <li key={entry.item} className="tl-dialog__item" data-item={entry.item}>
                <CascadeLabel id={entry.item} items={items} phrases={phrases} />{' '}
                <span className="tl-dialog__from">
                  (<Label parts={markAgent(entry.why, phrases)} />)
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {dialog.hiddenResults ? (
          <p className="tl-dialog__note tl-dialog__note--attention" data-testid="cascade-hidden-results">
            {REVIEW_TEXTS.cascadeHiddenResults}
          </p>
        ) : null}
        <div className="tl-dialog__buttons">
          <button type="button" className="tl-button" data-testid="cascade-continue" onClick={() => actions.confirmCascade()}>
            {CONTINUE}
          </button>
          <button type="button" className="tl-button tl-button--secondary" data-testid="cascade-cancel" data-autofocus onClick={() => actions.closeDialog()}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** An item the cascade names: its label in parts, else its id (Claude's phrases marked). */
function CascadeLabel({ id, items, phrases }: { id: string; items: readonly ItemView[]; phrases: readonly string[] }) {
  const item = items.find((i) => i.id === id);
  return <Label parts={item !== undefined ? itemLabelParts(item) : markAgent(id, phrases)} />;
}

/** Builder 2g: the cascade dialog's confirm button (§5.6's "Continue"). */
const CONTINUE = 'Continue';
const NO_ITEMS: readonly ItemView[] = [];

const REVEAL_TITLE = { 'show-result': REVIEW_TEXTS.showResults, 'raw-diff': REVIEW_TEXTS.rawDiff, activity: REVIEW_TEXTS.showClaudesActivity } as const;

function RevealDialog({ dialog }: { dialog: Extract<SessionDialogState, { kind: 'reveal' }> }) {
  const undecided = useBoard((s) => s.session?.results.waitingFor.length ?? 0);
  const hidden = useBoard((s) => s.session?.results.shown === false);
  const actions = useBoardActions();
  const text = dialog.via === 'raw-diff' ? REVIEW_TEXTS.rawDiffReveals : REVIEW_TEXTS.showResultsConfirm(undecided);
  return (
    <Modal labelledBy="tl-dialog-title" testId="dialog-reveal" onCancel={() => actions.closeDialog()}>
      <div data-undo-scope="session" data-via={dialog.via}>
        <h2 id="tl-dialog-title" className="tl-dialog__title">
          {REVEAL_TITLE[dialog.via]}
        </h2>
        <p className="tl-dialog__detail" data-testid="reveal-text">
          {text}
        </p>
        {dialog.via === 'raw-diff' && hidden ? <p className="tl-dialog__note">{REVIEW_TEXTS.showResultsConfirm(undecided)}</p> : null}
        <div className="tl-dialog__buttons">
          <button type="button" className="tl-button" data-testid="reveal-confirm" onClick={() => actions.confirmReveal()}>
            {REVEAL_TITLE[dialog.via].replace('…', '')}
          </button>
          <button type="button" className="tl-button tl-button--secondary" data-testid="reveal-cancel" data-autofocus onClick={() => actions.closeDialog()}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

function HoldAsDialog({ dialog }: { dialog: Extract<SessionDialogState, { kind: 'hold-as' }> }) {
  const item = useBoard((s) => s.session?.items.find((i) => i.id === dialog.item));
  const actions = useBoardActions();
  const [choice, setChoice] = useState<'axiom' | 'pending' | null>(null);
  const [why, setWhy] = useState('');
  const detail = item?.detail.kind === 'add-premise' ? item.detail : null;
  const written = detail?.writtenInReview === true;
  const sentence = detail?.sentence ?? dialog.item;
  const question = REVIEW_TEXTS.holdAsQuestion(sentence);
  const missing = REVIEW_TEXTS.holdAsMissing(sentence);
  return (
    <Modal labelledBy="tl-dialog-title" testId="dialog-hold-as" onCancel={() => actions.closeDialog()}>
      <div data-undo-scope="session">
        <h2 id="tl-dialog-title" className="tl-dialog__title">
          {/* The sentence is Claude's (an Add premise, D-15): it stays in Claude's style in the question. */}
          <Label parts={detail === null ? [{ kind: 'text', text: question }] : wordsIn(question, sentence, 'agent')} />
        </h2>
        <fieldset className="tl-dialog__field" data-testid="hold-as-options">
          <label className="tl-check">
            <input type="radio" name="tl-hold-as" data-testid="hold-as-axiom" checked={choice === 'axiom'} onChange={() => setChoice('axiom')} />
            {REVIEW_TEXTS.holdAsAxiom}
          </label>
          {!written ? (
            <label className="tl-check">
              <input type="radio" name="tl-hold-as" data-testid="hold-as-pending" checked={choice === 'pending'} onChange={() => setChoice('pending')} />
              {REVIEW_TEXTS.holdAsPending}
            </label>
          ) : null}
        </fieldset>
        <label className="tl-dialog__field">
          <span className="tl-dialog__heading">Why (optional)</span>
          <input
            className="tl-input"
            data-testid="hold-as-why"
            value={why}
            maxLength={LIMITS.textLength}
            onChange={(e) => setWhy(oneLine(e.target.value))}
            onPaste={(e) => pasteOneLine(e, setWhy)}
          />
        </label>
        {choice === null ? (
          <p className="tl-dialog__note">
            <Label parts={detail === null ? [{ kind: 'text', text: missing }] : wordsIn(missing, sentence, 'agent')} />
          </p>
        ) : null}
        <div className="tl-dialog__buttons">
          <button type="button" className="tl-button" data-testid="hold-as-accept" disabled={choice === null} onClick={() => choice !== null && actions.confirmHoldAs(choice, why)}>
            {REVIEW_TEXTS.accept}
          </button>
          <button type="button" className="tl-button tl-button--secondary" data-autofocus onClick={() => actions.closeDialog()}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ExitSessionDialog({ dialog }: { dialog: Extract<SessionDialogState, { kind: 'exit-session' }> }) {
  const actions = useBoardActions();
  return (
    <Modal labelledBy="tl-dialog-title" testId="dialog-exit-session" onCancel={() => actions.closeDialog()}>
      <div data-undo-scope="session">
        <h2 id="tl-dialog-title" className="tl-dialog__title">
          {REVIEW_TEXTS.exitSession}
        </h2>
        <p className="tl-dialog__detail" data-testid="exit-text">
          {REVIEW_TEXTS.exitConfirm(dialog.accepted, dialog.inReview, dialog.stepRunning)}
        </p>
        <div className="tl-dialog__buttons">
          <button type="button" className="tl-button tl-button--danger" data-testid="exit-confirm" onClick={() => actions.confirmExitSession()}>
            {REVIEW_TEXTS.exitSession}
          </button>
          <button type="button" className="tl-button tl-button--secondary" data-testid="exit-back" data-autofocus onClick={() => actions.closeDialog()}>
            {REVIEW_TEXTS.back}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useBoard((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'dependents':
      return <DependentsDialog key={`${dialog.id}-${dialog.to}`} dialog={dialog} />;
    case 'rationale':
      return <RationaleDialog key={`${dialog.id}-${dialog.to}`} dialog={dialog} />;
    case 'delete':
      return <DeleteDialog key={`${dialog.id}-${dialog.dependents ? 'confirm' : 'ask'}`} dialog={dialog} />;
    case 'arrows':
      return <ArrowsDialog key={`${dialog.id}-${dialog.change.kind}`} dialog={dialog} />;
    case 'revert':
      return <RevertDialog key={dialog.entry.id} dialog={dialog} />;
    case 'formalize':
      return <FormalizeDialog key={`${dialog.inferences.map((i) => i.target).join(',')}-${dialog.id}-${dialog.mode}`} dialog={dialog} />;
    case 'cascade':
      return <CascadeDialog dialog={dialog} />;
    case 'reveal':
      return <RevealDialog key={dialog.via} dialog={dialog} />;
    case 'hold-as':
      return <HoldAsDialog key={dialog.item} dialog={dialog} />;
    case 'exit-session':
      return <ExitSessionDialog dialog={dialog} />;
  }
}
