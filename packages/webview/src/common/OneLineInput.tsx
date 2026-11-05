/**
 * Text inputs for the user's one-line wording (D-16: verbatim, one line): pasted line breaks become spaces instead
 * of being deleted (which an <input> does by default, gluing words together).
 */
import { useLayoutEffect, useRef, useState, type ClipboardEvent, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { pastedLine } from '../model/format';

/** onPaste handler: inserts the clipboard text with its line breaks turned into spaces. */
export function pasteOneLine(event: ClipboardEvent<HTMLInputElement>, setValue: (value: string) => void): void {
  const text = event.clipboardData.getData('text/plain');
  if (!/[\r\n]/.test(text)) return; // nothing to fix: let the browser paste
  event.preventDefault();
  const input = event.currentTarget;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const insert = pastedLine(text);
  setValue(input.value.slice(0, start) + insert + input.value.slice(end));
  const caret = start + insert.length;
  requestAnimationFrame(() => input.setSelectionRange(caret, caret));
}

export interface InlineEditProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'defaultValue'> {
  initial: string;
  /** Enter, or leaving the field. */
  onCommit: (value: string) => void;
  /** Escape. */
  onCancel: () => void;
  /**
   * Called after Enter or Escape (not after the field lost the focus to something else) to put the focus back where
   * the editing started, since the field itself goes away.
   */
  returnFocus?: () => void;
}

/** An in-place editor: focused and selected on mount; Enter or blur saves, Escape cancels (each fires once). */
export function InlineEdit({ initial, onCommit, onCancel, returnFocus, className, ...rest }: InlineEditProps) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    onCommit(value);
  };
  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      returnFocus?.();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      returnFocus?.();
    }
  };
  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      className={`tl-edit${className ? ` ${className}` : ''}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onPaste={(event) => pasteOneLine(event, setValue)}
      onKeyDown={onKeyDown}
      onBlur={commit}
      onClick={(event) => event.stopPropagation()}
    />
  );
}
