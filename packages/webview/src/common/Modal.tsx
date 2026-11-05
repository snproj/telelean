/**
 * A modal dialog on the native <dialog> element (focus is trapped and restored by the browser; Escape cancels).
 * Mounted only while open: showModal() on mount, close() before unmount. The element marked `data-autofocus` gets
 * the focus (React's autoFocus would run before the dialog is shown, when nothing in it can take focus).
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';

export interface ModalProps {
  /** Id of the dialog's heading. */
  labelledBy: string;
  testId: string;
  /** Escape, or the parent's Cancel button. */
  onCancel: () => void;
  className?: string;
  children: ReactNode;
}

export function Modal({ labelledBy, testId, onCancel, className, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`tl-dialog${className ? ` ${className}` : ''}`}
      aria-labelledby={labelledBy}
      data-testid={testId}
      onCancel={(event) => {
        event.preventDefault(); // React decides when the dialog goes away
        onCancel();
      }}
    >
      {children}
    </dialog>
  );
}
