/**
 * The board's legend (spec v4 BD-9; D-15: never colour alone), pure so it can be tested: what each entry says and
 * which swatch it shows. Every swatch differs by a pattern or a glyph as well as by its colour: dots for declared, a
 * solid line for verified, a hollow head for conditional, a notched head for a mismatch, "λ" on the blue glow, "✓" on the
 * green one and on the band's seal, "⧗" for a pending proof. (BD-9 also lists "frozen", which comes with FROZEN.)
 */
export type LegendSwatch = 'declared' | 'verified' | 'conditional' | 'mismatch' | 'formalised' | 'established' | 'band' | 'pending';

export interface LegendEntry {
  /** Stable key, rendered as `data-legend`. */
  key: LegendSwatch;
  label: string;
  title: string;
  /** The glyph the swatch carries besides its colour, if it is not a line pattern. */
  glyph?: string;
}

export const LEGEND_ENTRIES: readonly LegendEntry[] = [
  { key: 'declared', label: 'declared', title: 'You drew this arrow: the target follows, at least in part, from the source (dotted)' },
  { key: 'verified', label: 'verified by Lean', title: 'A checked proof of the target uses the source (solid)' },
  { key: 'conditional', label: 'conditional', title: 'The proof takes the source as a hypothesis: proved only if it holds (hollow head)' },
  {
    key: 'mismatch',
    label: 'mismatch',
    title: 'A proof uses a card you drew no arrow from (TL107): solid, in the warning colour, with a notched head. An arrow the proof does not use stays plain dotted.',
  },
  { key: 'formalised', label: 'formalised', title: 'The card has a Lean statement (the blue glow and the "λ Lean" chip)', glyph: 'λ' },
  {
    key: 'established',
    label: 'established',
    title: 'Proved by Lean all the way down to your axioms, never resting on a pending claim, with current facts (the green glow and the "✓ established" chip)',
    glyph: '✓',
  },
  {
    key: 'band',
    label: 'these suffice together',
    title:
      'The band binds the arrows a checked proof uses. With ✓: together they suffice (checked by Lean; consistency unchecked). Dashed, without ✓: the proof also rests on something outside it (its tooltip says what).',
    glyph: '✓',
  },
  { key: 'pending', label: 'pending proof', title: 'A proposition whose .holds is still an axiom: assumed until a run proves it (the "pending proof" chip)', glyph: '⧗' },
];
