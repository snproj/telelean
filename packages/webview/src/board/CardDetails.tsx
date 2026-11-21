/**
 * The expanded part of a card (03 section 7 "Expanded"): the Lean code, the node's problems, its footprint and
 * presuppositions, "Depends on / Used by" (also the keyboard and screen-reader route through the graph; M2
 * carry-over 1: "Used by" also lists users the board does not show as cards, `LeanBinding.externalUsers`), the
 * attempts history (M2, D-18), the stance and source chips, and the keyboard equivalents of the gestures (Move to
 * axioms, Edit, Delete; spec v4 slice 1b: the arrow actions). In the proposed view (read-only) the chips and the
 * editing buttons are left out; its arrow actions and "Move to axioms" are shown disabled, with their reason (spec v4
 * ES-9, slice 1f). While an edit session (a run) is active, every editing control of the Current board is disabled,
 * with the reason as its tooltip; "Select incoming arrows" (a selection) stays.
 *
 * Presses here never drag the card and clicks never change the selection: the card face is the handle.
 */
import { EVIDENTIALS, STANCES, type AttemptSummary, type BoardDiagnostic, type ExternalUser, type TlNode } from '@telelean/core';
import { useMemo, useState, type MouseEvent } from 'react';
import { AgentText } from '../common/AgentText';
import { ExternalUserItem } from '../common/ExternalUser';
import { InlineCode } from '../common/InlineCode';
import { KIND_GLYPH, SOURCE_LABEL, STANCE_LABEL } from '../labels';
import { dependsOn, footprintEntries, presuppositionLabel, RELATION_TEXT, usedBy, type Relation } from '../model/cardData';
import { formatTime, plainText } from '../model/format';
import { VERDICT_LABEL } from '../model/run';
import { useBoard, useBoardActions } from '../state/context';
import { boardView, editLock, impactOf, PROPOSED_ARROWS_LOCKED, proposedOverlay } from '../state/store';
import { LeanCode } from './LeanCode';

const stop = (event: MouseEvent) => event.stopPropagation();

function NodeButton({ id }: { id: string }) {
  const node = useBoard((s) => boardView(s).nodes[id]);
  const actions = useBoardActions();
  if (!node) return <code>{id}</code>;
  return (
    <button type="button" className="tl-rel" data-rel-id={id} title="Show this card" onClick={() => actions.revealNode(id)}>
      <span className="tl-glyph" data-kind={node.type} aria-hidden="true">
        {KIND_GLYPH[node.type]}
      </span>
      <span className="tl-rel__text">{node.naturalName}</span>
    </button>
  );
}

function Relations({
  title,
  testId,
  relations,
  external = [],
  empty,
}: {
  title: string;
  testId: string;
  relations: Relation[];
  /** Users outside the board (carry-over 1): listed after the cards. */
  external?: readonly ExternalUser[];
  empty: string;
}) {
  return (
    <section className="tl-details__section" data-testid={testId}>
      <h4 className="tl-details__heading">{title}</h4>
      {relations.length === 0 && external.length === 0 ? (
        <p className="tl-details__none">{empty}</p>
      ) : (
        <ul className="tl-details__list">
          {relations.map((relation) => (
            <li key={relation.id} className="tl-details__rel">
              <NodeButton id={relation.id} />
              <span className="tl-rel__why">{relation.reasons.map((r) => RELATION_TEXT[r]).join(', ')}</span>
            </li>
          ))}
          {external.map((user) => (
            <li key={`${user.where}:${user.name}`} className="tl-details__rel" data-testid="external-user">
              <ExternalUserItem user={user} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The attempts history (D-18): every Formalize for dependencies round (M2's "These suffice") with this card as the target, newest first. */
const ATTEMPTS_SHOWN = 5;
const RESOLUTION_TEXT: Readonly<Record<NonNullable<AttemptSummary['resolution']>, string>> = {
  accepted: 'accepted',
  discarded: 'discarded',
  superseded: 'continued in a later round',
};

function Attempts({ attempts }: { attempts: readonly AttemptSummary[] }) {
  const nodes = useBoard((s) => s.nodes);
  const [all, setAll] = useState(false);
  if (attempts.length === 0) return null;
  const shown = all ? attempts : attempts.slice(0, ATTEMPTS_SHOWN);
  return (
    <section className="tl-details__section" data-testid="attempts">
      <h4 className="tl-details__heading">Attempts ({attempts.length})</h4>
      <ol className="tl-attempts">
        {shown.map((attempt) => (
          <li key={attempt.id} className="tl-attempt" data-testid="attempt" data-verdict={attempt.verdict} data-resolution={attempt.resolution ?? 'open'}>
            <div className="tl-attempt__line">
              <time className="tl-attempt__date" dateTime={attempt.date} data-testid="attempt-date">
                {formatTime(attempt.date)}
              </time>
              <strong className="tl-attempt__verdict" data-testid="attempt-verdict">
                {VERDICT_LABEL[attempt.verdict]}
              </strong>
              {attempt.round > 1 ? <span className="tl-attempt__meta">round {attempt.round}</span> : null}
              <span className="tl-attempt__resolution" data-testid="attempt-resolution">
                {attempt.resolution ? RESOLUTION_TEXT[attempt.resolution] : 'not resolved'}
              </span>
            </div>
            <div className="tl-attempt__premises" data-testid="attempt-premises">
              {attempt.premises.length === 0
                ? 'from no premises (follows from nothing?)'
                : `from ${attempt.premises.map((id) => `“${nodes[id]?.naturalName ?? id}”`).join(', ')}`}
            </div>
            {attempt.summary ? <AgentText text={attempt.summary} block className="tl-attempt__summary" testId="attempt-summary" /> : null}
            <div className="tl-attempt__meta">
              {attempt.gateAttempts} check attempt{attempt.gateAttempts === 1 ? '' : 's'} · {attempt.model}
              {attempt.effort ? ` (${attempt.effort})` : ''}
            </div>
          </li>
        ))}
      </ol>
      {attempts.length > ATTEMPTS_SHOWN ? (
        <button type="button" className="tl-icon-button" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${attempts.length}`}
        </button>
      ) : null}
    </section>
  );
}

function Problems({ diagnostics }: { diagnostics: readonly BoardDiagnostic[] }) {
  const actions = useBoardActions();
  if (diagnostics.length === 0) return null;
  return (
    <section className="tl-details__section" data-testid="card-problems">
      <h4 className="tl-details__heading">Problems</h4>
      <ul className="tl-details__list">
        {diagnostics.map((d, i) => (
          <li key={i} className="tl-problem" data-severity={d.severity}>
            <span className={`codicon codicon-${d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info'}`} aria-hidden="true" />
            <span className="tl-problem__text">
              <code>{d.code}</code> <InlineCode text={d.message} />
            </span>
            {d.file ? (
              <button type="button" className="tl-icon-button" onClick={() => actions.openInEditor(d.file ?? '', d.range)}>
                Open
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Proof({ node }: { node: TlNode }) {
  const nodes = useBoard((s) => boardView(s).nodes);
  const vocab = useBoard((s) => boardView(s).vocab);
  const subject = useBoard((s) => s.subject);
  const hideResult = useBoard((s) => proposedOverlay(s)?.hidden.has(node.id) === true);
  const actions = useBoardActions();
  const proof = node.status.proof;
  if (hideResult) {
    return (
      <section className="tl-details__section" data-testid="footprint">
        <p className="tl-details__none">What its proof rests on is shown after you have reviewed the statements.</p>
      </section>
    );
  }
  const footprint = proof.kind === 'proved' ? proof.footprint : proof.kind === 'conditional' ? (proof.footprint ?? []) : null;
  const entries = footprint ? footprintEntries(footprint, nodes, subject, vocab) : [];
  // The statement's presuppositions, unless the footprint above already shows them.
  const inFootprint = new Set(entries.flatMap((entry) => (entry.kind === 'presupposition' ? [entry.name] : [])));
  const presupposes = (node.lean.presupposes ?? []).filter((name) => !inFootprint.has(name));
  const axioms = node.lean.axioms ?? [];
  if (!footprint && proof.kind !== 'conditional' && presupposes.length === 0 && axioms.length === 0) return null;
  return (
    <section className="tl-details__section" data-testid="footprint">
      {proof.kind === 'conditional' ? (
        <>
          <h4 className="tl-details__heading">Taken as hypotheses (unproved)</h4>
          <ul className="tl-details__list">
            {proof.on.map((id) => (
              <li key={id}>
                <NodeButton id={id} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {footprint ? (
        <>
          <h4 className="tl-details__heading">Rests on</h4>
          {entries.length === 0 ? <p className="tl-details__none">Nothing at all.</p> : null}
          <ul className="tl-details__list">
            {entries.map((entry, i) => (
              <li key={i}>
                {entry.kind === 'node' ? (
                  <NodeButton id={entry.id} />
                ) : entry.kind === 'presupposition' ? (
                  <button type="button" className="tl-presup" data-presup={entry.name} title={entry.name} onClick={() => actions.highlightVocab(entry.name)}>
                    {entry.label}
                  </button>
                ) : entry.kind === 'axiom' ? (
                  <span className="tl-chip tl-chip--attention" title="A Lean axiom that is neither one of your axiom cards nor vocabulary (TL103)">
                    axiom <code>{entry.name}</code>
                  </span>
                ) : (
                  <code>{entry.name}</code>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {presupposes.length > 0 ? (
        <div data-testid="presuppositions">
          <h4 className="tl-details__heading">Presupposes</h4>
          <div className="tl-details__chips">
            {presupposes.map((name) => (
              <button key={name} type="button" className="tl-presup" data-presup={name} title={name} onClick={() => actions.highlightVocab(name)}>
                {presuppositionLabel(name, subject, vocab)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {axioms.length > 0 ? (
        <details className="tl-details__axioms">
          <summary>Lean's axiom list ({axioms.length})</summary>
          <code>{axioms.join(', ')}</code>
        </details>
      ) : null}
    </section>
  );
}

function Choices({ node, lock }: { node: TlNode; lock: string | null }) {
  const actions = useBoardActions();
  // Spec v4 CF-2: Stance and Source are fields of both kinds; the stance chips are offered on axioms (or when set).
  const showStance = node.type === 'AXIOM' || node.stance !== undefined;
  const showSource = true;
  if (!showStance && !showSource) return null;
  return (
    <section className="tl-details__section">
      {showStance ? (
        <div className="tl-details__chips" role="group" aria-label="Stance" data-testid="stance-chips">
          {STANCES.map((stance) => (
            <button
              key={stance}
              type="button"
              className="tl-choice"
              aria-pressed={node.stance === stance}
              disabled={lock !== null}
              title={lock ?? undefined}
              onClick={() => actions.editNode(node.id, 'stance', node.stance === stance ? null : stance)}
            >
              {STANCE_LABEL[stance]}
            </button>
          ))}
        </div>
      ) : null}
      {showSource ? (
        <div className="tl-details__chips" role="group" aria-label="Source" data-testid="source-chips">
          <span className="tl-details__label">source:</span>
          {EVIDENTIALS.map((source) => (
            <button
              key={source}
              type="button"
              className="tl-choice"
              aria-pressed={node.source === source}
              disabled={lock !== null}
              title={lock ?? undefined}
              onClick={() => actions.editNode(node.id, 'source', node.source === source ? null : source)}
            >
              {SOURCE_LABEL[source]}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Spec v4 slice 1b: the arrow actions of a card (slice 1e: they stay here too, beside the header's Context Menu section,
 * which offers the same actions for a selected card). On a proposition: "Follows
 * from nothing" / "Remove 'follows from nothing'", "Select incoming arrows" and "Mark pending" ("Move to axioms" is in
 * the row below). On an axiom: "Follows from nothing" (it becomes a proposition, after the impact dialog), or, for an
 * axiom whose `premises:` was written before v4, "Make it a proposition (pending)" and "Drop these arrows". Slice 1c2:
 * arrows are drawn by the gestures (the handle at a card's right edge; "Draw arrows from the selection" in the target's
 * right-click menu), so 1b's temporary "Draw arrow from the selection" is gone. Slice 1f (ES-9): while the board is
 * locked each of them is disabled with `lock` as its tooltip, except "Select incoming arrows", which only selects (its
 * tooltip then says nothing of Delete, which removes nothing during a session: slice 1e, 1f's verification).
 */
function ArrowActions({ node, lock }: { node: TlNode; lock: string | null }) {
  const actions = useBoardActions();
  const provisionalCards = useBoard((s) => s.provisional);
  const provisional = provisionalCards[node.id] === true;
  const isProposition = node.type === 'PROPOSITION';
  const arrowsIn = node.premises.length;
  const declaredBefore = !isProposition && arrowsIn > 0;
  const canMarkPending = isProposition && node.status.formal === 'formalized' && node.lean.statement !== undefined && node.lean.justification === undefined;
  const small = 'tl-button tl-button--secondary tl-button--small';
  /** An editing button: disabled while the card is provisional or the board is locked (the lock's reason wins). */
  const edit = (title: string | undefined) => ({ disabled: provisional || lock !== null, title: lock ?? title });
  return (
    <div className="tl-details__actions tl-details__actions--arrows" data-testid="arrow-actions" data-locked={lock !== null || undefined}>
      {isProposition && arrowsIn === 0 && node.fromNothing !== true ? (
        <button type="button" className={small} data-testid="from-nothing" {...edit('Mark it as following from nothing: it needs no premises (AR-5)')} onClick={() => actions.setFromNothing(node.id, true)}>
          Follows from nothing
        </button>
      ) : null}
      {node.fromNothing === true ? (
        <button type="button" className={small} data-testid="remove-from-nothing" {...edit(undefined)} onClick={() => actions.setFromNothing(node.id, false)}>
          Remove 'follows from nothing'
        </button>
      ) : null}
      {!isProposition && !declaredBefore && node.fromNothing !== true ? (
        <button
          type="button"
          className={small}
          data-testid="from-nothing"
          {...edit('It becomes a proposition that follows from nothing (AR-6): you see the impact first')}
          onClick={() => actions.setFromNothing(node.id, true)}
        >
          Follows from nothing
        </button>
      ) : null}
      {declaredBefore ? (
        <>
          <button
            type="button"
            className={small}
            data-testid="legacy-make-proposition"
            {...edit('Its arrows declared before v4 become its dependencies, and it becomes a proposition (AR-6): you see the impact first')}
            onClick={() => actions.addArrows(node.id, node.premises)}
          >
            Make it a proposition (pending)
          </button>
          <button
            type="button"
            className={small}
            data-testid="legacy-drop-arrows"
            {...edit('Remove its premises: line (it stays an axiom)')}
            onClick={() => actions.removeArrows(node.premises.map((source) => ({ source, target: node.id })))}
          >
            Drop these arrows
          </button>
        </>
      ) : null}
      {isProposition && (arrowsIn > 0 || node.fromNothing === true) ? (
        <button
          type="button"
          className={small}
          data-testid="select-incoming"
          disabled={provisional}
          title={lock !== null ? 'Select every arrow into this card' : 'Select every arrow into this card (then Formalize for dependencies asks about them; Delete removes them)'}
          onClick={() => actions.selectIncomingArrows(node.id)}
        >
          Select incoming arrows
        </button>
      ) : null}
      {canMarkPending ? (
        <button
          type="button"
          className={small}
          data-testid="mark-pending"
          {...edit('Assume it until a run proves it: adds `axiom …holds` for its statement (AR-8)')}
          onClick={() => actions.claimPending(node.id)}
        >
          Mark pending
        </button>
      ) : null}
    </div>
  );
}

/**
 * Spec v4 ES-9 (slice 1f): in the Proposed view the arrow actions and "Move to axioms" are there but disabled, with the
 * reason on hover (arrows change only through review items and transforms; in slice 1 the proposal is read-only).
 */
function ProposedArrowActions({ node }: { node: TlNode }) {
  const small = 'tl-button tl-button--secondary tl-button--small';
  const isProposition = node.type === 'PROPOSITION';
  const off = { disabled: true, title: PROPOSED_ARROWS_LOCKED };
  return (
    <div className="tl-details__actions tl-details__actions--arrows" data-testid="arrow-actions" data-locked="proposed">
      {node.fromNothing === true ? (
        <button type="button" className={small} data-testid="remove-from-nothing" {...off}>
          Remove 'follows from nothing'
        </button>
      ) : !isProposition || node.premises.length === 0 ? (
        <button type="button" className={small} data-testid="from-nothing" {...off}>
          Follows from nothing
        </button>
      ) : null}
      {isProposition ? (
        <button type="button" className={small} data-testid="make-axiom" {...off}>
          Move to axioms
        </button>
      ) : null}
    </div>
  );
}

function Actions({ node, lock }: { node: TlNode; lock: string | null }) {
  const actions = useBoardActions();
  const nodes = useBoard((s) => s.nodes);
  const edges = useBoard((s) => s.edges);
  const semantic = useBoard((s) => s.semantic);
  const provisionalCards = useBoard((s) => s.provisional);
  const state = { nodes, edges, semantic, provisional: provisionalCards };
  const provisional = provisionalCards[node.id] === true;
  // Spec v4: "Move to axioms" on a proposition (AR-7), its impact shown first (slice 1b). There is no "Make
  // Proposition": an arrow into an axiom, or "follows from nothing", makes it one (AR-6).
  const impact = node.type === 'PROPOSITION' ? impactOf(state, node.id, 'AXIOM') : null;
  return (
    <div className="tl-details__actions">
      {node.type === 'PROPOSITION' ? (
        <button
          type="button"
          className="tl-button tl-button--secondary tl-button--small"
          data-testid="make-axiom"
          disabled={provisional || lock !== null}
          title={lock ?? (impact ? plainText(`${impact.summary}. ${impact.detail}`) : undefined)}
          onClick={() => actions.moveToAxioms(node.id)}
        >
          Move to axioms
        </button>
      ) : null}
      <span className="tl-details__spacer" />
      <button
        type="button"
        className="tl-button tl-button--secondary tl-button--small"
        data-testid="edit-sentence"
        disabled={provisional || lock !== null}
        title={lock ?? undefined}
        onClick={() => actions.startEdit(node.id, 'naturalName')}
      >
        Edit
      </button>
      <button
        type="button"
        className="tl-button tl-button--secondary tl-button--small"
        data-testid="edit-why"
        disabled={provisional || lock !== null}
        title={lock ?? undefined}
        onClick={() => actions.startEdit(node.id, 'rationale')}
      >
        {node.rationale ? 'Edit why' : 'Add why'}
      </button>
      <button
        type="button"
        className="tl-button tl-button--secondary tl-button--small tl-button--danger"
        data-testid="delete-card"
        disabled={provisional || lock !== null}
        title={lock ?? undefined}
        onClick={() => actions.openDelete(node.id)}
      >
        Delete
      </button>
    </div>
  );
}

export function CardDetails({ node }: { node: TlNode }) {
  const edges = useBoard((s) => boardView(s).edges);
  const nodes = useBoard((s) => boardView(s).nodes);
  const order = useBoard((s) => boardView(s).order);
  const diagnostics = useBoard((s) => s.diagnostics);
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  /** Slice 1f (ES-9): why the Current board cannot be edited now, or null. */
  const lock = useBoard((s) => editLock(s));
  const allAttempts = useBoard((s) => s.attempts);
  const actions = useBoardActions();
  const ctx = useMemo(() => ({ edges, nodes, order }), [edges, nodes, order]);
  const depends = useMemo(() => dependsOn(node.id, ctx), [node.id, ctx]);
  const users = useMemo(() => usedBy(node.id, ctx), [node.id, ctx]);
  // The board's diagnostics describe the current files, not the proposal.
  const problems = useMemo(() => (proposed ? [] : diagnostics.filter((d) => d.nodeId === node.id)), [diagnostics, node.id, proposed]);
  const attempts = useMemo(() => allAttempts.filter((a) => a.target === node.id), [allAttempts, node.id]);
  const location = node.loc;

  return (
    <div className="tl-details" data-nodrag onClick={stop}>
      {node.lean.code ? (
        <LeanCode node={node} />
      ) : (
        <div className="tl-leanbox tl-leanbox--empty">
          <p className="tl-lean--empty" data-testid="lean-code">
            No Lean code yet: this node is a comment-only <code>@@ telelean</code> block.
          </p>
          {location ? (
            <button type="button" className="tl-icon-button" onClick={() => actions.openInEditor(location.file, location.range)}>
              <span className="codicon codicon-go-to-file" aria-hidden="true" />
              Open in editor
            </button>
          ) : null}
        </div>
      )}
      <Problems diagnostics={problems} />
      <Proof node={node} />
      <div className="tl-details__relations">
        <Relations title="Depends on" testId="depends-on" relations={depends} empty="Nothing: no declared premises and no proof." />
        <Relations title="Used by" testId="used-by" relations={users} external={node.lean.externalUsers ?? []} empty="Nothing uses it yet." />
      </div>
      <Attempts attempts={attempts} />
      {proposed ? (
        <>
          <p className="tl-details__none tl-details__readonly" data-testid="proposal-readonly">
            This is Claude’s proposal (read-only). Your board can be edited again once you accept or discard it.
          </p>
          <ProposedArrowActions node={node} />
        </>
      ) : (
        <>
          {lock !== null ? (
            <p className="tl-details__none tl-details__readonly" data-testid="board-locked">
              {lock}
            </p>
          ) : null}
          <Choices node={node} lock={lock} />
          <ArrowActions node={node} lock={lock} />
          <Actions node={node} lock={lock} />
        </>
      )}
    </div>
  );
}
