import { EVIDENTIALS, NODE_TYPES, STANCES, type Evidential, type NodeType, type Stance } from '@telelean/core';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { currentCanvas, type NewCardAnchor } from '../board/canvas/CanvasView';
import { revealCardSoon } from '../board/reveal';
import { pasteOneLine } from '../common/OneLineInput';
import { KIND_GLYPH, KIND_NOUN, PROMPT_PLACEHOLDER, SOURCE_LABEL, STANCE_LABEL, whyPlaceholder } from '../labels';
import { useBoard, useBoardActions, useBoardStore } from '../state/context';
import { boardView, editLock } from '../state/store';

/** Chips that act like radio buttons which can also be switched off again (all D-14 chips are optional). */
function ChipChoice<T extends string>({
  label,
  values,
  value,
  text,
  onChange,
  lock,
}: {
  label: string;
  values: readonly T[];
  value: T | undefined;
  text: Readonly<Record<T, string>>;
  onChange: (next: T | undefined) => void;
  lock: string | null;
}) {
  return (
    <span className="tl-prompt__chips" role="group" aria-label={label}>
      {values.map((v) => (
        <button key={v} type="button" className="tl-choice" aria-pressed={v === value} disabled={lock !== null} title={lock ?? undefined} onClick={() => onChange(v === value ? undefined : v)}>
          {text[v]}
        </button>
      ))}
    </span>
  );
}

/**
 * What a new proposition goes next to (BD-8): the card selected last: a proposition (on the canvas: right of it), or
 * an axiom (in the AXIOMS column: the new card goes to the canvas's left side, level with it). Null when no card is
 * selected (the middle of the view).
 */
function newCardAnchor(state: Parameters<typeof boardView>[0] & { selected: readonly string[] }): NewCardAnchor | null {
  const nodes = boardView(state).nodes;
  const id = [...state.selected].reverse().find((x) => nodes[x] !== undefined);
  if (!id) return null;
  if (nodes[id]?.type === 'PROPOSITION') return { kind: 'canvas', id };
  const card = document.querySelector<HTMLElement>(`.tl-axioms .tl-col__list [data-node-id="${CSS.escape(id)}"]`);
  return card ? { kind: 'axiom', clientTop: card.getBoundingClientRect().top } : null;
}

/**
 * The A|P prompt box (D-16; spec v4 BD-8): the switch marks the kind of the card the text creates, Axiom or
 * Proposition. Enter adds a comment-only card with the user's verbatim words (trimmed only; no LLM, no Lean). The
 * second row is optional (D-14): stance chips for an Axiom, a "why" field whose prompt follows the stance and kind,
 * and source chips. While the run
 * panel is shown the box folds that row away until the box has the focus or something in it, so the board and the
 * panel get the room. Spec v4 ES-9 (slice 1f): while an edit session (a run) is active nothing can be added (the
 * box is disabled, its placeholder and tooltips say why); what was typed stays for later.
 *
 * Spec v4 BD-8, CM-7 (slice 1c): a new proposition goes onto the canvas at the point "New proposition here" chose (the
 * box shows it, with a ✕ to forget it), else in view, next to the selected card if any (right of a proposition, level
 * with an axiom); its place is stored with it.
 */
export function PromptBox() {
  const kind = useBoard((s) => s.promptKind);
  const runShown = useBoard((s) => s.run !== null && s.run.subject === s.subject && s.runPanelOpen);
  const lock = useBoard((s) => editLock(s));
  const newCardAt = useBoard((s) => s.newCardAt);
  const focusToken = useBoard((s) => s.promptFocus);
  const actions = useBoardActions();
  const store = useBoardStore();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [why, setWhy] = useState('');
  const [stance, setStance] = useState<Stance | undefined>(undefined);
  const [source, setSource] = useState<Evidential | undefined>(undefined);
  const radios = useRef<Partial<Record<NodeType, HTMLButtonElement | null>>>({});
  const showStance = kind === 'AXIOM';
  // Spec v4 CF-2: both kinds have a Source.
  const showSource = true;

  // "New proposition here" (CM-7) asks for the focus.
  useEffect(() => {
    if (focusToken > 0) input.current?.focus();
  }, [focusToken]);

  const submit = () => {
    // BD-8: a proposition goes where "New proposition here" chose, else in view, next to the selected card if any.
    const canvas = currentCanvas();
    const position = kind === 'PROPOSITION' ? (newCardAt ?? canvas?.newCardPosition(newCardAnchor(store.getState())) ?? undefined) : undefined;
    const id = actions.addNode(kind, text, {
      ...(why.trim() ? { rationale: why } : {}),
      ...(showStance && stance ? { stance } : {}),
      ...(showSource && source ? { source } : {}),
      ...(position ? { position } : {}),
    });
    if (id) {
      setText('');
      setWhy('');
      setStance(undefined);
      setSource(undefined);
      revealCardSoon(id);
    }
  };

  const onSwitchKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = NODE_TYPES.indexOf(kind);
    const next = NODE_TYPES[(index + (event.key === 'ArrowRight' ? 1 : NODE_TYPES.length - 1)) % NODE_TYPES.length] ?? kind;
    actions.setPromptKind(next);
    radios.current[next]?.focus();
  };

  const empty = text === '' && why === '' && stance === undefined && source === undefined;
  return (
    <form
      className="tl-prompt"
      data-kind={kind}
      data-folded={(runShown && empty) || undefined}
      data-locked={lock !== null || undefined}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="tl-prompt__row">
        <div className="tl-seg" role="radiogroup" aria-label="Kind of the new card" onKeyDown={onSwitchKey}>
          {NODE_TYPES.map((k) => (
            <button
              key={k}
              ref={(element) => {
                radios.current[k] = element;
              }}
              type="button"
              role="radio"
              aria-checked={k === kind}
              tabIndex={k === kind ? 0 : -1}
              data-kind={k}
              disabled={lock !== null}
              title={lock ?? undefined}
              onClick={() => actions.setPromptKind(k)}
            >
              <span className="tl-glyph" data-kind={k} aria-hidden="true">
                {KIND_GLYPH[k]}
              </span>
              {KIND_NOUN[k]}
            </button>
          ))}
        </div>
        {kind === 'PROPOSITION' && newCardAt ? (
          <span className="tl-chip tl-prompt__place" data-testid="prompt-place" title="The new proposition goes where you right-clicked on the canvas">
            at the point you chose
            <button type="button" className="tl-prompt__place-clear" aria-label="Forget the point you chose" title="Place it in view instead" onClick={() => actions.clearNewCardAt()}>
              <span className="codicon codicon-close" aria-hidden="true" />
            </button>
          </span>
        ) : null}
        <input
          ref={input}
          className="tl-prompt__input"
          type="text"
          value={text}
          placeholder={lock ?? PROMPT_PLACEHOLDER[kind]}
          aria-label={`New ${KIND_NOUN[kind].toLowerCase()}`}
          disabled={lock !== null}
          title={lock ?? undefined}
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => pasteOneLine(event, setText)}
        />
        <button type="submit" className="tl-button" data-testid="prompt-add" disabled={text.trim() === '' || lock !== null} title={lock ?? undefined}>
          Add {KIND_NOUN[kind].toLowerCase()}
        </button>
      </div>
      <div className="tl-prompt__row tl-prompt__row--extra">
        {showStance ? <ChipChoice label="Stance" values={STANCES} value={stance} text={STANCE_LABEL} onChange={setStance} lock={lock} /> : null}
        <input
          className="tl-prompt__why"
          type="text"
          value={why}
          placeholder={whyPlaceholder(kind, stance)}
          aria-label="Why (optional)"
          disabled={lock !== null}
          title={lock ?? undefined}
          onChange={(event) => setWhy(event.target.value)}
          onPaste={(event) => pasteOneLine(event, setWhy)}
        />
        {showSource ? <ChipChoice label="Source" values={EVIDENTIALS} value={source} text={SOURCE_LABEL} onChange={setSource} lock={lock} /> : null}
      </div>
    </form>
  );
}
