/**
 * The Spyro walkthrough of 03 architecture section 3.3, as the board sees it after parsing
 * test-fixtures/spyro/Model/Spyro/{Main,Vocabulary}.lean and checking them with Lean (ranges are those files'
 * 0-based ranges; refs, uses, presuppositions and footprints are what the M1 check file and `.ilean` index report,
 * verified against a real Lean 4.35 build on 2026-11-01).
 *
 * FROZEN SAMPLE (M1 contract, docs/m1-plan.md section 5.1): the webview's tests and the extension's sample command
 * rely on it. It is the canonical example of the M1 card data: `lean.uses` (the "uses:" line), `lean.refs` (hover
 * glosses), `lean.presupposes` (tray chips) and the Vocabulary group.
 *
 *  - pg-no-dark-past   ASSUMPTION  code-less (stance: rule, so its badge reads "no source yet")
 *  - cynder-dark-past  ASSUMPTION  formalised (abbrev + axiom .holds)
 *  - new-spyro-pg      ASSUMPTION  formalised
 *  - cynder-not-good   GOAL        formalised statement, not proved; declares the three premises
 */
import { buildGraph, PRESUPPOSITION_PREFIX } from '../graph.js';
import type { DerivedStatus, FileRange, LeanRef, SemanticSummary, SourceLocation, TlGraph, TlNode, VocabItem } from '../model.js';

export const SPYRO_SUBJECT = 'Spyro';
const MAIN_FILE = 'Model/Spyro/Main.lean';
const VOCAB_FILE = 'Model/Spyro/Vocabulary.lean';
const ASSERTED = '2026-11-01';

export const SPYRO_LEAN = {
  cynderDarkPast: [
    '/-- Cynder is a character who has a dark past -/',
    'abbrev cynder_dark_past : Prop := HasDarkPast cynder',
    'axiom cynder_dark_past.holds : cynder_dark_past',
  ].join('\n'),
  newSpyroPg: [
    '/-- The new Spyro game is PG -/',
    'abbrev new_spyro_pg : Prop := IsPG newSpyro',
    'axiom new_spyro_pg.holds : new_spyro_pg',
  ].join('\n'),
  cynderNotGood: [
    '/-- Cynder would not be a good addition to the new Spyro game -/',
    'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro',
  ].join('\n'),
  /**
   * What a run adds under the normative reading (03 section 3.3; test-fixtures/spyro/Check/Normative.lean), as it
   * reads in test-fixtures/runner-lean/overlays/proved (docstring included, like every card's code).
   */
  pgNoDarkPastNormative: [
    '/-- PG games cannot have characters with dark pasts (normative reading) -/',
    'abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g',
    'axiom pg_no_dark_past.holds : pg_no_dark_past',
  ].join('\n'),
  cynderNotGoodProof: [
    'theorem cynder_not_good.holds : cynder_not_good :=',
    '  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds',
  ].join('\n'),
} as const;

/** The state of the Lean check the samples describe. */
export const SPYRO_SEMANTIC: SemanticSummary = {
  state: 'fresh',
  toolchain: 'leanprover/lean4:v4.35.0',
  checkedAt: '2026-11-01T02:00:00.000Z',
  durationMs: 1200,
  errorCount: 0,
};

function block(startLine: number, endLine: number): SourceLocation {
  return { file: MAIN_FILE, range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: 2 } }, markupVersion: 1 };
}

function span(file: string, startLine: number, endLine: number, endCharacter: number): FileRange {
  return { file, range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: endCharacter } } };
}

/** A ref on line `line` of a card's code, characters [from, to). */
function ref(name: string, line: number, from: number, to: number, nodeId?: string): LeanRef {
  return { name, range: { start: { line, character: from }, end: { line, character: to } }, ...(nodeId ? { nodeId } : {}) };
}

const NO_CERTS: DerivedStatus['certificates'] = { consistency: 'none', nonVacuity: 'none' };
const USER = { wordedBy: 'user', endorsed: true, origin: 'user' } as const;

function spyroNodes(): TlNode[] {
  return [
    {
      id: 'pg-no-dark-past',
      type: 'ASSUMPTION',
      role: 'node',
      subject: SPYRO_SUBJECT,
      naturalName: 'PG games cannot have characters with dark pasts',
      stance: 'rule',
      asserted: ASSERTED,
      premises: [],
      provenance: { ...USER },
      ext: {},
      loc: block(4, 11),
      lean: { binding: 'none' },
      status: { formal: 'informal', proof: { kind: 'none' }, certificates: { ...NO_CERTS }, flags: ['no-rationale'] },
    },
    {
      id: 'cynder-dark-past',
      type: 'ASSUMPTION',
      role: 'node',
      subject: SPYRO_SUBJECT,
      naturalName: 'Cynder is a character who has a dark past',
      rationale: 'familiar with gaming lore',
      source: 'common',
      asserted: ASSERTED,
      premises: [],
      provenance: { ...USER },
      ext: {},
      loc: block(13, 22),
      lean: {
        binding: 'pinned',
        statement: 'Spyro.cynder_dark_past',
        justification: 'Spyro.cynder_dark_past.holds',
        justificationKind: 'axiom',
        code: SPYRO_LEAN.cynderDarkPast,
        codeLoc: span(MAIN_FILE, 23, 25, 47),
        uses: ['Spyro.HasDarkPast', 'Spyro.cynder'],
        refs: [
          ref('Spyro.HasDarkPast', 1, 34, 45),
          ref('Spyro.cynder', 1, 46, 52),
          ref('Spyro.cynder_dark_past', 2, 31, 47, 'cynder-dark-past'),
        ],
        presupposes: ['Spyro.Character.exists'],
        axioms: ['Classical.choice', 'Spyro.Character', 'Spyro.HasDarkPast', 'Spyro.Character.exists', 'Spyro.cynder_dark_past.holds'],
      },
      status: { formal: 'formalized', proof: { kind: 'assumed' }, certificates: { ...NO_CERTS }, flags: [] },
    },
    {
      id: 'new-spyro-pg',
      type: 'ASSUMPTION',
      role: 'node',
      subject: SPYRO_SUBJECT,
      naturalName: 'The new Spyro game is PG',
      rationale: 'known from gaming news',
      source: 'reported',
      asserted: ASSERTED,
      premises: [],
      provenance: { ...USER },
      ext: {},
      loc: block(27, 36),
      lean: {
        binding: 'pinned',
        statement: 'Spyro.new_spyro_pg',
        justification: 'Spyro.new_spyro_pg.holds',
        justificationKind: 'axiom',
        code: SPYRO_LEAN.newSpyroPg,
        codeLoc: span(MAIN_FILE, 37, 39, 39),
        uses: ['Spyro.IsPG', 'Spyro.newSpyro'],
        refs: [ref('Spyro.IsPG', 1, 30, 34), ref('Spyro.newSpyro', 1, 35, 43), ref('Spyro.new_spyro_pg', 2, 27, 39, 'new-spyro-pg')],
        presupposes: ['Spyro.Game.exists'],
        axioms: ['Classical.choice', 'Spyro.Game', 'Spyro.IsPG', 'Spyro.Game.exists', 'Spyro.new_spyro_pg.holds'],
      },
      status: { formal: 'formalized', proof: { kind: 'assumed' }, certificates: { ...NO_CERTS }, flags: [] },
    },
    {
      id: 'cynder-not-good',
      type: 'GOAL',
      role: 'node',
      subject: SPYRO_SUBJECT,
      naturalName: 'Cynder would not be a good addition to the new Spyro game',
      asserted: ASSERTED,
      premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'],
      provenance: { ...USER },
      ext: {},
      loc: block(41, 49),
      lean: {
        binding: 'pinned',
        statement: 'Spyro.cynder_not_good',
        code: SPYRO_LEAN.cynderNotGood,
        codeLoc: span(MAIN_FILE, 50, 51, 63),
        uses: ['Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro'],
        refs: [ref('Spyro.GoodAddition', 1, 35, 47), ref('Spyro.cynder', 1, 48, 54), ref('Spyro.newSpyro', 1, 55, 63)],
        presupposes: ['Spyro.Character.exists', 'Spyro.Game.exists'],
      },
      status: { formal: 'formalized', proof: { kind: 'none' }, certificates: { ...NO_CERTS }, flags: [] },
    },
  ];
}

function vocab(
  name: string,
  kind: VocabItem['kind'],
  type: string,
  gloss: string,
  loc: FileRange,
  code: string,
  usedBy: string[],
  extra: Partial<VocabItem> = {},
): VocabItem {
  return { name, shortName: name.slice(`${SPYRO_SUBJECT}.`.length), subject: SPYRO_SUBJECT, kind, type, gloss, glossBy: 'user', loc, code, usedBy, flags: [], ...extra };
}

/**
 * The computed Vocabulary group of the walkthrough (Vocabulary.lean), in display order: sorts, predicates,
 * constants, presuppositions. The two `instance : Nonempty …` helpers are not listed (they belong to their
 * presupposition).
 */
export function spyroVocabulary(): VocabItem[] {
  return [
    vocab('Spyro.Character', 'sort', 'Type', 'characters', span(VOCAB_FILE, 2, 3, 22), '/-- characters -/\naxiom Character : Type', [], {
      presupposition: 'Spyro.Character.exists',
    }),
    vocab('Spyro.Game', 'sort', 'Type', 'games', span(VOCAB_FILE, 4, 5, 17), '/-- games -/\naxiom Game : Type', [], { presupposition: 'Spyro.Game.exists' }),
    vocab('Spyro.HasDarkPast', 'predicate', 'Spyro.Character → Prop', 'has a dark past', span(VOCAB_FILE, 12, 13, 36), '/-- has a dark past -/\naxiom HasDarkPast : Character → Prop', ['cynder-dark-past'], { arity: 1 }),
    vocab('Spyro.IsPG', 'predicate', 'Spyro.Game → Prop', 'is rated PG', span(VOCAB_FILE, 14, 15, 24), '/-- is rated PG -/\naxiom IsPG : Game → Prop', ['new-spyro-pg'], { arity: 1 }),
    vocab(
      'Spyro.GoodAddition',
      'predicate',
      'Spyro.Character → Spyro.Game → Prop',
      'would be a good addition to',
      span(VOCAB_FILE, 16, 17, 44),
      '/-- would be a good addition to -/\naxiom GoodAddition : Character → Game → Prop',
      ['cynder-not-good'],
      { arity: 2 },
    ),
    vocab('Spyro.cynder', 'constant', 'Spyro.Character', 'Cynder', span(VOCAB_FILE, 18, 19, 39), '/-- Cynder -/\nnoncomputable opaque cynder : Character', ['cynder-dark-past', 'cynder-not-good']),
    vocab('Spyro.newSpyro', 'constant', 'Spyro.Game', 'the new Spyro game', span(VOCAB_FILE, 20, 21, 36), '/-- the new Spyro game -/\nnoncomputable opaque newSpyro : Game', ['new-spyro-pg', 'cynder-not-good']),
    vocab(
      'Spyro.Character.exists',
      'presupposition',
      'Nonempty Spyro.Character',
      'there is at least one character',
      span(VOCAB_FILE, 6, 7, 43),
      '/-- there is at least one character -/\naxiom Character.exists : Nonempty Character',
      ['cynder-dark-past', 'cynder-not-good'],
      { presupposes: 'Spyro.Character' },
    ),
    vocab(
      'Spyro.Game.exists',
      'presupposition',
      'Nonempty Spyro.Game',
      'there is at least one game',
      span(VOCAB_FILE, 9, 10, 33),
      '/-- there is at least one game -/\naxiom Game.exists : Nonempty Game',
      ['new-spyro-pg', 'cynder-not-good'],
      { presupposes: 'Spyro.Game' },
    ),
  ];
}

/** The walkthrough as written in Main.lean: three dashed (declared) arrows into the goal. */
export function spyroGraph(version = 1): TlGraph {
  return buildGraph({ subject: SPYRO_SUBJECT, version, nodes: spyroNodes(), vocabulary: spyroVocabulary(), semantic: { ...SPYRO_SEMANTIC } });
}

/**
 * The same model after a normative run (03 section 3.3; positions from test-fixtures/runner-lean/overlays/proved,
 * where pg-no-dark-past is pinned with `lean:`, so its block ends one line later and every later block moves down):
 * pg-no-dark-past formalised and the goal proved from exactly the three selected assumptions plus the two
 * presuppositions, so its arrows are verified.
 */
export function spyroProvedGraph(version = 2): TlGraph {
  const nodes = spyroNodes().map((node): TlNode => {
    if (node.id === 'pg-no-dark-past') {
      return {
        ...node,
        loc: block(4, 12),
        lean: {
          binding: 'pinned',
          statement: 'Spyro.pg_no_dark_past',
          justification: 'Spyro.pg_no_dark_past.holds',
          justificationKind: 'axiom',
          code: SPYRO_LEAN.pgNoDarkPastNormative,
          codeLoc: span(MAIN_FILE, 13, 15, 45),
          uses: ['Spyro.Game', 'Spyro.Character', 'Spyro.IsPG', 'Spyro.HasDarkPast', 'Spyro.GoodAddition'],
          refs: [
            ref('Spyro.Game', 1, 40, 44),
            ref('Spyro.Character', 1, 51, 60),
            ref('Spyro.IsPG', 1, 63, 67),
            ref('Spyro.HasDarkPast', 1, 72, 83),
            ref('Spyro.GoodAddition', 1, 90, 102),
            ref('Spyro.pg_no_dark_past', 2, 30, 45, 'pg-no-dark-past'),
          ],
          presupposes: [],
          axioms: ['Spyro.Character', 'Spyro.Game', 'Spyro.GoodAddition', 'Spyro.HasDarkPast', 'Spyro.IsPG', 'Spyro.pg_no_dark_past.holds'],
        },
        status: { ...node.status, formal: 'formalized', proof: { kind: 'assumed' } },
      };
    }
    if (node.id === 'cynder-dark-past') return { ...node, loc: block(17, 26), lean: { ...node.lean, codeLoc: span(MAIN_FILE, 27, 29, 47) } };
    if (node.id === 'new-spyro-pg') return { ...node, loc: block(31, 40), lean: { ...node.lean, codeLoc: span(MAIN_FILE, 41, 43, 39) } };
    if (node.id === 'cynder-not-good') {
      return {
        ...node,
        loc: block(45, 53),
        lean: {
          ...node.lean,
          justification: 'Spyro.cynder_not_good.holds',
          justificationKind: 'theorem',
          code: `${SPYRO_LEAN.cynderNotGood}\n${SPYRO_LEAN.cynderNotGoodProof}`,
          codeLoc: span(MAIN_FILE, 54, 57, 81),
          refs: [
            ...(node.lean.refs ?? []),
            ref('Spyro.cynder_not_good', 2, 32, 47, 'cynder-not-good'),
            ref('Spyro.pg_no_dark_past.holds', 3, 2, 23, 'pg-no-dark-past'),
            ref('Spyro.newSpyro', 3, 24, 32),
            ref('Spyro.cynder', 3, 33, 39),
            ref('Spyro.new_spyro_pg.holds', 3, 40, 58, 'new-spyro-pg'),
            ref('Spyro.cynder_dark_past.holds', 3, 59, 81, 'cynder-dark-past'),
          ],
          axioms: [
            'Classical.choice',
            'Spyro.Character',
            'Spyro.Game',
            'Spyro.GoodAddition',
            'Spyro.HasDarkPast',
            'Spyro.IsPG',
            'Spyro.Character.exists',
            'Spyro.Game.exists',
            'Spyro.cynder_dark_past.holds',
            'Spyro.new_spyro_pg.holds',
            'Spyro.pg_no_dark_past.holds',
          ],
        },
        status: {
          ...node.status,
          proof: {
            kind: 'proved',
            footprint: [
              'cynder-dark-past',
              'new-spyro-pg',
              'pg-no-dark-past',
              `${PRESUPPOSITION_PREFIX}Spyro.Character.exists`,
              `${PRESUPPOSITION_PREFIX}Spyro.Game.exists`,
            ],
          },
          flags: ['proved-goal'],
        },
      };
    }
    return node;
  });
  const vocabulary = spyroVocabulary().map((item) =>
    item.name === 'Spyro.Character' || item.name === 'Spyro.Game' || item.name === 'Spyro.IsPG' || item.name === 'Spyro.HasDarkPast' || item.name === 'Spyro.GoodAddition'
      ? { ...item, usedBy: [...new Set([...item.usedBy, 'pg-no-dark-past'])] }
      : item,
  );
  return buildGraph({ subject: SPYRO_SUBJECT, version, nodes, vocabulary, semantic: { ...SPYRO_SEMANTIC } });
}
