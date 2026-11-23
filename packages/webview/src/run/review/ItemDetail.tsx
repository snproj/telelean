/**
 * Slice 2g (docs/slice2-plan.md 5.6): the item detail. The header (the label, status, badges and markers, "4 of 12"
 * with Back/Next, Show on board), the body by kind (the host's `ItemDetailView`: a hidden Result shows only what it
 * waits for, with Show results), "Previous proposal" for an updated item, and the footer: Accept, Accept & next and
 * Decline ▾ in review; "✓ Accepted · Back to review" or "✗ Declined (Reject) · Back to review" once decided; to be
 * redone, why (core's lines) and core's refusal instead of the link (2j1, D2-76), then its note for Claude and "Note for
 * Claude…", edited in place (2j2, D2-92, D2-95); a declined item's note, whatever its option (2j2); a disabled Accept
 * says why, with Select them; while Claude's step runs, D2-62's text instead of the buttons.
 */
import {
  DECL_KIND_LABELS,
  DECLINE_OPTION_TEXTS,
  ITEM_MARKER_TEXTS,
  LIMITS,
  REVIEW_TEXTS,
  type ItemDetailView,
  type ItemView,
  type LeanStatementView,
  type SessionView,
  type VocabKind,
} from '@telelean/core';
import { useEffect, useState } from 'react';
import { AgentText, UserText } from '../../common/AgentText';
import { VOCAB_KIND_NOUN } from '../../labels';
import { statementBody, missingArrowHints } from '../../model/run';
import { declineEntries, flagTexts, itemBadges, itemControls, itemLabelParts, itemMarkers, labelOf, namedCard, positionOf, readOnlyReason, redoLines, statusOf, verdictText, wordsIn } from '../../model/review';
import { useBoard, useBoardActions } from '../../state/context';
import { DeclineMenu } from './DeclineMenu';
import { Badges, CardWords, Label, Marked, NamedCardWords, Spinner, StatusMark, usePhrases } from './parts';

const shortName = (name: string) => name.split('.').at(-1) ?? name;

function Statement({ statement, item }: { statement: LeanStatementView; item: string }) {
  const explicit = useBoard((s) => s.sessionReview?.explicit[item] === true);
  const actions = useBoardActions();
  return (
    <div className="tl-review-lean">
      <h4 className="tl-details__heading" title={statement.name}>
        Lean statement <code>{shortName(statement.name)}</code>
      </h4>
      <pre className="tl-lean" data-testid="detail-lean" data-form={explicit ? 'explicit' : 'pretty'}>
        {statementBody(explicit ? statement.explicit : statement.pretty)}
      </pre>
      <label className="tl-check" title="No notation, every argument and universe shown, no coercion arrows">
        <input type="checkbox" data-testid="detail-explicit" checked={explicit} onChange={() => actions.toggleItemExplicit(item)} />
        {REVIEW_TEXTS.fullyExplicit}
      </label>
      <div className="tl-statement__closure" data-testid="detail-uses">
        <h4 className="tl-details__heading">{REVIEW_TEXTS.whatTheLeanUses}</h4>
        {statement.closure.length === 0 ? (
          <p className="tl-details__none">No vocabulary.</p>
        ) : (
          <ul className="tl-details__list">
            {statement.closure.map((entry) => (
              <li key={entry.name} className="tl-closure__item">
                <code className="tl-closure__name">{shortName(entry.name)}</code>
                <span className="tl-closure__kind">{VOCAB_KIND_NOUN[entry.kind as VocabKind] ?? entry.kind}</span>
                {entry.type ? <code className="tl-closure__type">: {entry.type}</code> : null}
                {entry.gloss ? entry.glossBy === 'agent' ? <AgentText text={entry.gloss} /> : <UserText text={entry.gloss} className="tl-closure__gloss" /> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Flag({ text, testId }: { text: string; testId?: string }) {
  return (
    <p className="tl-review-flag" data-testid={testId ?? 'detail-flag'}>
      <span className="codicon codicon-info" aria-hidden="true" /> {text}
    </p>
  );
}

function Cards({ title, cards }: { title: string; cards: ReadonlyArray<{ id: string; sentence: string; wordedBy: 'user' | 'agent' }> }) {
  if (cards.length === 0) return null;
  return (
    <div className="tl-review-cards">
      <h4 className="tl-details__heading">{title}</h4>
      <ul className="tl-details__list">
        {cards.map((c) => (
          <li key={c.id}>
            <CardWords card={c} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The body of one kind (also the "Previous proposal"'s). */
export function DetailBody({ detail, item, session }: { detail: ItemDetailView; item: ItemView; session: SessionView }) {
  const actions = useBoardActions();
  const nodes = Object.fromEntries(session.board.graph.nodes.map((n) => [n.id, n]));
  const has = (marker: ItemView['markers'][number]) => item.markers.includes(marker);
  switch (detail.kind) {
    case 'formalize':
      return (
        <div className="tl-review-body" data-kind="formalize">
          <p className="tl-statement__sentence" data-testid="detail-sentence">
            <CardWords card={detail.card} />
          </p>
          <Statement statement={detail.statement} item={item.id} />
        </div>
      );
    case 'change':
      return (
        <div className="tl-review-body" data-kind="change">
          <p className="tl-statement__sentence">
            <CardWords card={detail.card} />
          </p>
          {detail.fields.map((f) => (
            <div key={f.field} className="tl-review-field" data-field={f.field}>
              <h4 className="tl-details__heading">{f.field}</h4>
              {f.beforeStatement !== undefined || f.afterStatement !== undefined ? (
                <>
                  {f.beforeStatement !== undefined ? <pre className="tl-lean tl-review-before">{statementBody(f.beforeStatement.pretty)}</pre> : null}
                  <span aria-hidden="true">→</span>
                  {f.afterStatement !== undefined ? <Statement statement={f.afterStatement} item={item.id} /> : null}
                </>
              ) : (
                <p>
                  <span className="tl-review-before">{f.before ?? '—'}</span> → <span>{f.after ?? '—'}</span>
                </p>
              )}
            </div>
          ))}
          {has('sentence-lean-may-disagree') ? <Flag text={ITEM_MARKER_TEXTS['sentence-lean-may-disagree']} /> : null}
          <Cards title={REVIEW_TEXTS.mentionedBy} cards={detail.mentionedBy} />
        </div>
      );
    case 'add':
      return (
        <div className="tl-review-body" data-kind="add">
          <p className="tl-statement__sentence">
            <CardWords card={detail.card} />
          </p>
          {detail.fields.map((f) => (
            <p key={f.field} className="tl-review-field" data-field={f.field}>
              <span className="tl-details__label">{f.field}</span> {f.by === 'agent' ? <AgentText text={f.value} /> : <UserText text={f.value} />}
            </p>
          ))}
          {detail.statement !== undefined ? <Statement statement={detail.statement} item={item.id} /> : null}
        </div>
      );
    case 'add-premise':
      return (
        <div className="tl-review-body" data-kind="add-premise">
          <p className="tl-statement__sentence" data-testid="detail-sentence">
            <AgentText text={detail.sentence} />
          </p>
          <p className="tl-review-why">
            <AgentText text={detail.whyNeeded} />
          </p>
          <Statement statement={detail.statement} item={item.id} />
          {!has('no-longer-closes-gap') ? <Flag text={REVIEW_TEXTS.closesGapChecked} /> : null}
          {detail.mayRestate ? <Flag text={REVIEW_TEXTS.mayRestateTarget} /> : null}
          {detail.replacesFromNothing ? <Flag text={REVIEW_TEXTS.replacesFromNothing} /> : null}
          {has('completion-not-checked') ? <Flag text={REVIEW_TEXTS.completionNotChecked} /> : null}
          {has('meaning-differs-in-place') ? <Flag text={REVIEW_TEXTS.meaningDiffersWritten} /> : null}
          {detail.heldAs !== undefined ? <Flag text={detail.heldAs === 'axiom' ? REVIEW_TEXTS.holdAsAxiom : REVIEW_TEXTS.holdAsPending} testId="detail-held-as" /> : null}
        </div>
      );
    case 'add-arrow':
    case 'remove-arrow':
      return (
        <div className="tl-review-body" data-kind={detail.kind}>
          <p className="tl-review-arrow" data-testid="detail-arrow">
            <CardWords card={detail.source} quoted /> → <CardWords card={detail.target} quoted />
          </p>
          {detail.why !== undefined ? (
            <p className="tl-review-why">
              <AgentText text={detail.why} />
            </p>
          ) : null}
          {detail.addsNoNewBasis ? <Flag text={REVIEW_TEXTS.addsNoNewBasis} /> : null}
        </div>
      );
    case 'delete':
      return (
        <div className="tl-review-body" data-kind="delete">
          <p className="tl-statement__sentence">
            <CardWords card={detail.card} />
          </p>
          {detail.arrows.length > 0 ? (
            <ul className="tl-details__list">
              {detail.arrows.map((a) => (
                <li key={`${a.source}->${a.target}`}>
                  <NamedCardWords card={namedCard(nodes, a.source)} /> → <NamedCardWords card={namedCard(nodes, a.target)} />
                </li>
              ))}
            </ul>
          ) : null}
          <Cards title={REVIEW_TEXTS.mentionedBy} cards={detail.mentionedBy} />
        </div>
      );
    case 'vocabulary-term':
      return (
        <div className="tl-review-body" data-kind="vocabulary-term">
          <p>
            <code className="tl-closure__name">{detail.name}</code> <span className="tl-closure__kind">{VOCAB_KIND_NOUN[detail.vocabKind] ?? detail.vocabKind}</span>
            {detail.type !== undefined ? <code className="tl-closure__type">: {detail.type}</code> : null}
          </p>
          {detail.gloss !== undefined ? <p>{detail.glossBy === 'agent' ? <AgentText text={detail.gloss} /> : <UserText text={detail.gloss} />}</p> : null}
          <pre className="tl-lean">{detail.code}</pre>
        </div>
      );
    case 'declaration':
      return (
        <div className="tl-review-body" data-kind="declaration">
          <p>
            <span className="tl-closure__kind">{DECL_KIND_LABELS[detail.declKind]}</span> <code className="tl-closure__name">{detail.name}</code>
          </p>
          {detail.gloss !== undefined ? <p>{detail.glossBy === 'agent' ? <AgentText text={detail.gloss} /> : <UserText text={detail.gloss} />}</p> : null}
          <pre className="tl-lean" data-testid="detail-code">
            {detail.code}
          </pre>
          {detail.before !== undefined ? (
            <details className="tl-review-previous">
              <summary>Before</summary>
              <pre className="tl-lean tl-review-before">{detail.before}</pre>
            </details>
          ) : null}
          <Cards title={REVIEW_TEXTS.relyOnIt} cards={detail.usedByStatementsOf} />
        </div>
      );
    case 'result':
      if (!detail.revealed) {
        const waiting = session.results.waitingFor.map((id) => labelOf(session.items, id));
        return (
          <div className="tl-review-body" data-kind="result" data-revealed="false" data-testid="detail-hidden-result">
            <p className="tl-review-hidden">{REVIEW_TEXTS.hiddenResultDetail(waiting)}</p>
            <Cards title="The question" cards={detail.question} />
            <button
              type="button"
              className="tl-button tl-button--secondary tl-button--small"
              data-testid="detail-show-results"
              disabled={readOnlyReason(session) !== null}
              title={readOnlyReason(session) ?? REVIEW_TEXTS.showResults}
              onClick={() => actions.openReveal('show-result')}
            >
              {REVIEW_TEXTS.showResults}
            </button>
          </div>
        );
      }
      return <ShownResult detail={detail} session={session} />;
    case 'proof-broken':
      return (
        <div className="tl-review-body" data-kind="proof-broken">
          <p className="tl-statement__sentence">
            <CardWords card={detail.card} />
          </p>
          <pre className="tl-lean">{detail.error}</pre>
          <Flag text={REVIEW_TEXTS.reproveWithFormalize} />
        </div>
      );
  }
}

function ShownResult({ detail, session }: { detail: Extract<ItemDetailView, { kind: 'result'; revealed: true }>; session: SessionView }) {
  const nodes = Object.fromEntries(session.board.graph.nodes.map((n) => [n.id, n]));
  const names = (ids: readonly string[]) =>
    ids.length === 0
      ? '—'
      : ids.map((id, i) => (
          <span key={id}>
            {i > 0 ? ', ' : ''}
            <NamedCardWords card={namedCard(nodes, id)} />
          </span>
        ));
  const hints =
    detail.verdict === 'not-proved'
      ? missingArrowHints({ verdict: 'not-proved', ...(detail.gap !== undefined ? { gap: detail.gap } : {}), target: detail.target.id }, detail.question.map((c) => c.id), nodes)
      : [];
  return (
    <div className="tl-review-body" data-kind="result" data-revealed="true">
      <p className="tl-review-verdict" data-testid="detail-verdict" data-verdict={detail.verdict}>
        {verdictText(detail.verdict, detail.reasonChip)}
      </p>
      {flagTexts(detail.flags).map((f) => (
        <Flag key={f} text={f} />
      ))}
      {detail.seenEarly ? <Flag text={REVIEW_TEXTS.seenEarly} testId="detail-seen-early" /> : null}
      <p className="tl-review-band" data-testid="detail-band">
        <span className="tl-details__label">Band</span> {names(detail.band.used)} {detail.band.complete ? <span title={REVIEW_TEXTS.consistencyUncheckedLower}>✓</span> : null}
        {detail.band.open.length > 0 ? <span className="tl-run__hint"> ({detail.band.open.join('; ')})</span> : null}
      </p>
      {detail.restsOn.length > 0 ? (
        <p data-testid="detail-rests-on">
          <span className="tl-details__label">Rests on</span> {names(detail.restsOn)}
          {detail.throughResults.map((id) => {
            const card = namedCard(nodes, id);
            return (
              <span key={id}>
                {' · '}
                <Label parts={wordsIn(REVIEW_TEXTS.throughProof(`“${card.name}”`), card.name, card.by)} />
              </span>
            );
          })}
        </p>
      ) : null}
      {detail.band.notNeeded.length > 0 ? (
        <p>
          <span className="tl-details__label">{REVIEW_TEXTS.notNeeded}</span> {names(detail.band.notNeeded)}
        </p>
      ) : null}
      {detail.basisChanged.length > 0 ? <Cards title="Their basis changes" cards={detail.basisChanged} /> : null}
      {detail.proof !== undefined ? (
        <details className="tl-review-proof" data-testid="detail-proof">
          <summary>The proof (Lean)</summary>
          <pre className="tl-lean">{detail.proof.code}</pre>
        </details>
      ) : null}
      {detail.previousProof !== undefined ? (
        <details className="tl-review-previous">
          <summary>{RESULT_REPLACES}</summary>
          <pre className="tl-lean tl-review-before">{detail.previousProof}</pre>
        </details>
      ) : null}
      {detail.completion === 'not-checked' ? <Flag text={REVIEW_TEXTS.completionNotChecked} /> : null}
      {detail.verdict === 'not-proved' ? (
        <div className="tl-review-gap" data-testid="detail-gap">
          {detail.gap !== undefined ? (
            <p>
              <span className="tl-details__label">{REVIEW_TEXTS.whatIsMissing}</span> <AgentText text={detail.gap} />
            </p>
          ) : null}
          {hints.length > 0 ? (
            <ul className="tl-details__list">
              {hints.map((h) => (
                <li key={h.id}>{h.text}</li>
              ))}
            </ul>
          ) : null}
          <p className="tl-run__hint">{REVIEW_TEXTS.consistencyUncheckedLower}</p>
        </div>
      ) : null}
      {detail.summary !== undefined ? <AgentText text={detail.summary} marker="prefix" block /> : null}
    </div>
  );
}

/** Builder 2g: the previous proof's summary line ("replaces your proof", RV-1). */
const RESULT_REPLACES = 'replaces your proof: the previous proof';

function Footer({ item, session }: { item: ItemView; session: SessionView }) {
  const busy = useBoard((s) => s.sessionBusy !== null);
  const menu = useBoard((s) => (s.declineMenu !== null && s.declineMenu.origin === 'item' && s.declineMenu.items[0] === item.id ? s.declineMenu : null));
  const actions = useBoardActions();
  const phrases = usePhrases(session);
  const ro = readOnlyReason(session);
  if (ro !== null) {
    return (
      <div className="tl-review-footer" data-testid="detail-footer" data-readonly="true">
        <p className="tl-run__hint">{ro}</p>
      </div>
    );
  }
  const controls = itemControls(item, session, busy);
  const missing = item.accept.ok ? [] : (item.accept.missing ?? []);
  if (item.status === 'in-review') {
    return (
      <div className="tl-review-footer" data-testid="detail-footer">
        <div className="tl-run__buttons">
          <button type="button" className="tl-button tl-button--small" data-testid="detail-accept" disabled={!controls.accept.enabled} title={controls.accept.title} onClick={() => actions.acceptItem(item.id)}>
            {REVIEW_TEXTS.accept}
          </button>
          <button
            type="button"
            className="tl-button tl-button--secondary tl-button--small"
            data-testid="detail-accept-next"
            disabled={!controls.acceptNext.enabled}
            title={controls.acceptNext.title}
            onClick={() => actions.acceptItem(item.id, true)}
          >
            {REVIEW_TEXTS.acceptAndNext}
          </button>
          <button
            type="button"
            className="tl-button tl-button--secondary tl-button--small"
            data-testid="detail-decline"
            aria-expanded={menu !== null}
            disabled={!controls.decline.enabled}
            title={controls.decline.title}
            onClick={() => (menu !== null ? actions.closeDeclineMenu() : actions.openDeclineMenu([item.id], 'item'))}
          >
            {REVIEW_TEXTS.declineMenu}
          </button>
        </div>
        {!item.accept.ok ? (
          <p className="tl-review-reason" data-testid="detail-accept-reason">
            <Marked text={item.accept.reason} phrases={phrases} />{' '}
            {missing.length > 0 ? (
              <button type="button" className="tl-link" data-testid="detail-select-them" onClick={() => actions.selectItems(missing)}>
                {REVIEW_TEXTS.selectThem}
              </button>
            ) : null}
          </p>
        ) : null}
        {menu !== null ? <DeclineMenu entries={declineEntries(item)} /> : null}
      </div>
    );
  }
  // 2j1 (D2-76 D2, D4): an item to be redone says why (core's lines), then core's refusal in place of the Back to
  // review link; no Decline button (core still allows one, RV-3).
  if (item.status === 'to-be-redone') {
    const lines = redoLines(item);
    const sentence = item.review.ok ? REVIEW_TEXTS.redoneByClaude : item.review.reason;
    return (
      <div className="tl-review-footer" data-testid="detail-footer" data-redo="true">
        {lines.length > 0 ? (
          <ul className="tl-review-redo" data-testid="detail-redo-why">
            {lines.map((text, i) => (
              <li key={i} className="tl-review-decided" data-testid="detail-redo-line">
                <Marked text={text} phrases={phrases} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="tl-review-decided" data-testid="detail-decided">{`${statusOf(item).glyph} ${statusOf(item).word}`}</p>
        )}
        <p className="tl-run__hint" data-testid="detail-redo-refusal">
          <Marked text={sentence} phrases={phrases} />
        </p>
        <RedoNote item={item} busy={busy} />
      </div>
    );
  }
  // "✓ Accepted · Back to review", "✗ Declined (Reject) · Back to review" (§5.6): core's words, the link ours.
  const tail = ` · ${REVIEW_TEXTS.backToReview}`;
  const option = item.declined?.option;
  const word =
    item.status === 'accepted'
      ? REVIEW_TEXTS.acceptedFooter.replace(tail, '')
      : item.status === 'declined' && (option === 'reject' || option === 'shaky')
        ? REVIEW_TEXTS.declinedFooter(DECLINE_OPTION_TEXTS[option]).replace(tail, '')
        : item.status === 'declined'
          ? '✗ Declined'
          : `${statusOf(item).glyph} ${statusOf(item).word}`;
  return (
    <div className="tl-review-footer" data-testid="detail-footer">
      <p className="tl-review-decided" data-testid="detail-decided">
        {word} ·{' '}
        <button type="button" className="tl-link" data-testid="detail-back-to-review" disabled={!controls.review.enabled} title={controls.review.title} onClick={() => actions.reopenItem(item.id)}>
          {REVIEW_TEXTS.backToReview}
        </button>
      </p>
      {!controls.review.enabled ? (
        <p className="tl-run__hint">
          <Marked text={controls.review.title} phrases={phrases} />
        </p>
      ) : null}
      {item.declined?.note !== undefined ? (
        <p className="tl-review-note" data-testid="detail-decline-note">
          {REVIEW_TEXTS.noteLabel}: <UserText text={item.declined.note} />
        </p>
      ) : null}
    </div>
  );
}

/**
 * 2j2 (D2-92, D2-95): the note for Claude on an item to be redone: shown, and "Note for Claude…" edits it in place; Save
 * sends `noteItem` (a blank note clears it), Cancel and Esc drop the edit; Ctrl+Enter saves.
 */
function RedoNote({ item, busy }: { item: ItemView; busy: boolean }) {
  const actions = useBoardActions();
  // `sent`: the text Save sent. The editor stays open until the host's view holds that note (fixer 2j2 r1, F-F6): a
  // refused note (a conflict, a step started) keeps what was typed, with the error toast.
  const [editing, setEditing] = useState<{ item: string; text: string; sent?: string } | null>(null);
  const note = item.redo?.note;
  const open = editing !== null && editing.item === item.id ? editing : null;
  const sentText = open?.sent;
  useEffect(() => {
    if (sentText !== undefined && (note ?? '') === sentText) setEditing(null);
  }, [sentText, note]);
  const save = () => {
    if (open === null) return;
    const text = open.text.trim().slice(0, LIMITS.textLength);
    if (text === (note ?? '')) setEditing(null);
    else if (actions.noteItem(item.id, open.text)) setEditing({ ...open, sent: text });
  };
  return (
    <div className="tl-review-redo-note" data-testid="detail-redo-note">
      {note !== undefined && open === null ? (
        <p className="tl-review-note" data-testid="detail-redo-note-text">
          {REVIEW_TEXTS.noteLabel}: <UserText text={note} />
        </p>
      ) : null}
      {open === null ? (
        <button type="button" className="tl-link" data-testid="detail-redo-note-edit" disabled={busy} onClick={() => setEditing({ item: item.id, text: note ?? '' })}>
          {REVIEW_TEXTS.noteForClaudeEdit}
        </button>
      ) : (
        <div className="tl-decline__note">
          <label className="tl-decline__label" htmlFor="tl-redo-note">
            {REVIEW_TEXTS.noteForClaude}
          </label>
          <textarea
            id="tl-redo-note"
            className="tl-input tl-decline__text"
            data-testid="detail-redo-note-input"
            rows={3}
            maxLength={LIMITS.textLength}
            autoFocus
            value={open.text}
            onChange={(event) => setEditing({ item: item.id, text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                save();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setEditing(null);
              }
            }}
          />
          <div className="tl-decline__buttons">
            <button type="button" className="tl-button tl-button--small" data-testid="detail-redo-note-save" disabled={busy} onClick={save}>
              {REVIEW_TEXTS.noteSave}
            </button>
            <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="detail-redo-note-cancel" onClick={() => setEditing(null)}>
              {REVIEW_TEXTS.noteCancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ItemDetail({ item, session, ids, narrow }: { item: ItemView; session: SessionView; ids: readonly string[]; narrow: boolean }) {
  const busy = useBoard((s) => s.sessionBusy?.items?.includes(item.id) === true);
  const actions = useBoardActions();
  const status = statusOf(item);
  const position = positionOf(ids, item.id);
  const card = item.detail.kind === 'add-arrow' || item.detail.kind === 'remove-arrow' ? item.detail.target : item.cards[0];
  return (
    <section className="tl-review-detail" data-testid="item-detail" data-item={item.id} data-kind={item.kind} aria-label={labelOf(session.items, item.id)}>
      <header className="tl-review-detail__head">
        {narrow ? (
          <button type="button" className="tl-link" data-testid="detail-all-items" onClick={() => actions.setReviewPane('list')}>
            {REVIEW_TEXTS.allItems}
          </button>
        ) : null}
        <h3 className="tl-review-detail__title" data-testid="detail-label">
          <Label parts={itemLabelParts(item)} />
        </h3>
        <div className="tl-review-detail__meta">
          <StatusMark glyph={status.glyph} word={status.word} status={status.status} />
          {busy ? <Spinner label="Deciding…" /> : null}
          <Badges badges={itemBadges(item)} markers={itemMarkers(item)} />
          <span className="tl-details__spacer" />
          {position !== null ? (
            <span className="tl-review-detail__nav">
              <button type="button" className="tl-icon-button" aria-label="Back" title="Back (↑)" onClick={() => actions.moveCurrent(-1)}>
                <span className="codicon codicon-chevron-up" aria-hidden="true" />
              </button>
              <span data-testid="detail-position">{REVIEW_TEXTS.position(position.index, position.of)}</span>
              <button type="button" className="tl-icon-button" aria-label="Next" title="Next (↓)" onClick={() => actions.moveCurrent(1)}>
                <span className="codicon codicon-chevron-down" aria-hidden="true" />
              </button>
            </span>
          ) : null}
          {card !== undefined ? (
            <button type="button" className="tl-link" data-testid="detail-show-on-board" onClick={() => actions.showOnBoard(card.id)}>
              {REVIEW_TEXTS.showOnBoard}
            </button>
          ) : null}
        </div>
      </header>
      <DetailBody detail={item.detail} item={item} session={session} />
      {item.previous !== undefined && item.markers.includes('updated') ? (
        <details className="tl-review-previous" data-testid="detail-previous">
          <summary>{REVIEW_TEXTS.previousProposal}</summary>
          <DetailBody detail={item.previous} item={item} session={session} />
        </details>
      ) : null}
      <Footer item={item} session={session} />
    </section>
  );
}
