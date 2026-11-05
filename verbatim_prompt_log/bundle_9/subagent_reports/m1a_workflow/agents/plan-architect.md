# plan:architect (agent a0052a5923e92a38b)

## plan_path
/home/zhengyew/telelean/docs/m1-plan.md

## summary
M1 architecture is planned and its contracts are frozen in code. The plan is at /home/zhengyew/telelean/docs/m1-plan.md (412 lines). It covers: a scope checklist (all 14 M1 items, the user's amendments D-10/D-33 and the 4 turn-9 card requests, each mapped to a WP and an acceptance test); the M1 data flow; the semantic layer; D-11 as implementable logic; status derivation (D-15); vocabulary, "uses", refs and glosses; diagnostic codes; graph.json; the escape rule; folder layout and sidecars; Initialize; subjects and picker; undo vs history (git private refs per subject, storage counter, revert, prune); protocol v1 additions; test isolation for Chrome and VS Code; 6 parallel work packages with disjoint owned paths; the integration plan; risks; and a decisions log (no major decision needs the user).

Key design finding, verified empirically on a scratch copy of the Spyro fixture with the real Lean 4.35: the per-card vocabulary and hover glosses come from Lake's `.ilean` files (version 5). They list every declaration's full and selection ranges, and every identifier usage with the declaration that contains it. Example: `Spyro.HasDarkPast` used at 24:34-24:45 inside `Spyro.cynder_dark_past`. A generated check file adds the rest: `#check @N` gives the type, `#print N` gives the kind and the statement value (with `pp.proofs false`, theorem bodies print as `⋯`), and `#print axioms N` gives the footprint and `sorryAx`. It measured about 0.3 s and 480 MB RSS. When a module fails to build, Lake deletes its `.olean` and `.ilean`; module freshness is derived from that. No compiled tool and no `import Lean` are needed. All four card requests are practical in M1.

Contracts frozen in code:
- core: extended model types (TlGraph gains vocabulary, diagnostics and semantic; LeanBinding gains uses, refs, presupposes, axioms, codeLoc and justificationKind); LeanFacts; BoardAction, EditPlan, FileChange and history types; paths and layout conventions; markup, project, edit and export types with NotImplemented stubs.
- the Spyro sample now carries real card data. A test checks that every ref indexes its identifier in the card's code.
- runner: semantic and workspace interfaces with stubs. The runner tsconfig and vitest config now resolve `@telelean/core` from source.

Implemented by me so the webview does not wait on anyone:
- the full protocol validators (21 webview→host and 5 host→webview message types);
- the D-11 drop-zone impact function `kindChangeImpact`;
- the layout.json and path helpers;
- `runExclusive` and `readMemAvailableBytes`.

Tests run after the freeze:
- core `npm test`: 36/36 passed;
- runner `npx vitest run --silent`: 140/140 passed (68 s), with no leftover systemd units and `~/.elan/known-projects` unchanged at 37 lines;
- webview `tsc` (both configs) plus vitest: 24/24 passed;
- extension `tsc` plus vitest: 4/4 passed.

Not run: webview Playwright and the VS Code smoke test. Both rebuild `packages/extension/dist`, which is outside my owned paths. My changes there are additive and type-level, but I did not prove those two suites still pass.

## work_packages
- **id:** WP1
  - **title:** core markup and Lean-text primitives (lexer, parser, binder, serializer, text edits, LeanOps)
  - **owned_paths:** ["packages/core/src/markup/**", "packages/core/test/markup/**", "packages/core/test/fixtures/markup/**"]
  - **brief:** Read docs/m1-plan.md (safety rules at the top; sections 5.2, 6.1, 6.2, 6.5, 6.7, 9, 14) and follow its safety rules: no pushes/remotes/gh, no publishing or messaging, no downloads or npm installs, no Claude CLI prompts, write only in your owned paths and your scratch dir, check `free -m` before heavy steps.

GOAL. Implement `packages/core/src/markup/`. The types are frozen in `markup/types.ts`: you may add OPTIONAL fields or new exports only, recorded in plan section 14. Replace the stubs in `markup/api.ts`; you may split it into modules as long as `markup/index.ts` keeps exporting every name. Core is pure TypeScript with no Node or DOM APIs (tsconfig lib ES2023, `types: []`); the webview bundles it.

REFERENCE. Port the research prototype at `verbatim_prompt_log/bundle_1/subagent_reports/research_workflow/artifacts/r4-markup-lsp/`: proto/telelean_ref.py (lexer, parse_block, FileModel, bind), proto/test_telelean_ref.py (20 tests) and scripts/gen_lex_tests.py (19 lexing cases L01-L20). Read them as data. If you run Python at all, use `python3 -I`.

Apply these 02/03 rule changes to the reference:
- `type:` is canonical; `kind:` is a silent alias (no TL018).
- No DEFINITION kind.
- No TL016 for a missing version marker; absent means v1.
- `premises` is allowed on every node type (no TL012).
- Known fields (03 §3.2): id, type (ASSUMPTION|DERIVATION|GOAL; lower case is accepted with TL019 hint), natural_name, rationale, stance (believe|rule|supposing), source (observed|reported|inferred|common), asserted (YYYY-MM-DD), premises, lean, supersedes, refines, tags, origin (user|agent), session, worded_by (user|agent).
- Dotted keys and unknown keys are kept verbatim, in order, in `extensions`; an unknown non-dotted key also gets TL002.
- Required fields are type and natural_name (TL003). A block with no `id:` gets `deriveId(natural_name)`, `idWritten:false` and TL112 (info).
- Other diagnostics: TL001 malformed line, TL004 invalid value, TL005 duplicate scalar field, TL008 newer version (block kept), TL009 block inside `/--` or `/-!` (ignored), TL010 unterminated comment, TL011 info for an ASSUMPTION without rationale, TL013 hint, TL014. Workspace-level duplicates, dangling premises and cycles belong to WP2.

LEXER (`lexLean`). Lean 4.35 rules:
- `--` line comments; nested `/- -/`; `/--` doc and `/-!` moddoc comments (the nesting scan starts right after `/-`);
- strings with escapes, char literals, raw strings `r#"…"#`;
- dotted identifiers with «» parts; isIdFirst/isIdRest including the letter-like and subscript Unicode tables from the Python;
- numbers and single-character symbols;
- an unterminated comment runs to EOF.

PARSER (`parseLeanFile`):
- Blocks: a plain `/-` comment whose first non-blank line matches `@@ telelean [vN]`.
- Field lines are `key: value`. A value starting with `"` is a JSON string (`parseFieldValue`), otherwise trimmed raw text; never YAML.
- Lists split on commas, with optional brackets; a repeated list key accumulates.
- The body after `---` is dedented, with escapes kept.
- `FieldLine` spans let edits touch a single line.
- `imports` come from the header's `import` lines.

Declarations (`DeclInfo`), found by a header parser:
- docstring `/-- -/`, `@[...]` lists, modifiers (private, public, protected, meta, noncomputable, unsafe, partial, nonrec, scoped, local), keyword (including `class inductive`, `class abbrev`, `mutual`, `example`), name (with «»), and `instance (priority := …) name`;
- namespace/section/end tracking with `_root_.`; `fullName` is the resolved name;
- `span` runs from the docstring/attribute/modifier start to the end of the last non-blank line before the next top-level command. A command starts at column 0 with a declaration keyword, a modifier, `@[`, a docstring, a block comment, `end`, `namespace`, `section`, `open`, `#…`, `import`, or at EOF;
- `valueStart` is the first top-level `:=`, `where` or `|` after the signature, skipping brackets, strings and comments.

Binding:
- A pinned `lean:` field wins; its first name is the statement.
- Otherwise Go-style adjacency: the next declaration with no blank line between the block's `-/` and it. Plain comments, a docstring and attributes may sit in between.
- Another block, a blank line or EOF means code-less. Give TL013 (hint) when a declaration follows after a blank line, and TL014 for example/mutual.
- `statement` is fully qualified.
- Positions are UTF-16 offsets (JS indices); ranges are LSP-style via `lineIndex`. CRLF files keep `\r\n`.

SERIALIZER (exact rule, plan 6.7):
- A value is raw unless it contains a comment delimiter, starts with `"`, contains a line break or control character, or has leading/trailing spaces. Otherwise it is a JSON string in which every `/` followed by `-` becomes `/` (the 7 characters backslash u 0 0 2 f -), and every other `/` preceded by `-` becomes `\/`.
- The body uses `-\/` and `/\-`.
- `renderBlock` writes `/-`, `@@ telelean v1`, fields in FIELD_ORDER, then `---` and the body if any, then `-/`, with no trailing newline.
- Lists are written `a, b, c`.

IDS (`deriveId`): NFKD, strip combining marks, lower-case, non-alphanumerics become `-`, at most 6 words. When nothing is left (non-Latin text): `n-` plus 6 hex digits of a deterministic hash (FNV-1a; core has no crypto). Make it unique via `taken` with -2, -3, …; the result must match ID_PATTERN.

TEXT PRIMITIVES:
- `applyTextEdits` applies non-overlapping edits.
- `setBlockField` changes only the target line, inserts a missing key at its FIELD_ORDER position, removes the line for `null`, escapes values, and also writes `id:` when idWritten is false.
- `removeBlockEdits` removes the comment, its line break and one blank line.
- `insertBlockEdits` keeps one blank line between neighbours. `end-of-namespace` inserts before the `end <ns>` of the last matching namespace; with none, at EOF.

`applyLeanOps` (semantics in the `LeanOp` docs in types.ts and plan 6.2):
- `add-holds-axiom`: insert `axiom <rel>.holds : <rel>` on the line after the statement declaration (`rel = relativeName(statement, decl.namespace)`).
- `holds-theorem-to-axiom`: replace the whole theorem declaration with that axiom line, and return the old text in `archived`.
- `remove-holds` / `remove-decl`: delete the declaration with its docstring and one trailing blank line; archive it when asked.
- `add-hypothesis`: insert ` (<hypName> : <hypType>)` before the top-level `:` of the signature (after the name and any existing binders), and replace each given span with hypName.
- `apply-hypothesis`: wrap each span as `(<original> <hypName>)`.
- `set-docstring`: replace or insert `/-- text -/`, with `-/` in the text escaped as `-\/`.
- All edits must be non-overlapping. Problems (missing declaration, unexpected shape) go into `problems`, and then the caller applies nothing.

RUN: `cd packages/core && npm test` (tsc on src and test, then vitest). Do not edit frozen files (index.ts, model.ts, protocol.ts, samples, contracts.test.ts, protocol.test.ts). Report the files you wrote, the test output, and any additive contract changes.
  - **acceptance_tests:** ["AT1.1 Lexer: the 19 lexing cases of scripts/gen_lex_tests.py (nested comments, stray -/ and /-, escaped values, doc/moddoc comments, string/char/raw-string literals hiding markers, tabs, CRLF, non-BMP characters, /--- docstring, unterminated EOF) yield the expected comment kinds, spans and code tokens", "AT1.2 The 18 non-graph research tests (Lexing 5, Values 7, Binding 6) are ported to vitest with the 02/03 rule changes: type canonical, kind a silent alias, no DEFINITION kind, no TL016/TL018, premises allowed on any type", "AT1.3 Parsing test-fixtures/spyro/Model/Spyro/Main.lean gives 4 blocks with the sample's ids, fields and block ranges (lines 4-11, 13-22, 27-36, 41-49); pg-no-dark-past is code-less; the other three are pinned to Spyro.cynder_dark_past / Spyro.new_spyro_pg / Spyro.cynder_not_good; decls include Spyro.cynder_dark_past.holds with keyword axiom and valueStart absent; imports = [Model.Spyro.Vocabulary]", "AT1.4 Escape round-trip and property test: random values over an alphabet with / - \" \\ newline and space, including '-/', '/-', '/-/', '-/-', a leading quote and leading spaces, go through renderBlock then parseLeanFile and come back identical; lexLean finds exactly one terminated block comment in every rendered block (no nested opener); '/-' is serialised with the 7-character /- escape", "AT1.5 renderBlock writes fields in FIELD_ORDER under '@@ telelean v1', escapes the body, and preserves CRLF when eol is \\r\\n", "AT1.6 setBlockField/removeBlockEdits/insertBlockEdits: only the targeted line(s) change (the rest of the file is byte-identical); a missing key is inserted at its FIELD_ORDER position; null removes the line; a derived id is written; blank-line spacing stays tidy; CRLF files stay CRLF", "AT1.7 applyLeanOps on Spyro texts and the runner-lean 'proved' overlay: add-holds-axiom after cynder_not_good gives 'axiom cynder_not_good.holds : cynder_not_good'; holds-theorem-to-axiom archives exactly the theorem's text; remove-holds and remove-decl remove the docstring and spacing; add-hypothesis/apply-hypothesis with given spans; set-docstring inserts and replaces; a missing declaration is reported in problems", "AT1.8 deriveId: Latin slugs of at most 6 words, uniqueness suffixes, a deterministic n-<6 hex> fallback for non-Latin text, every result matches ID_PATTERN; a block without id gets the derived id plus TL112"]
- **id:** WP2
  - **title:** core model build, statuses, vocabulary, diagnostics, edit planning, graph.json
  - **owned_paths:** ["packages/core/src/project/**", "packages/core/src/edit/**", "packages/core/src/export/**", "packages/core/src/graph.ts", "packages/core/src/kindChange.ts", "packages/core/src/layout.ts", "packages/core/src/paths.ts", "packages/core/schema/**", "packages/core/scripts/**", "packages/core/test/project/**", "packages/core/test/edit/**", "packages/core/test/export/**", "packages/core/test/fixtures/project/**", "packages/core/test/fixtures/edit/**", "packages/core/test/fixtures/export/**"]
  - **brief:** Read docs/m1-plan.md (safety rules at the top; sections 2, 5.3, 5.4, 6 (all), 7.1, 7.3, 8, 9, 14) and follow its safety rules.

GOAL. Implement, all as pure TypeScript (no Node/DOM; the webview bundles core):
- `project/index.ts`: `buildProjectModel`, `subjectGraph`.
- `edit/index.ts`: `planAction`, `planKindChange`, `planDelete`, `subjectScaffold`.
- `export/graphJson.ts`: `toGraphJson`, plus a zod schema in `export/schema.ts`. Do NOT re-export schema.ts from export/index.ts, so zod stays out of the webview bundle.

The types are frozen in project/types.ts, edit/types.ts, export/graphJson.ts, actions.ts, facts.ts, model.ts and markup/types.ts. Additive optional changes only, recorded in plan section 14.

You also own `kindChange.ts`, `layout.ts`, `paths.ts` and `graph.ts`. The architect already implemented the first three; keep their behaviour, since integrator-owned contracts.test.ts and protocol.test.ts guard it.

INPUTS. `ProjectInput` = parsed files (WP1's `ParsedFile`), sha256 per path, optional `LeanFacts` (shape in facts.ts; produced by WP3 per plan section 4) and the library name.

BUILD (plan 6.1-6.5):
- Bind blocks to declarations (statement = block.binding.statement; justification = `<statement>.holds` from declFacts or the syntactic decls).
- Files whose hash differs from `facts.modules[].sourceSha256` fall back to syntactic keywords and get the `stale` flag; no refs for them.
- Derive statuses exactly per the table in 6.3:
  - conditional vs proved from the `#check` type, split at top-level arrows;
  - footprint mapping: other nodes' `.holds` become their ids, presuppositions become `presup:<name>`, sorts/predicates/standard axioms are dropped, anything else becomes `axiom:<name>` plus TL103;
  - flags: rests-on-claimed, proved-goal, provable-assumption, missing-holds, uses-sorry, holds-mismatch, not-checked, stale, no-rationale, self-evident.
- Edges per 6.3: declared, verified (conditional), lean-ref, and mismatch flags with TL107/TL109.
- Vocabulary per 6.4: classification, ordering, unmarked axioms (TL104), definitions, lemmas, presupposition attachment, hidden Nonempty instances, usedBy.
- Card data per 6.4: `code` and `codeLoc` (contiguous statement-to-holds text, or pieces); `uses` (statement refs, then the closure through other nodes' statements, first-occurrence order); `refs` (vocabulary/node refs with code-relative ranges, only for fresh files); `presupposes`; `axioms`; `justificationKind`.
- Diagnostics per 6.5: TL006, TL007, TL015, TL017 and TL101-TL121, plus Lean build messages as code LEAN with file/range. Also include WP1's markup diagnostics, mapped with nodeId.
- Subjects come from paths.ts (`subjectOfPath`): blocks outside a subject give TL120; a premise in another subject gives TL121. Ids are unique workspace-wide.

`subjectGraph`: nodes ordered by `orderByLayout` (layout first, then file order; files sorted by path), the subject's edges, vocabulary and diagnostics, and the semantic summary passed in. Its output must reproduce the frozen Spyro sample's card data for the Spyro fixture with matching facts.

PLANNING (plan 6.2, D-18):
- add-node: preferredId if valid and unused, else `deriveId`. `asserted = ctx.today`; verbatim words (trim only). Goes into `inboxPath(subject)`; create Inbox if missing (import Vocabulary; namespace) and add its import to `<library>/<S>.lean`, else to `<library>.lean`. Append to the layout. Label `Add <kind>: <sentence…>`.
- edit-node: setBlockField. If the statement's docstring equals the old natural_name, also emit a set-docstring LeanOp (D-9 mirror).
- delete-node: planDelete; remove the block and (unless keepLean) its decls, archiving theorems as ArchiveEntry; drop the id from other blocks' `premises:`; update the layout with withoutIds.
- change-kind: planKindChange per the 6.2 table:
  - `needs-confirmation` ActionError listing the dependents when none was chosen;
  - `mark-broken` → remove-holds;
  - `rewrite` needs every touched file fresh (else `facts-stale`): build the closure C of theorems using H, then add-hypothesis and apply-hypothesis with spans from DeclFacts.refs converted to current offsets, then remove-holds;
  - move the layout with moveInLayout;
  - the impact equals `kindChangeImpact` on the same graph, with dependents possibly extended by untracked decls.
- reorder: layout only, `layoutOnly: true`.
- set-premises: replace `premises:`. Validate that targets exist and that there is no self-reference or cycle (`invalid`). Empty premises → ActionError `not-yet` ("Self-evident? arrives with Claude in M2").
- create-subject: name valid and unused; `subjectScaffold` files; add `import <library>.<S>` to `<library>.lean` (create it if missing); empty layout.

EditPlans carry Lean FileChanges with whole-file before/after (use WP1's applyTextEdits/setBlockField/applyLeanOps), plus `layout` and `archive`. The runner materialises the sidecars. `subjectScaffold` emits the 7.1 file texts.

GRAPH.JSON (6.6): `toGraphJson` is deterministic and covers all subjects. Generate `packages/core/schema/telelean-graph-1.0.schema.json` from the zod schema with `z.toJSONSchema` (zod 4.6.7 is installed; do NOT add ajv or any package), e.g. a vitest test that rewrites the file when UPDATE_SCHEMA=1. Test that the committed file equals the generated one.

DEPENDENCIES. WP1 is a stub in your tree until integration:
- Unit-test status, vocabulary and planning logic on hand-built ParsedFile objects. Write fixture builders; WP1's types are frozen.
- Gate text-producing tests with `describe.skipIf(!isImplemented(() => parseLeanFile('X.lean', '')))`.
- Write `packages/core/test/fixtures/project/spyro-facts.json` by hand from plan section 4 and the sample. Real ilean refs, for example: HasDarkPast at 24:34-24:45 in Spyro.cynder_dark_past; axioms of cynder_dark_past.holds = [Classical.choice, Spyro.Character, Spyro.HasDarkPast, Spyro.Character.exists, Spyro.cynder_dark_past.holds]. The integrator re-checks it against WP3's real output.

RUN: `cd packages/core && npm test`. Report your files, the test output, which tests are gated on WP1, and any contract additions.
  - **acceptance_tests:** ["AT2.1 buildProjectModel + subjectGraph on the Spyro fixture files (parsed; gated on WP1) with spyro-facts.json reproduce spyroGraph()'s nodes (status, lean.uses, lean.refs, lean.presupposes, lean.justificationKind, lean.codeLoc), its vocabulary (9 items, same kinds and order) and its edges", "AT2.2 One test per cell of the plan 6.3 status table: ASSUMPTION/DERIVATION/GOAL × H absent/axiom/theorem/theorem with sorryAx; conditional vs proved from the #check type; holds-mismatch; footprint mapping including presup: and axiom: entries with TL103; rests-on-claimed; self-evident", "AT2.3 A stale file (hash differs from facts): statuses come from syntactic keywords with the stale flag, refs are omitted, and not-checked is set for failed, dependency-failed and not-built modules", "AT2.4 uses/refs are computed from DeclFacts.refs and never hard-coded: changing the fixture's refs changes uses; the closure runs through another node's statement; refs are code-relative and every ref's substring is a suffix of its name", "AT2.5 Vocabulary classification per 6.4: sort, predicate with arity, constant, function, presupposition attached to its sort, definition with definitional-choice, lemma, unmarked-axiom with TL104, the Nonempty instance hidden; display order; usedBy", "AT2.6 planAction add-node (Inbox created and imported when missing; id unique across subjects; layout appended), edit-node (docstring mirror follows), set-premises (replace; cycle → invalid; empty → not-yet), reorder (layoutOnly) and create-subject (scaffold + Model.lean import) produce the exact expected file texts (gated on WP1)", "AT2.7 planDelete/delete-node: premise removals, decl removal with ArchiveEntry for theorems, keepLean → leavesUnmarkedAxiom, brokenDependents listed", "AT2.8 planKindChange covers every cell of the plan 6.2 table, including needs-confirmation with the dependents, mark-broken, rewrite with spans from facts (gated text check), facts-stale refusal, and A→D pending promotion; its impact matches kindChangeImpact", "AT2.9 Two subjects (a Spyro + Bayonetta fixture): separate subject graphs, a duplicate id across subjects reported as TL006, a cross-subject premise as TL121, a block outside any subject as TL120", "AT2.10 toGraphJson is deterministic, validates against the zod schema, and the committed packages/core/schema/telelean-graph-1.0.schema.json equals the regenerated one"]
- **id:** WP3
  - **title:** runner semantic layer: sandboxed build + .ilean + check file -> LeanFacts
  - **owned_paths:** ["packages/runner/src/semantic/**", "packages/runner/src/lean/**", "packages/runner/test/semantic/**", "packages/runner/test/lean/**", "test-fixtures/semantic/**"]
  - **brief:** Read docs/m1-plan.md (safety rules at the top; sections 4, 5.6, 10, 12, 14) and follow its safety rules:
- Lean only through runLean (sandboxed, memory-capped) or, for quick probes on trusted fixture copies in your scratch dir, the toolchain binaries directly (never the elan proxies).
- `LEAN_NUM_THREADS=4`; one heavy process at a time; `free -m` first; never build Mathlib.
- Set `TELELEAN_TEST_TMP` to your scratch dir when running tests.

GOAL. Implement `refreshLeanFacts(request)` in `packages/runner/src/semantic/` (types frozen in semantic/types.ts; `LeanFacts` frozen in packages/core/src/facts.ts; additive optional fields only, recorded in plan section 14). Follow the steps of plan section 4:
- memory guard (`readMemAvailable` hook, default `readMemAvailableBytes`; below the threshold → status `low-memory`, nothing spawned);
- toolchain check (`lean-toolchain` must equal `leanprover/lean4:v4.35.0`, else `unsupported-toolchain`);
- sha256 of every module source before the build;
- `lake build` IN PLACE via runLean(`shadowDir: root`, `maskPaths: [root/.git]` only if it exists, memoryMax/timeouts/runId/signal passed through);
- a clear error when `lake-manifest.json` is missing;
- parse Lake's log (messages with file and range; convert Lean's 1-based line and code-point column to a 0-based line and UTF-16 character using the source line; failed modules from the ✖ lines and the 'Some required targets logged failures' list);
- module states fresh/failed/dependency-failed/not-built/stale (imports from source headers; Lake deletes a failed module's .olean/.ilean);
- read `.lake/build/lib/lean/<Module/Path>.ilean`, version 5 (exact verified shape in plan section 4: `decls` name → [full range…, selection range…], `references` keyed by a JSON string {c:{m,n}} with usages [l,c,l,c,parentDecl]); skip `_private.` names; set `parent` for auxiliary names;
- the generated check file on stdin to `lake env lean --stdin --json` via runLean: imports = fresh modules; `set_option pp.fullNames true` and `pp.proofs false`; per declaration `#check @N`, `#print N`, `#print axioms N`, names written with M0 `formatDeclName`; attribute messages by 1-based line as M0's `footprintsFromMessages` does;
- extract type, kind (+ attributes; `def` with instance_reducible → instance), value for defs, axioms (M0 `parseAxiomsMessage`, multi-line), usesSorry, error;
- docstrings from the source at each decl's range;
- re-hash the sources and mark changed modules stale.

Reuse the M0 helpers in packages/runner/src/lean (runLean, toolchainExe, resolveToolchain, parseLeanJsonMessages, parseAxiomsMessage, formatDeclName) and keep all M0 lean tests passing. You may refactor lean/ (you own it), but keep its exports. You may export your internal helpers (check-file generator, ilean reader, log parser) from semantic/index.ts. `refreshLeanFacts` never throws for Lean or sandbox failures (statuses with details) and is not self-serialising; callers use `runExclusive`.

FIXTURES. Put new overlays in `test-fixtures/semantic/`, applied over scratch copies of test-fixtures/spyro:
- a build error in Main;
- the runner-lean 'proved' overlay plus a conditional theorem `theorem d1.holds (h : cynder_not_good) : d1`, a `sorry` theorem, a hidden axiom `axiom hidden : ∀ c : Character, HasDarkPast c` and a structure;
- an edited lean-toolchain;
- a non-BMP character before an erroring identifier on one line.

Expected values were verified by the architect: `#check @Spyro.d1.holds` → `Spyro.cynder_not_good → Spyro.d1`; `#print` of a theorem with pp.proofs false ends in `:=\n⋯`; MemAvailable comes from /proc/meminfo. Never build inside test-fixtures/ or mental_model/; copy to TELELEAN_TEST_TMP. Check there are no leftover `telelean-*` systemd units and that `~/.elan/known-projects` keeps its line count.

RUN: `cd packages/runner && TELELEAN_TEST_TMP=<scratch> npx vitest run test/semantic` and the full suite once (about 70 s for M0). Report the files, the test output, measured durations and peak memory, and any contract additions.
  - **acceptance_tests:** ["AT3.1 A scratch copy of the Spyro fixture → status ok: every module fresh; decls include the 11 vocabulary names and 5 Main names with the right kinds (axiom, def+reducible, opaque, instance), types (Spyro.HasDarkPast: 'Spyro.Character → Prop'), axioms (cynder_dark_past.holds = [Classical.choice, Spyro.Character, Spyro.HasDarkPast, Spyro.Character.exists, Spyro.cynder_dark_past.holds]), refs (Spyro.HasDarkPast at 24:34-24:45 inside Spyro.cynder_dark_past) and docstrings; no leftover units; known-projects unchanged", "AT3.2 A build error in Main → status build-errors: Main failed; the Model root is dependency-failed; Vocabulary is fresh and its decls are present; the error message has a file and a 0-based UTF-16 range", "AT3.3 The proved overlay plus extras: d1.holds has type 'Spyro.cynder_not_good → Spyro.d1'; withSorry has usesSorry; hidden has kind axiom; structure fields carry a parent; theorems have no value; the abbrev value is pp.fullNames text", "AT3.4 Memory guard: readMemAvailable returns 1 GiB against a 2 GiB threshold → low-memory, and no process is spawned", "AT3.5 Cancellation through an AbortSignal, and a tiny timeout → cancelled/timeout with a detail and no leftover scopes", "AT3.6 An edited lean-toolchain → unsupported-toolchain, and nothing is spawned", "AT3.7 A source modified during the check (an onPhase('check') hook edits a file) → that module is stale", "AT3.8 A missing lake-manifest.json gives a clear detail; the .git mask is applied only when .git exists", "AT3.9 A message column after a non-BMP character is converted to UTF-16 correctly", "AT3.10 All M0 runner tests still pass"]
- **id:** WP4
  - **title:** runner workspace: ModelWorkspace, sidecars, history (git private refs), undo, Initialize, graph.json writer, sample mental_model
  - **owned_paths:** ["packages/runner/src/workspace/**", "packages/runner/test/workspace/**", "test-fixtures/workspace/**", "mental_model/**"]
  - **brief:** Read docs/m1-plan.md (safety rules at the top; sections 2, 3, 4 (mapping to SemanticSummary), 5.6, 7, 8, 10, 12, 13, 14) and follow its safety rules:
- git ONLY in test repositories under your scratch dir (TELELEAN_TEST_TMP), always with `-c commit.gpgsign=false -c core.hooksPath=/dev/null`, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1` and an explicit author;
- never in /home/zhengyew/telelean or mental_model/; no remotes, push, gc or prune.

GOAL. Implement `packages/runner/src/workspace/`: `createModelWorkspace` (the `ModelWorkspace` interface), `inspectFolder`, `planInitialize`, `findModelRoots`, `initGitRepository`. Types are frozen in workspace/types.ts (additive optional members only, e.g. injectable core functions as test hooks; record them in plan section 14). No vscode imports.

MODEL WORKSPACE (plan 2, 3):
- `load()` lists `<library>.lean`, `<library>/**.lean` and `.telelean/subjects/*/layout.json` via fs (skip dot-dirs, `.lake`, node_modules), reads texts through the TextSource, sha256-hashes them and parses with core `parseLeanFile`. Library comes from `.telelean/config.json` via `parseProjectConfig`.
- Cache parses by path + hash. `graph(subject)` = core `subjectGraph(buildProjectModel(...))` with a monotonic version, the subject's layout and the current SemanticSummary.
- `invalidate` re-reads; a file that is now null is removed.
- `onDidChange` events.
- `requestRefresh`: debounce (750 ms default), coalesce, one at a time per process via `semantic.runExclusive(() => refreshLeanFacts({root, library, memoryMax, minAvailableBytes, ...}))`. The `refreshFacts` option is the test hook.
- Map FactsStatus to SemanticSummary per plan section 4. Keep the previous facts after a failed refresh. Rewrite `.telelean/graph.json` (core `toGraphJson`, direct fs write, gitignored) after each refresh and each perform. `refreshNow()`.

`perform(action)` → `{ok:false, code, error}` outcomes for ActionError, never a throw:
1. core `planAction(model, action, {today, now, layouts})`;
2. materialise sidecars into whole-file FileChanges (layout.json via `serializeLayout`; attic entries appended to `atticPath(subject, nodeId)` with a header `-- archived <ISO time> (<reason>): <declName>`);
3. 'Manual edits' snapshot of each touched scope whose files differ from its tip;
4. `EditApplier.apply(changes, label)`;
5. the action snapshot of each touched scope (subject chains via `subjectSnapshotScope`, project chain via `projectSnapshotScope`). Skip it when `layoutOnly`;
6. push the undo entry and clear redo;
7. invalidate + requestRefresh.

Serialise perform/undo/redo/revert in one queue.

UNDO (plan 8): per subject, in memory, max 100. Exact reversal when current === after. Otherwise reverse patches with the installed `diff` 9.0.0 (structuredPatch/applyPatch, no fuzz). A file the action created is deleted only if unchanged. All or nothing: refuse with code `conflict` ("<file> changed since; use History to revert"). Undo/redo are applied like actions, snapshotted 'Undo: <label>' / 'Redo: <label>', and are themselves undoable.

HISTORY (plan 8, exact rules):
- refs `refs/telelean/<rootKey>/subjects/<S>` and `…/project`; rootKey per plan; validate with check-ref-format;
- snapshot = a commit of exactly the scope's files (paths relative to the model root) built with plumbing only: hash-object -w, then a temporary index file in a fresh temp dir or mktree, write-tree, commit-tree with the trailers Telelean-Action/Subject/Nodes/Format, update-ref with the old value;
- author/committer `telelean <telelean@localhost>` via env; never touch the user's index, HEAD, branches or hooks; `-c gc.auto=0`;
- 'Initial state' when a subject chain is missing (on load or board open);
- `listHistory` newest first, plus storage: `git rev-list --objects --disk-usage <ref> --not --branches --tags --remotes` per subject and over all of the root's refs, cached 10 s;
- `historyDiff` parent/current (FileChange list);
- `revert` snapshots the current state if it is dirty, writes the entry's tree over the subject scope (create/replace/delete), labels it 'Revert to: <label> (<time>)', snapshots and makes it undoable;
- `prune(keepLast)` recreates the last N commits with the same trees/messages/dates (the oldest becomes a root commit) and updates the ref; no gc;
- `historyStatus`: ready / no-repo / git-missing / disabled / error;
- `initGit` → `initGitRepository` (refuses inside an existing repository; `git init` only, no commit to any branch), then initial snapshots.

INITIALIZE (plan 7.1, 7.2):
- `inspectFolder`: empty / model / lake-project (lakefile.toml with [[lean_lib]] name; subjects = its subdirectories) / unsupported.
- `planInitialize`: for an empty folder, every file of 7.1 (lakefile.toml, lean-toolchain, lake-manifest.json with the exact JSON in 7.1, .gitignore, Model.lean importing the subject, core `subjectScaffold(subject, 'Model')`, .telelean/config.json via serializeProjectConfig, the subject's layout.json). For a lake project, only .telelean/config.json (library from the lakefile), the .gitignore lines and the layout files.
- `findModelRoots` skips DEFAULT_EXCLUDED_DIRS.

SAMPLE (plan 7.4). Write /home/zhengyew/telelean/mental_model/ with the 7.1 scaffold for subject Spyro:
- Vocabulary.lean is a byte copy of test-fixtures/spyro/Model/Spyro/Vocabulary.lean;
- Main.lean is test-fixtures/spyro/Model/Spyro/Main.lean with one extra line, `import Model.Spyro.Inbox` (after the Vocabulary import);
- Inbox.lean is an empty namespace module importing Vocabulary;
- Model/Spyro.lean, Model.lean, .telelean/config.json and .telelean/subjects/Spyro/layout.json.

The sample must contain no .lake and no .git. Write it with plain file writes (it is data), not via a test.

DEPENDENCIES. Core WP1/WP2 functions and WP3's refreshLeanFacts are stubs in your tree:
- unit-test history, undo, sidecars, scan, scaffold and refresh scheduling with fakes (refreshFacts hook, fake applier, injected core hooks if you add them);
- gate flows that need parse/build/plan with `isImplemented(...)`;
- gate Lean builds of the scaffold/sample (copies in TELELEAN_TEST_TMP) on WP3.

RUN: `cd packages/runner && TELELEAN_TEST_TMP=<scratch> npx vitest run test/workspace`. Report the files, the test output, what is gated, effects outside the repo, and contract additions.
  - **acceptance_tests:** ["AT4.1 Scan on a scratch copy of mental_model plus a second subject: subjects() lists both with node counts; graph('Spyro') has 4 nodes (gated on WP1/WP2); unknown subjects throw", "AT4.2 requestRefresh with a fake refreshFacts: debounced, coalesced, one at a time; semantic states map per plan section 4; previous facts are kept after a failure; onDidChange fires; graph.json is written after a refresh and after a perform (gated on WP2) and parses", "AT4.3 perform materialises layout.json and the attic file into FileChanges for the fake applier; layoutOnly actions are applied and undoable but not snapshotted; ActionError becomes an ok:false outcome", "AT4.4 Undo/redo: exact reversal; reverse patch with an unrelated hand edit elsewhere in the file; conflict refusal leaves files untouched; a created file is deleted only if unchanged; a new action clears redo; undo of an undo works", "AT4.5 History in a scratch repo: Initial state; Manual edits snapshot before an action; action snapshot with trailers; per-subject scope; listHistory order/labels; historyDiff parent/current; revert and undo of the revert; prune keeps N with the same trees; storage counters > 0 with total >= each subject; the user's index mtime, HEAD, branches and `git status --porcelain` are unchanged; a marker-writing hook (post-commit, reference-transaction) never runs; only refs/telelean/* change; a model root inside a parent repo gets the right rootKey", "AT4.6 inspectFolder/planInitialize: empty → exactly the 7.1 files (lake-manifest JSON exact); lake-project → only .telelean/ and .gitignore lines; an already opted-in model → a no-op inspection; initGitRepository refuses inside an existing repo; the scaffold builds under runLean in a scratch copy (gated on WP3)", "AT4.7 mental_model/ content: files as specified in plan 7.4, Vocabulary.lean byte-identical to the fixture, no .lake/.git; a scratch copy parses to 4 Spyro nodes (gated on WP1) and builds under runLean (gated on WP3)", "AT4.8 findModelRoots finds nested roots and skips node_modules, .lake, .git, verbatim_prompt_log and test-fixtures"]
- **id:** WP5
  - **title:** VS Code extension host: activation, commands, BoardPanel per root, EditApplier/TextSource, refresh triggers, clipboard, history diff, colours, isolated tests
  - **owned_paths:** ["packages/extension/src/**", "packages/extension/test/**", "packages/extension/scripts/**", "packages/extension/package.json", "packages/extension/tsconfig.json", "packages/extension/vitest.config.mts", "packages/extension/.vscode-test.mjs", "packages/extension/dist/extension.js", "packages/extension/dist/extension.js.map", "packages/extension/out/**"]
  - **brief:** Read docs/m1-plan.md (safety rules at the top; sections 2, 3, 5.5, 5.6, 8, 10, 12 (R4, R8, R11), 13, 14) and follow its safety rules:
- never touch the user's VS Code settings or extensions;
- the test VS Code runs only with the isolated profile of plan section 10;
- do not change the VS Code test version (1.140.0 is already in .vscode-test);
- do not run `npm run build:all` or the webview build (dist/webview belongs to WP6); one VS Code instance at a time; `free -m` first.

GOAL. The thin VS Code adapter for M1. Add `"@telelean/runner": ["../runner/src/index.ts"]` to tsconfig paths. esbuild resolves it through tsconfig. Import only runner `semantic`/`workspace` (deep paths or namespaces) so `llm/confinement.ts`'s `import.meta.url` is not evaluated in the CJS bundle; check the bundle loads.

PACKAGE.JSON:
- Commands: `telelean.openBoard` (Open Board), `telelean.initializeModel` (Initialize Model Here; also in explorer/context for folders), `telelean.refresh` (Refresh Lean Check).
- Activation events: `workspaceContains:**/.telelean/config.json` and `onWebviewPanel:telelean.board`.
- `capabilities.untrustedWorkspaces.supported=false`, `virtualWorkspaces=false`.
- Settings: telelean.memory.capGiB (4), telelean.memory.minAvailableGiB (2), telelean.refresh.enabled (true), telelean.refresh.debounceMs (750), telelean.git.snapshotRefs (true), telelean.git.path ('git').
- Colours: keep the 4 ids and add `telelean.vocabulary` and `telelean.highlight`. Each id has exactly one dot; defaults are explicit per-theme hex values, never `charts.*` (M0 lesson). Update the M0 colour smoke test.

RUNTIME:
- `findModelRoots` per workspace folder; Open Board quick-picks when there are several roots; with none, offer Initialize.
- One BoardPanel per model root (title 'telelean: <folder>'), with a WebviewPanelSerializer restoring root and subject (D-22).
- A ModelWorkspace per root, created with an EditApplier and a TextSource.
- EditApplier: a WorkspaceEdit with minimal text edits for open documents (line diff via the installed `diff` package) and create/delete for files; then save every touched document; reject if applyEdit fails.
- TextSource: open document text if open, else fs.
- Watchers: onDidChangeTextDocument (debounced ~200 ms) → invalidate; onDidSaveTextDocument → invalidate + requestRefresh; a FileSystemWatcher for `**/*.lean`, `.telelean/**`, lakefile.toml and lean-toolchain under each root → invalidate (+ refresh for lakefile/toolchain).
- Refresh only while that root's board is open.
- Post `workspace` + `graph` on ready, on onDidChange and after subject switches.

PROTOCOL DISPATCH (core `parseWebviewToHost`; frozen; do not edit protocol.ts):
- Map messages to BoardActions → `ws.perform`. Then post `actionResult` {requestId, outcome} and, on success, a `notice` with undoable: true.
- undo/redo → `ws.undo`/`ws.redo` for the board's subject; selectSubject; createSubject (then switch); theseSuffice → set-premises.
- historyList → `history`; historyPreview → `vscode.changes` on a read-only `telelean-history:` TextDocumentContentProvider fed by `ws.historyDiff`; historyRevert → `ws.revert`; historyPrune; initGit (only after a modal confirm in the host).
- copyText → `vscode.env.clipboard.writeText` + notice 'Copied'.
- openInEditor → resolve inside the root (refuse otherwise) and showTextDocument at the range.
- refresh → `ws.refreshNow`.

Initialize command: pick a folder → inspectFolder → InputBox for the first subject (validated with isSubjectName; default derived from the folder name) → planInitialize → apply via fs/WorkspaceEdit → if not inside a repo, modal offer → initGitRepository → open the board. Test-only arguments may auto-answer prompts.

TEST API: extend TeleleanApi, e.g. onDidPostToBoard, simulateBoardMessage(root, raw), workspaceFor(root). Keep the M0 sample path, or replace the M0 smoke tests with M1 ones.

TESTS. Unit (vitest, no vscode): message→action mapping, EditApplier change conversion, TextSource preference, path refusal.

VS Code smoke under xvfb with the isolated profile (plan 10):
- the pretest script makes the dirs under TELELEAN_TEST_TMP and copies mental_model to ws/;
- writes the user settings (chat.disableAIFeatures, telemetry off, updates off, experiments off, workspace trust off);
- `.vscode-test.mjs` sets workspaceFolder, `--user-data-dir`, `--extensions-dir`, `--disable-extensions`, `--disable-telemetry`, `--disable-workspace-trust`, and env HOME/XDG_*, ELAN_HOME=/home/zhengyew/.elan, GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1;
- the script uses `sh -c 'ulimit -c 0; env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx vscode-test'`;
- assert that the real ~/.copilot, ~/.config/Code and ~/.config/google-chrome listings did not change.

The full smoke flow needs WP1-WP4 (stubs until integration): write it now, run what you can (activation, package.json, colours, CSP, a sample board), and report the rest as pending integration. Build with `npm run build` (extension only). Report the files, the test output, effects outside the repo (check the real home dirs), and open issues for frozen files.
  - **acceptance_tests:** ["AT5.1 Activation and opt-in: the extension activates in the copied sample workspace; with two roots, openBoard asks (test arg chooses one); a folder without .telelean runs no Lean", "AT5.2 package.json unit test: the 3 commands, activation events, settings with defaults, colours (6 ids, exactly one dot each, explicit hex defaults, no charts.*), untrustedWorkspaces false", "AT5.3 Initialize on an empty scratch folder writes the scaffold (via planInitialize), validates the subject name, and handles the git offer (test arg)", "AT5.4 One BoardPanel per root; the serializer state holds root and subject and a reopened panel restores them", "AT5.5 VS Code smoke flow on the copied sample (pending integration where it needs WP1-WP4): 4 cards; after refresh semantic fresh and 9 vocabulary items; addNode writes a block to Model/Spyro/Inbox.lean and undo removes it; G→A on cynder-not-good adds the axiom and the refresh shows assumed; copyText puts the code on the clipboard (env.clipboard.readText); initGit + historyList + historyRevert work; historyPreview opens a diff editor; openInEditor opens Main.lean; .telelean/graph.json exists", "AT5.6 Isolation: the real ~/.copilot, ~/.config/Code and ~/.config/google-chrome are unchanged after the smoke run; no leftover VS Code or telelean-* processes or units", "AT5.7 Unit tests: protocol message → BoardAction mapping (all mutating types), FileChange → WorkspaceEdit minimal edits, TextSource prefers open documents, openInEditor refuses paths outside the root, actionResult/notice posting with requestId"]
- **id:** WP6
  - **title:** webview board UI: vocabulary group, cards with the 4 turn-9 requests, edits, drop zones, tray, subject picker, history dropdown, Lean badge, Undo
  - **owned_paths:** ["packages/webview/**", "packages/extension/dist/webview/**"]
  - **brief:** Read docs/m1-plan.md (safety rules at the top; sections 1.3, 5.1, 5.5, 6.2, 6.3, 6.4, 7.3, 8, 10, 12 (R5), 13, 14) and follow its safety rules:
- Playwright uses the installed Chrome (no browser download), one worker, an isolated HOME/XDG (plan 10) and `ulimit -c 0`;
- do not run the VS Code smoke test (WP5's);
- `free -m` before running Chrome.

GOAL. The M1 board in React 19 + zustand, built by Vite into packages/extension/dist/webview. It consumes only `@telelean/core`: protocol (frozen; do not edit), model types, `kindChangeImpact` (already implemented), samples (frozen: `spyroGraph`, `spyroProvedGraph`, `largeGraph` carry the M1 card data). Keep the M0 strict CSP: no inline styles; use the CSSOM, CSS classes and `--vscode-*` variables, with fallbacks for the new contributed colours `--vscode-telelean-vocabulary` and `--vscode-telelean-highlight`.

STORE:
- Handle all host messages: graph (idempotent by seq), workspace, history, actionResult, notice.
- Mutations carry a requestId (`r<n>`). Optimistic updates for drag, add and reorder roll back on `actionResult` ok:false with an error toast.

UI:
1. VOCABULARY GROUP at the top of the Assumptions list: collapsible (state kept), grouped Types / Predicates & relations / Constants / Presuppositions (chips 'assumes characters exist', made from the sort's gloss: 'assumes <gloss> exist', falling back to 'assumes there is a <shortName>') / Definitions / Lemmas / Unmarked axioms (warning). Box-shaped items show shortName, type (mono) and gloss (italic with a marker if glossBy is 'agent'). Each item is highlightable (scroll into view within the column plus a ~2 s `data-highlight` flash).
2. CARD FACE (M0 plus):
   - aura and proof chip for every ProofStatus kind and flag (pending-promotion 'promotion pending', conditional 'conditional on …', proved-goal 'proved: make Derivation?', uses-sorry, missing-holds, not-checked, stale as a subtle 'checking…' marker);
   - one 'needs attention' badge counting error/warning diagnostics for the node;
   - a 'uses:' line when lean.uses exists. Deterministic truncation: the first 2 short names, then ', …' when there are more, plus a toggle '▾ N' that opens a dropdown listing all with kind and gloss. Clicking an entry highlights the vocabulary item.
3. EXPANDED VIEW:
   - the Lean code in a <pre>. Drag inside it must select text and never drag the card: canDrag false for pointer-downs inside the code, `draggable=false` and `user-select:text` on the code, and if Chrome still starts a drag, toggle the card's draggable attribute on pointerdown inside the code (plan R5). Clicks in the code do not toggle card selection;
   - identifiers covered by lean.refs are spans: hover shows a tooltip with the gloss (vocabulary) or the sentence (node refs); a plain click highlights the vocabulary item, or for nodeId refs reveals and flashes that card; Ctrl/Cmd+click is reserved (no action yet);
   - a Copy button posts `copyText` with exactly lean.code;
   - an 'Open in editor' button posts openInEditor with codeLoc or loc;
   - footprint and presuppositions lists;
   - buttons 'Make Assumption/Derivation/Goal' (the keyboard/menu equivalent of drop zones, using the same impact and dialog), Edit, Delete.
4. INLINE EDIT of the sentence, rationale ('because:' line), and stance/source chips → editNode (Enter saves, Escape cancels; an empty rationale removes it).
5. DELETE DIALOG listing nodes that declare it as a premise (from declared edges) and proofs that use it (`proofDependents`), with options 'Delete card and its Lean code' (default), 'Delete card only, keep Lean' (explain the hidden-assumption consequence) and Cancel → deleteNode.
6. DRAG: within a column → reorder (M0 posted nothing). Across columns, the drop zones show `kindChangeImpact(graph, id, to).summary`. On drop: needsConfirmation opens the dialog (dependents list; 'Rewrite them to take it as a hypothesis' disabled unless rewriteAvailable; 'Keep them, marked broken'; Cancel); asksRationale shows an optional 'Why do you hold it?' field (Skip allowed) → kindChange with dependents/rationale.
7. A|D|G BOX: stance chips for Assumption (I believe it / It's a rule or definition / Supposing, for argument); a why field whose placeholder follows the stance and kind ('Why do you believe it?' / 'Where does the rule come from?' / 'What are you exploring?'; D: 'Why do you think it follows?'; G: 'Why do you care?'); optional source chips (observed/reported/inferred/common knowledge) → addNode with rationale/stance/source.
8. TRAY: presupposition chips from lean.presupposes of the selected nodes; 'These suffice ▶' posts theseSuffice; with zero premises a disabled 'Self-evident?' plus the note 'available with Claude in M2'.
9. HEADER:
   - subject picker (workspace.subjects with counts; 'New subject…' inline with isSubjectName validation → createSubject; selecting → selectSubject);
   - History dropdown (posts historyList on open; entries 'time · action · label'; storage 'This subject: 12 KB · All subjects: 30 KB'; per entry Preview (historyPreview, compare parent) and 'Revert to this' (confirm → historyRevert); 'Keep last N' → historyPrune; when history.state is no-repo, an 'Initialize git' button → initGit; git-missing/disabled/error messages);
   - Lean badge per SemanticSummary state (plan section 4 mapping; click → refresh), a problems list (diagnostics; file items → openInEditor), and the syntactic-mode banner for unsupported-toolchain;
   - undo/redo buttons with the workspace labels.
10. TOASTS from notice (Undo button when undoable → undo). Ctrl+Z / Ctrl+Shift+Z (and Ctrl+Y) on the board when focus is not in an input, textarea or contenteditable → undo/redo.

HARNESS (test/harness/harness.js):
- reply to mutations with actionResult ok;
- answer historyList with a canned listing;
- let tests inject host messages (workspace, notice, actionResult failures).

In playwright.config.ts, `launchOptions.env` gets HOME, XDG_CONFIG_HOME, XDG_CACHE_HOME and XDG_DATA_HOME inside the run's short temp dir, and args `--disable-crash-reporter --disable-breakpad --no-first-run`. The test:e2e script is `sh -c 'ulimit -c 0; playwright test'`. Compare the real ~/.config/google-chrome listing before and after.

Update M0 tests whose expectations the plan changed (e.g. reorder now posts) and say so. RUN: `cd packages/webview && npm test` (typecheck, build into dist/webview, unit, e2e). Report the files, the test output, before/after home-dir listings, and open issues for frozen files.
  - **acceptance_tests:** ["AT6.1 Store: graphs apply idempotently by seq; selection and expansion survive; workspace/history/notice messages are stored; an optimistic drag/add/reorder rolls back on actionResult ok:false and shows an error toast", "AT6.2 The vocabulary group renders the 9 spyroGraph items in sort/predicate/constant/presupposition groups, is collapsible, and shows 'assumes characters exist' / 'assumes games exist' chips", "AT6.3 Cards show the aura for formalised nodes, the right chip for each ProofStatus kind and the M1 flags (pending-promotion, conditional, proved-goal on spyroProvedGraph's goal, uses-sorry, not-checked, stale) and an attention badge counting node diagnostics", "AT6.4 Arrows: declared dashed, verified solid, mismatch styled; the M0 edge-engine e2e tests still pass", "AT6.5 A|D|G box: stance chips (Assumption), a why placeholder per stance/kind, source chips; Enter posts addNode with naturalName, rationale, stance and source", "AT6.6 Inline edit of the sentence, rationale, stance and source posts editNode; Escape cancels; an empty rationale posts null", "AT6.7 The delete dialog lists premise dependents and proof dependents (spyroProvedGraph cynder-dark-past → cynder-not-good) and posts deleteNode with the chosen keepLean", "AT6.8 Dragging within a column posts reorder with the right beforeId", "AT6.9 During a cross-column drag the drop zones show kindChangeImpact summaries (e.g. 'Make Derivation: promotion pending until proved'); dropping cynder-dark-past on Goals in spyroProvedGraph opens the dialog listing cynder-not-good, with rewrite enabled (fresh) and disabled when semantic is stale, and posts kindChange with dependents; G→A offers the optional rationale field", "AT6.10 Ctrl+Z / Ctrl+Shift+Z post undo/redo, but not while typing in an input; a notice with undoable shows an Undo button that posts undo", "AT6.11 The tray shows presupposition chips from lean.presupposes; These suffice posts theseSuffice; zero premises shows a disabled 'Self-evident?' with the M2 note", "AT6.12 The subject picker lists workspace subjects and posts selectSubject; New subject validates the name and posts createSubject", "AT6.13 The history dropdown posts historyList on open and renders 'time · action · label' entries and the storage counter text; Preview posts historyPreview; Revert asks then posts historyRevert; Keep last posts historyPrune; the no-repo state shows 'Initialize git', which posts initGit", "AT6.14 The Lean badge text covers every SemanticSummary state; the problems list items post openInEditor; the unsupported-toolchain banner appears", "AT6.15 Playwright runs with HOME/XDG inside the run's temp dir and ulimit -c 0; the real ~/.config/google-chrome listing is unchanged after the run", "AT6.16 Request 1: a mouse drag across the expanded Lean code of cynder-dark-past gives a non-empty window.getSelection() containing code text, posts no reorder or kindChange, and the card never gets data-dragging; dragging the card face still works", "AT6.17 Request 2: the cynder-not-good card shows 'uses: GoodAddition, cynder, …' with '▾ 3'; the dropdown lists GoodAddition, cynder and newSpyro with glosses; clicking one highlights it in the vocabulary group; cards without lean.uses show no line", "AT6.18 Request 3: the Copy button posts copyText whose text equals node.lean.code exactly, and the 'Copied' notice shows", "AT6.19 Request 4: hovering the HasDarkPast span in cynder-dark-past's code shows 'has a dark past'; clicking it expands the vocabulary group, scrolls the item into view and sets data-highlight; in spyroProvedGraph, clicking pg_no_dark_past.holds in the goal's proof reveals and flashes the pg-no-dark-past card; Ctrl+click does nothing", "AT6.20 No CSP violations; the M0 e2e suite still passes (with any expectation changes the plan requires noted)"]

## contracts
- /home/zhengyew/telelean/packages/core/src/index.ts
- /home/zhengyew/telelean/packages/core/src/model.ts
- /home/zhengyew/telelean/packages/core/src/graph.ts
- /home/zhengyew/telelean/packages/core/src/facts.ts
- /home/zhengyew/telelean/packages/core/src/actions.ts
- /home/zhengyew/telelean/packages/core/src/paths.ts
- /home/zhengyew/telelean/packages/core/src/layout.ts
- /home/zhengyew/telelean/packages/core/src/kindChange.ts
- /home/zhengyew/telelean/packages/core/src/protocol.ts
- /home/zhengyew/telelean/packages/core/src/notImplemented.ts
- /home/zhengyew/telelean/packages/core/src/markup/types.ts
- /home/zhengyew/telelean/packages/core/src/markup/api.ts
- /home/zhengyew/telelean/packages/core/src/markup/index.ts
- /home/zhengyew/telelean/packages/core/src/project/types.ts
- /home/zhengyew/telelean/packages/core/src/project/index.ts
- /home/zhengyew/telelean/packages/core/src/edit/types.ts
- /home/zhengyew/telelean/packages/core/src/edit/index.ts
- /home/zhengyew/telelean/packages/core/src/export/graphJson.ts
- /home/zhengyew/telelean/packages/core/src/export/index.ts
- /home/zhengyew/telelean/packages/core/src/samples/spyro.ts
- /home/zhengyew/telelean/packages/core/test/contracts.test.ts
- /home/zhengyew/telelean/packages/core/test/protocol.test.ts
- /home/zhengyew/telelean/packages/runner/src/index.ts
- /home/zhengyew/telelean/packages/runner/src/semantic/types.ts
- /home/zhengyew/telelean/packages/runner/src/semantic/index.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/types.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/index.ts
- /home/zhengyew/telelean/packages/runner/tsconfig.json
- /home/zhengyew/telelean/packages/runner/vitest.config.ts

## integration_plan
The integrator owns the frozen files and runs every heavy step one at a time (check `free -m` first; `LEAN_NUM_THREADS=4`; `TELELEAN_TEST_TMP` set to a scratch dir).

1. Owned-path discipline. Diff each WP's changes against its owned paths. Review the plan's section-14 entries (additive contract changes) and the builders' open issues about frozen files, such as protocol, model or samples changes they needed. Apply the accepted ones yourself.

2. Remove the stub gates. Delete every `isImplemented(...)` skip gate, and the trivial stub test in contracts.test.ts. Typecheck core (`tsc -p packages/core/tsconfig.test.json`), runner, webview (both configs) and extension. Check that extension/tsconfig has the `@telelean/runner` path, and that the esbuild bundle does not evaluate `llm/confinement.ts` (`import.meta.url`).

3. Package suites:
   - core `npm test`;
   - runner `npx vitest run` (M0 lean/llm plus WP3 semantic plus WP4 workspace; the Lean tests use sandboxed runLean);
   - webview unit tests;
   - extension unit tests.

4. New integrator-owned end-to-end test, `packages/runner/test/integration/`. It uses a scratch copy of `mental_model/`, a fs `EditApplier`, the real refreshLeanFacts, and `git init` in the copy (with `GIT_CONFIG_GLOBAL=/dev/null` and the safe `-c` flags):
   - `load` → the Spyro graph has 4 nodes in fixture order;
   - `refreshNow` → fresh. Compare `subjectGraph` card data against the frozen sample: cynder-dark-past and new-spyro-pg are `assumed`, the goal is unproved, there are 9 vocabulary items, and `uses`/`refs`/`presupposes` equal the sample's;
   - perform each action and check the files: add-node (block in Inbox.lean, layout appended); edit-node (docstring mirror follows); set-premises; reorder (layout only, not snapshotted); G→A on the goal (axiom added; after refresh `assumed`); undo and redo; A→G on an assumption the goal's proof uses, with the proved overlay applied by hand, once with mark-broken and once with rewrite; delete;
   - history: entries exist with trailers, the storage counter is above 0, and revert works and can itself be undone;
   - `graph.json` parses and validates against the zod schema;
   - the copy's `git status --porcelain`, `.git/index` mtime, HEAD and branches are unchanged, and no hook ran.
   Also re-check WP2's hand-written spyro-facts.json against WP3's real facts for the fixture; fix whichever side is wrong.

5. Lean round-trip of the escape rule. Render and edit blocks whose sentences and bodies contain `-/`, `/-`, `/-/`, `-/-`, a leading quote and a newline. Build the scratch project under runLean: it must succeed, and re-parsing must give identical values.

6. Webview and extension together. Run `npm run build` in webview (writes dist/webview), then Playwright with an isolated HOME. Then the extension build plus the VS Code smoke test under xvfb with the isolated profile of plan section 10 (copied sample: add, undo, kind change, copy to clipboard, history with revert and preview, graph.json). Compare the listings of the real `~/.copilot`, `~/.config/Code` and `~/.config/google-chrome` before and after; check that no telelean-* units or test processes are left; check that `~/.elan/known-projects` is unchanged.

7. Rebuild `packages/extension/dist` (extension and webview) last, so the user's in-place installed extension shows M1 after "Developer: Reload Window".

8. Write `docs/m1-report.md`. Include real test outputs, deviations from the plan, and the decisions log from plan section 13 plus any builder decisions, for the user to read later. The smoke test is the proxy for the user's own VS Code: never use the user's VS Code profile or windows.

## minor_decisions
- **decision:** Per-card vocabulary ('uses:'), hover glosses and click targets come from Lake's .ilean files (v5: decl ranges and references with their parent declarations). Kind, type, statement value, footprint and sorry come from a generated check file (#check @N, #print N, #print axioms N with pp.fullNames and pp.proofs false). There is no compiled extractor and no `import Lean` in M1.
  - **rationale:** Verified on Lean 4.35: exact resolved references (e.g. Spyro.cynder in Spyro.cynder_dark_past), about 0.3 s and 480 MB for the check; it keeps 03 §5's tool-free M1. The toolchain is pinned, so the internal format is stable, and unknown versions degrade to 'no refs'.
- **decision:** Lean refresh builds in place in the model folder (sources read-only, .lake writable, .git masked), not in a shadow. A module is fresh unless Lake failed it or one of its imports failed; Lake deletes failed modules' .olean/.ilean. Sources are hashed before and after, to mark stale files.
  - **rationale:** This matches 03 §8.4 and is incremental and fast. Staleness keyed by file hash is 03 §2 step 3.
- **decision:** Opt-in marker is .telelean/config.json (with the library name), not layout.json.
  - **rationale:** Layout is per subject and optional; a dedicated config file is a clearer marker and holds project settings.
- **decision:** Sidecars are per subject: .telelean/subjects/<S>/layout.json and attic/<id>.lean. graph.json stays at the root (gitignored).
  - **rationale:** A subject's history snapshot and revert then cover exactly its own files (D-10 plus A3's per-subject counter).
- **decision:** History uses one git ref chain per subject (refs/telelean/<rootKey>/subjects/<S>) plus a project chain, built with plumbing only (temporary index, commit-tree, update-ref) and always -c commit.gpgsign=false -c core.hooksPath=/dev/null -c gc.auto=0 with an explicit author.
  - **rationale:** Revert stays per subject; the storage counter is per subject and overall; the user's index, branches and hooks are never touched, as D-33/A3 promised.
- **decision:** Layout-only changes (re-order) are undoable but not snapshotted on their own.
  - **rationale:** Layout carries no meaning, and per-drag entries would flood the history the user wants for meta-analysis.
- **decision:** 'Keep last N' rewrites the chain and does not run git gc on the user's repository.
  - **rationale:** Running gc or prune on the user's repo is invasive. The counter (reachable objects) drops at once, and the disk space returns at git's next housekeeping.
- **decision:** mental_model/ is written without .lake and without git init. The board offers 'Initialize git' when the user wants history there.
  - **rationale:** mental_model sits inside /home/zhengyew/telelean, which must stay git-free. git init is the user's choice (Initialize offers it).
- **decision:** In M1, 'These suffice' writes the target's premises: (declared support, D-13) and says proving with Claude comes in M2. Zero premises ('Self-evident?') answers 'available from M2'.
  - **rationale:** M1 has no AI; the press still does what D-13 defines for it. Self-evidence is meaningful only with a run.
- **decision:** Strict D-2(b): a block bound to anything other than a Prop abbrev/def is flagged TL113 (ill-formed).
  - **rationale:** telelean writes and reads only the approved convention; guessing other shapes would make statuses unreliable.
- **decision:** Statuses of files whose facts are stale fall back to syntactic keywords (axiom vs theorem), shown with a 'stale' flag until the refresh.
  - **rationale:** The board updates instantly after an edit without claiming Lean has checked it.
- **decision:** 'uses:' = vocabulary in the statement closure (the statement's own refs, then refs reached through other nodes' statements), first-occurrence order; sorts appear only where written. Inline it shows the first 2 names then ', …', with a '▾ N' dropdown.
  - **rationale:** This follows the user's 'HasDarkPast, cynder, ...' example deterministically (testable) and works even for large vocabularies.
- **decision:** Clicking another node's name inside the expanded code reveals and flashes that card (as well as the requested vocabulary highlight). Ctrl+click is reserved for later.
  - **rationale:** It is a natural extension of the user's hover/click idea at the same cost, and keeps Ctrl+click free for their planned go-to/edit features.
- **decision:** Glosses are shown as the user's wording in M1 (glossBy 'user'); M2 marks agent-worded docstrings.
  - **rationale:** There is no agent in M1; D-3's 'Claude's wording until you rewrite it' becomes relevant only when runs create vocabulary.
- **decision:** Instances that only re-export a presupposition (instance : Nonempty T := T.exists) are not listed in the vocabulary group.
  - **rationale:** They are plumbing for the presupposition chip and would clutter the group.
- **decision:** wording.jsonl and attempts.jsonl are not written in M1.
  - **rationale:** History snapshots keep every old wording; attempts only exist once runs exist (M2).
- **decision:** The graph.json JSON Schema is generated from a zod schema (z.toJSONSchema) kept out of the webview bundle.
  - **rationale:** zod is a declared, installed dependency; ajv is not declared, and no package may be added.
- **decision:** The runner is typecheck-only (noEmit); runner and extension resolve @telelean/core (and the extension @telelean/runner) from source through tsconfig paths and vitest aliases.
  - **rationale:** The extension and webview already do this; no build step or workspace links are needed, and stale dist output is avoided.
- **decision:** Applying an edit saves the touched files, including any unsaved typing in them.
  - **rationale:** D-17 says edits are saved immediately; history and undo need the result on disk.
- **decision:** New subject import order: Vocabulary ← Inbox ← Main (Main imports Inbox).
  - **rationale:** Nodes formalised by hand in Inbox can then be used by Main without moving code.
- **decision:** No port-drag arrows in M1. The expanded card has 'Make Assumption/Derivation/Goal' buttons as the keyboard and menu equivalent of the drop zones.
  - **rationale:** The tray already declares support; the buttons give accessibility and testability with the same impact/dialog logic.
- **decision:** Contributed colour ids keep exactly one dot and get explicit per-theme hex defaults (no charts.*); telelean.vocabulary and telelean.highlight are added.
  - **rationale:** These are M0 lessons (VS Code replaces only the first dot; some themes derive charts.* badly).
- **decision:** The architect implemented the protocol validators, kindChangeImpact, the layout/path helpers, runExclusive and readMemAvailableBytes as part of the contract; subjectScaffold is a shared stub owned by WP2 and also used by WP4.
  - **rationale:** The webview can build and test drop zones and messages without waiting for the host, and Initialize and New subject write identical subject files.
- **decision:** requestId is optional on all mutating messages (actionResult only when given); theseSuffice now accepts empty premises.
  - **rationale:** This keeps the M0 webview compiling and its tests valid during the parallel build, and leaves room for M2's self-evident runs.

## major_decisions_needing_user

## effects_outside_repo
- Scratch dir writes: /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m1-architect/ holds:
- a copy of test-fixtures/spyro (spyro/), with a `.lake/` build and a modified Model/Spyro/Main.lean used for probes;
- check1.lean and check2.lean;
- time1.txt;
- an empty runner-tmp/ (the runner tests' temp root; the tests cleaned up after themselves).
- Ran the toolchain's lake/lean directly (unsandboxed) on that scratch copy of the trusted Spyro fixture: `lake build` three times, `lake env lean --stdin --json` twice, plus /usr/bin/time. These wrote only inside the scratch copy. ~/.elan/known-projects stayed at 37 lines (checked before and after).
- The runner test suite (sandboxed Lean via runLean) created transient systemd user scopes named telelean-t<pid>-N. All ended; `systemctl --user list-units 'telelean-*'` was empty afterwards, and no test processes were left running.
- npm (through npx and `npm test`) wrote 9 debug logs to ~/.npm/_logs, timestamped 10:53-10:57 +0800 on 2026-11-01. npm's own log rotation (logs-max) may have deleted older log files in that folder.
- The Claude Code harness wrote outside the repo: one oversized tool output (the research reference parser listing) under ~/.claude/projects/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/tool-results/, and a background-task output file under /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/tasks/.
- Inside the repo, beyond my owned paths: vitest refreshed its result caches (packages/*/node_modules/.vite/vitest/.../results.json and .vite-temp dirs). I deliberately changed packages/runner/tsconfig.json and packages/runner/vitest.config.ts; these are the minimal stubs listed in contracts.
- No downloads, no npm installs, no git commands, no network use, no Claude CLI runs, and no changes to the user's VS Code, ~/.config, ~/.claude settings, ~/.elan or git config. The two `lake serve` processes running on this machine (for ~/webring and test-fixtures/spyro) belong to the user's VS Code Lean extension and were not touched.

