/**
 * Line utilities shared by the parser and the text edits. Lines are separated by `\n`; a `\r` right before it
 * belongs to the line break (`\r\n`), so line contents never include it. Offsets are UTF-16 code units, which are
 * also LSP's default character unit, so a position's `character` is an offset difference.
 */
import type { Range } from '../model.js';
import type { LineIndex, Span } from './types.js';

const NL = 0x0a;
const CR = 0x0d;

/** Offsets at which each line starts (the first is 0). */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

/** The 0-based line containing `offset` (an offset at a line start belongs to that line). */
export function lineOfOffset(starts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Where line `line`'s content ends: before its `\n` or `\r\n`, or at the end of the text. */
export function lineContentEnd(text: string, starts: readonly number[], line: number): number {
  const next = starts[line + 1];
  if (next === undefined) return text.length;
  const newline = next - 1;
  return newline > (starts[line] ?? 0) && text.charCodeAt(newline - 1) === CR ? newline - 1 : newline;
}

/** Where line `line` ends including its line break (the next line's start, or the end of the text). */
export function lineFullEnd(text: string, starts: readonly number[], line: number): number {
  return starts[line + 1] ?? text.length;
}

/** True when `text[start, end)` holds only spaces and tabs. */
export function isHorizontalSpace(text: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c !== 0x20 && c !== 0x09) return false;
  }
  return true;
}

/** True when line `line` exists and holds only whitespace. */
export function isBlankLine(text: string, starts: readonly number[], line: number): boolean {
  const start = starts[line];
  if (start === undefined) return false;
  return text.slice(start, lineContentEnd(text, starts, line)).trim() === '';
}

/** The leading spaces and tabs of line `line`. */
export function lineIndent(text: string, starts: readonly number[], line: number): string {
  const start = starts[line] ?? 0;
  let i = start;
  const end = lineContentEnd(text, starts, line);
  while (i < end && (text.charCodeAt(i) === 0x20 || text.charCodeAt(i) === 0x09)) i++;
  return text.slice(start, i);
}

/** The file's line break: that of its first line, `\n` when it has none. */
export function detectEol(text: string): '\n' | '\r\n' {
  const i = text.indexOf('\n');
  return i > 0 && text.charCodeAt(i - 1) === CR ? '\r\n' : '\n';
}

/** True when the text ends with a line break. */
export function endsWithNewline(text: string): boolean {
  return text.length > 0 && text.charCodeAt(text.length - 1) === NL;
}

/** Offset <-> position conversion for one text (LSP convention: 0-based line, UTF-16 character). */
export function lineIndex(text: string): LineIndex {
  const starts = lineStarts(text);
  return {
    lineCount: starts.length,
    positionAt(offset: number) {
      const clamped = Math.max(0, Math.min(offset, text.length));
      const line = lineOfOffset(starts, clamped);
      return { line, character: clamped - (starts[line] ?? 0) };
    },
    offsetAt(position: { line: number; character: number }) {
      if (position.line < 0) return 0;
      const start = starts[position.line];
      if (start === undefined) return text.length;
      return Math.min(start + Math.max(0, position.character), lineContentEnd(text, starts, position.line));
    },
  };
}

/** A line table bundling the text, its line starts and range conversion (internal helper). */
export class Lines {
  readonly starts: number[];
  constructor(readonly text: string) {
    this.starts = lineStarts(text);
  }
  lineOf(offset: number): number {
    return lineOfOffset(this.starts, offset);
  }
  start(line: number): number {
    return this.starts[line] ?? this.text.length;
  }
  contentEnd(line: number): number {
    return lineContentEnd(this.text, this.starts, line);
  }
  fullEnd(line: number): number {
    return lineFullEnd(this.text, this.starts, line);
  }
  isBlank(line: number): boolean {
    return isBlankLine(this.text, this.starts, line);
  }
  indent(line: number): string {
    return lineIndent(this.text, this.starts, line);
  }
  get count(): number {
    return this.starts.length;
  }
  position(offset: number): { line: number; character: number } {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    const line = this.lineOf(clamped);
    return { line, character: clamped - this.start(line) };
  }
  range(span: Span): Range {
    return { start: this.position(span.start), end: this.position(span.end) };
  }
  /** True when only spaces/tabs precede `offset` on its line. */
  isLineInitial(offset: number): boolean {
    return isHorizontalSpace(this.text, this.start(this.lineOf(offset)), offset);
  }
}
