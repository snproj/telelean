# build:WP1 (agent ac3e2258b8241571c)

## summary
WP1 is implemented in packages/core/src/markup/: the lexer, parser, binder, serializer, text edits and applyLeanOps, all coded against the unchanged markup/types.ts. Final run: `npm test` in packages/core passes typecheck and 27 files / 316 tests. Ten of those files (142 tests) are mine; the rest belong to WP2, including its gated tests, which now run against my parser and pass.

AT1.1–AT1.9 are all automated and pass. The Spyro fixture parses to exactly the frozen sample's block ranges, every vocabulary location, and every card's code and codeLoc, for both the base fixture and the proved overlay.

**Lean 4.35 behaves differently from the brief and the research prototype in two places. I followed Lean, after checking each case with small probes run on the toolchain binary.**
1. The nesting scan of a comment starts after its third character, not right after `/-`. So `/-/-/` is one complete comment and `/--/ doc -/` is a valid docstring, where the prototype's rule gets both wrong.
2. Lean skips whitespace, line comments and plain comments right after `/--` and `/-!`. So `/-- -- -/` is an unterminated comment: the line comment eats the closer.

Point 2 was a real bug: set-docstring with a sentence starting `--` would have produced a docstring that swallows the rest of the file. escapeBodyText now writes a leading `--` as `\--`. A property test now checks that every escaped text inside `/-- … -/` is exactly one closed comment.

**As an extra check beyond the unit tests, Lean 4.35 compiled a file of 17 rendered blocks and docstrings with hard values (both delimiters, quotes, backslashes, newlines, U+2028, leading `--`).** It exits 0, and Lean's own docstrings match the parser's.

**The property test also caught a parser bug, now fixed:** a value containing U+2028 was rejected as a malformed line. escapeJsonValue now also escapes U+2028/U+2029 and C1 control characters.

Parsing is fast: a generated 30,000-line file takes 50–70 ms.

## files
- /home/zhengyew/telelean/packages/core/src/markup/api.ts
- /home/zhengyew/telelean/packages/core/src/markup/chars.ts
- /home/zhengyew/telelean/packages/core/src/markup/lexer.ts
- /home/zhengyew/telelean/packages/core/src/markup/text.ts
- /home/zhengyew/telelean/packages/core/src/markup/values.ts
- /home/zhengyew/telelean/packages/core/src/markup/ids.ts
- /home/zhengyew/telelean/packages/core/src/markup/names.ts
- /home/zhengyew/telelean/packages/core/src/markup/decls.ts
- /home/zhengyew/telelean/packages/core/src/markup/parser.ts
- /home/zhengyew/telelean/packages/core/src/markup/serializer.ts
- /home/zhengyew/telelean/packages/core/src/markup/edits.ts
- /home/zhengyew/telelean/packages/core/src/markup/leanOps.ts
- /home/zhengyew/telelean/packages/core/test/markup/lexer.test.ts
- /home/zhengyew/telelean/packages/core/test/markup/research.test.ts
- /home/zhengyew/telelean/packages/core/test/markup/spyro.test.ts
- /home/zhengyew/telelean/packages/core/test/markup/values.test.ts
- /home/zhengyew/telelean/packages/core/test/markup/serializer.test.ts
- /home/zhengyew/telelean/packages/core/test/markup/edits.test.ts
- /home/zhengyew/telelean/packages/core/test/markup/leanOps.test.ts
- /home/zhengyew/telelean/packages/core/test/markup/ids.test.ts
- /home/zhengyew/telelean/packages/core/test/markup/decls.test.ts
- /home/zhengyew/telelean/packages/core/test/markup/robustness.test.ts

## how_to_run_tests
cd /home/zhengyew/telelean/packages/core && PATH=$HOME/.local/bin:$PATH npm test   (tsc -p tsconfig.test.json && vitest run). Markup only: npx vitest run test/markup

## test_output
$ cd packages/core && npm test
> @telelean/core@0.0.0 test
> tsc -p tsconfig.test.json && vitest run

 RUN  v5.0.5 /home/zhengyew/telelean/packages/core

 Test Files  27 passed (27)
      Tests  316 passed (316)
   Start at  12:49:05
   Duration  5.11s (import 48%, tests 38%, transform 9%, worker 5%)

$ npx vitest run test/markup
 Test Files  10 passed (10)
      Tests  142 passed (142)

Tests passed per markup file (verbose reporter):
     10 test/markup/decls.test.ts
     20 test/markup/edits.test.ts
      7 test/markup/ids.test.ts
     19 test/markup/leanOps.test.ts
     34 test/markup/lexer.test.ts
     20 test/markup/research.test.ts
      4 test/markup/robustness.test.ts
      6 test/markup/serializer.test.ts
      9 test/markup/spyro.test.ts
     13 test/markup/values.test.ts

Extra check (manual, not part of npm test): Lean 4.35 compiling the generated escape file (scratch probe/Esc.lean, with import Lean): exit=0, findDocString? printed x0: "-\\/ " … x10: "\\-- " … x16: "spaced   " (all 17 equal to parseLeanFile's trimmed docstrings).
Timing (scratch node script): 30006 lines: 72.0 ms / 57.4 ms / 48.4 ms, 2500 blocks, 5000 decls.

## acceptance
- **test:** AT1.1 Lexer: the gen_lex_tests.py lexing cases give the expected comment kinds, spans and code tokens
  - **status:** pass
  - **evidence:** lexer.test.ts, 34 tests. All 19 cases L01–L20 (incl. L09b), texts copied verbatim, each checking every comment's kind/start/end/unterminated plus the full token list, with disjointness and text-slice checks. Hand-checked values include L01 [0,37) with body [2,35), L10 CRLF [0,29), L14 non-BMP [0,37) in UTF-16 units, L17 docstring '- three dashes', L20 unterminated [11,35). Also covers token kinds, strings, chars (incl. '\''), raw strings, «», interpolated strings, and the Lean-verified edge cases (/-/-/, /--/ doc -/, /--/-/, /-- -- -/, /-! -- -/, docstring text after leading comments).
- **test:** AT1.2 the research tests (Lexing 5, Values 7, Binding 6) ported with the 02/03 rule changes
  - **status:** pass
  - **evidence:** research.test.ts, 20 tests: the 18 ported tests plus two extras (premises on any type with no TL012; TL010 for an unterminated non-block comment). Asserts kind: is a silent alias (key normalised to type, codes exactly ['TL019']); TL016 and TL018 are absent; type: DEFINITION gives TL004; anonymous instance and example are code-less with TL014.
- **test:** AT1.3 Spyro Main.lean / Vocabulary.lean parse to the sample's blocks, bindings, decls, imports and 11 vocabulary decls
  - **status:** pass
  - **evidence:** spyro.test.ts, 9 tests, fixtures read via ?raw. Block line ranges are [[4,11],[13,22],[27,36],[41,49]] and every field and range equals spyroGraph(). pg-no-dark-past is {mode:'none'}; the other three are pinned to the expected names. Main.lean decls: abbrev/axiom pairs at lines 23–24/25, 37–38/39, 50–51; cynder_dark_past.holds is an axiom with no valueStart. imports=['Model.Spyro.Vocabulary']. Vocabulary.lean: 11 decls incl. two anonymous instances (lines 8, 11), each location equal to spyroVocabulary()'s loc/code/gloss. Every card's codeLoc/code in spyroGraph() and spyroProvedGraph() equals the parser's decl spans.
- **test:** AT1.4 escape round-trip and property test
  - **status:** pass
  - **evidence:** values.test.ts, 13 tests. escapeJsonValue('/-') === '"/-"' (7 characters inside the quotes); '-/' → '"-\/"'; '/-/' → '"/-\/"'. 2000 random values: no delimiter in the output, and parseFieldValue returns them unchanged. 1500 renderBlock→parseLeanFile cases (alphabet: slash, dash, quote, backslash, LF/CRLF, spaces, both delimiters, /-/, -/-, leading quote/spaces, U+2028, lone surrogate, random LF/CRLF and bodies) come back identical. lexLean finds exactly one terminated block comment covering each rendered block, and the following abbrev still binds. Fixed hard cases and list round-trips also pass. Extra manual check: Lean 4.35 compiles 17 rendered blocks plus docstrings (exit 0).
- **test:** AT1.5 renderBlock: FIELD_ORDER under the v1 marker, escaped body, CRLF
  - **status:** pass
  - **evidence:** serializer.test.ts, 6 tests: exact text of a full block (fields in FIELD_ORDER, extensions last, body -\/ and /\-, no trailing newline); FIELD_ORDER subsequence check; minimal block; CRLF everywhere (no lone LF/CR); parse-back equality for LF and CRLF; extras precedence; a bad key throws.
- **test:** AT1.6 setBlockField / removeBlockEdits / insertBlockEdits
  - **status:** pass
  - **evidence:** edits.test.ts, 20 tests, each comparing whole line arrays so the rest is byte-identical:
- a value change touches only line 17 (escaped);
- rationale is inserted before stance (line 9), stance before premises (line 46), worded_by after lean (line 49);
- null and [] remove lines;
- a derived id (two-words) is written once after the marker;
- duplicate/list lines are removed; the written key, indentation and same-line closers are respected;
- CRLF stays CRLF;
- removing pg-no-dark-past also takes one blank line; no blank line at file start or end;
- insertBlockEdits into the subjectScaffold Inbox text (end-of-namespace) leaves exactly one blank line on each side, twice;
- end-of-file with and without a final newline and for an empty file; after-block on three Spyro blocks.
- **test:** AT1.7 applyLeanOps on Spyro texts and the proved overlay
  - **status:** pass
  - **evidence:** leanOps.test.ts, 19 tests:
- add-holds-axiom inserts 'axiom cynder_not_good.holds : cynder_not_good' (also the _root_ form);
- holds-theorem-to-axiom archives exactly SPYRO_LEAN.cynderNotGoodProof;
- remove-holds and remove-decl remove the docstring and keep the spacing;
- add-hypothesis turns 'theorem d1.holds (h : cynder_not_good) : d1 := foo x.holds h' into 'theorem d1.holds (h_x : x) (h : cynder_not_good) : d1 := foo h_x h' (and goes after universe parameters);
- apply-hypothesis gives 'foo (c h_x) ((@c h_x) y) (c h_x).left' and accepts spans that start at the @;
- set-docstring replaces/inserts, escaping both delimiters and a leading --;
- a missing declaration gives problems=['The declaration `Spyro.missing` is not declared in Model/Spyro/Main.lean.'] with edits=[] and archived=[];
- overlapping ops and a decl holding a block are refused.
- **test:** AT1.8 deriveId
  - **status:** pass
  - **evidence:** ids.test.ts, 7 tests:
- 'cynder-is-a-character-who-has' (6 words); transliteration ('ca-deja-vu-aero-strasse', 'full-width-istanbul');
- -2/-3 suffixes;
- n-83afc8 / n-36ac47 / n-811c9d, matching FNV-1a values computed independently in Python;
- 2000 random sentences all match ID_PATTERN;
- two id-less blocks with the same sentence get 'same-sentence' and 'same-sentence-2', each with a TL112 info; written ids are avoided.
- **test:** AT1.9 declaration spans follow plan 6.1's command starts
  - **status:** pass
  - **evidence:** decls.test.ts, 10 tests. Theorems a–h end at a column-0 -- comment, set_option, variable, open, attribute, #check and a block comment: spans [1,2],[4,4],[6,7],[9,9],[11,11],[13,13],[15,15], and h [17,19] keeps its indented comment and continuation. Also covers deriving clause vs deriving instance; mutual…end (its end closes no namespace); indented namespaces; name resolution (_root_, «», sections, noncomputable section, end A.B); keywords/modifiers/attributes/priority/anonymous instances; value starts (:= inside binders skipped, where, |, |x| not counted); docstring attachment; header imports.

## contract_changes
- Additive: new export setBlockFields(file, block, changes: readonly BlockFieldChange[]): TextEdit[] and the type BlockFieldChange { key: KnownFieldKey; value: string | readonly string[] | null } (markup/edits.ts, re-exported from markup/api.ts, so reachable from @telelean/core). Reason: changing two fields of one block (type+rationale on a kind change, a field plus the D-8 lean: pin) with two setBlockField calls would write the derived id twice (overlapping edits); one call writes it once. setBlockField delegates to it, behaviour unchanged.
- Behaviour extension of a frozen function (needed to fix a bug): escapeBodyText also writes a leading `--` (after whitespace) as `\--`, besides -/ → -\/ and /- → /\-. Reason: Lean 4.35 skips whitespace and comments right after `/--`, so `/-- -- x -/` is an unterminated comment. Probes on the toolchain: `/-- -- -/` gives 'unterminated comment', and findDocString? returns '\\-- escaped ' for `/-- \-- escaped -/`. Without this, set-docstring could corrupt the file. The D-9 mirror comparison stays consistent because it uses escapeBodyText too.
- Behaviour extension (still satisfies the documented rule): escapeJsonValue also escapes C1 control characters and U+2028/U+2029 as \uXXXX. JSON.stringify leaves them literal; editors flag U+2028/U+2029 as unusual line terminators.
- Structure only: markup/api.ts now re-exports from modules (lexer, text, parser, decls, values, serializer, ids, edits, leanOps, names). findDecl, relativeName and ID_PATTERN moved verbatim to names.ts and ids.ts. markup/index.ts and markup/types.ts are unchanged; every frozen name is still exported.
- Not written: docs/m1-plan.md section 14 entries for the above. docs/ is outside my assigned paths, so the integrator should copy these four items there.

## minor_decisions
- **decision:** Lexer: the nesting scan starts after the 3rd character for every comment kind. Doc and module-doc comments first skip Lean's token whitespace (spaces, line breaks, `--` line comments, plain block comments), and their body starts there, as Lean's docstring does.
  - **rationale:** Lean 4.35 source (Parser/Basic.lean `whitespace`, `finishCommentBlock`; Parser/Term.lean `docComment`), confirmed by probes: /-/-/ complete, /--/ doc -/ valid, /--/-/ and /-- -- -/ unterminated, `/-- -- note⏎real doc -/` documents 'real doc '. The brief's 'starts right after the slash-dash' comes from a wrong note in the prototype.
- **decision:** Lexer details:
- interpolated strings after s!, m!, f! skip {…} code;
- '\'' is one char literal;
- an unterminated « is a symbol and lexing continues;
- after a '.', a number reads digits only (h.1.2);
- whitespace is Lean's (space, tab, CR, LF); anything else is a one-code-point symbol;
- a line comment's span excludes the \r of CRLF.
  - **rationale:** Closer to Lean's tokenizer; keeps markers hidden inside strings; recovers sensibly in broken files.
- **decision:** Command starts = plan 6.1's column-0 list, plus:
- every line where a declaration header begins, at any indentation (indented namespaces, mutual members);
- a few commands the list omits (elab_rules, builtin_initialize, declare_syntax_cat, add_decl_doc, include, omit, module, prelude);
- `deriving` only as `deriving instance`.
  - **rationale:** Without these, a bare `deriving Repr` clause would be cut off its inductive, an elab_rules block would be swallowed into the declaration above it, and indented declarations would be invisible.
- **decision:** A mutual block's span runs through its matching `end`, and that `end` does not pop a namespace. valueStart counts `|` only when it begins a line or the declaration is an inductive type.
  - **rationale:** Avoids namespace corruption after mutual, and false value starts on `|x|` notation.
- **decision:** A docstring attaches across blank lines and plain comments, including telelean blocks (L06, L19 semantics). A second docstring before the keyword yields no declaration from the first.
  - **rationale:** Matches Lean, so set-docstring replaces the docstring Lean actually uses instead of adding a second one (a parse error).
- **decision:** fullName strips unnecessary «» per component («plain» → plain, «weird name» kept); _root_. is honoured. DeclInfo.attributes holds the full raw `@[…]` text.
  - **rationale:** fullName should match how Lean prints names (facts and .ilean); the raw attribute text is unambiguous.
- **decision:** Binding:
- 'adjacent' always has a fully-qualified statement;
- an adjacent anonymous instance, example or mutual → mode 'none' + TL014, with adjacentDecl still recorded;
- adjacentDecl/gapDecl are also recorded for pinned blocks (informational);
- TL013 only when the declaration after the blank line has a name;
- pinned names are taken as written, except that a leading _root_. is stripped.
  - **rationale:** WP2 never sees an adjacent binding without a statement, and the positions stay available for after-block insertion.
- **decision:** Field validation:
- an invalid written id (e.g. Bad_ID) stays the node id, with a TL004 error; an empty id is derived (TL112) plus TL004;
- invalid enum values are dropped with TL004; TL003 only when the line is absent;
- natural_name with a line break → TL004 warning, value kept;
- lean: items must lex as one Lean identifier;
- list items may be JSON strings, so they can hold commas or delimiters;
- inside an unterminated block, fields stop at the first malformed line (no TL001 cascade).
  - **rationale:** Node identity stays stable while the user fixes typos; errors are reported without noisy cascades.
- **decision:** Diagnostics:
- block-level ones (TL003, TL011, TL013, TL014, TL112) sit on the marker line; TL010 on the 2-character `/-`;
- TL010 is also reported for unterminated non-block comments, which hide every block after them;
- severities: TL001/3/4/5/10 error; TL002/8/9/14 warning; TL011/112 info; TL013/19 hint.
  - **rationale:** Less noisy squiggles in editors (M4), and an explanation when blocks vanish.
- **decision:** Serializer:
- an empty value is written "" (no trailing space);
- known keys in extra take their FIELD_ORDER place (the NewBlock field wins), and a list key's string is read as list text;
- kind in extra is dropped;
- an invalid extra key throws.
  - **rationale:** Every rendered block re-parses exactly; caller mistakes surface early.
- **decision:** deriveId:
- a small transliteration table runs before NFKD (ß→ss, æ→ae, ø→o, ł→l, …);
- the fallback is n- plus the first 6 of the 8 hex digits of FNV-1a 32;
- the uniqueness loop is capped at 10^6.
  - **rationale:** Better slugs for Latin text; deterministic; a bad taken() callback cannot loop forever.
- **decision:** Edits:
- setBlockField replaces only the value span (keeps a written `kind:`, the indentation and spacing; adds a space after ':' when missing) and keeps a value off a same-line closer;
- new lines take the anchor line's indentation;
- deletions remove one blank line only when two would otherwise meet, or at the file start/end;
- insertBlockEdits converts the block's line breaks to the file's and reuses existing blank lines.
  - **rationale:** Minimal, byte-stable diffs and tidy spacing.
- **decision:** applyLeanOps refuses, so the caller edits by hand:
- removing or replacing a declaration that contains a telelean block;
- add-holds-axiom when `.holds` already exists in the file;
- holds-theorem-to-axiom on a non-theorem;
- occurrence spans not at an identifier or dotted prefix inside the declaration after its name;
- an invalid hypothesis name, or a hypothesis type with a comment or line break;
- overlapping operations.
add-hypothesis goes after universe parameters `.{u}`. A `_root_` statement gets `axiom _root_.S.holds : _root_.S`.
  - **rationale:** All or nothing, never a corrupted file.
- **decision:** lineIndex treats only \n as a line break (\r\n is one break; a lone \r is part of the line); ParsedFile.eol is taken from the first line break.
  - **rationale:** Same lines as Lean; CRLF files keep CRLF.

## open_issues
- docs/m1-plan.md section 14 needs the four contract-change entries listed above. I could not write them (docs/ is outside my assigned paths).
- The plan, brief and research note (r4 report, telelean_ref.py) state the comment-scan rule wrongly for Lean 4.35, and they do not mention that Lean skips whitespace and comments after `/--` and `/-!`. The code follows Lean (verified); those documents may want a correction.
- Lean recovers from a parse error character by character (e.g. L02: a stray -/ in a value, after which later declarations still elaborate). The lexer just keeps going: the unterminated string after the stray closer runs to the end of the file. The file is broken in Lean anyway and the block diagnostics are shown.
- Edge cases left as is:
- `open … in` and `set_option … in` prefixes are separate commands, so remove-decl leaves them behind;
- a docstring that follows code on the same line is not attached to the next line's declaration;
- add-holds-axiom writes the type as relativeName(statement, namespace), as specified, which could be shadowed by a closer namespace in unusual nesting.
- For the integrator: WP2's skip-gated tests (test/edit/plans.wp1.test.ts and the 'WP-markup parseLeanFile' variant in test/project/spyro.test.ts) already run and pass against this implementation, so the gates can be removed; contracts.test.ts 'stubs' says the integrator deletes it once parseLeanFile is implemented.

## integration_notes
Everything is exported from @telelean/core (index.ts → markup/index.ts → markup/api.ts); importing it pulls in no Node or DOM APIs.

**parseLeanFile**
- Never throws. A diagnostic carries nodeId when it belongs to a block; block-level codes sit on the marker line.
- Blocks: `id` is written or derived (idWritten false + TL112, unique within the file). `fields` are typed. `extensions` keep dotted and unknown keys verbatim. `lines` lists every key: value line (key normalised: kind → type) with its line span and value span. `body` is dedented with escapes kept.
- binding.mode:
  - 'pinned': statement = first lean: name (a leading _root_. stripped);
  - 'adjacent': statement = the declaration's fully-qualified name;
  - 'none'.
- Check `mode`, not the presence of adjacentDecl: adjacentDecl/gapDecl are recorded whenever there is such a declaration, even for pinned blocks.
- decls:
  - keyword and name as written, with namespace and modifiers;
  - fullName is resolved and canonical (`_root_`, unnecessary «» removed);
  - attributes holds the full `@[…]` text;
  - docstring is Lean's docstring, trimmed;
  - span runs from docstring/attribute/modifier to the end of the last non-blank line before the next command start;
  - valueStart is absent for axioms and mutual blocks.

**Edits**
- Use setBlockFields for several fields of one block in one plan: the derived id is written once and the edits cannot overlap.
- insertBlockEdits converts the block's line breaks to the file's eol; after-block skips the block's bound declarations (adjacent declaration, pinned names, their .holds) that sit before the next block.
- applyLeanOps returns either edits+archived or problems, never both. apply-hypothesis accepts occurrence spans with or without the leading @. Spans must start at an identifier token (a dotted prefix such as `d0.holds` in `d0.holds.left` is fine).
- For the D-9 mirror, keep comparing DeclInfo.docstring with escapeBodyText(old natural_name): a leading `--` is now written as `\--` on both sides.

**For the integrator's runLean escape test (plan 11.4):** the escape generator /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/wp1/gen-escape.mjs, run against a tsc build in scratch (see how_to_run), already produced a file that Lean 4.35 compiles; it can be reused or ported.

## effects_outside_repo
- Scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/wp1/ holds:
- explore1.mjs, explore2.mjs, perf.mjs, gen-escape.mjs, check-esc.mjs (my scripts);
- out/ (a tsc --outDir build of packages/core/src);
- probe/ (P1–P4, D1–D6, M1–M2, Esc.lean, Esc2.lean, single/S00–S16.lean, lean-out.txt).
- Ran ~/.elan/toolchains/leanprover--lean4---v4.35.0/bin/lean directly (no elan proxy, no lake) about 30 times on those probe files, from the scratch dir:
- with ulimit -c 0 and LEAN_NUM_THREADS=4, each under 2 s;
- peak RSS about 1.6 GB, for the one file with `import Lean`;
- no -o flag, so Lean wrote no files; all processes exited, and a final ps check found none of mine running.
- Read, without modifying, Lean sources under ~/.elan/toolchains/leanprover--lean4---v4.35.0/src/lean/ (Lean/Parser/Basic.lean, Term.lean, Command.lean, Init/Meta/Defs.lean) to confirm the lexing rules.
- Inside the repo but outside my paths: vitest rewrote its results cache packages/core/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json on each run. Other builders' vitest runs write it too.
- Ran python3 -I for small inline tasks (FNV-1a reference hashes, patching my own markup files and scratch probe files).
- No network access, downloads, npm install, git commands, sudo or global changes; nothing sent or published.

