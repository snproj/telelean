/**
 * TL110 (docs/m1-plan.md section 6.5): `autoImplicit` on. With it, Lean silently turns an unknown lower-case name in a
 * statement into a universally quantified variable, so a typo in a card's Lean statement changes what it says
 * instead of failing. telelean's scaffold sets `autoImplicit = false` under `[leanOptions]`; any other lakefile gets a
 * warning on every board until it does.
 *
 * A deliberately small reader (no TOML parser is installed): comments are dropped line by line, then every
 * `autoImplicit = true|false` (TOML, also inside `leanOptions = { … }`) or `` `autoImplicit, true|false `` /
 * `autoImplicit := …` (lakefile.lean) counts. On = any `true`, or no `false` at all (Lean's default is on).
 */
import type { BoardDiagnostic, Range } from '../model.js';

const TOML_SETTING = /\bautoImplicit\s*=\s*(true|false)\b/;
const LEAN_SETTING = /\bautoImplicit\s*(?:,|:=)\s*(true|false)\b/;

function lineRange(line: number, character: number, length: number): Range {
  return { start: { line, character }, end: { line, character: character + length } };
}

/** The TL110 warning for this lakefile, or undefined when `autoImplicit` is off. */
export function autoImplicitDiagnostic(lakefile: { path: string; text: string }): BoardDiagnostic | undefined {
  const lean = lakefile.path.endsWith('.lean');
  const pattern = lean ? LEAN_SETTING : TOML_SETTING;
  let off = false;
  let on: Range | undefined;
  lakefile.text.split(/\r?\n/).forEach((raw, line) => {
    const cut = lean ? raw.indexOf('--') : raw.indexOf('#');
    const text = cut >= 0 ? raw.slice(0, cut) : raw;
    const match = pattern.exec(text);
    if (!match) return;
    if (match[1] === 'false') off = true;
    else on ??= lineRange(line, match.index, match[0].length);
  });
  if (off && on === undefined) return undefined;
  const fix = lean ? '`leanOptions := #[⟨`autoImplicit, false⟩]`' : '`autoImplicit = false` under `[leanOptions]`';
  return {
    code: 'TL110',
    severity: 'warning',
    message:
      `autoImplicit is on in ${lakefile.path}${on ? '' : " (Lean's default)"}: an unknown name in a statement silently becomes a variable, ` +
      `so a typo changes what a card says instead of failing. Set ${fix}.`,
    file: lakefile.path,
    range: on ?? lineRange(0, 0, 0),
  };
}
