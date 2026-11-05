/**
 * Pure helpers that turn graph data into what a card shows (no DOM, no React, unit-tested): the "uses:" line, the
 * presupposition chips, identifier segments of the expanded Lean code, the status chips, the footprint, and the
 * "Depends on / Used by" relations (03 section 7; docs/m1-plan.md sections 6.3-6.4).
 */
import {
  PRESUPPOSITION_PREFIX,
  proofDependents,
  type BoardDiagnostic,
  type LeanRef,
  type NodeType,
  type ProofStatus,
  type TlEdge,
  type TlNode,
  type VocabItem,
} from '@telelean/core';

export type VocabIndex = ReadonlyMap<string, VocabItem>;

export function vocabIndex(items: readonly VocabItem[]): Map<string, VocabItem> {
  return new Map(items.map((item) => [item.name, item]));
}

/**
 * The name the board prints for a Lean constant: a vocabulary item of this subject by its short name, anything
 * else (another subject's vocabulary, D-10 explicit imports; core constants) fully qualified.
 */
export function displayName(name: string, subject: string, vocab: VocabIndex): string {
  const item = vocab.get(name);
  if (item && item.subject === subject) return item.shortName;
  return name;
}

/** How many names the "uses:" line prints before it truncates (docs/m1-plan.md 13.1 #10). */
export const USES_INLINE = 2;

/** The inline "uses:" text: the first two names, then ", …" when there are more (deterministic). */
export function usesInline(uses: readonly string[], subject: string, vocab: VocabIndex): string {
  const names = uses.slice(0, USES_INLINE).map((name) => displayName(name, subject, vocab));
  return `${names.join(', ')}${uses.length > USES_INLINE ? ', …' : ''}`;
}

/** The last dot-separated component of a Lean name (`Spyro.Character` -> `Character`). */
function lastComponent(name: string): string {
  const parts = name.split('.');
  return parts[parts.length - 1] ?? name;
}

/**
 * The chip for a presupposition (D-3b), from the sort's gloss: "assumes characters exist"; without a gloss,
 * "assumes there is a Character". `presupposition` is the axiom (`Spyro.Character.exists`).
 */
export function presuppositionLabel(presupposition: string, subject: string, vocab: VocabIndex): string {
  const item = vocab.get(presupposition);
  const sortName = item?.presupposes ?? (presupposition.endsWith('.exists') ? presupposition.slice(0, -'.exists'.length) : undefined);
  const sort = sortName ? vocab.get(sortName) : undefined;
  const gloss = sort?.gloss?.trim();
  if (gloss) return `assumes ${gloss} exist`;
  const shown = sortName ? (sort ? displayName(sortName, subject, vocab) : sortName.startsWith(`${subject}.`) ? sortName.slice(subject.length + 1) : sortName) : lastComponent(presupposition);
  return `assumes there is a ${shown}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Expanded Lean code: plain text and identifier references

export interface CodeSegment {
  text: string;
  /** Set when this piece is an identifier Lean resolved (hover: gloss or sentence; click: highlight). */
  ref?: LeanRef;
}

/**
 * Splits `code` into lines of segments, cutting out the `refs` (ranges relative to the code, UTF-16 columns, as in
 * LSP). Refs that span lines, fall outside their line, or overlap an earlier ref are ignored rather than guessed.
 */
export function codeSegments(code: string, refs: readonly LeanRef[] | undefined): CodeSegment[][] {
  const lines = code.split(/\r\n|\r|\n/);
  const byLine = new Map<number, LeanRef[]>();
  for (const ref of refs ?? []) {
    const { start, end } = ref.range;
    if (start.line !== end.line || end.character <= start.character || start.character < 0) continue;
    const list = byLine.get(start.line) ?? [];
    list.push(ref);
    byLine.set(start.line, list);
  }
  return lines.map((line, index) => {
    const lineRefs = (byLine.get(index) ?? []).slice().sort((a, b) => a.range.start.character - b.range.start.character);
    const segments: CodeSegment[] = [];
    let at = 0;
    for (const ref of lineRefs) {
      const from = ref.range.start.character;
      const to = Math.min(ref.range.end.character, line.length);
      if (from < at || from >= line.length || to <= from) continue;
      if (from > at) segments.push({ text: line.slice(at, from) });
      segments.push({ text: line.slice(from, to), ref });
      at = to;
    }
    if (at < line.length || segments.length === 0) segments.push({ text: line.slice(at) });
    return segments;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Status chips on the card face (D-15)

export type ChipTone = 'plain' | 'lean' | 'attention' | 'error' | 'info' | 'subtle';

export interface Chip {
  /** Stable key, also rendered as `data-chip` (tests and styling). */
  key: string;
  label: string;
  title: string;
  tone: ChipTone;
  /** A chip that is also a button. */
  action?: 'make-derivation' | 'edit-rationale';
  /** The status it shows is the last known one: Lean is re-checking this node (dimmed). */
  dim?: boolean;
}

function short(text: string, max = 28): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The stale chip: "checking…" only while Lean is checking (the badge says so too), else what happened. */
export function staleChip(checking: boolean): Chip {
  return checking
    ? { key: 'stale', label: 'checking…', title: 'Lean is checking the files now; until it is done, this is the last known status', tone: 'subtle' }
    : {
        key: 'stale',
        label: 'changed since last check',
        title: 'Its file changed since Lean last checked it, so this is the last known status. Lean checks again when the file is saved (or click the Lean badge).',
        tone: 'subtle',
      };
}

/**
 * The chips of a card face, in display order. `nodes` resolves ids named by a conditional proof; `checking` says
 * whether a Lean check is running now (SemanticSummary state `checking`).
 */
export function cardChips(node: TlNode, nodes: Readonly<Record<string, TlNode>>, checking = false): Chip[] {
  const { formal, proof, flags } = node.status;
  const has = (flag: (typeof flags)[number]) => flags.includes(flag);
  const notChecked = has('not-checked');
  const stale = has('stale');
  const chips: Chip[] = [];

  if (formal === 'formalized') chips.push({ key: 'lean', label: 'λ Lean', title: 'Has a Lean statement', tone: 'lean' });
  else if (formal === 'ill-formed') {
    chips.push({ key: 'lean', label: 'Lean problem', title: 'Its Lean statement or .holds is missing, has an error, or is not `abbrev n : Prop := …` (see Problems)', tone: 'error' });
  } else chips.push({ key: 'lean', label: 'no Lean yet', title: 'Comment-only node: no Lean code yet', tone: 'plain' });

  const proofChip = proofStatusChip(node, proof, nodes, notChecked);
  if (proofChip) chips.push(stale ? { ...proofChip, dim: true } : proofChip);
  if (stale) chips.push(staleChip(checking));
  if (notChecked) chips.push({ key: 'not-checked', label: 'not checked by Lean', title: 'Lean has not checked this node (its module failed or is not imported, or there are no facts yet)', tone: 'attention' });

  if (has('uses-sorry')) chips.push({ key: 'uses-sorry', label: 'uses sorry', title: 'Its proof contains `sorry`, so it is not proved (TL115)', tone: 'attention' });
  if (has('holds-mismatch')) chips.push({ key: 'holds-mismatch', label: '.holds says something else', title: 'Its `.holds` declaration does not state this statement (TL114)', tone: 'attention' });
  if (has('missing-holds')) chips.push({ key: 'missing-holds', label: 'missing .holds', title: 'A formalised assumption needs `axiom n.holds : n` (TL117)', tone: 'attention' });
  if (has('rests-on-claimed')) chips.push({ key: 'rests-on-claimed', label: 'rests on a claimed node', title: 'Its proof uses a Derivation whose promotion is still pending (its .holds is an axiom)', tone: 'attention' });
  if (has('provable-assumption')) {
    chips.push({ key: 'provable-assumption', label: 'has a proof: make Derivation?', title: 'Its `.holds` is a theorem, so it is derived rather than assumed (TL106)', tone: 'info', action: 'make-derivation' });
  }
  if (has('self-evident')) chips.push({ key: 'self-evident', label: 'self-evident', title: 'Proved without any of your assumptions', tone: 'info' });
  if (has('existence-commitment')) {
    chips.push({ key: 'existence-commitment', label: 'existence commitment', title: 'Its proof needs a presupposition that no statement mentions (TL108)', tone: 'info' });
  }
  if (has('definitional-choice')) chips.push({ key: 'definitional-choice', label: 'definitional choice', title: 'Its statement relies on a definition (D-4: needs your endorsement)', tone: 'info' });
  if (has('broken') || has('depends-on-removed')) chips.push({ key: 'broken', label: 'broken', title: 'It depends on something that was removed', tone: 'error' });
  if (has('no-rationale')) {
    const label = node.stance === 'rule' ? 'no source yet' : 'no reason yet';
    chips.push({ key: 'no-rationale', label, title: 'Add a reason ("because: …")', tone: 'attention', action: 'edit-rationale' });
  }
  if (node.type === 'ASSUMPTION' && node.premises.length > 0) {
    chips.push({ key: 'hint-d13', label: 'you think this follows from those: prove it?', title: 'An assumption with declared support could be a Derivation (D-13)', tone: 'info' });
  }
  return chips;
}

function proofStatusChip(node: TlNode, proof: ProofStatus, nodes: Readonly<Record<string, TlNode>>, notChecked: boolean): Chip | null {
  const flags = node.status.flags;
  switch (proof.kind) {
    case 'assumed':
      return node.type === 'GOAL'
        ? { key: 'proof', label: 'assumed', title: 'This goal is asserted as an axiom (TL116): make it an Assumption?', tone: 'attention' }
        : { key: 'proof', label: 'assumed', title: 'Taken as an axiom (an assumption)', tone: 'plain' };
    case 'proved': {
      const mark = notChecked ? '' : '✓ ';
      const footprint = proof.footprint.length > 0 ? ` from: ${proof.footprint.map((id) => nodes[id]?.naturalName ?? id).join('; ')}` : ' from no assumptions';
      if (flags.includes('proved-goal')) {
        return { key: 'proved-goal', label: `${mark}proved: make Derivation?`, title: `Proved by Lean${footprint}. A proved goal can become a Derivation (TL105).`, tone: 'info', action: 'make-derivation' };
      }
      return { key: 'proof', label: `${mark}proved`, title: `Proved by Lean${footprint}`, tone: 'plain' };
    }
    case 'conditional': {
      const names = proof.on.map((id) => nodes[id]?.naturalName ?? id);
      const shown = names.slice(0, 2).map((name) => short(name)).join(', ') + (names.length > 2 ? ', …' : '');
      return { key: 'conditional', label: `conditional on ${shown}`, title: `Proved, but it takes these unproved statements as hypotheses: ${names.join('; ')}`, tone: 'attention' };
    }
    case 'pending-promotion':
      return { key: 'pending-promotion', label: 'promotion pending', title: 'A Derivation whose .holds is still an axiom (claimed): it counts as derived once you prove it', tone: 'attention' };
    case 'none': {
      if (node.status.formal !== 'formalized' || node.type === 'ASSUMPTION') return null;
      if (flags.includes('uses-sorry') || flags.includes('holds-mismatch')) return null; // their own chips say why
      return { key: 'proof', label: 'unproved', title: 'Stated in Lean, not proved yet', tone: 'plain' };
    }
  }
}

/** Error and warning diagnostics attached to a node: what its "needs attention" badge counts. */
export function attentionDiagnostics(diagnostics: readonly BoardDiagnostic[], nodeId: string): BoardDiagnostic[] {
  return diagnostics.filter((d) => d.nodeId === nodeId && (d.severity === 'error' || d.severity === 'warning'));
}

// ---------------------------------------------------------------------------------------------------------------
// Footprint and relations

export type FootprintEntry =
  | { kind: 'node'; id: string }
  | { kind: 'presupposition'; name: string; label: string }
  | { kind: 'axiom'; name: string }
  | { kind: 'other'; name: string };

/** A proof's footprint (03 section 2): node ids, `presup:<name>` and `axiom:<name>` entries. */
export function footprintEntries(footprint: readonly string[], nodes: Readonly<Record<string, TlNode>>, subject: string, vocab: VocabIndex): FootprintEntry[] {
  return footprint.map((entry): FootprintEntry => {
    if (entry.startsWith(PRESUPPOSITION_PREFIX)) {
      const name = entry.slice(PRESUPPOSITION_PREFIX.length);
      return { kind: 'presupposition', name, label: presuppositionLabel(name, subject, vocab) };
    }
    if (entry.startsWith('axiom:')) return { kind: 'axiom', name: entry.slice('axiom:'.length) };
    if (nodes[entry]) return { kind: 'node', id: entry };
    return { kind: 'other', name: entry };
  });
}

export type RelationReason =
  /** Declared support (`premises:`, D-13). */
  | 'declared'
  /** The proof uses it (a verified edge). */
  | 'proof'
  /** The proof uses it only through other proofs. */
  | 'proof-indirect'
  /** The proof takes it as a hypothesis `(h : n)`. */
  | 'conditional'
  /** The statement mentions it (a lean-ref edge). */
  | 'statement';

export interface Relation {
  id: string;
  reasons: RelationReason[];
}

export const RELATION_TEXT: Readonly<Record<RelationReason, string>> = {
  declared: 'declared',
  proof: 'used by the proof',
  'proof-indirect': 'used through other proofs',
  conditional: 'taken as a hypothesis',
  statement: 'mentioned in the statement',
};

/** Orders relation lists like the board: Assumptions, Derivations, Goals, each in column order. */
function byBoardOrder(order: Readonly<Record<NodeType, readonly string[]>>) {
  const rank = new Map<string, number>();
  let i = 0;
  for (const kind of ['ASSUMPTION', 'DERIVATION', 'GOAL'] as const) for (const id of order[kind]) rank.set(id, i++);
  return (a: Relation, b: Relation) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER);
}

function collect(entries: Array<[string, RelationReason]>, exists: (id: string) => boolean): Relation[] {
  const byId = new Map<string, Relation>();
  for (const [id, reason] of entries) {
    if (!exists(id)) continue;
    const relation = byId.get(id) ?? { id, reasons: [] };
    if (!relation.reasons.includes(reason)) relation.reasons.push(reason);
    byId.set(id, relation);
  }
  return [...byId.values()];
}

/** proofDependents only reads the edges; its parameter type is merely not `readonly`. */
function edgeGraph(edges: readonly TlEdge[]): { edges: TlEdge[] } {
  return { edges: edges as TlEdge[] };
}

export interface RelationContext {
  edges: readonly TlEdge[];
  nodes: Readonly<Record<string, TlNode>>;
  order: Readonly<Record<NodeType, readonly string[]>>;
}

/** "Depends on": declared premises, nodes its proof uses (verified edges), nodes its statement mentions. */
export function dependsOn(id: string, ctx: RelationContext): Relation[] {
  const entries: Array<[string, RelationReason]> = [];
  for (const premise of ctx.nodes[id]?.premises ?? []) entries.push([premise, 'declared']);
  for (const edge of ctx.edges) {
    if (edge.target !== id || edge.source === id) continue;
    if (edge.type === 'premise') entries.push([edge.source, 'declared']);
    else if (edge.type === 'verified') entries.push([edge.source, edge.conditional ? 'conditional' : 'proof']);
    else if (edge.type === 'lean-ref') entries.push([edge.source, 'statement']);
  }
  return collect(entries, (x) => ctx.nodes[x] !== undefined).sort(byBoardOrder(ctx.order));
}

/** "Used by": nodes declaring it as a premise, proofs resting on it (transitively), statements mentioning it. */
export function usedBy(id: string, ctx: RelationContext): Relation[] {
  const entries: Array<[string, RelationReason]> = [];
  const direct = new Set<string>();
  for (const edge of ctx.edges) {
    if (edge.source !== id || edge.target === id) continue;
    if (edge.type === 'premise') entries.push([edge.target, 'declared']);
    else if (edge.type === 'verified') {
      direct.add(edge.target);
      entries.push([edge.target, edge.conditional ? 'conditional' : 'proof']);
    } else if (edge.type === 'lean-ref') entries.push([edge.target, 'statement']);
  }
  for (const node of ctx.nodes[id] ? Object.values(ctx.nodes) : []) {
    if (node.id !== id && node.premises.includes(id)) entries.push([node.id, 'declared']);
  }
  for (const dependent of proofDependents(edgeGraph(ctx.edges), id)) {
    if (!direct.has(dependent)) entries.push([dependent, 'proof-indirect']);
  }
  return collect(entries, (x) => ctx.nodes[x] !== undefined).sort(byBoardOrder(ctx.order));
}

/** What the delete dialog lists (D-18): who declares it, which proofs use it, which statements mention it. */
export function deleteDependents(id: string, ctx: RelationContext): { declaredBy: string[]; proofs: string[]; mentions: string[] } {
  const declaredBy = new Set<string>();
  const mentions = new Set<string>();
  for (const edge of ctx.edges) {
    if (edge.source !== id || edge.target === id) continue;
    if (edge.type === 'premise') declaredBy.add(edge.target);
    if (edge.type === 'lean-ref') mentions.add(edge.target);
  }
  for (const node of Object.values(ctx.nodes)) if (node.id !== id && node.premises.includes(id)) declaredBy.add(node.id);
  const exists = (x: string) => ctx.nodes[x] !== undefined;
  return {
    declaredBy: [...declaredBy].filter(exists),
    proofs: proofDependents(edgeGraph(ctx.edges), id).filter(exists),
    mentions: [...mentions].filter(exists),
  };
}

/** Presupposition axioms of a set of nodes (the tray's "+ presupposes" chips), first occurrence order. */
export function presuppositionsOf(ids: readonly string[], nodes: Readonly<Record<string, TlNode>>): string[] {
  const out: string[] = [];
  for (const id of ids) for (const name of nodes[id]?.lean.presupposes ?? []) if (!out.includes(name)) out.push(name);
  return out;
}
