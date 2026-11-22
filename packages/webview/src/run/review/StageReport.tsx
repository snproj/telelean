/**
 * Slice 2g (docs/slice2-plan.md 5.3, 5.4, 5.7): the session panel's parts above and below the list.
 *  - Inferences: "Formalize for dependencies", one line per target with its step chip (never a verdict);
 *  - the stage report (RV-10), a `<details open>`: while the results are hidden only "result after the review" per
 *    target and Show results; once shown, the verdicts, bands, Rests on, Not needed, What is missing (with "Select these
 *    arrows"), each step's words with "Assumed without asking" and Ask me instead, "proposed nothing", the steps'
 *    outcomes in telelean's words and the notes; always "Consistency unchecked"; the withdrawn items;
 *  - the events box: "Since your last action: …", with links to the items;
 *  - "Rejected in this session": the current rejects with Un-reject, superseded versions view only.
 */
import { DECLINE_OPTION_TEXTS, ITEM_STATUS_TEXTS, REVIEW_TEXTS, type SessionView } from '@telelean/core';
import { AgentText } from '../../common/AgentText';
import { formatClock } from '../../model/run';
import { askMeControl, inferenceLines, listControls, reportSummary, reportTargets, unrejectControl } from '../../model/review';
import { useBoard, useBoardActions } from '../../state/context';
import { DeclineMenu } from './DeclineMenu';
import { ItemLink, Label, Marked, NamedCardWords, usePhrases } from './parts';

/** Builder 2g: Claude's arrow in a band, with its item's status; Un-reject (§5.7's word); a superseded version. */
export const CLAUDE_ARROW = (status: keyof typeof ITEM_STATUS_TEXTS) => ` (Claude's arrow: ${ITEM_STATUS_TEXTS[status].glyph} ${ITEM_STATUS_TEXTS[status].word})`;
export const UNREJECT = 'Un-reject';
export const EARLIER_VERSION = ' (an earlier version, view only)';

export function Inferences({ session }: { session: SessionView }) {
  const actions = useBoardActions();
  const lines = inferenceLines(session);
  return (
    <section className="tl-run__section tl-review-inferences" data-testid="session-inferences" aria-label={REVIEW_TEXTS.formalizeForDependencies}>
      <h3 className="tl-run__heading">{REVIEW_TEXTS.formalizeForDependencies}</h3>
      <ul className="tl-details__list">
        {lines.map((line) => (
          <li key={line.target.id} className="tl-review-inference" data-testid="session-inference" data-target={line.target.id}>
            <span className="tl-review-inference__text">
              <Label parts={line.parts} />
            </span>
            {line.chip !== null ? (
              <span className="tl-review-chip" data-testid="step-chip" data-state={line.state ?? undefined}>
                {line.chip}
              </span>
            ) : null}
            {line.result !== undefined ? (
              <button type="button" className="tl-link" onClick={() => actions.focusItem(line.result as string)}>
                {REVIEW_TEXTS.showReviewItem}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AskMeInstead({ session, step, index, named }: { session: SessionView; step: string; index: number; named: readonly string[] }) {
  const busy = useBoard((s) => s.sessionBusy !== null);
  const menu = useBoard((s) => (s.declineMenu?.origin === 'report' && s.declineMenu.key === `${step}:${index}` ? s.declineMenu : null));
  const actions = useBoardActions();
  const control = askMeControl(session, step, named, busy);
  return (
    <>
      <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="ask-me-instead" disabled={!control.enabled} title={control.title} onClick={() => actions.askMeInstead(step, index)}>
        {REVIEW_TEXTS.askMeInstead}
      </button>
      {menu !== null ? <DeclineMenu entries={[{ option: 'shaky', label: DECLINE_OPTION_TEXTS.shaky, note: true }]} testId="decline-menu-ask" /> : null}
    </>
  );
}

export function StageReport({ session }: { session: SessionView }) {
  const busy = useBoard((s) => s.sessionBusy !== null);
  const actions = useBoardActions();
  const phrases = usePhrases(session);
  const shown = session.results.shown;
  const controls = listControls(session, [], busy);
  const targets = reportTargets(session);
  const outcomes = session.steps.filter((s) => s.outcome !== undefined);
  return (
    <details className="tl-run__section tl-report tl-stage-report" data-testid="stage-report" data-shown={shown} open>
      <summary className="tl-run__heading" data-testid="stage-report-summary">
        {reportSummary(session)}
      </summary>
      {!shown && session.phase === 'stage' ? (
        <button
          type="button"
          className="tl-button tl-button--secondary tl-button--small"
          data-testid="report-show-results"
          disabled={!controls.showResults.enabled}
          title={controls.showResults.title}
          onClick={() => actions.openReveal('show-result')}
        >
          {REVIEW_TEXTS.showResults}
        </button>
      ) : null}
      <ul className="tl-details__list">
        {targets.map((t) => (
          <li key={t.target} className="tl-stage-report__target" data-testid="report-target" data-target={t.target} data-revealed={t.revealed}>
            <span className="tl-stage-report__name">
              <CardName session={session} id={t.target} name={t.name} />
            </span>{' '}
            {t.verdict === undefined ? (
              <span className="tl-run__hint">{REVIEW_TEXTS.resultAfterReview}</span>
            ) : (
              <>
                <span className="tl-review-verdict" data-testid="report-verdict">
                  {t.verdict}
                </span>
                {t.band !== undefined ? (
                  <p className="tl-review-band" data-testid="report-band">
                    <span className="tl-details__label">Band</span>{' '}
                    {t.band.used.map((u, i) => (
                      <span key={u.id} data-claude={u.status !== undefined || undefined}>
                        {i > 0 ? ', ' : ''}
                        <NamedCardWords card={u} />
                        {u.status !== undefined ? CLAUDE_ARROW(u.status) : ''}
                      </span>
                    ))}
                    {t.band.complete ? <span title={REVIEW_TEXTS.consistencyUncheckedLower}> ✓</span> : null}
                    {t.band.open.length > 0 ? <span className="tl-run__hint"> ({t.band.open.join('; ')})</span> : null}
                  </p>
                ) : null}
                {t.restsOn !== undefined && t.restsOn.length > 0 ? (
                  <p data-testid="report-rests-on">
                    <span className="tl-details__label">Rests on</span>{' '}
                    {t.restsOn.map((r, i) => (
                      <span key={r.id}>
                        {i > 0 ? ', ' : ''}
                        <NamedCardWords card={r} />
                      </span>
                    ))}
                    {(t.throughResults ?? []).map((x, i) => (
                      <span key={i}>
                        {' · '}
                        <Label parts={x} />
                      </span>
                    ))}
                  </p>
                ) : null}
                {t.notNeeded !== undefined && t.notNeeded.length > 0 ? (
                  <p>
                    <span className="tl-details__label">{REVIEW_TEXTS.notNeeded}</span>{' '}
                    {t.notNeeded.map((r, i) => (
                      <span key={r.id}>
                        {i > 0 ? ', ' : ''}
                        <NamedCardWords card={r} />
                      </span>
                    ))}
                  </p>
                ) : null}
                {t.gap !== undefined ? (
                  <div data-testid="report-gap">
                    <span className="tl-details__label">{REVIEW_TEXTS.whatIsMissing}</span> <AgentText text={t.gap} />
                    {(t.hints ?? []).length > 0 ? (
                      <ul className="tl-details__list">
                        {(t.hints ?? []).map((h) => (
                          <li key={h.id}>
                            <Marked text={h.text} phrases={phrases} />{' '}
                            {h.kind === 'select' ? (
                              <button type="button" className="tl-link" data-testid="report-select-arrows" onClick={() => actions.selectReportArrows(t.target, { source: h.id, target: t.target })}>
                                {REVIEW_TEXTS.selectTheseArrows}
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {t.missing !== undefined && t.missing.length > 0 ? (
                  <div data-testid="report-missing">
                    <span className="tl-details__label">{REVIEW_TEXTS.whatIsMissing}</span>
                    <ul className="tl-details__list">
                      {t.missing.map((m) => (
                        <li key={m.text}>
                          <Marked text={m.text} phrases={phrases} />{' '}
                          {m.select !== undefined ? (
                            <button type="button" className="tl-link" data-testid="report-select-arrows" onClick={() => actions.selectReportArrows(t.target, m.select)}>
                              {REVIEW_TEXTS.selectTheseArrows}
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="tl-run__hint" data-testid="report-consistency">
        {REVIEW_TEXTS.consistencyUnchecked}
      </p>
      {session.report.steps
        .filter((s) => s.revealed)
        .map((s) => (
          <div key={s.step} className="tl-stage-report__step" data-testid="report-step" data-step={s.step} data-agent-scope>
            {s.summary !== undefined ? <AgentText text={s.summary} marker="prefix" block /> : null}
            {s.proposedNothing !== undefined ? <p>{REVIEW_TEXTS.proposedNothing(s.proposedNothing)}</p> : null}
            {(s.assumedWithoutAsking ?? []).length > 0 ? (
              <div className="tl-report__assumed">
                <h4 className="tl-details__heading">{REVIEW_TEXTS.assumedWithoutAsking}</h4>
                <ul className="tl-details__list">
                  {(s.assumedWithoutAsking ?? []).map((a, i) => (
                    <li key={a.text}>
                      <AgentText text={a.text} /> <AskMeInstead session={session} step={s.step} index={i} named={a.items} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      {outcomes.length > 0 ? (
        <ul className="tl-details__list" data-testid="report-outcomes">
          {outcomes.map((s) => (
            <li key={s.id}>{s.outcome}</li>
          ))}
        </ul>
      ) : null}
      {session.report.notes.map((n) => (
        <p key={n} className="tl-report__note" data-testid="report-note">
          <Marked text={n} phrases={phrases} />
        </p>
      ))}
      {session.report.withdrawn.length > 0 ? (
        <div data-testid="report-withdrawn">
          <h4 className="tl-details__heading">{ITEM_STATUS_TEXTS.withdrawn.word}</h4>
          <ul className="tl-details__list">
            {session.report.withdrawn.map((w) => (
              <li key={`${w.label}-${w.at}`}>
                – <Marked text={w.label} phrases={phrases} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}

/** A target in the report: as its inference names it (its author's style), else as the board does. */
function CardName({ session, id, name }: { session: SessionView; id: string; name: string }) {
  const ref = session.inferences.find((i) => i.target.id === id)?.target;
  return <NamedCardWords card={{ id, name, by: ref?.wordedBy ?? 'user' }} />;
}

export function EventsBox({ session }: { session: SessionView }) {
  const seen = useBoard((s) => s.sessionReview?.seenEvent ?? 0);
  const actions = useBoardActions();
  const phrases = usePhrases(session);
  const events = session.events.filter((e) => e.id > seen);
  if (events.length === 0) return null;
  return (
    <section className="tl-run__section tl-review-events" data-testid="session-events" aria-label={REVIEW_TEXTS.eventsLead}>
      <div className="tl-run__heading">
        {REVIEW_TEXTS.eventsLead}
        <span className="tl-details__spacer" />
        <button type="button" className="tl-icon-button" aria-label="Dismiss" title="Dismiss" onClick={() => actions.dismissEvents()}>
          <span className="codicon codicon-close" aria-hidden="true" />
        </button>
      </div>
      <ul className="tl-details__list">
        {events.map((e) => (
          <li key={e.id} data-testid="session-event">
            <time className="tl-run__time" dateTime={e.at}>
              {formatClock(e.at)}
            </time>{' '}
            <Marked text={e.text} phrases={phrases} />{' '}
            {e.items.map((id, i) => (
              <span key={id}>
                {i > 0 ? ', ' : ''}
                <ItemLink id={id} session={session} />
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RejectedList({ session }: { session: SessionView }) {
  const busy = useBoard((s) => s.sessionBusy !== null);
  const actions = useBoardActions();
  const phrases = usePhrases(session);
  if (session.rejected.length === 0) return null;
  return (
    <details className="tl-run__section tl-review-rejected" data-testid="session-rejected" open>
      <summary className="tl-run__heading">
        {REVIEW_TEXTS.rejectedInSession} ({session.rejected.length})
      </summary>
      <ul className="tl-details__list">
        {session.rejected.map((r) => {
          const control = unrejectControl(r, session, busy);
          return (
            <li key={`${r.item}-${r.rev}`} data-testid="rejected-item" data-superseded={r.superseded || undefined}>
              {r.superseded ? (
                <button type="button" className="tl-link" onClick={() => actions.focusItem(r.item)}>
                  <Marked text={r.label} phrases={phrases} />
                </button>
              ) : (
                <ItemLink id={r.item} session={session} fallback={r.label} />
              )}
              {control !== null ? (
                <>
                  {' '}
                  <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="unreject" disabled={!control.enabled} title={control.title} onClick={() => actions.unrejectItem(r.item)}>
                    {UNREJECT}
                  </button>
                </>
              ) : (
                <span className="tl-run__hint">{EARLIER_VERSION}</span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
