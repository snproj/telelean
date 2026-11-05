/**
 * The board's confirmations (one at a time, from the store's `dialog`):
 *  - dependents: a kind change whose Lean change breaks other proofs, listing them, with core's explanation:
 *    A->G / D->G removes a `.holds` they use (rewrite them to take it as a hypothesis), D->A / G->A of a proof that
 *    takes hypotheses makes `.holds` an axiom without them (rewrite them to use it directly); the rewrite needs fresh
 *    Lean facts. Or keep them marked broken, or cancel;
 *  - rationale: the optional "Why do you hold it?" of a change to Assumption (D-14: Skip is fine);
 *  - delete: who declares it, which proofs use it, which statements mention it (D-18); delete the card with or
 *    without its Lean code (Cancel has the focus, so Delete then Enter deletes nothing). When the host refuses to
 *    delete the Lean code because other declarations use it, the dialog opens again listing them (they would stop
 *    compiling): "Delete anyway", card only, or cancel;
 *  - revert: "Revert to this" in the history dropdown (D-33).
 * The host's lists name cards by id and other declarations by their Lean names: a card shows by its sentence (this
 * subject's from the board, another subject's from the host's `dependentCards`, with its subject), anything else by
 * its Lean name in code font.
 *
 * M2 carry-overs: (1) the first delete question also lists what uses the card outside the board
 * (`LeanBinding.externalUsers`: lemmas without a card, other subjects' cards) and says "Nothing else refers to it."
 * only when nothing does; (2) the dialogs' own words are singular for one dependent ("Rewrite that proof …", "Keep
 * that proof …") and plural otherwise; (3) a kind change re-asked by the host lists the host's dependents and says
 * that it found more than the dialog showed before.
 */
import type { DependentCard } from '@telelean/core';
import { useMemo, useState } from 'react';
import { ExternalUserItem } from '../common/ExternalUser';
import { InlineCode } from '../common/InlineCode';
import { Modal } from '../common/Modal';
import { pasteOneLine } from '../common/OneLineInput';
import { KIND_GLYPH, KIND_NOUN } from '../labels';
import { deleteDependents } from '../model/cardData';
import { formatTime } from '../model/format';
import { useBoard, useBoardActions } from '../state/context';
import type { DialogState } from '../state/store';

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
 * Every dependent of a `.holds` is a proof (a card's or a lemma's), so "proof" fits both kinds of entry.
 */
export function dependentsTexts(to: 'ASSUMPTION' | 'DERIVATION' | 'GOAL', count: number): { intro: string; rewrite: string; keep: string } {
  const one = count === 1;
  // To Goal: `.holds` goes, so its users take the statement as a hypothesis instead. To Assumption (a proof that
  // takes hypotheses): `.holds` becomes an axiom that states it directly, so its users stop passing it arguments.
  if (to === 'ASSUMPTION') {
    return {
      intro: one ? 'This passes it arguments:' : 'These pass it arguments:',
      rewrite: one ? 'Rewrite that proof to use it directly' : 'Rewrite them to use it directly',
      keep: one ? 'Keep that proof, marked broken' : 'Keep them, marked broken',
    };
  }
  return {
    intro: one ? 'This uses it:' : 'These use it:',
    rewrite: one ? 'Rewrite that proof to take it as a hypothesis' : 'Rewrite them to take it as a hypothesis',
    keep: one ? 'Keep that proof, marked broken' : 'Keep them, marked broken',
  };
}

function DependentsDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'dependents' }> }) {
  const node = useBoard((s) => s.nodes[dialog.id]);
  const actions = useBoardActions();
  const texts = dependentsTexts(dialog.to, dialog.dependents.length);
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
  const [reason, setReason] = useState('');
  return (
    <Modal labelledBy="tl-dialog-title" testId="dialog-rationale" onCancel={() => actions.closeDialog()}>
      <h2 id="tl-dialog-title" className="tl-dialog__title">
        Make {KIND_NOUN[dialog.to]}
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
        <button type="button" className="tl-button" onClick={() => actions.confirmRationale(reason)}>
          Make {KIND_NOUN[dialog.to]}
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
  const cardOnlyNote = hasLean ? (
    <p className="tl-dialog__note">
      “Card only” keeps the Lean declarations: without the card, <code>axiom …holds</code> becomes an unmarked axiom, a hidden
      assumption Lean still takes as given, and the board flags it in the Vocabulary group.
    </p>
  ) : null;

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
          Delete its Lean code too?
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
        {cardOnlyNote}
        <div className="tl-dialog__buttons">
          <button type="button" className="tl-button tl-button--danger" onClick={() => actions.deleteNode(node.id, false, true)}>
            Delete anyway
          </button>
          <button type="button" className="tl-button tl-button--secondary" onClick={() => actions.deleteNode(node.id, true)}>
            Delete card only, keep Lean
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
      {cardOnlyNote}
      <div className="tl-dialog__buttons">
        <button type="button" className="tl-button tl-button--danger" onClick={() => actions.deleteNode(node.id, false)}>
          {hasLean ? 'Delete card and its Lean code' : 'Delete card'}
        </button>
        {hasLean ? (
          <button type="button" className="tl-button tl-button--secondary" onClick={() => actions.deleteNode(node.id, true)}>
            Delete card only, keep Lean
          </button>
        ) : null}
        <button type="button" className="tl-button tl-button--secondary" data-autofocus onClick={() => actions.closeDialog()}>
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
    case 'revert':
      return <RevertDialog key={dialog.entry.id} dialog={dialog} />;
  }
}
