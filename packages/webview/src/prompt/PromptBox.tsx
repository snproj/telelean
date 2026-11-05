import { EVIDENTIALS, NODE_TYPES, STANCES, type Evidential, type NodeType, type Stance } from '@telelean/core';
import { useRef, useState, type KeyboardEvent } from 'react';
import { revealCardSoon } from '../board/reveal';
import { pasteOneLine } from '../common/OneLineInput';
import { KIND_GLYPH, KIND_NOUN, PROMPT_PLACEHOLDER, SOURCE_LABEL, STANCE_LABEL, whyPlaceholder } from '../labels';
import { useBoard, useBoardActions } from '../state/context';

/** Chips that act like radio buttons which can also be switched off again (all D-14 chips are optional). */
function ChipChoice<T extends string>({ label, values, value, text, onChange }: { label: string; values: readonly T[]; value: T | undefined; text: Readonly<Record<T, string>>; onChange: (next: T | undefined) => void }) {
  return (
    <span className="tl-prompt__chips" role="group" aria-label={label}>
      {values.map((v) => (
        <button key={v} type="button" className="tl-choice" aria-pressed={v === value} onClick={() => onChange(v === value ? undefined : v)}>
          {text[v]}
        </button>
      ))}
    </span>
  );
}

/**
 * The A|D|G prompt box (D-16): the switch marks the kind of the card the text creates. Enter adds a comment-only
 * card with the user's verbatim words (trimmed only; no LLM, no Lean). The second row is optional (D-14): stance
 * chips for an Assumption, a "why" field whose prompt follows the stance and kind, and source chips. While the run
 * panel is shown the box keeps working (D-16) but folds that row away until the box has the focus or something in
 * it, so the board and the panel get the room.
 */
export function PromptBox() {
  const kind = useBoard((s) => s.promptKind);
  const runShown = useBoard((s) => s.run !== null && s.run.subject === s.subject && s.runPanelOpen);
  const actions = useBoardActions();
  const [text, setText] = useState('');
  const [why, setWhy] = useState('');
  const [stance, setStance] = useState<Stance | undefined>(undefined);
  const [source, setSource] = useState<Evidential | undefined>(undefined);
  const radios = useRef<Partial<Record<NodeType, HTMLButtonElement | null>>>({});
  const showStance = kind === 'ASSUMPTION';
  const showSource = kind !== 'GOAL';

  const submit = () => {
    const id = actions.addNode(kind, text, {
      ...(why.trim() ? { rationale: why } : {}),
      ...(showStance && stance ? { stance } : {}),
      ...(showSource && source ? { source } : {}),
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
              onClick={() => actions.setPromptKind(k)}
            >
              <span className="tl-glyph" data-kind={k} aria-hidden="true">
                {KIND_GLYPH[k]}
              </span>
              {KIND_NOUN[k]}
            </button>
          ))}
        </div>
        <input
          className="tl-prompt__input"
          type="text"
          value={text}
          placeholder={PROMPT_PLACEHOLDER[kind]}
          aria-label={`New ${KIND_NOUN[kind].toLowerCase()}`}
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => pasteOneLine(event, setText)}
        />
        <button type="submit" className="tl-button" disabled={text.trim() === ''}>
          Add {KIND_NOUN[kind].toLowerCase()}
        </button>
      </div>
      <div className="tl-prompt__row tl-prompt__row--extra">
        {showStance ? <ChipChoice label="Stance" values={STANCES} value={stance} text={STANCE_LABEL} onChange={setStance} /> : null}
        <input
          className="tl-prompt__why"
          type="text"
          value={why}
          placeholder={whyPlaceholder(kind, stance)}
          aria-label="Why (optional)"
          onChange={(event) => setWhy(event.target.value)}
          onPaste={(event) => pasteOneLine(event, setWhy)}
        />
        {showSource ? <ChipChoice label="Source" values={EVIDENTIALS} value={source} text={SOURCE_LABEL} onChange={setSource} /> : null}
      </div>
    </form>
  );
}
