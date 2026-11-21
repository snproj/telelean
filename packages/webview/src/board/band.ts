/**
 * The band (spec v4.1 BD-7, B.5; slice 1d), pure: which drawn arrows into a proposition bind together as the ones its
 * checked proof uses, and whether the band is COMPLETE (the ✓, "these suffice") or OPEN (no ✓, naming what lies
 * outside it). The board never decides what a proof uses: core computes direct(v) from Lean's elaborated proof
 * (`status.direct`, the solid arrows); this module only words it and picks the arrows.
 *
 *  - band(v) = the drawn arrows into v whose source is in direct(v), plus the drawn hollow-head arrows of a conditional
 *    proof (its hypotheses), which sit inside an open band.
 *  - Complete when every card in direct(v) has a drawn arrow into v, v's proof takes no hypothesis, its footprint has no
 *    hidden assumption (`axiom:`), direct(v) came from the elaborated proof (not the source-text fallback), B.2's
 *    cross-check found nothing unseen, and neither v's `.holds` nor that of a card in direct(v) states something else
 *    than its card (TL114: Lean checked the proof from that other statement, not from the one the arrow stands for).
 *    The band says the arrows suffice together; never that each is needed, nor that the axioms are consistent (S20),
 *    so its tooltip always says "consistency unchecked".
 *  - A card with no arrow to bind: its band sits on its "follows from nothing" mark (the ∅ stub) when it has one; else
 *    there is no band (a proof from nothing shows its chip instead, cardData.ts).
 *  - No band from out-of-date facts (the card, or a card its proof uses directly, is stale or not checked), none for an
 *    axiom, an unproved card, or a card whose result the Proposed view still hides (D-19, RV-6).
 */
import { PRESUPPOSITION_PREFIX, type TlEdge, type TlNode, type VocabItem } from '@telelean/core';

export interface Band {
  /** The proposition the band belongs to (one band per card: a proposition has one proof). */
  target: string;
  /** The drawn arrows it binds, as overlay edge ids (`${source}->${target}`), in the order of the card's premises. */
  arrows: string[];
  /** It sits on the card's ∅ stub (no arrow to bind; the card is marked "follows from nothing"). */
  onMark: boolean;
  /** The ✓: these arrows suffice together (checked by Lean). */
  complete: boolean;
  /** What lies outside an open band, in words (empty when complete). */
  outside: string[];
  /** The tooltip. */
  title: string;
}

/** What the band needs from the board on screen (BoardViewData and Overlay both have it). */
export interface BandContext {
  nodes: Readonly<Record<string, TlNode>>;
  edges: readonly TlEdge[];
  vocab?: ReadonlyMap<string, VocabItem>;
  /** Cards whose result the Proposed view hides until the review reveals it. */
  hidden?: ReadonlySet<string>;
}

export const BAND_COMPLETE_TITLE = 'Together these suffice (checked by Lean) · consistency unchecked';

const OUT_OF_DATE: ReadonlySet<string> = new Set(['stale', 'not-checked']);

function cut(text: string, max = 40): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** A card as the band names it: “its sentence”, or its id when it is not on this board (another subject's card). */
export function bandName(id: string, nodes: Readonly<Record<string, TlNode>>): string {
  const node = nodes[id];
  return `“${cut(node?.naturalName || id)}”`;
}

const isProof = (node: TlNode) => node.status.proof.kind === 'proved' || node.status.proof.kind === 'conditional';
const footprintOf = (node: TlNode): readonly string[] => {
  const proof = node.status.proof;
  return proof.kind === 'proved' ? proof.footprint : proof.kind === 'conditional' ? (proof.footprint ?? []) : [];
};

/** direct(v): core's list (every subject), or, from a graph made before slice 1d, the solid arrows into the card. */
export function directOf(node: TlNode, edges: readonly TlEdge[]): string[] {
  if (node.status.direct) return [...node.status.direct.ids];
  return edges.filter((e) => e.type === 'verified' && e.target === node.id && !e.conditional).map((e) => e.source);
}

/** The band of one card, or null when it has none (see the module comment). */
export function bandOf(node: TlNode, ctx: BandContext): Band | null {
  if (node.type !== 'PROPOSITION' || !isProof(node) || ctx.hidden?.has(node.id)) return null;
  if (node.status.flags.some((f) => OUT_OF_DATE.has(f))) return null;
  const proof = node.status.proof;
  const direct = directOf(node, ctx.edges);
  const on = proof.kind === 'conditional' ? proof.on : [];
  for (const id of [...direct, ...on]) if (ctx.nodes[id]?.status.flags.some((f) => OUT_OF_DATE.has(f))) return null;

  const drawn = node.premises.filter((p) => p !== node.id && ctx.nodes[p] !== undefined);
  const arrows = drawn.filter((p) => direct.includes(p) || on.includes(p)).map((p) => `${p}->${node.id}`);
  const onMark = arrows.length === 0 && node.fromNothing === true;
  if (arrows.length === 0 && !onMark) return null;

  const outside: string[] = [];
  for (const id of direct) if (!drawn.includes(id)) outside.push(`also uses ${bandName(id, ctx.nodes)} (no arrow)`);
  for (const id of on) outside.push(`given ${bandName(id, ctx.nodes)} (not proved)`);
  if (footprintOf(node).some((x) => x.startsWith('axiom:'))) outside.push('a hidden assumption');
  // An arrow stands for its card's statement, but Lean checked the proof from what each `.holds` states: when v's
  // `.holds`, or that of a card the proof uses, states something else (TL114), the arrows do not say what Lean checked.
  if (node.status.flags.includes('holds-mismatch')) outside.push('its own .holds states something else (TL114)');
  for (const id of direct) if (ctx.nodes[id]?.status.flags.includes('holds-mismatch')) outside.push(`the .holds of ${bandName(id, ctx.nodes)} states something else (TL114)`);
  for (const id of node.status.direct?.unseen ?? []) outside.push(`uses ${bandName(id, ctx.nodes)} in a way the arrows do not show`);
  if ((node.status.direct?.from ?? 'source') === 'source') outside.push('computed from the source text only');
  const complete = outside.length === 0;

  const lines = [complete ? BAND_COMPLETE_TITLE : `Open band (no ✓): ${outside.join(' · ')} · consistency unchecked`];
  const definitions = (node.lean.uses ?? []).filter((name) => ctx.vocab?.get(name)?.kind === 'definition');
  if (definitions.length > 0) lines.push(`also by definition: ${definitions.map((name) => shortName(name, node, ctx.vocab)).join(', ')}`);
  const presupposes = footprintOf(node)
    .filter((x) => x.startsWith(PRESUPPOSITION_PREFIX))
    .map((x) => x.slice(PRESUPPOSITION_PREFIX.length));
  if (presupposes.length > 0) lines.push(`also presupposes: ${presupposes.map((name) => shortName(name, node, ctx.vocab)).join(', ')}`);
  return { target: node.id, arrows, onMark, complete, outside, title: lines.join('\n') };
}

/** A vocabulary item's name as this board prints it (its short name in its own subject). */
function shortName(name: string, node: TlNode, vocab: ReadonlyMap<string, VocabItem> | undefined): string {
  const item = vocab?.get(name);
  if (item && item.subject === node.subject) return item.shortName;
  return name.startsWith(`${node.subject}.`) ? name.slice(node.subject.length + 1) : name;
}

/** Every band of the board on screen (the cards' order). */
export function bandsOf(ctx: BandContext): Band[] {
  const out: Band[] = [];
  for (const node of Object.values(ctx.nodes)) {
    const band = bandOf(node, ctx);
    if (band) out.push(band);
  }
  return out;
}
