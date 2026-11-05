import type { TlNode } from '@telelean/core';
import { useMemo, useState } from 'react';
import { KIND_GLYPH, KIND_NOUN } from '../labels';
import { presuppositionLabel, presuppositionsOf } from '../model/cardData';
import { trayRunBlock } from '../model/run';
import { useBoard, useBoardActions } from '../state/context';
import { trayModel, type TrayModel } from '../state/store';

function Chip({ node, role, onRemove, onMakeTarget }: { node: TlNode; role: 'premise' | 'target'; onRemove: () => void; onMakeTarget?: () => void }) {
  return (
    <span className="tl-chipcard" data-kind={node.type} data-role={role} data-id={node.id}>
      <span className="tl-glyph" data-kind={node.type} title={KIND_NOUN[node.type]}>
        {KIND_GLYPH[node.type]}
      </span>
      <span className="tl-chipcard__text" title={node.naturalName}>
        {node.naturalName}
      </span>
      {onMakeTarget ? (
        <button type="button" className="tl-icon-button" title="Make this the target" aria-label={`Make "${node.naturalName}" the target`} onClick={onMakeTarget}>
          ⊢
        </button>
      ) : null}
      <button type="button" className="tl-icon-button" title="Remove from selection" aria-label={`Remove "${node.naturalName}" from the selection`} onClick={onRemove}>
        <span className="codicon codicon-close" aria-hidden="true" />
      </button>
    </span>
  );
}

/** A card's sentence for the tray's notes (cut after a word near 40 characters), or its id when it is not on this board. */
function sentenceOf(id: string, nodes: Readonly<Record<string, TlNode>>): string {
  const text = nodes[id]?.naturalName ?? id;
  if (text.length <= 40) return text;
  const cut = text.slice(0, 40);
  const space = cut.lastIndexOf(' ');
  return `${(space > 20 ? cut.slice(0, space) : cut.slice(0, 39)).trimEnd()}…`;
}

/** "3 premises ⊢ “Cynder would not be …”": the selection in one line (the compact tray). */
function selectionSummary(tray: TrayModel, nodes: Readonly<Record<string, TlNode>>): { text: string; title: string } {
  const premises = tray.premises.length === 0 ? 'no premises' : `${tray.premises.length} premise${tray.premises.length === 1 ? '' : 's'}`;
  const target = tray.target ? nodes[tray.target]?.naturalName ?? tray.target : null;
  const lines = tray.premises.map((id) => nodes[id]?.naturalName ?? id);
  return {
    text: target ? `${premises} ⊢ “${target}”` : `${premises}, no target`,
    title: [...lines, target ? `⊢ ${target}` : '⊢ (no target)'].join('\n'),
  };
}

/**
 * The selection, split into premises ⊢ target (D-5), with the presuppositions the selected statements carry
 * ("+ presupposes: assumes characters exist", D-3b), and the M2 run buttons (docs/m2-plan.md section 6.4):
 *  - "These suffice ▶" asks Claude to prove the target from exactly the selected premises (the host declares them as
 *    the target's support first, D-13; that replaces its declared premises, so the tray names the ones it would drop
 *    and offers "Add to its premises ▶", which keeps them);
 *  - "Self-evident?" with a target and no premises: provable from no premises at all (D-5);
 *  - disabled, with the reason, while a run of this model folder is active (one at a time) and for an assumption as
 *    the target (make it a Derivation first, D-11).
 * While a run is active the buttons cannot be used anyway, so the tray folds to one line (the selection summed up,
 * the disabled button, the reason) and leaves the room to the board and the run panel; its chevron shows the whole
 * tray for the rest of that run.
 * On a board without cards it points to the A|D|G box below instead.
 */
export function SelectionTray() {
  const selected = useBoard((s) => s.selected);
  const target = useBoard((s) => s.target);
  const nodes = useBoard((s) => s.nodes);
  const vocab = useBoard((s) => s.vocab);
  const subject = useBoard((s) => s.subject);
  const loaded = useBoard((s) => s.version !== null);
  const run = useBoard((s) => s.run);
  const starting = useBoard((s) => s.runBusy?.action === 'start');
  const actions = useBoardActions();
  /** The run for which the user unfolded the tray (it folds again for the next run). */
  const [unfoldedFor, setUnfoldedFor] = useState<string | null>(null);
  const tray = useMemo(() => trayModel({ selected, target, nodes }), [selected, target, nodes]);
  const presuppositions = useMemo(() => presuppositionsOf(selected, nodes), [selected, nodes]);
  const runBlock = trayRunBlock(run, subject);
  const folded = runBlock !== null && run !== null && unfoldedFor !== run.runId;

  if (selected.length === 0) {
    const empty = loaded && Object.keys(nodes).length === 0;
    return (
      <section className="tl-tray tl-tray--empty" aria-label="Selection">
        {empty ? (
          <span className="tl-tray__hint tl-tray__hint--start" data-testid="first-step">
            <span className="codicon codicon-arrow-down" aria-hidden="true" /> No cards yet: type something you believe in the box below and press Enter. It becomes
            your first assumption.
          </span>
        ) : (
          <span className="tl-tray__hint">
            Click a card to select it, Ctrl/Cmd-click to select several. Select premises and one goal, then press “These suffice”.
          </span>
        )}
      </section>
    );
  }

  const targetNode = tray.target ? nodes[tray.target] : undefined;
  const selfEvident = tray.selfEvident;
  /** Why the run buttons are disabled: the selection first, then a run that is already going. */
  const blocked = tray.blocked ?? runBlock;
  /**
   * "These suffice" would drop some of the target's declared premises (only worth saying when it can be pressed;
   * "Self-evident?" declares nothing, so it drops nothing).
   */
  const replaces = blocked === null && !selfEvident && tray.dropped.length > 0;

  if (folded && run !== null) {
    const summary = selectionSummary(tray, nodes);
    return (
      <section className="tl-tray tl-tray--folded" aria-label="Selection" data-testid="tray" data-folded="true">
        <span className="tl-tray__count" data-testid="tray-count">
          {selected.length} selected
        </span>
        <span className="tl-tray__summary" data-testid="tray-summary" title={summary.title}>
          {summary.text}
        </span>
        <button type="button" className="tl-button tl-button--secondary tl-button--small" onClick={() => actions.clearSelection()}>
          Clear
        </button>
        <button
          type="button"
          className="tl-button tl-button--small"
          data-testid={selfEvident ? 'tray-self-evident' : 'tray-these-suffice'}
          disabled
          title={blocked ?? undefined}
        >
          {selfEvident ? 'Self-evident?' : 'These suffice ▶'}
        </button>
        <span className="tl-tray__blocked" data-testid="tray-blocked" title={blocked ?? undefined}>
          {blocked}
        </span>
        <button
          type="button"
          className="tl-icon-button"
          data-testid="tray-unfold"
          aria-expanded={false}
          aria-label="Show the whole selection"
          title="Show the whole selection (its cards, what they presuppose)"
          onClick={() => setUnfoldedFor(run.runId)}
        >
          <span className="codicon codicon-chevron-up" aria-hidden="true" />
        </button>
      </section>
    );
  }

  return (
    <section className="tl-tray" aria-label="Selection" data-testid="tray">
      <span className="tl-tray__count" data-testid="tray-count">
        {selected.length} selected
      </span>
      <div className="tl-tray__chips">
        {tray.premises.map((id) => {
          const node = nodes[id];
          return node ? (
            <Chip key={id} node={node} role="premise" onRemove={() => actions.deselect(id)} onMakeTarget={() => actions.setTarget(id)} />
          ) : null;
        })}
        <span className="tl-tray__turnstile" aria-hidden="true">
          ⊢
        </span>
        <span className="tl-tray__target" data-testid="tray-target" data-filled={targetNode ? true : undefined}>
          {targetNode ? (
            <Chip node={targetNode} role="target" onRemove={() => actions.deselect(targetNode.id)} />
          ) : (
            <span className="tl-tray__slot">target</span>
          )}
        </span>
        {presuppositions.length > 0 ? (
          <span className="tl-tray__presup" data-testid="tray-presuppositions" title="Existence presuppositions of the selected statements (D-3b)">
            <span className="tl-tray__presup-label">+ presupposes:</span>
            {presuppositions.map((name) => (
              <button key={name} type="button" className="tl-presup" data-presup={name} title={name} onClick={() => actions.highlightVocab(name)}>
                {presuppositionLabel(name, subject, vocab)}
              </button>
            ))}
          </span>
        ) : null}
      </div>
      <span className="tl-tray__spacer" />
      <button type="button" className="tl-button tl-button--secondary" onClick={() => actions.clearSelection()}>
        Clear
      </button>
      {replaces ? (
        <button
          type="button"
          className="tl-button tl-button--secondary"
          data-testid="tray-add-premises"
          disabled={starting}
          title={`Ask Claude to prove the target from its ${tray.dropped.length} declared premise${tray.dropped.length === 1 ? '' : 's'} plus the selected ones (declares them all as its support)`}
          onClick={() => actions.startRun('add')}
        >
          Add to its premises ▶
        </button>
      ) : null}
      {selfEvident ? (
        <button
          type="button"
          className="tl-button"
          data-testid="tray-self-evident"
          disabled={blocked !== null || starting}
          title={blocked ?? 'Ask Claude whether the target follows from no premises at all (declares nothing)'}
          onClick={() => actions.startRun()}
        >
          Self-evident?
        </button>
      ) : (
        <button
          type="button"
          className="tl-button"
          data-testid="tray-these-suffice"
          disabled={blocked !== null || starting}
          title={
            blocked ??
            `Ask Claude to prove the target from exactly these premises (declares them as its support first${replaces ? `, which drops ${tray.dropped.length} declared premise${tray.dropped.length === 1 ? '' : 's'}` : ''})`
          }
          onClick={() => actions.startRun()}
        >
          These suffice ▶
        </button>
      )}
      {starting ? (
        <span className="tl-tray__note" data-testid="tray-starting">
          <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" /> Starting the run…
        </span>
      ) : blocked ? (
        <span className="tl-tray__blocked" data-testid="tray-blocked">
          {blocked}
        </span>
      ) : null}
      {runBlock !== null && run !== null ? (
        <button
          type="button"
          className="tl-icon-button"
          data-testid="tray-fold"
          aria-expanded={true}
          aria-label="Show the selection on one line"
          title="Fold the selection to one line while Claude's run is active"
          onClick={() => setUnfoldedFor(null)}
        >
          <span className="codicon codicon-chevron-down" aria-hidden="true" />
        </button>
      ) : null}
      {replaces ? (
        <span className="tl-tray__replace" data-testid="tray-replaces" title={tray.dropped.map((id) => nodes[id]?.naturalName ?? id).join('\n')}>
          <span className="codicon codicon-warning" aria-hidden="true" /> “These suffice” replaces the target’s declared premises and drops{' '}
          {tray.dropped.map((id) => `“${sentenceOf(id, nodes)}”`).join(', ')}.
        </span>
      ) : null}
    </section>
  );
}
