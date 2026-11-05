# plan:review (agent a034647318bd77191)

## plan_path
/home/zhengyew/telelean/docs/m1-plan.md

## summary
I reviewed the M1 plan and its contract code and fixed what was wrong. The corrected plan is /home/zhengyew/telelean/docs/m1-plan.md (546 lines); section 15 lists each change with its evidence, section 14 logs the contract edits, and minor decisions 20-31 are mine. I checked the main claims on a scratch copy of the Spyro fixture with extra declarations, built with the toolchain's own lake; ~/.elan/known-projects stayed at 37 lines.

Problems found and fixed:
1. Verified arrows and D-11 dependents were wrong for derivations. `#print axioms` lists only axioms (verified: `theorem g2.holds := d0.holds.2` lists only d0's assumptions). So footprint-based edges would draw no derivation-to-goal arrow, and `proofDependents` would let D-to-G delete a `.holds` another proof uses, which D-11 forbids. Verified edges now come from the `.ilean` references, followed through untracked lemmas. The footprint still comes from `#print axioms`, and TL107/TL109 are judged at the assumption level.
2. The mechanical hypothesis rewrite put the new binder after the existing ones. Then `(c h)` passes `h` to the wrong parameter. The binder now goes first. The rewrite is refused (`unsafe`) when a dependent is not a theorem, or when a use doesn't show in the references.
3. Lean prints `instance : Nonempty T := T.exists` as a theorem (verified). `kind: 'instance'` now comes from the source keyword, and anonymous instances are matched by start line.
4. Hidden assumptions couldn't be told from vocabulary by type text. Added a `#check type_of% @N` probe (`DeclFacts.typeSort`, verified output) and exact D-3 shape rules, including flagging `axiom c : T` (TL111).
5. `#check` output wraps long types over several lines (verified), so the type is now whitespace-normalised before parsing.
6. Stale and failed files: the old syntactic fallback could show an unchecked theorem as proved, and statuses would flicker while typing. A stale file now keeps its previous facts by name, Lean-unchecked theorems are never shown as proved, and a build error makes only the node containing it ill-formed.
7. Projects with Lake dependencies (Mathlib) weren't guarded at all. They are now refused: new `FactsStatus` `unsupported-project`, and Initialize returns `unsupported` (D-28 explicit opt-in; the RAM rule).
8. `planInitialize` had no way to see an existing `.gitignore`. `FolderInspection` now carries its text.
9. WP2 and WP4 would have written the scaffold texts independently. The exact texts are now frozen; I implemented and tested `subjectScaffold` and built its output with Lean 4.35.
10. Core tests could not read fixture files: core has `types: []`, so no `node:fs`. Added `test/raw-imports.d.ts` for Vite `?raw` imports (verified with tsc and vitest).
11. `spyroProvedGraph()` didn't match the overlay it cites: pg-no-dark-past is pinned there, its code lacked the docstring line, and all block `loc`s were off. Corrected.
12. Risk R2 claimed Lake locks builds. It doesn't: the lock was removed in lean4#2445, as the toolchain sources show. R5 now explains that only toggling the card's `draggable` attribute lets Chrome select text in the code.

Smaller fixes:
- Lake log line formats documented, including replayed warnings and full multi-line messages.
- A list of the lines that end a declaration's span.
- Derived-id collisions resolved by suffix.
- D-8 pinning of adjacent bindings on the next edit.
- The host always derives new node ids.
- Docstring writes escape `/-` too (the plan text had lost the unicode escape characters; restored).
- TL102, TL108 and TL111 defined.
- Board: the M0 legend gains the new arrow kinds; the expanded card gets Depends on / Used by; the D-13 hint on an assumption with premises.
- The delete dialog also lists statements that mention the node.
- Graph versions seeded from `Date.now()`.
- Git calls also turn off `core.fsmonitor`; git tests set `GIT_CEILING_DIRECTORIES`.
- No `.telelean/config.json` outside `mental_model/` and `test-fixtures/`.
- A WP5 smoke-test fallback while `mental_model/` is still empty.
- Leftover-unit checks look only at your own run id.

Tests run after the fixes:
- core `npm test`: 38/38 passed;
- `tsc` clean for runner, webview (both configs) and extension;
- webview vitest 24/24, extension vitest 4/4.
- Not re-run: the runner suite (I changed only runner types and docs), Playwright and the VS Code smoke test.

All six work packages keep the architect's owned paths. Nothing needs the user's decision.

## work_packages
- **id:** WP1
  - **title:** core markup and Lean-text primitives (lexer, parser, binder, serializer, text edits, LeanOps)
  - **owned_paths:** ["packages/core/src/markup/**", "packages/core/test/markup/**", "packages/core/test/fixtures/markup/**"]
  - **brief:** Read docs/m1-plan.md first: the safety rules at the top, and sections 0 (reading fixtures with ?raw), 5.2, 6.1, 6.2, 6.5, 6.7, 9, 14 and 15.

SAFETY (mandatory; also for anything you start):
- Never push, add remotes or use gh.
- Never publish or send anything to anyone.
- Network only to read docs.
- No downloads, no npm install, no new packages. Report a need in open issues.
- Never run the Claude CLI with a prompt. Never read credentials.
- Write only inside your owned paths and your scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/<your-label>/.
- Never touch the user's VS Code settings or extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, the npm config or the global git config.
- No sudo, no global installs. Do not run git in /home/zhengyew/telelean.
- Run free -m before heavy steps. Kill only processes you started.
- Report every effect outside the repo. Never claim a test passed unless you ran it; quote real output.

GOAL
Implement packages/core/src/markup/.
- The types are frozen in markup/types.ts. You may add OPTIONAL fields or new exports only, each recorded in plan section 14.
- Replace the stubs in markup/api.ts. You may split it into modules, as long as markup/index.ts keeps exporting every name.
- Core is pure TypeScript with no Node or DOM APIs (lib ES2023, types: []); the webview bundles it.
- Tests read fixture files through Vite ?raw imports, e.g. import mainLean from '../../../../test-fixtures/spyro/Model/Spyro/Main.lean?raw'. packages/core/test/raw-imports.d.ts declares them. Do not use node:fs.

REFERENCE
Port the research prototype in verbatim_prompt_log/bundle_1/subagent_reports/research_workflow/artifacts/r4-markup-lsp/:
- proto/telelean_ref.py (lexer, parse_block, FileModel, bind);
- proto/test_telelean_ref.py (20 tests);
- scripts/gen_lex_tests.py (the lexing cases L01-L20).
Read them as data. If you run Python at all, use python3 -I.

RULE CHANGES vs the reference (02/03)
- type: is canonical; kind: is a silent alias (no TL018).
- There is no DEFINITION kind.
- No TL016 for a missing version marker: absent means v1.
- premises is allowed on every node type (no TL012).
- Known fields (03 section 3.2):
  - id;
  - type: ASSUMPTION, DERIVATION or GOAL; lower case is accepted with a TL019 hint;
  - natural_name, rationale;
  - stance: believe, rule or supposing;
  - source: observed, reported, inferred or common;
  - asserted: YYYY-MM-DD;
  - premises, lean, supersedes, refines, tags;
  - origin: user or agent; session; worded_by: user or agent.
- Dotted keys and unknown keys are kept verbatim, in order, in extensions. An unknown non-dotted key also gets TL002.
- Required fields: type and natural_name (TL003).
- A block with no id: gets deriveId(natural_name), made unique within the file, idWritten false, and TL112 (info).
- Other diagnostics:
  - TL001 malformed line;
  - TL004 invalid value;
  - TL005 duplicate scalar field;
  - TL008 newer version (the block is kept);
  - TL009 block inside a doc or module-doc comment (ignored);
  - TL010 unterminated comment;
  - TL011 info for an ASSUMPTION without rationale;
  - TL013 hint;
  - TL014.
- Workspace-level duplicates, dangling premises, cycles and double binding belong to WP2.

LEXER (lexLean, Lean 4.35 rules)
- Double-dash line comments.
- Nested block comments.
- Doc comments (/--) and module-doc comments (/-!); the nesting scan starts right after the slash-dash.
- Strings with escapes, char literals, raw strings r#"..."#.
- Dotted identifiers with guillemet parts; isIdFirst/isIdRest include the letter-like and subscript Unicode tables of the Python.
- Numbers and single-character symbols.
- An unterminated comment runs to EOF.

PARSER (parseLeanFile; it never throws)
- A block is a plain block comment whose first non-blank line matches the @@ telelean marker with an optional vN.
- Field lines are key: value. A value starting with a double quote is a JSON string (parseFieldValue); otherwise it is the trimmed raw text. Never YAML.
- Lists split on commas, with optional brackets; a repeated list key accumulates.
- The body after --- is dedented, with its escapes kept.
- FieldLine spans let edits touch a single line.
- imports come from the header's import lines.
- Pinned lean: names are taken as written (fully qualified by convention; WP2 resolves fallbacks).

DECLARATIONS (DeclInfo), found by a header parser
- docstring, @[...] lists, modifiers (private public protected meta noncomputable unsafe partial nonrec scoped local);
- keyword, including class inductive, class abbrev, mutual and example;
- name (with guillemets), and instance (priority := ...) name;
- namespace/section/end tracking with _root_; fullName is the resolved name.
- span runs from the docstring/attribute/modifier start to the end of the last non-blank line before the next command start.
- A command start is exactly plan 6.1's list: a column-0 line beginning with a declaration keyword, a modifier, @[, a doc comment opener, a module-doc opener, a block comment opener, a double-dash line comment, end, namespace, section, open, export, variable, universe, set_option, attribute, notation/infix/infixl/infixr/prefix/postfix, macro, macro_rules, syntax, elab, deriving, initialize, a #-command or import; or EOF.
- valueStart is the first top-level :=, where or | after the signature, skipping brackets, strings and comments.

BINDING
- A pinned lean: field wins; its first name is the statement.
- Otherwise Go-style adjacency: the next declaration with no blank line between the block's closer and it. Plain comments, a docstring and attributes may sit in between.
- Another block, a blank line or EOF means code-less. Give TL013 (hint) when a declaration follows after a blank line, and TL014 for example/mutual.
- statement is fully qualified.
- Positions are UTF-16 offsets (JS string indices); ranges are LSP-style via lineIndex. CRLF files keep CRLF.

SERIALIZER
The exact rule is in plan 6.7; read the plan text for the exact characters.
- A value is raw unless it contains a comment delimiter, starts with a double quote, contains a line break or control character, or has leading/trailing spaces.
- Otherwise it is a JSON string in which:
  - every slash followed by a dash becomes the 6-character JSON unicode escape of a slash (backslash, u, 0, 0, 2, f);
  - every other slash preceded by a dash becomes backslash-slash.
- Body text uses escapeBodyText: dash-backslash-slash and slash-backslash-dash.
- renderBlock writes the opener, the v1 marker line, the fields in FIELD_ORDER, then --- and the body if any, then the closer, with no trailing newline.
- Lists are written a, b, c.

IDS (deriveId)
- NFKD, strip combining marks, lower-case; non-alphanumerics become -; at most 6 words.
- When nothing is left (non-Latin text): n- plus 6 hex digits of FNV-1a 32-bit over the UTF-8 bytes of the trimmed sentence (core has no crypto).
- Make it unique via taken with -2, -3, …
- The result must match ID_PATTERN.

TEXT PRIMITIVES
- applyTextEdits applies non-overlapping edits, in any order.
- setBlockField:
  - changes only the target line;
  - inserts a missing key at its FIELD_ORDER position;
  - removes the line for null;
  - escapes values;
  - also writes id: when idWritten is false.
- removeBlockEdits removes the comment, its line break and one blank line.
- insertBlockEdits keeps one blank line between neighbours.
  - end-of-namespace inserts before the end <ns> of the last matching namespace, else at EOF.
  - after-block inserts after the block and the declarations bound to it.

applyLeanOps
All or nothing: a non-empty problems list means nothing is applied. Semantics are in the LeanOp docs and plan 6.2.
- add-holds-axiom: insert axiom <rel>.holds : <rel> on the line after the statement declaration (rel = relativeName(statement, decl.namespace)).
- holds-theorem-to-axiom: replace the whole theorem declaration (with its docstring) by that axiom line, and return the old text in archived.
- remove-holds / remove-decl: delete the declaration with its docstring and one trailing blank line; archive it when asked.
- add-hypothesis: insert ' (<hypName> : <hypType>)' RIGHT AFTER the declaration's name, before any existing binders (the new hypothesis becomes the first explicit argument), and replace each given span by hypName.
- apply-hypothesis: wrap each span as (<occurrence> <hypName>). When the occurrence is immediately preceded by @, include the @: (@c h).
- set-docstring: replace or insert the doc comment, with the text escaped by escapeBodyText (doc comments nest, so both delimiters must be escaped).
All edits must be non-overlapping. A missing declaration or an unexpected shape goes into problems.

RUN
cd packages/core && npm test (tsc on src and test, then vitest).
Do not edit frozen files: index.ts, model.ts, facts.ts, protocol.ts, samples, the contracts/protocol/samples tests, raw-imports.d.ts.
Report the files you wrote, the real test output, any additive contract changes and the effects outside the repo.
  - **acceptance_tests:** ["AT1.1 Lexer: the lexing cases of scripts/gen_lex_tests.py (nested comments, stray closers and openers, escaped values, doc/moddoc comments, string/char/raw-string literals hiding markers, tabs, CRLF, non-BMP characters, the triple-dash docstring, unterminated EOF) yield the expected comment kinds, spans and code tokens", "AT1.2 The non-graph research tests (Lexing 5, Values 7, Binding 6) are ported to vitest with the 02/03 rule changes: type canonical, kind a silent alias, no DEFINITION kind, no TL016/TL018, premises allowed on any type", "AT1.3 Parsing test-fixtures/spyro/Model/Spyro/Main.lean (read via ?raw) gives 4 blocks with the sample's ids, fields and block ranges (lines 4-11, 13-22, 27-36, 41-49). pg-no-dark-past is code-less; the other three are pinned to Spyro.cynder_dark_past / Spyro.new_spyro_pg / Spyro.cynder_not_good. decls include Spyro.cynder_dark_past.holds (keyword axiom, no valueStart), with spans ending on their own line. imports = [Model.Spyro.Vocabulary]. Vocabulary.lean gives 11 decls, including two anonymous instances (keyword instance, no name)", "AT1.4 Escape round-trip and property test: random values over an alphabet with slash, dash, double quote, backslash, newline and space (including the two comment delimiters, slash-dash-slash, dash-slash-dash, a leading quote and leading spaces) go through renderBlock then parseLeanFile and come back identical. lexLean finds exactly one terminated block comment in every rendered block. A slash before a dash is written with the 6-character unicode escape of plan 6.7", "AT1.5 renderBlock writes fields in FIELD_ORDER under the v1 marker, escapes the body, and preserves CRLF when eol is CRLF", "AT1.6 setBlockField/removeBlockEdits/insertBlockEdits: only the targeted line(s) change (the rest of the file is byte-identical). A missing key is inserted at its FIELD_ORDER position; null removes the line; a derived id is written; blank-line spacing stays tidy; CRLF stays CRLF. insertBlockEdits into the subjectScaffold Inbox text (end-of-namespace) leaves exactly one blank line on each side", "AT1.7 applyLeanOps on Spyro texts and the runner-lean proved overlay:\n- add-holds-axiom after cynder_not_good gives 'axiom cynder_not_good.holds : cynder_not_good';\n- holds-theorem-to-axiom archives exactly the theorem's text;\n- remove-holds and remove-decl remove the docstring and the spacing;\n- add-hypothesis on 'theorem d1.holds (h : cynder_not_good) : d1 := ...' gives 'theorem d1.holds (h_x : x) (h : cynder_not_good) : d1 := ...' and replaces the given spans;\n- apply-hypothesis wraps c as (c h_x) and @c as (@c h_x);\n- set-docstring inserts and replaces, escaping both comment delimiters;\n- a missing declaration is reported in problems and no edits are returned", "AT1.8 deriveId: Latin slugs of at most 6 words; uniqueness suffixes; a deterministic n-<6 hex> for non-Latin text; every result matches ID_PATTERN. Two id-less blocks with the same sentence in one file get distinct derived ids, each with TL112", "AT1.9 Declaration spans follow plan 6.1's command starts: a column-0 double-dash comment, set_option, variable, open, attribute and #check lines end the preceding declaration; an indented continuation line does not; a block comment after a theorem ends it"]
- **id:** WP2
  - **title:** core model build, statuses, reference-based edges, vocabulary, diagnostics, edit planning, graph.json
  - **owned_paths:** ["packages/core/src/project/**", "packages/core/src/edit/**", "packages/core/src/export/**", "packages/core/src/graph.ts", "packages/core/src/kindChange.ts", "packages/core/src/layout.ts", "packages/core/src/paths.ts", "packages/core/schema/**", "packages/core/scripts/**", "packages/core/test/project/**", "packages/core/test/edit/**", "packages/core/test/export/**", "packages/core/test/fixtures/project/**", "packages/core/test/fixtures/edit/**", "packages/core/test/fixtures/export/**"]
  - **brief:** Read docs/m1-plan.md first: the safety rules at the top, and sections 0, 2, 5.3, 5.4, 6 (all of it), 7.1, 7.3, 8, 9, 14 and 15.

SAFETY (mandatory; also for anything you start):
- Never push, add remotes or use gh.
- Never publish or send anything to anyone.
- Network only to read docs.
- No downloads, no npm install, no new packages. Report a need in open issues.
- Never run the Claude CLI with a prompt. Never read credentials.
- Write only inside your owned paths and your scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/<your-label>/.
- Never touch the user's VS Code settings or extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, the npm config or the global git config.
- No sudo, no global installs. Do not run git in /home/zhengyew/telelean.
- Run free -m before heavy steps. Kill only processes you started.
- Report every effect outside the repo. Never claim a test passed unless you ran it; quote real output.

GOAL
Implement, as pure TypeScript (no Node or DOM; the webview bundles core):
- project/index.ts: buildProjectModel, subjectGraph.
- edit/index.ts: planAction, planKindChange, planDelete.
  - subjectScaffold is ALREADY implemented with the exact texts of plan 7.1. Keep its output; contracts.test.ts guards it.
- export/graphJson.ts: toGraphJson, plus a zod schema in export/schema.ts. export/index.ts must NOT re-export schema.ts, so zod stays out of the webview bundle.

Contracts
- The types are frozen in project/types.ts, edit/types.ts, export/graphJson.ts, actions.ts, facts.ts, model.ts and markup/types.ts.
- facts.ts now has DeclFacts.typeSort and FactsStatus 'unsupported-project'; model.ts has ProofStatus.conditional.footprint.
- Additive optional changes only, each recorded in plan section 14.
- You also own kindChange.ts, layout.ts, paths.ts and graph.ts. They are implemented: keep their behaviour, since the integrator-owned contracts.test.ts and protocol.test.ts guard it.
- Tests read fixtures with Vite ?raw imports (test/raw-imports.d.ts), and JSON via ?raw plus JSON.parse.
- fileHashes in tests can be any strings that equal the facts' sourceSha256: core only compares them.

INPUTS
ProjectInput = parsed files (WP1's ParsedFile), sha256 per path, optional LeanFacts (facts.ts; produced by WP3 per plan section 4) and the library name.

BUILD (plan 6.1-6.5)

Binding and ids
- Bind blocks to declarations: statement = block.binding.statement.
- A pinned name falls back to resolution against the block's enclosing namespaces when there is no exact match.
- justification = <statement>.holds, from the facts or the syntactic decls.
- Resolve derived-id collisions workspace-wide by suffixing (files in path order). TL006 only for duplicated written ids.
- TL007, TL015, TL017.

Which facts (plan 6.3)
- A file is fresh when its hash matches facts.modules[].sourceSha256.
- A stale file keeps a declaration's previous facts BY NAME while its current syntactic keyword agrees with the facts' kind: flag stale, refs dropped, uses/presupposes/axioms kept.
- Otherwise, and for failed, dependency-failed or not-built modules or when there are no facts, only the syntactic keyword counts:
  - an axiom counts as an axiom;
  - a theorem counts as NOT proved: proof none plus not-checked. Never show proved without Lean.
- Anonymous instances: match facts to syntax by the declaration's start line.

Statuses (exactly per the 6.3 table)
- A justificationKind of 'other' is treated like theorem.
- Conditional vs proved: take the whitespace-normalised #check type and split it at top-level arrows.
- Footprint mapping:
  - a node's .holds becomes its id;
  - a presupposition becomes presup:<name>;
  - standard axioms and vocabulary symbols are dropped;
  - anything else becomes axiom:<name> plus TL103.
- ProofStatus.conditional also carries footprint.
- Flags:
  - rests-on-claimed, proved-goal, provable-assumption, missing-holds, uses-sorry, holds-mismatch, not-checked, stale, self-evident;
  - no-rationale: ASSUMPTION only, with TL011;
  - existence-commitment, with TL108;
  - definitional-choice.
- TL102 per 6.3.
- ill-formed = TL101, TL113, or a Lean error message inside the node's statement or .holds declaration.

Edges (plan 6.3)
- Declared edges from premises.
- VERIFIED EDGES FROM REFERENCES, not from footprints:
  - direct(v) = the nodes whose .holds v's .holds uses: follow DeclFacts.refs through declarations owned by no node until a node's .holds is reached;
  - plus conditional edges for on(v).
  - Footprints list only axioms and would miss every derivation-to-goal edge. Verified: theorem g2.holds := d0.holds.2 lists only d0's assumptions.
- lean-ref edges.
- Mismatch flags only for proved or conditional targets, at the assumption level as defined in 6.3: TL107 used-undeclared, TL109 declared-unused.
- Only edges with both ends in the subject go into subjectGraph.

Vocabulary (plan 6.4)
- sort;
- presupposition, attached to its sort;
- Nonempty instances that re-export a presupposition are hidden;
- unmarked-axiom plus TL104 when typeSort is Prop;
- predicate with arity, including 0;
- constant and function, plus TL111 when declared with axiom or when the binder types are not sorts;
- other plus TL111;
- definition, plus definitional-choice when it lies in a statement closure; untracked Prop defs are definitions too;
- lemma;
- declarations with a parent are folded into their parent.
- Syntactic fallback on the declaration text.
- Display order per 6.4; usedBy; glossBy 'user'.

Card data (plan 6.4)
- code and codeLoc: the contiguous statement-to-holds text including the docstring, or pieces joined by a blank line.
- uses: the statement's refs, then breadth-first through referenced node statements and vocabulary definitions; first occurrence wins; names from another subject are kept.
- refs:
  - refs to vocabulary items or to a node's statement/.holds, the card's own included;
  - code-relative, fresh files only;
  - all other refs dropped (e.g. And.right from .2 projections, Nat).
- presupposes, axioms, justificationKind.

Diagnostics (plan 6.5)
- TL006, TL007, TL015, TL017 and TL101-TL121.
- Lean build messages as code LEAN, with file, range and nodeId by containment.
- WP1's markup diagnostics, mapped with nodeId.
- Subjects come from paths.ts (subjectOfPath): a block outside a subject gives TL120; a premise in another subject gives TL121.
- Ids are unique workspace-wide.

subjectGraph
- Nodes ordered by orderByLayout: layout first, then file order (files sorted by path).
- The subject's edges, vocabulary and diagnostics, and the semantic summary passed in.
- For the Spyro fixture with matching facts it must reproduce spyroGraph()'s card data; for the runner-lean proved overlay with matching facts, spyroProvedGraph()'s. The review made both samples consistent with their fixtures.

PLANNING (plan 6.2, D-18)
EditPlans carry whole-file Lean FileChanges (use WP1's applyTextEdits, setBlockField and applyLeanOps), plus layout and archive. The runner materialises the sidecars.

add-node
- id = deriveId(naturalName, taken), taken over all workspace ids. preferredId is ignored in M1.
- The sentence is verbatim (trim only). asserted = ctx.today.
- The block goes into inboxPath(subject) at end-of-namespace.
- When Inbox is missing, create it with subjectScaffold's Inbox text and add import <library>.<S>.Inbox to <library>/<S>.lean if that exists, else to <library>.lean.
- Append to the layout. Set nodeId.

edit-node
- setBlockField.
- If the statement's docstring equals escapeBodyText(old natural_name) (trimmed), also emit a set-docstring LeanOp with the new sentence (D-9 mirror).
- null removes rationale, stance or source; never naturalName.

Every plan that edits a block
- whose node is formalised by adjacency also writes lean: <fully-qualified statement> (D-8 pinning);
- whose id was derived also writes id:.

delete-node
- planDelete.
- Remove the block and, unless keepLean, its statement and .holds; archive theorems as ArchiveEntry.
- Drop the id from other blocks' premises:.
- Update the layout with withoutIds.
- brokenDependents = proofs that use the removed .holds AND statements that mention the removed abbrev.
- keepLean with an axiom .holds sets leavesUnmarkedAxiom.

change-kind (planKindChange, per the 6.2 table)
- No dependents choice: needs-confirmation ActionError listing the dependents (node ids, plus the Lean names of untracked declarations).
- mark-broken: remove-holds.
- rewrite, exactly per 6.2:
  - facts-stale unless every touched file is fresh;
  - unsafe when a user is not a theorem, or, for an axiom H, when a declaration whose axioms list H is not reached through the refs;
  - hypName h_<last component of S>, made unique;
  - add-hypothesis with the binder first;
  - apply-hypothesis for the members of the closure;
  - then remove-holds.
- Move the layout with moveInLayout.
- The impact equals kindChangeImpact on the same graph; its dependents may be extended by untracked declarations.
- Optional rationale for a change to ASSUMPTION.

reorder
Layout only, layoutOnly: true.

set-premises
- Replace premises:.
- Targets must exist in the same subject, with no self-reference and no cycle (else invalid).
- Empty premises: ActionError not-yet ('Self-evident? arrives with Claude in M2').

create-subject
- The name must be valid (isSubjectName) and unused.
- subjectScaffold files.
- import <library>.<S> appended after the last import of <library>.lean (create the file if missing).
- Empty layout.

Labels: exactly per plan 6.2's list.

GRAPH.JSON (plan 6.6)
- toGraphJson is deterministic and covers all subjects.
- Generate packages/core/schema/telelean-graph-1.0.schema.json from the zod schema with z.toJSONSchema (zod 4.6.7 is installed; do NOT use ajv). For example, a vitest test that rewrites the file when UPDATE_SCHEMA=1.
- Add a test that the committed file equals the generated one and that the Spyro export validates.

DEPENDENCIES
- WP1 is a stub in your tree until integration.
- Unit-test statuses, edges, vocabulary and planning logic on hand-built ParsedFile objects. Write fixture builders; WP1's types are frozen.
- Gate text-producing tests with describe.skipIf(!isImplemented(() => parseLeanFile('X.lean', ''))).
- Write packages/core/test/fixtures/project/spyro-facts.json by hand from plan section 4 and the sample, plus a proved-overlay variant with d0/g2-style extras. Use real ilean refs, for example:
  - HasDarkPast at 24:34-24:45 inside Spyro.cynder_dark_past;
  - axioms of cynder_dark_past.holds = [Classical.choice, Spyro.Character, Spyro.HasDarkPast, Spyro.Character.exists, Spyro.cynder_dark_past.holds];
  - Spyro.instNonemptyCharacter: kind instance (from the source keyword; #print shows theorem);
  - the abbrevs: kind def with attribute reducible;
  - cynder and newSpyro: kind opaque;
  - typeSort 'Type 1' for sorts, 'Type' for predicates and constants, 'Prop' for presuppositions and .holds axioms.
- The integrator re-checks it against WP3's real output.

RUN
cd packages/core && npm test.
Report your files, the real test output, which tests are gated on WP1, any contract additions and the effects outside the repo.
  - **acceptance_tests:** ["AT2.1 buildProjectModel plus subjectGraph on the Spyro fixture files (parsed; gated on WP1) with spyro-facts.json reproduce spyroGraph()'s nodes (status, lean.uses, lean.refs, lean.presupposes, lean.justificationKind, lean.codeLoc, loc), its vocabulary (9 items with the same kinds, order and usedBy; the two Nonempty instances hidden) and its 3 declared edges. With the proved-overlay facts they reproduce spyroProvedGraph()'s statuses, footprint, verified edges and refs", "AT2.2 One test per cell of the 6.3 status table (ASSUMPTION/DERIVATION/GOAL x H absent/axiom/theorem/theorem with sorryAx), plus:\n- conditional vs proved from a wrapped #check type;\n- holds-mismatch;\n- justificationKind other;\n- footprint mapping including presup: and axiom: entries with TL103;\n- rests-on-claimed;\n- self-evident;\n- existence-commitment with TL108;\n- TL102;\n- a block bound to a theorem or to a bare axiom is ill-formed with TL113;\n- a Lean error inside one node's .holds makes only that node ill-formed", "AT2.3 Stale and unchecked files:\n- a stale file keeps its previous facts by name while the keyword is unchanged (stale flag, no refs, uses kept);\n- a theorem whose facts are missing, or whose keyword changed, shows proof none plus not-checked/stale, never proved;\n- nodes of failed, dependency-failed and not-built modules get not-checked", "AT2.4 uses and refs come from DeclFacts.refs and are never hard-coded:\n- changing the fixture's refs changes uses;\n- the closure runs through another node's statement and through a vocabulary definition;\n- refs are code-relative, include the card's own statement inside its .holds, and drop non-vocabulary refs (e.g. And.right, Nat);\n- for the Spyro fixture, every ref's substring is a suffix of its name", "AT2.5 Vocabulary classification per 6.4 with typeSort:\n- sort;\n- predicate with arity, including axiom P0 : Prop with arity 0;\n- constant; function;\n- presupposition attached to its sort;\n- the anonymous Nonempty instance hidden (matched by start line);\n- definition with definitional-choice when it lies in a statement closure;\n- lemma;\n- unmarked-axiom with TL104 (typeSort Prop);\n- axiom c : Character becomes a constant with TL111;\n- a structure field is folded into its parent;\n- display order; usedBy", "AT2.6 These plans produce the exact expected file texts and labels (gated on WP1):\n- add-node: Inbox created from the scaffold text and imported when missing; id from deriveId, unique across subjects; layout appended;\n- edit-node: the docstring mirror follows only when the docstring equals the old sentence; an adjacent binding gets pinned;\n- set-premises: replace; a cycle gives invalid; empty premises give not-yet;\n- reorder: layoutOnly;\n- create-subject: scaffold plus the Model.lean import", "AT2.7 planDelete/delete-node:\n- premise removals;\n- statement and .holds removed, with an ArchiveEntry for theorems;\n- keepLean gives leavesUnmarkedAxiom;\n- brokenDependents lists the proofs using the .holds and the statements mentioning the abbrev", "AT2.8 planKindChange covers every cell of the 6.2 table:\n- needs-confirmation with the dependents;\n- mark-broken;\n- rewrite with spans from the facts (gated text check: binder first, apply-hypothesis on the closure members, the result is conditional after re-parse);\n- facts-stale refusal;\n- unsafe refusal (a def using H; an axiom H whose axioms-users are not all reached by the refs);\n- A-to-D pending promotion.\nIts impact matches kindChangeImpact", "AT2.9 Two subjects (Spyro plus a second subject fixture):\n- separate subject graphs;\n- a duplicate written id across subjects is reported as TL006;\n- a derived-id collision is resolved by suffix (no TL006);\n- a cross-subject premise gives TL121;\n- a block outside any subject gives TL120", "AT2.10 toGraphJson is deterministic and validates against the zod schema, and the committed packages/core/schema/telelean-graph-1.0.schema.json equals the regenerated one", "AT2.11 A proof through a derivation: g2.holds := d0.holds.2, with facts holding refs to Spyro.d0.holds and axioms listing only d0's assumptions.\n- It gives the verified edge d0 to g2, not the assumption edges.\n- proofDependents(graph, 'd0') = ['g2'], and kindChangeImpact for D-to-G on d0 needs confirmation.\n- A proof through an untracked lemma gives the edge from the node the lemma uses.\n- Mismatch flags:\n  - premises [d0] with a proof via d0: no flags;\n  - premises [a1] with a proof using a2: used-undeclared plus TL107;\n  - an unproved goal's premises are never declared-unused", "AT2.12 LEAN diagnostics get their nodeId by containment and their severity from Lean; markup diagnostics carry a nodeId; subjectGraph carries the subject's diagnostics only"]
- **id:** WP3
  - **title:** runner semantic layer: sandboxed build + .ilean + check file -> LeanFacts
  - **owned_paths:** ["packages/runner/src/semantic/**", "packages/runner/src/lean/**", "packages/runner/test/semantic/**", "packages/runner/test/lean/**", "test-fixtures/semantic/**"]
  - **brief:** Read docs/m1-plan.md first: the safety rules at the top, and sections 4, 5.6, 6.3 and 6.4 (what WP2 needs from the facts), 10, 12, 14 and 15.

SAFETY (mandatory; also for anything you start):
- Never push, add remotes or use gh.
- Never publish or send anything to anyone.
- Network only to read docs.
- No downloads, no npm install, no new packages. Report a need in open issues.
- Never run the Claude CLI with a prompt. Never read credentials.
- Write only inside your owned paths and your scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/<your-label>/.
- Never touch the user's VS Code settings or extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, the npm config or the global git config.
- No sudo, no global installs. Do not run git in /home/zhengyew/telelean.
- Report every effect outside the repo. Never claim a test passed unless you ran it; quote real output.

LEAN AND RAM RULES:
- Run Lean only through runLean (sandboxed, memory-capped). For quick probes on trusted fixture copies in your scratch dir you may call the toolchain binaries directly (~/.elan/toolchains/leanprover--lean4---v4.35.0/bin/lake and lean); never the elan proxies.
- LEAN_NUM_THREADS=4. One heavy process at a time. Run free -m first and wait while MemAvailable is under 12 GB.
- Never build Mathlib.
- Set TELELEAN_TEST_TMP to your scratch dir when running tests.
- Never build inside test-fixtures/ or mental_model/: copy to TELELEAN_TEST_TMP first.
- When checking for leftover telelean-* systemd units or processes, look only at names containing your own run id/pid; other builders run Lean at the same time.
- Check that ~/.elan/known-projects keeps its line count.
- Kill only processes you started.

GOAL
Implement refreshLeanFacts(request) in packages/runner/src/semantic/.
- Types are frozen in semantic/types.ts; LeanFacts is frozen in packages/core/src/facts.ts, including the new FactsStatus 'unsupported-project' and DeclFacts.typeSort.
- Additive optional fields only, each recorded in plan section 14.

Follow plan section 4 step by step:

1. Memory guard
- readMemAvailable hook, default readMemAvailableBytes.
- Below the threshold: status low-memory, nothing spawned.

2. Toolchain and project
- lean-toolchain (trimmed) must equal leanprover/lean4:v4.35.0, else unsupported-toolchain.
- lake-manifest.json must exist and have an empty packages list, else unsupported-project with a detail.
- Nothing is spawned in either case.

3. Build
- Read and sha256 every module source (<library>.lean, <library>/**.lean) and keep the texts.
- lake build IN PLACE via runLean: shadowDir: root; maskPaths: [root/.git] only if it exists; memoryMax, timeouts, runId and signal passed through.

4. Parse Lake's log, using the verified line shapes of plan 4 step 4:
- progress lines (Built, Replayed, Building) with the check marks;
- trace lines are ignored;
- messages are kept whole, continuation lines included;
- the 'Some required targets logged failures:' list gives the failed modules.
- Convert Lean's 1-based line and 0-based code-point column to a 0-based line and UTF-16 character, using the step-3 text. Ranges are zero-width.

5. Module states
- fresh, failed, dependency-failed, not-built, stale.
- Imports come from the source headers. Lake deletes a failed module's .olean/.ilean.

6. Read .ilean
- Path: .lake/build/lib/lean/<Module/Path>.ilean, version 5. The exact shape is in plan 4 step 6:
  - decls: name to [full range, selection range];
  - references: keyed by a JSON string {c:{m,n}}, with definition (4 or 5 elements) and usages [l,c,l,c,parent].
- Skip _private. names.
- Set parent for auxiliary names (structure fields).

7. The check file
Generated, on stdin to lake env lean --stdin --json, via runLean.
- Import only fresh modules: never failed, dependency-failed or not-built ones, even if old .olean files exist. With no fresh module, the check is skipped.
- set_option pp.fullNames true and pp.proofs false.
- Per declaration: #check @N, #print N and #print axioms N; for axioms and opaques also #check type_of% @N.
- Names are written with M0's formatDeclName.
- Messages are attributed by 1-based line, as M0's footprintsFromMessages does.
Extract:
- type: the text after the first ' : ', with whitespace runs collapsed to one space (long types wrap);
- kind and attributes from #print. kind is instance when the declaration's source text, after docstring, attributes and modifiers, starts with the instance keyword: Lean prints Prop instances as theorem and data instances as @[instance_reducible] def;
- value for defs (after :=);
- axioms (M0 parseAxiomsMessage, multi-line) and usesSorry;
- typeSort: the text after the last ' : ' of the type_of% output;
- error.

8. Docstrings
From the source, at each decl's full range.

9. Re-hash
Re-hash the sources and mark changed modules stale.

REUSE AND CONSTRAINTS
- Reuse the M0 helpers in packages/runner/src/lean: runLean, toolchainExe, resolveToolchain, parseLeanJsonMessages, parseAxiomsMessage, formatDeclName.
- Keep all M0 lean tests passing. You may refactor lean/ (you own it), but keep its exports.
- You may export internal helpers (check-file generator, ilean reader, log parser) from semantic/index.ts.
- refreshLeanFacts never throws for Lean or sandbox failures (statuses with details).
- It is not self-serialising: callers use runExclusive.

FIXTURES
New overlays go in test-fixtures/semantic/, applied over scratch copies of test-fixtures/spyro:
(a) a build error in Main;
(b) the runner-lean proved overlay plus extras:
  - a conditional theorem 'theorem d1.holds (h : cynder_not_good) : d1';
  - a long-named two-hypothesis conditional whose #check output wraps;
  - a derivation used by a proof ('theorem d0.holds' and 'theorem g2.holds : g2 := d0.holds.2');
  - a proof through an untracked lemma;
  - a sorry theorem;
  - a hidden axiom 'axiom hidden : ∀ c : Character, HasDarkPast c';
  - 'axiom c2 : Character', 'axiom P0 : Prop', 'axiom f : Character → Game';
  - a def used by a statement abbrev;
  - a structure with a field;
  - a data instance;
(c) an edited lean-toolchain;
(d) a lake-manifest.json listing a package, and a copy with the manifest removed;
(e) a non-BMP character before an erroring identifier on one line.
The review probed most of these on Lean 4.35; the outputs are quoted in plan section 4. Fixtures are plain trusted .lean files with no #eval, and contain no .telelean/config.json.

RUN
cd packages/runner && TELELEAN_TEST_TMP=<scratch> npx vitest run test/semantic, then the full suite once (about 70 s for M0).
Report the files, the real test output, measured durations and peak memory, contract additions, and effects outside the repo (units left, known-projects line count).
  - **acceptance_tests:** ["AT3.1 A scratch copy of the Spyro fixture gives status ok, with every module fresh. decls include the 11 vocabulary names and the 5 Main names, with:\n- the right kinds: axiom; def with attribute reducible for the abbrevs; opaque; instance for the two Nonempty instances (from the source keyword, although #print shows theorem);\n- types (Spyro.HasDarkPast: 'Spyro.Character → Prop');\n- typeSort (Character 'Type 1', HasDarkPast 'Type', Character.exists 'Prop');\n- axioms (cynder_dark_past.holds = [Classical.choice, Spyro.Character, Spyro.HasDarkPast, Spyro.Character.exists, Spyro.cynder_dark_past.holds]);\n- refs (Spyro.HasDarkPast at 24:34-24:45 inside Spyro.cynder_dark_past);\n- docstrings.\nNo leftover units of this run; known-projects unchanged", "AT3.2 A build error in Main gives status build-errors:\n- Main failed; the Model root is dependency-failed;\n- Vocabulary is fresh and its decls are present;\n- the error message has a file, a 0-based UTF-16 zero-width range and its continuation lines", "AT3.3 The proved overlay plus extras:\n- d1.holds has type 'Spyro.cynder_not_good → Spyro.d1';\n- the wrapped two-hypothesis type comes back on one line;\n- g2.holds has a ref to Spyro.d0.holds, while its axioms list only d0's assumptions;\n- withSorry has usesSorry;\n- hidden has kind axiom and typeSort Prop; c2 has typeSort Type;\n- the structure field carries a parent;\n- theorems have no value;\n- the abbrev value is pp.fullNames text", "AT3.4 Memory guard: readMemAvailable returns 1 GiB against a 2 GiB threshold, giving low-memory, and no process is spawned", "AT3.5 Cancellation through an AbortSignal, and a tiny timeout, give cancelled/timeout with a detail and no leftover scopes of this run", "AT3.6 An edited lean-toolchain gives unsupported-toolchain, and nothing is spawned", "AT3.7 A source modified during the check (an onPhase('check') hook edits a file) makes that module stale", "AT3.8 The .git mask is applied only when .git exists (checked by argv inspection or a probe)", "AT3.9 A message column after a non-BMP character is converted to UTF-16 correctly", "AT3.10 All M0 runner tests still pass", "AT3.11 A manifest listing a package, and a missing manifest, each give unsupported-project with distinct details, and nothing is spawned", "AT3.12 The Lake log parser, unit-tested on recorded logs (success with Replayed warnings, failure with trace lines, multi-line errors, the failures list), gives the right messages, severities, files and failed modules"]
- **id:** WP4
  - **title:** runner workspace: ModelWorkspace, sidecars, history (git private refs), undo, Initialize, graph.json writer, sample mental_model
  - **owned_paths:** ["packages/runner/src/workspace/**", "packages/runner/test/workspace/**", "test-fixtures/workspace/**", "mental_model/**"]
  - **brief:** Read docs/m1-plan.md first: the safety rules at the top, and sections 2, 3, 4 (mapping to SemanticSummary), 5.6, 7, 8, 10, 12, 13, 14 and 15.

SAFETY (mandatory; also for anything you start):
- Never push, add remotes or use gh.
- Never publish or send anything to anyone.
- Network only to read docs.
- No downloads, no npm install, no new packages. Report a need in open issues.
- Never run the Claude CLI with a prompt. Never read credentials.
- Write only inside your owned paths and your scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/<your-label>/.
- Never touch the user's VS Code settings or extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, the npm config or the global git config.
- No sudo, no global installs.
- Run free -m before heavy steps (wait while MemAvailable is under 12 GB). One heavy process at a time. Kill only processes you started.
- Report every effect outside the repo. Never claim a test passed unless you ran it; quote real output.

GIT RULES:
- git ONLY in test repositories under your scratch dir (TELELEAN_TEST_TMP).
- Always use -c commit.gpgsign=false -c core.hooksPath=/dev/null, GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1, GIT_CEILING_DIRECTORIES=<scratch root> and an explicit author.
- Never in /home/zhengyew/telelean or mental_model/.
- No remotes, push, fetch, gc or prune.
- Lean only through runLean, on scratch copies, with LEAN_NUM_THREADS=4.

GOAL
Implement packages/runner/src/workspace/:
- createModelWorkspace (the ModelWorkspace interface);
- inspectFolder, planInitialize, findModelRoots, initGitRepository.
Types are frozen in workspace/types.ts. FolderInspection now carries an optional gitignore text, and dependency projects are 'unsupported'. Additive optional members only, e.g. injectable core functions as test hooks; record them in plan section 14. No vscode imports.

MODEL WORKSPACE (plan 2, 3)

load()
- Lists <library>.lean, <library>/**.lean and .telelean/subjects/*/layout.json via fs (skip dot-dirs, .lake and node_modules).
- Reads the texts through the TextSource, sha256-hashes them and parses them with core parseLeanFile.
- The library comes from .telelean/config.json via parseProjectConfig.

graph(subject)
- Cache parses by path plus hash.
- graph(subject) = core subjectGraph(buildProjectModel(...)), with the subject's layout and the current SemanticSummary.
- Its version counter is seeded from Date.now() and strictly increasing, across subjects and across workspaces re-created in one process.
- An unknown subject throws.

invalidate and events
- invalidate re-reads; a file that is now null is removed.
- onDidChange events.

requestRefresh
- Debounce (750 ms default), coalesce, and run one at a time per process via semantic.runExclusive(() => refreshLeanFacts({root, library, memoryMax, minAvailableBytes, onPhase, ...})).
- The refreshFacts option is the test hook.
- The semantic state is 'checking' while it runs.
- Map FactsStatus to SemanticSummary per plan section 4 (unsupported-project becomes disabled plus a TL201 diagnostic).
- Keep the previous facts after a failed refresh.
- Rewrite .telelean/graph.json (core toGraphJson; direct fs write; gitignored) after each refresh and each perform.
- refreshNow().

perform(action)
Refusals (ActionError) become {ok:false, code, error, dependents?} outcomes, never a throw.
1. core planAction(model, action, {today, now, layouts}).
2. Materialise sidecars into whole-file FileChanges: layout.json via serializeLayout; attic entries appended to atticPath(subject, nodeId) with the header '-- archived <ISO time> (<reason>): <declName>'.
3. A 'Manual edits' snapshot of each touched scope whose current files differ from its tip.
4. EditApplier.apply(changes, label). It rejects when a file's current text differs from before: report conflict.
5. The action snapshot of each touched scope: subject chains via subjectSnapshotScope, the project chain via projectSnapshotScope. Skip it when layoutOnly.
6. Push the undo entry and clear redo.
7. invalidate plus requestRefresh.
Serialise perform, undo, redo, revert and prune in one queue.

UNDO (plan 8)
- Per subject, in memory, at most 100 entries.
- Exact reversal when current === after.
- Otherwise, reverse patches with the installed diff 9.0.0 (structuredPatch/applyPatch, no fuzz).
- A file the action created is deleted only if unchanged.
- All or nothing: refuse with conflict ('<file> changed since; use History to revert').
- Undo and redo are applied like actions, snapshotted 'Undo: <label>' / 'Redo: <label>', and are themselves undoable.
- A subject that disappears (undo of create-subject) leaves subjects() without it.

HISTORY (plan 8, exact rules)
- Refs: refs/telelean/<rootKey>/subjects/<S> and .../project. rootKey per the plan; validate with check-ref-format.
- A snapshot is a commit of exactly the scope's files, with paths relative to the model root and contents from the TextSource.
- Build it with plumbing only:
  - hash-object -w;
  - then a temporary index file in a fresh temp dir (GIT_INDEX_FILE), or mktree;
  - write-tree;
  - commit-tree with the trailers Telelean-Action, Telelean-Subject, Telelean-Nodes and Telelean-Format;
  - update-ref with the old value.
- Every git call: -c commit.gpgsign=false -c core.hooksPath=/dev/null -c gc.auto=0 -c core.fsmonitor=false; env GIT_TERMINAL_PROMPT=0; author and committer 'telelean <telelean@localhost>' via env.
- Never touch the user's index, HEAD, branches or hooks.
- 'Initial state' when a subject chain is missing (on load or board open).
- listHistory: newest first, plus storage from git rev-list --objects --disk-usage <ref> --not --branches --tags --remotes, per subject and over all of the root's refs, cached for 10 s.
- historyDiff: parent or current, as a FileChange list.
- revert:
  - snapshot the current state if it is dirty;
  - write the entry's tree over the subject scope (create/replace/delete) through the EditApplier, labelled 'Revert to: <label> (<time>)';
  - snapshot it and make it undoable.
- prune(keepLast): recreate the last N commits with the same trees, messages and dates (the oldest becomes a root commit) and update the ref. No gc.
- historyStatus: ready, no-repo, git-missing, disabled or error.
- initGit: initGitRepository (refuses inside an existing repository; git init only, no commit to any branch), then the initial snapshots.
- Labels per plan 6.2.

INITIALIZE (plan 7.1, 7.2)

inspectFolder
- empty: hidden files and .git only; record the .gitignore text.
- model: has .telelean/config.json.
- lake-project: lakefile.toml with a [[lean_lib]] name, lake-manifest.json with no packages, and no [[require]]. subjects = the library's subdirectories with subject names. Record the .gitignore text.
- unsupported, with a reason: lakefile.lean only; no [[lean_lib]]; no manifest; Lake dependencies such as Mathlib; other files without a lakefile.
- A Lake project on another toolchain is accepted.

planInitialize
- empty: exactly the 7.1 files:
  - lakefile.toml and lake-manifest.json as byte copies of test-fixtures/spyro's;
  - lean-toolchain; .gitignore;
  - Model.lean = 'import Model.<S>' plus a newline;
  - core subjectScaffold(subject, 'Model') (already implemented);
  - .telelean/config.json via serializeProjectConfig;
  - the subject's layout via serializeLayout(emptyLayout()).
- lake project: only .telelean/config.json (with the inspected library), the .gitignore lines and the layout files.
- An existing .gitignore gets only the missing lines appended (before = its text).

findModelRoots
Skips DEFAULT_EXCLUDED_DIRS and dot-dirs; maxDepth defaults to 4.

SAMPLE (plan 7.4)
Write /home/zhengyew/telelean/mental_model/ with plain file writes (it is data; do not write it from a test):
- the 7.1 project files for subject Spyro, with Model.lean = 'import Model.Spyro';
- Model/Spyro.lean and Model/Spyro/Inbox.lean exactly as subjectScaffold('Spyro','Model') returns them;
- Model/Spyro/Vocabulary.lean: a byte copy of test-fixtures/spyro/Model/Spyro/Vocabulary.lean;
- Model/Spyro/Main.lean: test-fixtures/spyro/Model/Spyro/Main.lean with one extra line, 'import Model.Spyro.Inbox', after the Vocabulary import;
- .telelean/config.json;
- .telelean/subjects/Spyro/layout.json (empty layout).
No .lake, no .git, nothing else.

DEPENDENCIES
- Core WP1/WP2 functions (parseLeanFile, buildProjectModel, subjectGraph, planAction, toGraphJson) and WP3's refreshLeanFacts are stubs in your tree.
- Unit-test history, undo, sidecars, scan, Initialize and refresh scheduling with fakes: the refreshFacts hook, a fake applier, and injected core hooks if you add them.
- Gate flows that need parse/build/plan with isImplemented(...).
- Gate Lean builds of the scaffold and the sample (copies in TELELEAN_TEST_TMP) on WP3.
- subjectScaffold and the layout and path helpers are implemented.

RUN
cd packages/runner && TELELEAN_TEST_TMP=<scratch> npx vitest run test/workspace.
Report the files, the real test output, what is gated, contract additions and effects outside the repo.
  - **acceptance_tests:** ["AT4.1 Scan on a scratch copy of mental_model plus a second subject: subjects() lists both with node counts; graph('Spyro') has 4 nodes (gated on WP1/WP2); unknown subjects throw", "AT4.2 requestRefresh with a fake refreshFacts:\n- debounced, coalesced, one at a time; 'checking' while it runs;\n- every FactsStatus maps per plan section 4, including unsupported-project to disabled plus TL201;\n- the previous facts are kept after a failure;\n- onDidChange fires;\n- graph.json is written after a refresh and after a perform (gated on WP2) and parses", "AT4.3 perform:\n- materialises layout.json and the attic file into FileChanges for the fake applier;\n- layoutOnly actions are applied and undoable but not snapshotted;\n- an ActionError becomes an ok:false outcome with its dependents;\n- an applier rejection (before mismatch) becomes conflict, and nothing is recorded", "AT4.4 Undo/redo:\n- exact reversal;\n- a reverse patch with an unrelated hand edit elsewhere in the file;\n- a conflict refusal leaves files untouched;\n- a created file is deleted only if unchanged;\n- a new action clears redo;\n- undo of an undo works", "AT4.5 History in a scratch repo:\n- Initial state; a Manual edits snapshot before an action; the action snapshot with trailers; per-subject scope;\n- listHistory order and labels; historyDiff parent/current;\n- revert, and undo of the revert;\n- prune keeps N with the same trees;\n- storage counters are above 0, with the total at least each subject's;\n- the user's index mtime, HEAD, branches and git status --porcelain are unchanged;\n- marker-writing hooks (post-commit, reference-transaction) never run;\n- only refs/telelean/* change;\n- a model root inside a parent repo gets the right rootKey", "AT4.6 inspectFolder/planInitialize:\n- empty gives exactly the 7.1 files (lakefile and manifest byte-identical to the fixture's; subject files equal subjectScaffold);\n- an existing .gitignore gets only the missing lines (before = its text);\n- lake-project gives only .telelean/ files and .gitignore lines;\n- [[require]], or a manifest with packages, gives unsupported naming Lake dependencies;\n- lakefile.lean only gives unsupported;\n- an opted-in model gives model;\n- initGitRepository refuses inside an existing repo;\n- the scaffold builds under runLean in a scratch copy (gated on WP3)", "AT4.7 mental_model/ content is exactly per plan 7.4: Vocabulary.lean byte-identical to the fixture; Main.lean = the fixture plus one import line; no .lake/.git. A scratch copy parses to 4 Spyro nodes (gated on WP1) and builds under runLean (gated on WP3)", "AT4.8 findModelRoots finds nested roots and skips node_modules, .lake, .git, verbatim_prompt_log, test-fixtures and dot-dirs", "AT4.9 Graph versions strictly increase across subjects and across two workspaces created one after the other for the same root"]
- **id:** WP5
  - **title:** VS Code extension host: activation, commands, BoardPanel per root, EditApplier/TextSource, refresh triggers, clipboard, history diff, colours, isolated tests
  - **owned_paths:** ["packages/extension/src/**", "packages/extension/test/**", "packages/extension/scripts/**", "packages/extension/package.json", "packages/extension/tsconfig.json", "packages/extension/vitest.config.mts", "packages/extension/.vscode-test.mjs", "packages/extension/dist/extension.js", "packages/extension/dist/extension.js.map", "packages/extension/out/**"]
  - **brief:** Read docs/m1-plan.md first: the safety rules at the top, and sections 2, 3, 5.5, 5.6, 8, 10, 12 (R4, R8, R11), 13, 14 and 15.

SAFETY (mandatory; also for anything you start):
- Never push, add remotes or use gh.
- Never publish or send anything to anyone.
- Network only to read docs.
- No downloads, no npm install, no new packages. Report a need in open issues.
- Never run the Claude CLI with a prompt. Never read credentials.
- Write only inside your owned paths and your scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/<your-label>/.
- Never touch the user's VS Code settings or extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, the npm config or the global git config.
- No sudo, no global installs. Do not run git in /home/zhengyew/telelean.
- Kill only processes you started.
- Report every effect outside the repo. Never claim a test passed unless you ran it; quote real output.

VS CODE RULES:
- The test VS Code runs ONLY with the isolated profile of plan section 10: HOME/XDG, user-data and extensions dirs under TELELEAN_TEST_TMP; ulimit -c 0; Copilot/chat, telemetry and updates off.
- Do not change the VS Code test version: 1.140.0 is in packages/extension/.vscode-test. Never modify that folder.
- Do not run npm run build:all or the webview build: dist/webview belongs to WP6.
- One VS Code instance at a time. Run free -m first and wait while MemAvailable is under 12 GB.
- git only in scratch copies, with GIT_CONFIG_GLOBAL=/dev/null.

GOAL
The thin VS Code adapter for M1.
- Add '@telelean/runner' mapped to ../runner/src/index.ts, and '@telelean/runner/*' mapped to ../runner/src/*, to the tsconfig paths and the vitest alias. esbuild resolves through tsconfig.
- Import only runner semantic and workspace (deep paths), so llm/ (confinement.ts uses import.meta.url) stays out of the bundle.
- Check that the bundle loads: require it in a unit test with a vscode stub, or in the smoke test.

PACKAGE.JSON
- Commands:
  - telelean.openBoard (Open Board);
  - telelean.initializeModel (Initialize Model Here; also in explorer/context for folders);
  - telelean.refresh (Refresh Lean Check).
- Activation: workspaceContains:**/.telelean/config.json and onWebviewPanel:telelean.board.
- capabilities.untrustedWorkspaces.supported=false, virtualWorkspaces=false.
- Settings and defaults:
  - telelean.memory.capGiB (4);
  - telelean.memory.minAvailableGiB (2);
  - telelean.refresh.enabled (true);
  - telelean.refresh.debounceMs (750);
  - telelean.git.snapshotRefs (true);
  - telelean.git.path ('git').
- Colours: keep the 4 ids and add telelean.vocabulary and telelean.highlight.
  - Each id has exactly one dot.
  - Defaults are explicit per-theme hex values, never charts.* (M0 lesson).
  - Update the M0 colour smoke test.

RUNTIME
- findModelRoots per workspace folder. Open Board quick-picks when there are several roots; with none, it offers Initialize.
- One BoardPanel per model root (title 'telelean: <folder>'), with a WebviewPanelSerializer restoring root and subject (D-22).
- A ModelWorkspace per root:
  - created lazily when its first board opens;
  - kept until the window closes, so undo survives closing the board;
  - created with an EditApplier and a TextSource.
- EditApplier:
  - first verify that each file's current text (open document, else disk) equals before (null: the file must not exist); otherwise reject without applying anything;
  - then a WorkspaceEdit with minimal text edits for open documents (line diff via the installed diff package) and create/delete for files;
  - then save every touched document;
  - reject if applyEdit fails.
- TextSource: the open document's text if open, else fs.
- Watchers:
  - onDidChangeTextDocument (debounced ~200 ms): invalidate;
  - onDidSaveTextDocument: invalidate plus requestRefresh;
  - a FileSystemWatcher for **/*.lean, .telelean/**, lakefile.toml and lean-toolchain under each root: invalidate (plus refresh for lakefile/toolchain);
  - ignore events under .lake/ and for .telelean/graph.json.
- Refresh only while that root's board is open (D-28).
- Post workspace plus graph on ready, on onDidChange and after subject switches.
- If the board's subject disappears (undo of create-subject, a revert), switch the board to the first remaining subject.

PROTOCOL DISPATCH
Use core parseWebviewToHost (frozen; do not edit protocol.ts).
- Map messages to BoardActions and call ws.perform. Then post actionResult {requestId, outcome} when a requestId was given and, on success, a notice with undoable: true and the outcome label.
- undo/redo: ws.undo/ws.redo for the board's subject.
- selectSubject; createSubject (then switch); theseSuffice becomes set-premises; addNode becomes add-node (clientId is not used as the id).
- historyList: post history.
- historyPreview: vscode.changes on a read-only telelean-history: TextDocumentContentProvider fed by ws.historyDiff.
- historyRevert: ws.revert. historyPrune.
- initGit: only after a modal confirm in the host.
- copyText: vscode.env.clipboard.writeText plus a 'Copied' notice.
- openInEditor: resolve inside the root (refuse otherwise) and showTextDocument at the range.
- refresh: ws.refreshNow.

INITIALIZE COMMAND
1. Pick a folder; inspectFolder.
2. InputBox for the first subject: validated with isSubjectName; default derived from the folder name per plan 7.2.
3. planInitialize; apply via the EditApplier.
4. If the folder is not inside a repo (ws.historyStatus() is no-repo), a modal offer, then initGitRepository.
5. Open the board.
Test-only arguments may auto-answer prompts.

TEST API
Extend TeleleanApi, e.g. onDidPostToBoard, simulateBoardMessage(root, raw), workspaceFor(root). Keep the M0 sample path, or replace the M0 smoke tests with M1 ones (say which).

TESTS
Unit (vitest, no vscode):
- message-to-action mapping;
- EditApplier change conversion and the before check;
- TextSource preference;
- path refusal;
- actionResult/notice posting with requestId;
- subject switch on disappearance.
VS Code smoke under xvfb, with the isolated profile (plan 10):
- The pretest script makes the dirs under TELELEAN_TEST_TMP and copies mental_model to ws/. While mental_model/ has no .telelean/config.json yet, copy test-fixtures/spyro instead and generate .telelean/config.json plus an empty layout in the COPY only; never write into mental_model/ or test-fixtures/.
- It writes the user settings: chat.disableAIFeatures, telemetry off, updates off, experiments off, workspace trust off.
- .vscode-test.mjs sets workspaceFolder, --user-data-dir, --extensions-dir, --disable-extensions, --disable-telemetry and --disable-workspace-trust, and the env HOME/XDG_*, ELAN_HOME=/home/zhengyew/.elan, GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1. Keep DBUS_SESSION_BUS_ADDRESS and XDG_RUNTIME_DIR.
- The script runs sh -c 'ulimit -c 0; env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx vscode-test'.
- Assert that the isolated user-data dir was used, and that the real ~/.copilot, ~/.config/Code and ~/.config/google-chrome listings did not change.
The full smoke flow needs WP1-WP4, which are stubs until integration. Write it now, run what you can (activation, package.json, colours, CSP, a sample board), and report the rest as pending integration.

Build with npm run build (extension only).
Report the files, the real test output, effects outside the repo (check the real home dirs) and open issues for frozen files.
  - **acceptance_tests:** ["AT5.1 Activation and opt-in: the extension activates in the copied sample workspace; with two roots, openBoard asks (a test arg chooses one); a folder without .telelean runs no Lean", "AT5.2 package.json unit test: the 3 commands, the activation events, the settings with their defaults, the colours (6 ids, exactly one dot each, explicit hex defaults, no charts.*), untrustedWorkspaces false, virtualWorkspaces false", "AT5.3 Initialize on an empty scratch folder writes the scaffold (via planInitialize), validates the subject name, and handles the git offer (test arg)", "AT5.4 One BoardPanel per root; the serializer state holds root and subject, and a reopened panel restores them", "AT5.5 VS Code smoke flow on the copied sample (pending integration where it needs WP1-WP4):\n- 4 cards;\n- after refresh, semantic fresh and 9 vocabulary items;\n- addNode writes a block to Model/Spyro/Inbox.lean, and undo removes it;\n- G-to-A on cynder-not-good adds the axiom, and the refresh shows assumed;\n- copyText puts the code on the clipboard (env.clipboard.readText);\n- initGit, historyList and historyRevert work;\n- historyPreview opens a diff editor;\n- openInEditor opens Main.lean;\n- .telelean/graph.json exists", "AT5.6 Isolation: the isolated user-data dir received the instance's files; the real ~/.copilot, ~/.config/Code and ~/.config/google-chrome are unchanged after the smoke run; no leftover VS Code processes or telelean-* units of this run", "AT5.7 Unit tests:\n- protocol message to BoardAction mapping (all mutating types);\n- FileChange to WorkspaceEdit minimal edits;\n- the EditApplier refuses when a file's text differs from before;\n- TextSource prefers open documents;\n- openInEditor refuses paths outside the root;\n- actionResult/notice posting with requestId;\n- a vanished subject switches the board"]
- **id:** WP6
  - **title:** webview board UI: vocabulary group, cards with the 4 turn-9 requests, Depends on/Used by, edits, drop zones, tray, subject picker, history dropdown, Lean badge, Undo
  - **owned_paths:** ["packages/webview/**", "packages/extension/dist/webview/**"]
  - **brief:** Read docs/m1-plan.md first: the safety rules at the top, and sections 1.3, 5.1, 5.5, 6.2, 6.3, 6.4, 7.3, 8, 10, 12 (R5), 13, 14 and 15.

SAFETY (mandatory; also for anything you start):
- Never push, add remotes or use gh.
- Never publish or send anything to anyone.
- Network only to read docs.
- No downloads, no npm install, no new packages. Report a need in open issues.
- Never run the Claude CLI with a prompt. Never read credentials.
- Write only inside your owned paths and your scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/<your-label>/.
- Never touch the user's VS Code settings or extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, the npm config or the global git config.
- No sudo, no global installs. Do not run git in /home/zhengyew/telelean.
- Kill only processes you started.
- Report every effect outside the repo. Never claim a test passed unless you ran it; quote real output.

CHROME RULES:
- Playwright uses the installed Chrome (no browser download), one worker, an isolated HOME/XDG (plan 10) and ulimit -c 0.
- Do not run the VS Code smoke test (it is WP5's).
- Run free -m before running Chrome and wait while MemAvailable is under 12 GB.

GOAL
The M1 board in React 19 plus zustand, built by Vite into packages/extension/dist/webview.
- It consumes only @telelean/core:
  - protocol (frozen; do not edit);
  - model types;
  - kindChangeImpact and proofDependents (implemented);
  - samples (frozen): spyroGraph, spyroProvedGraph and largeGraph carry the M1 card data; spyroProvedGraph now matches the runner-lean proved overlay. Build variants for other statuses in your tests.
- Keep the M0 strict CSP:
  - no inline style attributes;
  - use the CSSOM, CSS classes and --vscode-* variables;
  - give fallbacks for the new contributed colours --vscode-telelean-vocabulary and --vscode-telelean-highlight.

STORE
- Handle all host messages:
  - graph: drop a graph whose version is lower than the last applied one; re-applying the same version is harmless;
  - workspace, history, actionResult, notice.
- Mutations carry a requestId (r<n>).
- Optimistic updates for drag, add and reorder roll back on actionResult ok:false, with an error toast.
- An add's optimistic card (provisional id) is replaced when the graph arrives; outcome.nodeId moves its selection and expansion to the final id.
- A needs-confirmation result opens the dependents dialog with outcome.dependents: node ids are shown as their sentences, other entries as Lean names in mono.
- addNode sends the sentence trimmed only (verbatim, D-16). Pasted line breaks become spaces, since the protocol requires one line.

UI

1. VOCABULARY GROUP at the top of the Assumptions list
- Collapsible. The state is kept in the webview state via setState, per board; not in layout.json.
- Grouped:
  - Types;
  - Predicates & relations;
  - Functions;
  - Constants;
  - Presuppositions: chips such as 'assumes characters exist', made from the sort's gloss ('assumes <gloss> exist'), falling back to 'assumes there is a <shortName>';
  - Definitions;
  - Lemmas;
  - Unmarked axioms (warning);
  - Other.
- Box-shaped items show the shortName, the type (mono) and the gloss (italic, with a marker if glossBy is 'agent').
- Each item is highlightable: scroll it into view within the column, plus a ~2 s data-highlight flash.

2. CARD FACE (M0 plus)
- Aura and a proof chip for every ProofStatus kind and flag:
  - pending-promotion: 'promotion pending';
  - conditional: 'conditional on …';
  - proved-goal: 'proved: make Derivation?';
  - uses-sorry; missing-holds;
  - not-checked: 'not checked by Lean', never a check mark;
  - stale: a subtle 'checking…' marker over the last known status.
- One 'needs attention' badge counting the error/warning diagnostics for the node.
- A D-13 hint chip on an ASSUMPTION with declared premises: 'you think this follows from those: prove it?'.
- A 'uses:' line when lean.uses exists:
  - deterministic truncation: the first 2 short names, then ', …' when there are more;
  - a toggle '▾ N' opens a dropdown listing all of them with kind and gloss; names from another subject are shown fully qualified;
  - clicking an entry highlights the vocabulary item.

3. EXPANDED VIEW
- The Lean code in a pre with class tl-lean.
  - Request 1: a drag inside it must select text and never drag the card. CSS alone cannot do this in Chrome (plan R5).
  - On pointerdown inside the code, set the card's draggable attribute to false; restore it on pointerup, pointercancel or blur.
  - Also: canDrag false for drags starting in the code; draggable=false and user-select:text on the code.
  - Clicks in the code do not toggle card selection: stop propagation; a click that ends a text selection changes nothing.
- Identifiers covered by lean.refs are spans:
  - hover shows a tooltip element with the gloss (vocabulary) or the sentence (node refs);
  - a plain click highlights the vocabulary item, or, for nodeId refs, reveals and flashes that card;
  - Ctrl/Cmd+click is reserved (no action yet).
- A Copy button posts copyText with exactly lean.code.
- An 'Open in editor' button posts openInEditor with codeLoc or loc.
- Footprint (proved and conditional) and presuppositions lists.
- 'Depends on' and 'Used by' lists (03 section 7; also the keyboard route). Each entry is clickable to reveal and flash its card.
  - Depends on: declared premises, verified sources, and statement mentions from lean-ref edges.
  - Used by: nodes declaring it, proofs using it (via proofDependents), and statements mentioning it.
- Buttons 'Make Assumption/Derivation/Goal' (the keyboard/menu equivalent of the drop zones, with the same impact and dialog), Edit, Delete.

4. INLINE EDIT
The sentence, the rationale ('because:' line), and the stance/source chips post editNode. Enter saves, Escape cancels; an empty rationale removes it.

5. DELETE DIALOG
- Lists the nodes that declare it as a premise (declared edges), the proofs that use it (proofDependents) and the statements that mention it (lean-ref edges).
- Options:
  - 'Delete card and its Lean code' (default);
  - 'Delete card only, keep Lean', explaining the hidden-assumption consequence;
  - Cancel.
- Posts deleteNode.

6. DRAG
- Within a column: post reorder (M0 posted nothing).
- Across columns, the drop zones show kindChangeImpact(graph, id, to).summary.
- On drop:
  - needsConfirmation opens the dialog: the dependents; 'Rewrite them to take it as a hypothesis' (disabled unless rewriteAvailable); 'Keep them, marked broken'; Cancel;
  - asksRationale shows an optional 'Why do you hold it?' field (Skip allowed);
  - then post kindChange with dependents/rationale.

7. A|D|G BOX
- Stance chips for Assumption: I believe it / It's a rule or definition / Supposing, for argument.
- A why field whose placeholder follows the stance and kind:
  - 'Why do you believe it?' / 'Where does the rule come from?' / 'What are you exploring?';
  - Derivation: 'Why do you think it follows?';
  - Goal: 'Why do you care?'.
- Optional source chips: observed / reported / inferred / common knowledge.
- Posts addNode with rationale, stance and source.

8. TRAY
- Presupposition chips from lean.presupposes of the selected nodes.
- 'These suffice ▶' posts theseSuffice.
- With zero premises, a disabled 'Self-evident?' plus the note 'available with Claude in M2'.

9. HEADER
- Subject picker: workspace.subjects with counts; 'New subject…' inline, with isSubjectName validation, posts createSubject; selecting posts selectSubject.
- History dropdown:
  - posts historyList on open;
  - entries 'time · action · label';
  - storage text 'This subject: 12 KB · All subjects: 30 KB';
  - per entry: Preview (historyPreview, compare parent) and 'Revert to this' (confirm, then historyRevert);
  - 'Keep last N' posts historyPrune;
  - when history.state is no-repo, an 'Initialize git' button posts initGit;
  - messages for git-missing, disabled and error.
- Lean badge per SemanticSummary state (plan section 4 mapping); clicking it posts refresh.
- A problems list (diagnostics); file items post openInEditor.
- The syntactic-mode banner for unsupported-toolchain, and the detail for disabled.
- Undo/redo buttons with the workspace labels.
- The M0 legend, extended with the conditional and mismatch arrows.

10. EDGES
- Declared dashed, verified solid (M0).
- Conditional verified edges are solid, with a distinct marker and a 'taken as a hypothesis' tooltip.
- Mismatch edges in a warning colour, with a tooltip.
- lean-ref edges are drawn thin, only while one end is hovered or selected.

11. TOASTS AND KEYS
- Toasts from notice; an Undo button when undoable posts undo.
- Ctrl+Z / Ctrl+Shift+Z (and Ctrl+Y) on the board post undo/redo when focus is not in an input, textarea or contenteditable.

HARNESS (test/harness/harness.js)
- Reply to mutations with actionResult ok (outcome.nodeId for addNode).
- Answer historyList with a canned listing.
- Let tests inject host messages: workspace, notice, and actionResult failures including needs-confirmation.

PLAYWRIGHT CONFIG
- In playwright.config.ts, launchOptions.env gets HOME, XDG_CONFIG_HOME, XDG_CACHE_HOME and XDG_DATA_HOME inside the run's short temp dir.
- Args: --disable-crash-reporter --disable-breakpad --no-first-run.
- The test:e2e script is sh -c 'ulimit -c 0; playwright test'.
- Compare the real ~/.config/google-chrome listing before and after.

Update M0 tests whose expectations the plan changed (e.g. reorder now posts) and say so.

RUN
cd packages/webview && npm test (typecheck, build into dist/webview, unit, e2e).
Report the files, the real test output, the before/after home-dir listings and open issues for frozen files.
  - **acceptance_tests:** ["AT6.1 Store:\n- graphs with a lower version are dropped; equal or higher versions are applied;\n- selection and expansion survive;\n- workspace/history/notice messages are stored;\n- an optimistic drag/add/reorder rolls back on actionResult ok:false with an error toast;\n- an add's provisional card gives way to the host's id, with the selection moved;\n- needs-confirmation opens the dialog with the host's dependents", "AT6.2 The vocabulary group renders the 9 spyroGraph items grouped by kind; it is collapsible (the state survives a harness reload via setState) and shows 'assumes characters exist' / 'assumes games exist'", "AT6.3 Cards show:\n- the aura for formalised nodes;\n- the right chip for each ProofStatus kind and M1 flag: pending-promotion; conditional; proved-goal on spyroProvedGraph's goal; uses-sorry; not-checked without any check mark; stale;\n- an attention badge counting node diagnostics;\n- the D-13 hint on an ASSUMPTION with premises", "AT6.4 Arrows: declared dashed, verified solid, conditional marked, mismatch styled, lean-ref only on hover/selection; the M0 edge-engine e2e tests still pass", "AT6.5 A|D|G box: stance chips (Assumption), a why placeholder per stance/kind, source chips; Enter posts addNode with naturalName (trimmed only), rationale, stance and source", "AT6.6 Inline edit of the sentence, rationale, stance and source posts editNode; Escape cancels; an empty rationale posts null", "AT6.7 The delete dialog lists premise dependents, proof dependents (spyroProvedGraph cynder-dark-past to cynder-not-good) and statement mentions (a test graph with a lean-ref edge), and posts deleteNode with the chosen keepLean", "AT6.8 Dragging within a column posts reorder with the right beforeId", "AT6.9 Cross-column drag:\n- the drop zones show kindChangeImpact summaries (e.g. 'Make Derivation: promotion pending until proved');\n- dropping cynder-dark-past on Goals in spyroProvedGraph opens the dialog listing cynder-not-good; rewrite is enabled when fresh and disabled when semantic is stale; it posts kindChange with dependents;\n- G-to-A offers the optional rationale field;\n- the expanded card's Make buttons behave the same", "AT6.10 Ctrl+Z / Ctrl+Shift+Z post undo/redo, but not while typing in an input; a notice with undoable shows an Undo button that posts undo", "AT6.11 The tray shows presupposition chips from lean.presupposes; These suffice posts theseSuffice; zero premises shows a disabled 'Self-evident?' with the M2 note", "AT6.12 The subject picker lists the workspace subjects and posts selectSubject; New subject validates the name and posts createSubject", "AT6.13 The history dropdown:\n- posts historyList on open;\n- renders 'time · action · label' entries and the storage counter text;\n- Preview posts historyPreview;\n- Revert asks, then posts historyRevert;\n- Keep last posts historyPrune;\n- the no-repo state shows 'Initialize git', which posts initGit", "AT6.14 The Lean badge text covers every SemanticSummary state; problems list items post openInEditor; the unsupported-toolchain banner appears; disabled shows its detail", "AT6.15 Playwright runs with HOME/XDG inside the run's temp dir and ulimit -c 0; the real ~/.config/google-chrome listing is unchanged after the run", "AT6.16 Request 1, on the expanded Lean code of cynder-dark-past:\n- a mouse drag across it gives a non-empty window.getSelection() containing code text;\n- it posts no reorder or kindChange;\n- the card never gets data-dragging;\n- the selection (tray) is unchanged;\n- a plain click in the code changes nothing;\n- dragging the card face still works afterwards (draggable restored)", "AT6.17 Request 2:\n- the cynder-not-good card shows 'uses: GoodAddition, cynder, …' with '▾ 3';\n- the dropdown lists GoodAddition, cynder and newSpyro with glosses, and clicking one highlights it in the vocabulary group;\n- cynder-dark-past shows 'uses: HasDarkPast, cynder' with '▾ 2' and no ellipsis;\n- cards without lean.uses show no line", "AT6.18 Request 3: the Copy button posts copyText whose text equals node.lean.code exactly, and the 'Copied' notice shows", "AT6.19 Request 4:\n- hovering the HasDarkPast span in cynder-dark-past's code shows 'has a dark past';\n- clicking it expands the vocabulary group, scrolls the item into view and sets data-highlight;\n- in spyroProvedGraph, clicking pg_no_dark_past.holds in the goal's proof reveals and flashes the pg-no-dark-past card;\n- Ctrl+click does nothing", "AT6.20 No CSP violations; the M0 e2e suite still passes (with any expectation changes the plan requires noted)", "AT6.21 For spyroProvedGraph, the expanded card's Depends on / Used by lists are right (the goal depends on the three assumptions; cynder-dark-past is used by the goal), and each entry reveals its card. The legend shows the declared, verified, conditional and mismatch arrows and the aura"]

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
- /home/zhengyew/telelean/packages/core/test/raw-imports.d.ts
- /home/zhengyew/telelean/packages/runner/src/index.ts
- /home/zhengyew/telelean/packages/runner/src/semantic/types.ts
- /home/zhengyew/telelean/packages/runner/src/semantic/index.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/types.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/index.ts
- /home/zhengyew/telelean/packages/runner/tsconfig.json
- /home/zhengyew/telelean/packages/runner/vitest.config.ts

## integration_plan
The integrator owns the frozen files and runs every heavy step one at a time: check free -m first, LEAN_NUM_THREADS=4, TELELEAN_TEST_TMP set to a scratch dir, ulimit -c 0 in test scripts.

1. Owned-path discipline. Diff each WP's changes against its owned paths. Review the plan's section-14 entries (additive contract changes) and the builders' open issues about frozen files, and apply the accepted ones yourself. Confirm that no `.telelean/config.json` exists outside `mental_model/` and `test-fixtures/`.

2. Remove the stub gates and typecheck. Delete every `isImplemented(...)` skip gate, and the trivial stub test in `contracts.test.ts`. Typecheck:
   - core (`tsc -p packages/core/tsconfig.test.json`);
   - runner;
   - webview (both configs);
   - extension.
   Check that the extension's tsconfig has the `@telelean/runner` paths, and that the esbuild bundle loads without evaluating `llm/confinement.ts`.

3. Package suites:
   - core `npm test`;
   - runner `npx vitest run` (M0 lean/llm, WP3 semantic and WP4 workspace; the Lean tests use sandboxed runLean);
   - webview unit tests;
   - extension unit tests.

4. New integrator-owned end-to-end test in `packages/runner/test/integration/`. It uses a scratch copy of `mental_model/`, a fs EditApplier that checks `before`, the real `refreshLeanFacts`, and `git init` in the copy (with `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CEILING_DIRECTORIES` and the safe `-c` flags).
   - `load`: the Spyro graph has 4 nodes in fixture order.
   - `refreshNow`: fresh. Compare `subjectGraph` card data with the frozen sample:
     - cynder-dark-past and new-spyro-pg are assumed, and the goal has proof none;
     - there are 9 vocabulary items and the two Nonempty instances are hidden;
     - `uses`, `refs` and `presupposes` equal the sample's. They are names and code-relative ranges; `mental_model/Main.lean` sits one line lower than the fixture, so only `loc`/`codeLoc` differ by one line.
   - Perform each action and check the files:
     - add-node: a block in Inbox.lean, layout appended, the host-derived id;
     - edit-node: the docstring mirror follows, and an adjacent binding gets pinned;
     - set-premises;
     - reorder: layout only, not snapshotted;
     - G→A on the goal: axiom added, and after the refresh it is assumed;
     - undo and redo.
   - Apply the proved overlay by hand. Then A→G on an assumption the goal's proof uses, once with mark-broken and once with rewrite (afterwards the goal is conditional on it, and its binder is first).
   - Add a derivation proved by a theorem and used by a goal's proof. The verified edge derivation→goal must exist, and D→G must ask for confirmation.
   - delete.
   - History: entries with trailers, a storage counter above 0, revert, and undo of the revert.
   - `graph.json` parses and validates against the zod schema.
   - The copy's `git status --porcelain`, `.git/index` mtime, HEAD and branches are unchanged, and no hook ran.
   Also re-check WP2's hand-written `spyro-facts.json` against WP3's real facts for the fixture (kinds incl. `instance` for the Nonempty instances, `typeSort`, refs, axioms) and fix whichever side is wrong.

5. Lean round-trip of the escape rule. Render and edit blocks whose sentences and bodies contain the two comment delimiters, slash-dash-slash, dash-slash-dash, a leading quote and a newline, and a docstring via `set-docstring`. Build the scratch project under runLean: it must succeed, and re-parsing must give identical values.

6. Webview and extension together. Run `npm run build` in webview (writes `dist/webview`), then Playwright with an isolated HOME. Then the extension build plus the VS Code smoke test under xvfb with the isolated profile of plan section 10, on the copied sample: add, undo, kind change, copy to the clipboard, history with revert and preview, `graph.json`.
   - Compare the listings of the real `~/.copilot`, `~/.config/Code` and `~/.config/google-chrome` before and after.
   - Check that no telelean-* units or test processes of these runs are left.
   - Check that `~/.elan/known-projects` is unchanged.

7. Rebuild `packages/extension/dist` (extension and webview) last, so the user's in-place installed extension shows M1 after "Developer: Reload Window".

8. Write `docs/m1-report.md`. Include:
   - the real test outputs;
   - deviations from the plan;
   - the decisions log from plan section 13 (decisions 1-31) plus any builder decisions, for the user to read later.
   The smoke test is the stand-in for the user's own VS Code: never use the user's VS Code profile or windows.

## minor_decisions
- **decision:** The per-card vocabulary ('uses:'), hover glosses and click targets come from Lake's .ilean files (v5: declaration ranges, and references with their parent declarations). Kind, type, statement value, footprint and sorry come from a generated check file (#check @N, #print N, #print axioms N, plus #check type_of% @N for axioms and opaques, with pp.fullNames and pp.proofs false). No compiled extractor and no import Lean in M1.
  - **rationale:** Verified on Lean 4.35 by the architect and the review: exact resolved references, with UTF-16 columns; about 0.3 s and 480 MB for the check. This keeps 03 §5's tool-free M1. The toolchain is pinned, so the internal format is stable, and unknown versions degrade to 'no refs'.
- **decision:** The Lean refresh builds in place in the model folder (sources read-only, .lake writable, .git masked), not in a shadow. A module is fresh unless Lake failed it or one of its imports failed; Lake deletes failed modules' .olean/.ilean. Sources are hashed before and after the build, to mark stale files.
  - **rationale:** This matches 03 §8.4/D-24 and is incremental and fast. Staleness keyed by file hash is 03 §2 step 3. The review corrected the risk note: Lake has no build lock, so races with the user's Lean server are possible but self-healing; a private build shadow is the fallback.
- **decision:** The opt-in marker is .telelean/config.json (it also holds the library name), not layout.json.
  - **rationale:** Layout is per subject and optional; a dedicated config file is a clearer marker and holds the project settings.
- **decision:** Sidecars are per subject: .telelean/subjects/<S>/layout.json and attic/<id>.lean. graph.json stays at the root (gitignored).
  - **rationale:** A subject's history snapshot and revert then cover exactly its own files (D-10 plus A3's per-subject counter).
- **decision:** History uses one git ref chain per subject (refs/telelean/<rootKey>/subjects/<S>) plus a project chain, built with plumbing only (temporary index, commit-tree, update-ref). Every call uses -c commit.gpgsign=false -c core.hooksPath=/dev/null -c gc.auto=0 -c core.fsmonitor=false, GIT_TERMINAL_PROMPT=0 and an explicit author.
  - **rationale:** Revert stays per subject; the storage counter is per subject and overall; the user's index, branches and hooks are never touched, as D-33/A3 promised. fsmonitor is off so a user-configured monitor daemon is never started.
- **decision:** Layout-only changes (re-order) are undoable but not snapshotted on their own.
  - **rationale:** Layout carries no meaning, and an entry per drag would flood the history the user wants for meta-analysis.
- **decision:** 'Keep last N' rewrites the chain and does not run git gc on the user's repository.
  - **rationale:** Running gc or prune on the user's repo is invasive. The counter (reachable objects) drops at once, and the disk space returns at git's next housekeeping.
- **decision:** mental_model/ is written without .lake and without git init. The board offers 'Initialize git' when the user wants history there.
  - **rationale:** mental_model sits inside /home/zhengyew/telelean, which must stay git-free; git init is the user's choice (Initialize offers it).
- **decision:** In M1, 'These suffice' writes the target's premises: (declared support, D-13) and says that proving with Claude arrives in M2. Zero premises ('Self-evident?') answers 'available from M2'.
  - **rationale:** M1 has no AI; the button still does what D-13 defines for it. Self-evidence is meaningful only with a run.
- **decision:** Strict D-2(b): a block bound to anything other than a Prop abbrev/def is flagged TL113 (ill-formed). The message says how to write the approved form.
  - **rationale:** telelean writes and reads only the approved convention; guessing other shapes would make statuses unreliable.
- **decision:** 'uses:' is the vocabulary in the statement closure: the statement's own refs, then refs reached through other nodes' statements and through vocabulary definitions, in first-occurrence order; sorts appear only where written. Inline it shows the first 2 names, then ', …', with a '▾ N' dropdown.
  - **rationale:** This follows the user's 'HasDarkPast, cynder, ...' example deterministically (so it is testable) and works for large vocabularies. Going through definitions shows what the meaning really depends on (D-4).
- **decision:** Clicking another node's name inside the expanded code reveals and flashes that card, besides the requested vocabulary highlight. Ctrl+click is reserved for later.
  - **rationale:** A natural extension of the user's hover/click idea at the same cost; it keeps Ctrl+click free for their planned go-to/edit features.
- **decision:** Glosses are shown as the user's wording in M1 (glossBy 'user'); M2 marks agent-worded docstrings.
  - **rationale:** There is no agent in M1; D-3's 'Claude's wording until you rewrite it' matters only once runs create vocabulary.
- **decision:** Instances that only re-export a presupposition (instance : Nonempty T := T.exists) are not listed in the vocabulary group.
  - **rationale:** They are plumbing for the presupposition chip and would clutter the group. The review found that Lean prints them as theorems, so they are recognised by the source keyword and matched by start line.
- **decision:** wording.jsonl and attempts.jsonl are not written in M1.
  - **rationale:** History snapshots keep every old wording; attempts only exist once runs exist (M2).
- **decision:** The graph.json JSON Schema is generated from a zod schema (z.toJSONSchema) kept out of the webview bundle.
  - **rationale:** zod is a declared, installed dependency; ajv is present only transitively and may not be added.
- **decision:** The runner is typecheck-only (noEmit). Runner and extension resolve @telelean/core (and the extension also @telelean/runner) from source, through tsconfig paths and vitest aliases.
  - **rationale:** The extension and webview already work this way; no build step or workspace links are needed, and stale dist output is avoided.
- **decision:** Applying an edit saves the touched files, including any unsaved typing in them. The applier first refuses if a file changed since the plan was made.
  - **rationale:** D-17 says edits are saved immediately, and history and undo need the result on disk. The before-check prevents overwriting typing that arrives between planning and applying.
- **decision:** New-subject import order: Vocabulary ← Inbox ← Main (Main imports Inbox).
  - **rationale:** Nodes formalised by hand in Inbox can then be used by Main without moving code.
- **decision:** No port-drag arrows in M1. The expanded card has 'Make Assumption/Derivation/Goal' buttons as the keyboard and menu equivalent of the drop zones.
  - **rationale:** The tray already declares support; the buttons give accessibility and testability with the same impact/dialog logic.
- **decision:** Contributed colour ids keep exactly one dot and get explicit per-theme hex defaults (no charts.*); telelean.vocabulary and telelean.highlight are added.
  - **rationale:** M0 lessons: VS Code replaces only the first dot, and some themes derive charts.* badly.
- **decision:** Parts of the contract were implemented up front so builders need not wait: by the architect, the protocol validators, kindChangeImpact, the layout/path helpers, runExclusive and readMemAvailableBytes; by the review, subjectScaffold with frozen exact texts.
  - **rationale:** The webview can build and test drop zones and messages without the host. Initialize, New subject and the sample write identical files without WP2 and WP4 coordinating.
- **decision:** requestId is optional on all mutating messages (actionResult only when one is given); theseSuffice accepts empty premises.
  - **rationale:** The M0 webview keeps compiling and its tests stay valid during the parallel build, and it leaves room for M2's self-evident runs.
- **decision:** (review) Verified arrows come from Lean's references (the proof's .ilean usages, followed through untracked lemmas to the first node). Footprints still come from #print axioms.
  - **rationale:** #print axioms lists only axioms (verified: theorem g2.holds := d0.holds.2 lists only d0's assumptions). Footprint-based arrows would miss every derivation→goal edge, and D→G could then delete a .holds another proof uses, which D-11 forbids.
- **decision:** (review) Declared-vs-verified mismatches (TL107/TL109) are judged at the assumption level, and only for proved or conditional targets.
  - **rationale:** A proof that routes through a derivation of the declared premises should not be flagged, and an unproved goal's premises are never 'unused'.
- **decision:** (review) A stale file keeps its previous facts by name while the declaration keyword is unchanged (flag stale). Theorems that Lean has not checked show no proof (not-checked) instead of the syntactic 'proved'.
  - **rationale:** Statuses don't flicker while typing, and the board never claims 'proved' without Lean (the prototype's integrity principle).
- **decision:** (review) The mechanical D-11 rewrite inserts the hypothesis as the first binder, and refuses (unsafe) when a dependent is not a theorem or a use is invisible to the references.
  - **rationale:** With the binder last, (c h) passes h to the wrong parameter for theorems that have their own hypotheses. A def cannot take a hypothesis without changing its type. 'Mark broken' stays available.
- **decision:** (review) Projects with Lake dependencies (e.g. Mathlib) are refused in M1: Initialize returns unsupported, and the refresh returns unsupported-project without spawning anything.
  - **rationale:** D-28 asks for an explicit Mathlib opt-in (M4), and building or importing Mathlib would break the user's RAM rule.
- **decision:** (review) Hidden assumptions are recognised by Lean's sort check (#check type_of% @N prints ': Prop'), not by guessing from the type text. An axiom-declared constant or function is flagged TL111.
  - **rationale:** Verified output on 4.35. An axiom constant asserts existence without the visible presupposition D-3 requires; opaque constants make it explicit.
- **decision:** (review) An adjacent binding is pinned (lean: written) on the next telelean edit of its block, like the derived-id write-back (D-8).
  - **rationale:** D-8 says telelean pins once a node is formalised; in M1 the user formalises by hand, so the next edit is the natural moment.
- **decision:** (review) The host always derives new node ids itself (deriveId, with n-<hex> for non-Latin text). The webview's provisional id only matches its optimistic card.
  - **rationale:** The webview's slug and core's deriveId differ for non-Latin sentences (D-8 requires the n-<hex> fallback). ActionOutcome.nodeId tells the webview the final id.
- **decision:** (review) The M0 legend gains the conditional and mismatch arrows. The expanded card gets 'Depends on / Used by' lists. An ASSUMPTION with declared premises shows D-13's 'prove it?' hint.
  - **rationale:** D-15 requires a legend; 03 §7 specifies the Depends on/Used by buttons (also the keyboard and screen-reader route); D-13 specifies the hint. All are cheap in M1.
- **decision:** (review) The vocabulary group's collapsed state is kept in the webview state (per board, survives reloads), not in layout.json.
  - **rationale:** Writing a file per toggle would create undo entries and file churn for UI state.
- **decision:** (review) A model workspace is created when its first board opens and lives until the window closes; Lean refreshes run only while a board is open.
  - **rationale:** Undo survives closing and reopening the board; parsing is cheap; D-28's refresh rule is kept.
- **decision:** (review) spyroProvedGraph() was corrected to match test-fixtures/runner-lean/overlays/proved: block locs, pg-no-dark-past pinned, its docstring line in code, codeLoc 13-15.
  - **rationale:** The sample is the canonical card data that WP2 and the integrator reproduce from real facts; it must agree with the fixture it cites.
- **decision:** (review) Core tests read fixture files with Vite ?raw imports, declared once in packages/core/test/raw-imports.d.ts.
  - **rationale:** Core is typechecked with types: [] on purpose (no Node APIs in src), so node:fs is unavailable in its tests; ?raw works under vitest 5 (verified).
- **decision:** (review) Lean messages keep their continuation lines. Lake log ranges are zero-width at the reported start.
  - **rationale:** An M0 open item: first-line-only errors lose the detail the problems list needs. Lake prints only a start position.
- **decision:** (review) The delete dialog and planDelete also list statements that mention the node's abbrev.
  - **rationale:** Deleting the statement abbrev breaks those statements too, not only proofs that use the .holds.

## major_decisions_needing_user

## effects_outside_repo
- Scratch dir writes in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m1-reviewer/:
- spyro/: a copy of test-fixtures/spyro plus a probe module Model/Spyro/Extra.lean and a modified Model.lean, with a .lake/ build;
- check.lean: the probe check file;
- Extra.lean.good: a backup of the probe module;
- scaffold/: a scaffold test project with a .lake/ build.
- Ran the toolchain's lake and lean directly (unsandboxed) on those scratch copies of the trusted fixture:
- lake build 4 times: spyro three times, including one deliberate build error; scaffold once;
- lake env lean --stdin --json once;
- /usr/bin/time once.
They wrote only inside the scratch copies. ~/.elan/known-projects stayed at 37 lines (checked before and after). No Lean processes of mine are left running; the lean --server processes on this machine belong to the user's VS Code.
- Ran one read-only git command in the scratch dir: git -C <scratch>/scaffold status, which reported 'not a git repository'. No other git commands; none in /home/zhengyew/telelean.
- npm wrote a debug log to ~/.npm/_logs for each of my npm/npx invocations (about 19 runs between 11:33 and 11:46 +0800, 2026-11-01): npm test, npx tsc, npx vitest and one npm config get logs-max. npm keeps only 10 logs (logs-max 10), so its rotation deleted older log files there, including logs from earlier agents' runs.
- Inside the repo, beyond the plan and the contract files: vitest refreshed its caches (packages/{core,runner,webview,extension}/node_modules/.vite and .vite-temp). I created and then deleted two temporary probe tests inside packages/core/test (zz-raw-probe.test.ts and zzprobe/raw.test.ts), to verify ?raw imports.
- Read-only access outside my paths: the architect's scratch files (check1.lean, check2.lean, time1.txt, its spyro/.lake/*.ilean), the main session's STATE.md, and the toolchain's Lake/Lean sources under ~/.elan/toolchains/leanprover--lean4---v4.35.0/src (read, not modified). python3 -I was used only to read JSON and compute line numbers.
- No downloads, no npm installs, no network use, no Claude CLI runs, no pushes or remotes, and no changes to the user's VS Code, ~/.config, ~/.claude, ~/.elan or git config. No systemd units were started (no runLean runs).

