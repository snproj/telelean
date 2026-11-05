/**
 * Small pure formatters and input helpers (unit-tested): history times, storage sizes, the one-line sentence rule,
 * and the board's undo/redo shortcuts.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** A history entry's time: "14:03" today, "Oct 31 14:03" otherwise (local time; fixed format, no locale). */
export function formatTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (sameDay) return time;
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}${year} ${time}`;
}

/** Disk sizes for the history counter: "512 B", "1.5 KB", "12 KB", "3.4 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '?';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)} ${units[unit]}`;
}

/** A piece of a message from core: plain text, or a `code` span (core writes Lean names and code in backticks). */
export interface TextSpan {
  text: string;
  code: boolean;
}

/** Splits core's Markdown-style backtick spans out of a message; an unmatched backtick stays literal text. */
export function codeSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  let at = 0;
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    const start = match.index;
    if (start > at) spans.push({ text: text.slice(at, start), code: false });
    spans.push({ text: match[1] ?? '', code: true });
    at = start + match[0].length;
  }
  if (at < text.length) spans.push({ text: text.slice(at), code: false });
  return spans;
}

/** A message from core for a tooltip (a `title` shows no markup): its backtick spans without the backticks. */
export function plainText(text: string): string {
  return codeSpans(text)
    .map((span) => span.text)
    .join('');
}

/** Two pieces of tooltip text as sentences: "detail. Click to check again." (a period is added only when missing). */
export function sentences(...parts: ReadonlyArray<string | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .map((part) => (/[.!?…:]$/.test(part) ? part : `${part}.`))
    .join(' ');
}

/**
 * The user's sentence as the protocol needs it (D-16 verbatim, one line): line breaks become spaces, then the
 * text is trimmed. Nothing else changes (inner spacing is the user's).
 */
export function oneLine(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ').trim();
}

/** Line breaks in pasted text become spaces (an `<input>` would silently delete them, gluing words together). */
export function pastedLine(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ');
}

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Ctrl/Cmd+Z = undo; Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y = redo. */
export function shortcutFor(event: ShortcutEvent): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}

/** Whether keyboard focus is somewhere text is typed (where Ctrl+Z belongs to the field, not the board). */
export function isTextEntry(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}
