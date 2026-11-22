/**
 * Slice 2g (docs/slice2-plan.md 5.9): the end confirmation, in place of the list while the phase is `confirming` (not
 * modal, so its links work: a link shows the item's detail below it). Changes (N), each a link; "Rejected, not applied
 * (M)", folded; "not run" for the inferences whose step never ended; the definitions and presuppositions the user
 * endorses; the final check (running: build · checks · backstop; passed ✓; failed ✗ with every failure); Apply (only
 * on a passed check with no drift; it sends the check id), Back to review, Exit session…. No freeze list, no keep tick.
 */
import { DECL_KIND_LABELS, REVIEW_TEXTS, type EndConfirmationView, type SessionView } from '@telelean/core';
import { rowIds, reviewRows } from '../../model/review';
import { confirmationModel } from '../../model/sessionBar';
import { useBoard, useBoardActions } from '../../state/context';
import { ItemDetail } from './ItemDetail';
import { CardWords, ItemLink, Marked, usePhrases } from './parts';

function ItemLinks({ items, session }: { items: ReadonlyArray<{ item: string; label: string }>; session: SessionView }) {
  return (
    <ul className="tl-details__list">
      {items.map((c) => (
        <li key={c.item}>
          <ItemLink id={c.item} session={session} fallback={c.label} testId="confirmation-link" />
        </li>
      ))}
    </ul>
  );
}

export function EndConfirmation({ session, confirmation }: { session: SessionView; confirmation: EndConfirmationView }) {
  const busy = useBoard((s) => s.sessionBusy?.action ?? null);
  const current = useBoard((s) => s.sessionReview?.current ?? null);
  const actions = useBoardActions();
  const model = confirmationModel(session, confirmation);
  const phrases = usePhrases(session);
  const target = (id: string) => session.inferences.find((i) => i.target.id === id)?.target ?? { sentence: id, wordedBy: 'user' as const };
  const item = session.items.find((i) => i.id === current);
  const nodes = Object.fromEntries(session.board.graph.nodes.map((n) => [n.id, n]));
  const ids = rowIds(reviewRows(session.items, session.inferences, nodes, 'all'));
  return (
    <div className="tl-run__section tl-end" data-testid="end-confirmation" data-check={model.check.state}>
      <h3 className="tl-run__heading">{REVIEW_TEXTS.confirmingPhase}</h3>
      <section data-testid="confirmation-changes">
        <h4 className="tl-details__heading">{REVIEW_TEXTS.changesN(confirmation.changes.length)}</h4>
        <ItemLinks items={confirmation.changes} session={session} />
      </section>
      {confirmation.rejected.length > 0 ? (
        <details data-testid="confirmation-rejected">
          <summary>{REVIEW_TEXTS.rejectedNotApplied(confirmation.rejected.length)}</summary>
          <ItemLinks items={confirmation.rejected} session={session} />
        </details>
      ) : null}
      {confirmation.notRun.length > 0 ? (
        <ul className="tl-details__list" data-testid="confirmation-not-run">
          {confirmation.notRun.map((t) => (
            <li key={t}>
              <CardWords card={target(t)} quoted />: {REVIEW_TEXTS.notRun}
            </li>
          ))}
        </ul>
      ) : null}
      {confirmation.endorsed.length > 0 ? (
        <section data-testid="confirmation-endorsed">
          <h4 className="tl-details__heading">{REVIEW_TEXTS.endorseTitle}</h4>
          <ul className="tl-details__list">
            {confirmation.endorsed.map((e) => (
              <li key={e.name}>
                <span className="tl-closure__kind">{DECL_KIND_LABELS[e.declKind]}</span> <code>{e.name}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="tl-end__check" data-testid="final-check" data-state={model.check.state}>
        <h4 className="tl-details__heading">{REVIEW_TEXTS.finalCheck}</h4>
        <p>
          {model.check.state === 'running' ? <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" /> : null}
          {model.check.state === 'passed' ? <span aria-hidden="true">✓ </span> : null}
          {model.check.state === 'failed' ? <span aria-hidden="true">✗ </span> : null}
          {model.check.text}
        </p>
        {model.check.state === 'passed' && model.check.reused ? <p className="tl-run__hint">{REVIEW_TEXTS.fileChecksReused}</p> : null}
        {model.failures.length > 0 ? (
          <ul className="tl-details__list" data-testid="final-check-failures">
            {model.failures.map((f, i) => (
              <li key={i} data-rule={confirmation.check.failures[i]?.rule}>
                <span className="tl-details__label">{f.rule}</span> <Marked text={f.text} phrases={phrases} />{' '}
                {f.items.map((id) => (
                  <ItemLink key={id} id={id} session={session} />
                ))}
                {f.declaration !== undefined ? <code> {f.declaration}</code> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <div className="tl-run__buttons">
        <button type="button" className="tl-button" data-testid="confirmation-apply" disabled={!model.apply.enabled || busy !== null} title={model.apply.title} onClick={() => actions.applyEnd()}>
          {REVIEW_TEXTS.apply}
        </button>
        <button type="button" className="tl-button tl-button--secondary" data-testid="confirmation-back" disabled={busy !== null || session.phase !== 'confirming'} onClick={() => actions.backToReview()}>
          {REVIEW_TEXTS.backToReview}
        </button>
        <button type="button" className="tl-button tl-button--secondary" data-testid="confirmation-exit" disabled={session.phase === 'applying'} onClick={() => actions.openExitSession()}>
          {REVIEW_TEXTS.exitSessionEllipsis}
        </button>
      </div>
      {item !== undefined ? <ItemDetail item={item} session={session} ids={ids} narrow={false} /> : null}
    </div>
  );
}
