/**
 * The Lean side of the header: the badge (one per SemanticSummary state; a click asks for a refresh), the problems
 * list (every board diagnostic; file items open in the editor, node items reveal their card), and the banner for
 * syntactic mode (D-7) and switched-off checking.
 */
import type { BoardDiagnostic } from '@telelean/core';
import { useState } from 'react';
import { InlineCode } from '../common/InlineCode';
import { Popover } from '../common/Popover';
import { semanticBadge } from '../labels';
import { useBoard, useBoardActions } from '../state/context';

const BADGE_ICON = { ok: 'pass', busy: 'sync', warn: 'warning', error: 'error', off: 'circle-slash' } as const;

export function LeanBadge() {
  const semantic = useBoard((s) => s.semantic);
  const actions = useBoardActions();
  const badge = semanticBadge(semantic);
  return (
    <button
      type="button"
      className="tl-lean-badge"
      data-testid="lean-badge"
      data-state={semantic.state}
      data-tone={badge.tone}
      title={badge.title}
      onClick={() => actions.refresh()}
    >
      <span className={`codicon codicon-${BADGE_ICON[badge.tone]}`} aria-hidden="true" />
      {badge.text}
    </button>
  );
}

const SEVERITY_ICON: Readonly<Record<BoardDiagnostic['severity'], string>> = { error: 'error', warning: 'warning', info: 'info', hint: 'lightbulb' };

export function ProblemsMenu() {
  const diagnostics = useBoard((s) => s.diagnostics);
  const nodes = useBoard((s) => s.nodes);
  const actions = useBoardActions();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const serious = diagnostics.filter((d) => d.severity === 'error' || d.severity === 'warning').length;
  if (diagnostics.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className="tl-menu-button"
        data-testid="problems-button"
        data-serious={serious > 0 || undefined}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
      >
        <span className={`codicon codicon-${serious > 0 ? 'warning' : 'info'}`} aria-hidden="true" />
        Problems {diagnostics.length}
      </button>
      <Popover anchor={anchor} open={anchor !== null} onClose={() => setAnchor(null)} label="Problems" testId="problems-menu" className="tl-menu tl-problems" align="end">
        <ul className="tl-problems__list">
          {diagnostics.map((d, i) => {
            const node = d.nodeId ? nodes[d.nodeId] : undefined;
            const where = d.file ? `${d.file}${d.range ? `:${d.range.start.line + 1}` : ''}` : null;
            return (
              <li key={i} className="tl-problem" data-testid="problem" data-severity={d.severity}>
                <span className={`codicon codicon-${SEVERITY_ICON[d.severity]}`} aria-hidden="true" />
                <span className="tl-problem__text">
                  <code>{d.code}</code> <InlineCode text={d.message} />
                  {node ? <span className="tl-problem__node"> ({node.naturalName})</span> : null}
                </span>
                {node ? (
                  <button
                    type="button"
                    className="tl-icon-button"
                    onClick={() => {
                      setAnchor(null);
                      actions.revealNode(node.id);
                    }}
                  >
                    Show card
                  </button>
                ) : null}
                {where && d.file ? (
                  <button
                    type="button"
                    className="tl-icon-button"
                    data-testid="problem-open"
                    title={`Open ${where}`}
                    onClick={() => {
                      setAnchor(null);
                      actions.openInEditor(d.file ?? '', d.range);
                    }}
                  >
                    {where}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Popover>
    </>
  );
}

/** Syntactic mode (D-7) and switched-off checking get a line under the header; other states fit the badge. */
export function LeanBanner() {
  const semantic = useBoard((s) => s.semantic);
  if (semantic.state === 'unsupported-toolchain') {
    return (
      <div className="tl-banner" data-testid="lean-banner" data-state={semantic.state} role="status">
        <span className="codicon codicon-info" aria-hidden="true" />
        <span>
          <strong>Syntactic mode.</strong> This project uses {semantic.toolchain ?? 'another Lean toolchain'}; telelean checks only with
          leanprover/lean4:v4.35.0, so the cards show what the files say, unchecked by Lean.
          {semantic.detail ? (
            <>
              {' '}
              <InlineCode text={semantic.detail} />
            </>
          ) : null}
        </span>
      </div>
    );
  }
  if (semantic.state === 'disabled') {
    return (
      <div className="tl-banner" data-testid="lean-banner" data-state={semantic.state} role="status">
        <span className="codicon codicon-circle-slash" aria-hidden="true" />
        <span>
          <strong>Lean checking is off.</strong> <InlineCode text={semantic.detail ?? 'The cards show what the files say, unchecked by Lean.'} />
        </span>
      </div>
    );
  }
  return null;
}
