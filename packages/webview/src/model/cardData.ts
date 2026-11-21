/**
 * Pure helpers that turn graph data into what a card shows (no DOM, no React, unit-tested): the "uses:" line, the
 * presupposition chips, identifier segments of the expanded Lean code, the status chips, the footprint, and the
 * "Depends on / Used by" relations (03 section 7; docs/m1-plan.md sections 6.3-6.4).
 */
import {
  NODE_TYPES,
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

export type ChipTone = 'plain' | 'lean' | 'proved' | 'attention' | 'error' | 'info' | 'subtle';

export interface Chip {
  /** Stable key, also rendered as `data-chip` (tests and styling). */
  key: string;
  label: string;
  title: string;
  tone: ChipTone;
  /** A chip that is also a button. */
  action?: 'edit-rationale';
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
        title:
          'Its file, or a declaration its proof goes through, changed since Lean last checked it, so this is the last known status (dimmed, never the green glow). Lean checks again when the file is saved (or click the Lean badge).',
        tone: 'subtle',
      };
}

/** Which glow a card has (spec v4.1 BD-6, slice 1d): the green one replaces the blue one. */
export type Glow = 'established' | 'formalized' | null;

/**
 * A card's glow: green when it is established (a proposition proved all the way down to axiom cards, with current
 * facts); else blue when it has a Lean statement; none otherwise. `dim`: its facts are out of date, so the glow shows
 * its last status dimmed (never green: core never flags a stale card established). `hideResult` (the Proposed view
 * before the review reveals the result, D-19, RV-6): the green glow would tell the result, so the card glows blue.
 */
export function cardGlow(node: TlNode, hideResult = false): { glow: Glow; dim: boolean } {
  const flags = node.status.flags;
  const stale = flags.includes('stale');
  if (!hideResult && !stale && node.type === 'PROPOSITION' && flags.includes('established')) return { glow: 'established', dim: false };
  return { glow: node.status.formal === 'formalized' ? 'formalized' : null, dim: stale };
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

  for (const proofChip of proofStatusChips(node, proof, nodes)) chips.push(stale ? { ...proofChip, dim: true } : proofChip);
  // Spec v4 AR-5 (slice 1b): the mark is a chip until 1c draws its "∅" stub arrow.
  if (node.fromNothing === true) {
    chips.push({ key: 'from-nothing', label: 'follows from nothing', title: 'You marked it as following from nothing: it needs no premises (its details can remove the mark)', tone: 'info' });
  }
  if (stale) chips.push(staleChip(checking));
  if (notChecked) chips.push({ key: 'not-checked', label: 'not checked by Lean', title: 'Lean has not checked this node (its module failed or is not imported, or there are no facts yet)', tone: 'attention' });

  if (has('uses-sorry')) chips.push({ key: 'uses-sorry', label: 'uses sorry', title: 'Its proof contains `sorry`, so it is not proved (TL115)', tone: 'attention' });
  if (has('holds-mismatch')) chips.push({ key: 'holds-mismatch', label: '.holds says something else', title: 'Its `.holds` declaration does not state this statement (TL114)', tone: 'attention' });
  if (has('missing-holds')) chips.push({ key: 'missing-holds', label: 'missing .holds', title: 'A formalised axiom needs `axiom n.holds : n` (TL117)', tone: 'attention' });
  if (has('provable-assumption')) chips.push({ key: 'provable-assumption', label: 'has a proof', title: 'This axiom has a proof: its `.holds` is a theorem (TL106). Axioms never glow green.', tone: 'info' });
  // Spec v4.1 BD-7 / S18: proved without any card's `.holds`. With the "follows from nothing" mark, the band on its ∅
  // stub says so; without it, this chip does.
  if (has('self-evident') && node.type === 'PROPOSITION' && node.fromNothing !== true) {
    chips.push({
      key: 'self-evident',
      label: 'proved from nothing',
      title: 'Lean proved it without any of your axioms or other cards: check what the statement says (it may hold by logic or by definitions alone)',
      tone: 'attention',
    });
  }
  if (has('uses-unseen')) {
    const unseen = node.status.direct?.unseen ?? [];
    chips.push({
      key: 'uses-unseen',
      label: unseen.length > 0 ? `uses ${names(unseen, nodes)} in a way the arrows do not show` : 'uses a card in a way the arrows do not show',
      title: `Its proof rests on ${unseen.length > 0 ? unseen.map((id) => `“${nodes[id]?.naturalName ?? id}”`).join(', ') : 'a card'}, but no card it uses directly rests on it (TL123): its band gets no ✓`,
      tone: 'attention',
    });
  }
  if (has('existence-commitment')) {
    chips.push({ key: 'existence-commitment', label: 'existence commitment', title: 'Its proof needs a presupposition that no statement mentions (TL108)', tone: 'info' });
  }
  if (has('definitional-choice')) chips.push({ key: 'definitional-choice', label: 'definitional choice', title: 'Its statement relies on a definition (D-4: needs your endorsement)', tone: 'info' });
  if (has('broken') || has('depends-on-removed')) chips.push({ key: 'broken', label: 'broken', title: 'It depends on something that was removed', tone: 'error' });
  if (has('no-rationale')) {
    const label = node.stance === 'rule' ? 'no source yet' : 'no reason yet';
    chips.push({ key: 'no-rationale', label, title: 'Add a reason ("because: …")', tone: 'attention', action: 'edit-rationale' });
  }
  if (node.type === 'AXIOM' && node.premises.length > 0) {
    // Spec v4 A19 (slice 1b): an axiom's `premises:` written before v4 is not drawn (TL122); its details offer both.
    chips.push({
      key: 'declared-before-v4',
      label: 'declared before v4: make it a proposition, or drop these arrows',
      title: `Its premises: line (${node.premises.length} arrow${node.premises.length === 1 ? '' : 's'} into it) was written before v4, when axioms could have arrows; the board does not draw them. Its details offer "Make it a proposition (pending)" and "Drop these arrows".`,
      tone: 'info',
    });
  }
  return chips;
}

/** Up to two cards' sentences, shortened, then ", …" (chip labels). */
function names(ids: readonly string[], nodes: Readonly<Record<string, TlNode>>): string {
  return ids.slice(0, 2).map((id) => short(nodes[id]?.naturalName ?? id)).join(', ') + (ids.length > 2 ? ', …' : '');
}

/**
 * The chips that state a card's proof status (spec v4.1 BD-6, slice 1d). A proposition that is established shows
 * "✓ established" (with the green glow: never colour alone); one that is proved but not established keeps the blue glow
 * and says why: "proved, but rests on pending: ‹card›", "proved, given: ‹card›" (a conditional proof), "proved, but uses a
 * hidden assumption" (TL103), or plainly "proved" (no ✓) when the facts it rests on are out of date. An axiom whose
 * `.holds` is a theorem shows only "has a proof" (its own chip): axioms never glow green.
 */
function proofStatusChips(node: TlNode, proof: ProofStatus, nodes: Readonly<Record<string, TlNode>>): Chip[] {
  const flags = node.status.flags;
  switch (proof.kind) {
    case 'assumed':
      return [{ key: 'proof', label: 'assumed', title: 'Taken as an axiom', tone: 'plain' }];
    case 'proved':
    case 'conditional': {
      if (node.type === 'AXIOM') return [];
      const footprint = proof.kind === 'proved' ? proof.footprint : (proof.footprint ?? []);
      const cards = footprint.filter((x) => !x.startsWith(PRESUPPOSITION_PREFIX) && !x.startsWith('axiom:'));
      const from = cards.length > 0 ? ` It rests on: ${cards.map((id) => nodes[id]?.naturalName ?? id).join('; ')}.` : ' It rests on no axiom card.';
      if (flags.includes('established')) {
        return [
          {
            key: 'established',
            label: '✓ established',
            title: `Established: proved by Lean with no hypothesis, resting only on axiom cards (and presuppositions or definitions), never on a pending claim, with current facts.${from}`,
            tone: 'proved',
          },
        ];
      }
      const out: Chip[] = [];
      const pending = footprint.filter((id) => nodes[id]?.status.proof.kind === 'pending');
      if (flags.includes('rests-on-pending') || pending.length > 0) {
        out.push({
          key: 'rests-on-pending',
          label: pending.length > 0 ? `proved, but rests on pending: ${names(pending, nodes)}` : 'proved, but rests on pending',
          title: 'Proved by Lean, but its proof rests on a proposition that is pending proof (its .holds is still an axiom), so it is not established: no green glow until that one is proved.',
          tone: 'attention',
        });
      }
      if (proof.kind === 'conditional') {
        out.push({
          key: 'conditional',
          label: `proved, given: ${names(proof.on, nodes)}`,
          title: `Proved, but it takes these unproved statements as hypotheses (the hollow arrowheads): ${proof.on.map((id) => nodes[id]?.naturalName ?? id).join('; ')}`,
          tone: 'attention',
        });
      }
      if (footprint.some((x) => x.startsWith('axiom:'))) {
        out.push({
          key: 'hidden-assumption',
          label: 'proved, but uses a hidden assumption',
          title: 'Proved by Lean, but its proof rests on a Lean axiom that is neither one of your axiom cards nor vocabulary (TL103), so it is not established.',
          tone: 'attention',
        });
      }
      if (out.length === 0) {
        const why = flags.includes('stale') || flags.includes('not-checked') ? 'its facts are out of date' : 'a card it rests on is out of date, unchecked, or its .holds states something else';
        out.push({ key: 'proof', label: 'proved', title: `Proved by Lean, but not established: ${why}.${from}`, tone: 'plain' });
      }
      return out;
    }
    case 'pending':
      return [{ key: 'pending', label: 'pending proof', title: 'Its .holds is still an axiom: assumed until a run proves it', tone: 'attention' }];
    case 'none': {
      if (node.status.formal !== 'formalized' || node.type === 'AXIOM') return [];
      if (flags.includes('uses-sorry') || flags.includes('holds-mismatch')) return []; // their own chips say why
      return [{ key: 'proof', label: 'unproved', title: 'Stated in Lean, not proved yet', tone: 'plain' }];
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

/** Orders relation lists like the board: Axioms, then Propositions, each in column order. */
function byBoardOrder(order: Readonly<Record<NodeType, readonly string[]>>) {
  const rank = new Map<string, number>();
  let i = 0;
  for (const kind of NODE_TYPES) for (const id of order[kind]) rank.set(id, i++);
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

/** Presupposition axioms of a set of nodes (the Context Menu section's summary tooltip, slice 1e; the tray's chips before), first occurrence order. */
export function presuppositionsOf(ids: readonly string[], nodes: Readonly<Record<string, TlNode>>): string[] {
  const out: string[] = [];
  for (const id of ids) for (const name of nodes[id]?.lean.presupposes ?? []) if (!out.includes(name)) out.push(name);
  return out;
}
