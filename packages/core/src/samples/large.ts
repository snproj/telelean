/**
 * A deterministic, generated graph with about 25 cards per column, for scrolling and edge-overlay tests.
 * It mixes code-less and formalised nodes, declared (dashed) and verified (solid) arrows, arrows that skip the
 * Derivations column (A -> G) and within-column arrows (D -> D, allowed by D-13b). Sentences vary in length so
 * cards have different heights.
 */
import { buildGraph } from '../graph.js';
import type { NodeType, TlGraph, TlNode } from '../model.js';

export interface LargeGraphOptions {
  /** Cards per column (default 25). */
  perColumn?: number;
  /** PRNG seed (default 7): the same seed always yields the same graph. */
  seed?: number;
  version?: number;
}

export const LARGE_SUBJECT = 'Franchise';

const TOPICS = [
  'lore', 'ratings', 'tone', 'villains', 'sequels', 'canon', 'reviews', 'audience', 'soundtrack', 'level design',
  'difficulty', 'art style', 'voice acting', 'pacing', 'collectibles', 'boss fights', 'humour', 'nostalgia',
];
const LEAN_WORDS = ['Lore', 'Rating', 'Tone', 'Villain', 'Sequel', 'Canon', 'Review', 'Audience', 'Music'];

const A_TEMPLATES = [
  (x: string, y: string) => `Players remember the ${x} longer than the ${y}`,
  (x: string) => `Every mainline entry is judged by its ${x}`,
  (x: string, y: string) =>
    `Long-time fans care more about ${x} than about ${y}, especially when a familiar character returns after many years away from the series`,
  (x: string) => `Critics mention the ${x} in almost every review`,
  (x: string, y: string) => `A change in ${x} is noticed before a change in ${y}`,
];
const D_TEMPLATES = [
  (x: string, y: string) => `The ${x} shapes how the ${y} is received`,
  (x: string, y: string) => `Improving the ${x} cannot hurt the ${y}`,
  (x: string, y: string) =>
    `If the ${x} disappoints, then the ${y} will be blamed as well, whatever the development team actually changed`,
  (x: string) => `The ${x} is what fans compare first`,
];
const G_TEMPLATES = [
  (x: string, y: string) => `Show that the ${x} predicts the ${y}`,
  (x: string) => `The next game should keep the ${x} unchanged`,
  (x: string, y: string) => `A darker ${x} would not damage the ${y} of the franchise in the long run`,
];

/** mulberry32: tiny deterministic PRNG. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function largeGraph(options: LargeGraphOptions = {}): TlGraph {
  const perColumn = options.perColumn ?? 25;
  const rand = prng(options.seed ?? 7);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
  const pickDistinct = (ids: readonly string[], count: number): string[] => {
    const pool = [...ids];
    const out: string[] = [];
    while (out.length < count && pool.length > 0) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0] as string);
    return out;
  };
  const pad = (i: number) => String(i).padStart(2, '0');
  const leanName = (id: string) => id.replace(/-/g, '_');

  const base = (id: string, type: NodeType, naturalName: string): TlNode => ({
    id,
    type,
    role: 'node',
    subject: LARGE_SUBJECT,
    naturalName,
    asserted: '2026-11-01',
    premises: [],
    provenance: { wordedBy: 'user', endorsed: true, origin: 'user' },
    ext: {},
    lean: { binding: 'none' },
    status: { formal: 'informal', proof: { kind: 'none' }, certificates: { consistency: 'none', nonVacuity: 'none' }, flags: [] },
  });

  const formalise = (node: TlNode, statement: string, holds: 'axiom' | 'theorem' | null): TlNode => {
    const n = leanName(node.id);
    const lines = [`/-- ${node.naturalName} -/`, `abbrev ${n} : Prop := ${statement}`];
    if (holds === 'axiom') lines.push(`axiom ${n}.holds : ${n}`);
    if (holds === 'theorem') lines.push(`theorem ${n}.holds : ${n} := by`, `  exact ${leanName(node.premises[0] ?? n)}.holds`);
    return {
      ...node,
      lean: { binding: 'adjacent', statement: `Franchise.${n}`, ...(holds ? { justification: `Franchise.${n}.holds` } : {}), code: lines.join('\n') },
      status: { ...node.status, formal: 'formalized' },
    };
  };

  const assumptions: TlNode[] = [];
  for (let i = 1; i <= perColumn; i++) {
    const [x, y] = [pick(TOPICS), pick(TOPICS)];
    let node = base(`a${pad(i)}`, 'ASSUMPTION', pick(A_TEMPLATES)(x, y));
    if (i % 2 === 1) node = { ...node, rationale: pick(['personal experience', 'read it in an interview', 'common knowledge among fans']) };
    else node = { ...node, status: { ...node.status, flags: ['no-rationale'] } };
    if (i % 3 === 0) {
      node = formalise(node, `Remembers players ${pick(LEAN_WORDS)}`, 'axiom');
      node = { ...node, status: { ...node.status, proof: { kind: 'assumed' } } };
    }
    assumptions.push(node);
  }
  const aIds = assumptions.map((n) => n.id);

  const derivations: TlNode[] = [];
  for (let i = 1; i <= perColumn; i++) {
    const [x, y] = [pick(TOPICS), pick(TOPICS)];
    let node = base(`d${pad(i)}`, 'DERIVATION', pick(D_TEMPLATES)(x, y));
    const premises = pickDistinct(aIds, 1 + Math.floor(rand() * 3));
    if (i > 1 && rand() < 0.3) premises.push(`d${pad(1 + Math.floor(rand() * (i - 1)))}`); // within-column arrow
    node = { ...node, premises: [...new Set(premises)] };
    if (i % 2 === 0) node = formalise(node, `Shapes ${pick(LEAN_WORDS)} ${pick(LEAN_WORDS)}`, i % 4 === 0 ? 'theorem' : null);
    if (i % 4 === 0) {
      // Proved: the footprint is the declared premises, minus the last one when there are three or more,
      // so the board shows both "declared and verified" (solid) and "declared but unused" (dashed).
      const footprint = node.premises.length >= 3 ? node.premises.slice(0, -1) : [...node.premises];
      node = { ...node, status: { ...node.status, proof: { kind: 'proved', footprint } } };
    }
    derivations.push(node);
  }
  const dIds = derivations.map((n) => n.id);

  const goals: TlNode[] = [];
  for (let i = 1; i <= perColumn; i++) {
    const [x, y] = [pick(TOPICS), pick(TOPICS)];
    let node = base(`g${pad(i)}`, 'GOAL', pick(G_TEMPLATES)(x, y));
    const premises = pickDistinct(dIds, 1 + Math.floor(rand() * 2));
    if (rand() < 0.3) premises.push(pick(aIds)); // skips the Derivations column
    node = { ...node, premises: [...new Set(premises)] };
    if (i % 3 === 0) node = formalise(node, `Predicts ${pick(LEAN_WORDS)} ${pick(LEAN_WORDS)}`, null);
    goals.push(node);
  }

  return buildGraph({ subject: LARGE_SUBJECT, version: options.version ?? 1, nodes: [...assumptions, ...derivations, ...goals] });
}
