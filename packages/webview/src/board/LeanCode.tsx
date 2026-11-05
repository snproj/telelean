/**
 * A card's Lean code, expanded (the user's turn-9 requests 1, 3 and 4):
 *  - a press-and-drag selects text and never drags the card (the card's drag guard handles `.tl-lean`; see
 *    dragGuard.ts), and clicks in the code never change the board's selection;
 *  - identifiers Lean resolved (`lean.refs`) are spans: hovering shows the vocabulary item's gloss or the node's
 *    sentence; a plain click highlights the item in the Vocabulary group or reveals that node's card;
 *    Ctrl/Cmd+click is reserved (go to definition / editing later) and does nothing yet;
 *  - "Copy" posts exactly `lean.code` to the host's clipboard; "Open in editor" opens where the code starts.
 */
import type { LeanRef, TlNode } from '@telelean/core';
import { Fragment, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Popover } from '../common/Popover';
import { VOCAB_KIND_NOUN } from '../labels';
import { codeSegments, displayName } from '../model/cardData';
import { useBoard, useBoardActions } from '../state/context';
import { boardView } from '../state/store';

interface Tip {
  anchor: HTMLElement;
  ref: LeanRef;
}

function refOf(target: EventTarget | null, refs: readonly LeanRef[]): { span: HTMLElement; ref: LeanRef } | null {
  if (!(target instanceof Element)) return null;
  const span = target.closest<HTMLElement>('.tl-ref');
  const index = Number(span?.dataset.refIndex);
  const ref = Number.isInteger(index) ? refs[index] : undefined;
  return span && ref ? { span, ref } : null;
}

/** What hovering an identifier says: the node's sentence, or the vocabulary item's gloss with its kind and type. */
function RefTip({ leanRef }: { leanRef: LeanRef }) {
  const node = useBoard((s) => (leanRef.nodeId ? boardView(s).nodes[leanRef.nodeId] : undefined));
  const item = useBoard((s) => boardView(s).vocab.get(leanRef.name));
  const subject = useBoard((s) => s.subject);
  const vocab = useBoard((s) => boardView(s).vocab);
  if (node) {
    const agent = node.provenance.wordedBy === 'agent';
    return (
      <>
        <span className={agent ? 'tl-tip__main tl-gloss--agent' : 'tl-tip__main'} data-provenance={agent ? 'agent' : 'user'}>
          {node.naturalName}
          {agent ? <span className="tl-card__agent-marker tl-agent__marker"> (Claude's wording)</span> : null}
        </span>
        <span className="tl-tip__meta">{leanRef.name}</span>
      </>
    );
  }
  if (item) {
    return (
      <>
        <span className={item.glossBy === 'agent' && item.gloss ? 'tl-tip__main tl-gloss--agent' : 'tl-tip__main'} data-provenance={item.glossBy === 'agent' && item.gloss ? 'agent' : undefined}>
          {item.gloss ?? item.shortName}
          {item.glossBy === 'agent' && item.gloss ? <span className="tl-card__agent-marker tl-agent__marker"> (Claude's wording)</span> : null}
        </span>
        <span className="tl-tip__meta">
          {VOCAB_KIND_NOUN[item.kind]} · <code>{displayName(item.name, subject, vocab)}{item.type ? ` : ${item.type}` : ''}</code>
        </span>
      </>
    );
  }
  return <code className="tl-tip__main">{leanRef.name}</code>;
}

export function LeanCode({ node }: { node: TlNode }) {
  const actions = useBoardActions();
  const code = node.lean.code ?? '';
  const refs = useMemo(() => node.lean.refs ?? [], [node.lean.refs]);
  const lines = useMemo(() => codeSegments(code, refs), [code, refs]);
  const [tip, setTip] = useState<Tip | null>(null);
  const [copied, setCopied] = useState(false);
  const location = node.lean.codeLoc ?? (node.loc ? { file: node.loc.file, range: node.loc.range } : undefined);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const onClick = (event: MouseEvent<HTMLPreElement>) => {
    // Never a card click: no selection change, no expand/collapse.
    event.stopPropagation();
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return; // ends a text selection
    if (event.ctrlKey || event.metaKey) return; // reserved (go to definition, editing: later milestones)
    const hit = refOf(event.target, refs);
    if (!hit) return;
    if (hit.ref.nodeId) actions.revealNode(hit.ref.nodeId);
    else actions.highlightVocab(hit.ref.name);
  };

  const onMouseOver = (event: MouseEvent<HTMLPreElement>) => {
    const hit = refOf(event.target, refs);
    if (!hit) return;
    setTip((current) => (current?.anchor === hit.span ? current : { anchor: hit.span, ref: hit.ref }));
  };

  const onMouseOut = (event: MouseEvent<HTMLPreElement>) => {
    const from = refOf(event.target, refs);
    if (!from) return;
    const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (to && from.span.contains(to)) return;
    setTip((current) => (current?.anchor === from.span ? null : current));
  };

  return (
    <div className="tl-leanbox">
      <div className="tl-leanbox__bar">
        <span className="tl-leanbox__title">Lean</span>
        <button
          type="button"
          className="tl-icon-button"
          aria-label="Copy the Lean code"
          title="Copy the Lean code to the clipboard"
          onClick={(event) => {
            event.stopPropagation();
            if (actions.copyText(code)) setCopied(true);
          }}
        >
          <span className={`codicon codicon-${copied ? 'check' : 'copy'}`} aria-hidden="true" />
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </button>
        {location ? (
          <button
            type="button"
            className="tl-icon-button"
            title={`Open ${location.file} at line ${location.range.start.line + 1}`}
            onClick={(event) => {
              event.stopPropagation();
              actions.openInEditor(location.file, location.range);
            }}
          >
            <span className="codicon codicon-go-to-file" aria-hidden="true" />
            Open in editor
          </button>
        ) : null}
      </div>
      <pre className="tl-lean" data-testid="lean-code" draggable={false} onClick={onClick} onMouseOver={onMouseOver} onMouseOut={onMouseOut}>
        <code>
          {lines.map((segments, line) => (
            <Fragment key={line}>
              {line > 0 ? '\n' : null}
              {segments.map((segment, i) =>
                segment.ref ? (
                  <span
                    key={i}
                    className="tl-ref"
                    data-ref={segment.ref.name}
                    data-ref-node={segment.ref.nodeId}
                    data-ref-index={refs.indexOf(segment.ref)}
                  >
                    {segment.text}
                  </span>
                ) : (
                  <Fragment key={i}>{segment.text}</Fragment>
                ),
              )}
            </Fragment>
          ))}
        </code>
      </pre>
      <Popover anchor={tip?.anchor ?? null} open={tip !== null} tooltip testId="ref-tooltip" className="tl-tip">
        {tip ? <RefTip leanRef={tip.ref} /> : null}
      </Popover>
    </div>
  );
}
