export const meta = {
  name: 'telelean-project-report',
  description: 'Read-only: per-file summaries, Lean-system theory (fact-checked), features, assembled into a project report',
  phases: [
    { title: 'Survey', detail: 'per-file summaries, theory draft, features draft (parallel)' },
    { title: 'Fact-check', detail: 'independent verification of the Lean-theory draft' },
    { title: 'Assemble', detail: 'editor writes the main report' },
  ],
}

const REPO = '/home/zhengyew/telelean'
const SCR = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9'
const DOCS1 = REPO + '/verbatim_prompt_log/bundle_1/user_requested_documents'

const SAFETY = `
RULES (mandatory). This is a READ-ONLY documentation job.
- Do not modify anything under ${REPO} or elsewhere; write only inside your scratch dir ${SCR}/report-<your-label>/ if you need notes or small experiments.
- Never push to any remote repository, never send or publish anything, no downloads, no installs, no network use at all.
- Never run the Claude CLI or scripts/walkthrough-claude.mjs / scripts/smoke-claude.mjs (except --dry-run if truly useful), never read credentials.
- RAM: at most one heavy process; Lean only via ~/.elan/toolchains/leanprover--lean4---v4.35.0/bin directly, LEAN_NUM_THREADS=4, in scratch copies; leave no processes behind.
- Return your result as the structured output (no report files). Be accurate: describe what the code DOES now, not what plans intended; when the code and docs disagree, say so.
`
const PROJECT = `
PROJECT. telelean: a VS Code extension (personal-use prototype) that shows a user's mental model as ASSUMPTION / DERIVATION / GOAL nodes in three columns, backed by Lean 4 files ("@@ telelean" markup blocks in Lean comments), with an LLM harness ("These suffice": Claude via the user's own Claude Code CLI) gated by non-LLM Lean checks. Repo ${REPO}: npm workspaces packages/core (pure TS: markup, project model/statuses, edits, export, gate rules, proposals, protocol), packages/runner (Node: Lean sandbox, semantic refresh, workspace/history, shadow, gate engine, run manager, proposals/Accept, LLM backends), packages/extension (VS Code adapter), packages/webview (React board); scripts/; mental_model/ (sample Spyro model); test-fixtures/; docs/ (design-amendments, m0-report, m1-plan, m2-plan, user-guide, decisions-log). Original design: ${DOCS1}/02_design_decisions.md and 03_architecture.md. Status: M1 (board without AI) done; M2 (one-shot "These suffice") implemented and verified with a fake LLM backend; the real-Claude walkthrough has NOT been run yet.
`
const FILES = { type: 'object', properties: {
  package_overview: { type: 'string', description: 'conceptual overview of this part: responsibilities, module groups, main data flow, how it connects to the other packages (300-700 words)' },
  files: { type: 'array', items: { type: 'object', properties: {
    path: { type: 'string', description: 'repo-relative' }, purpose: { type: 'string', description: '1-3 sentences: what it is for and what it does' },
    key_exports: { type: 'string' }, depends_on: { type: 'string', description: 'main internal dependencies' },
  }, required: ['path', 'purpose'] } },
}, required: ['package_overview', 'files'] }

const GROUPS = [
  { key: 'core', scope: 'every file under packages/core/src/ (about 61 files), plus packages/core/package.json and its tsconfig/vitest config files' },
  { key: 'runner-a', scope: 'every file under packages/runner/src/lean/, packages/runner/src/semantic/, packages/runner/src/llm/, plus packages/runner/src/index.ts, packages/runner/package.json and its tsconfig/vitest config files' },
  { key: 'runner-b', scope: 'every file under packages/runner/src/workspace/, packages/runner/src/shadow/, packages/runner/src/gate/, packages/runner/src/run/, packages/runner/src/proposal/' },
  { key: 'extension-repo', scope: 'every file under packages/extension/src/ and packages/extension/scripts/, packages/extension/package.json (summarise its contributed commands, settings, colours) and .vscode-test.mjs/tsconfig; the root package.json, tsconfig.base.json, .gitignore, .node-version; scripts/*.mjs; every file of mental_model/ except .lake; test-fixtures/ (one entry per subdirectory, plus notable files); docs/*.md (one entry each)' },
  { key: 'webview', scope: 'every file under packages/webview/src/, plus packages/webview/index.html, vite/playwright/vitest configs and tsconfigs' },
  { key: 'tests', scope: 'every test file under packages/core/test, packages/runner/test, packages/extension/test and packages/webview/test (about 190 files; one entry each: what it verifies; fixtures/helpers briefly). In package_overview, explain the test strategy (unit, real-Lean integration, FakeBackend scripts incl. the cheat catalogue, Playwright, VS Code smoke/e2e under xvfb with isolated HOME, quota tripwires) and how to run each suite' },
]

phase('Survey')
const filesP = parallel(GROUPS.map((g) => () => agent(`${SAFETY}\n${PROJECT}
YOUR TASK: per-file survey of: ${g.scope}. Read each file (skim large ones fully enough to be accurate). For every file give its repo-relative path, a 1-3 sentence purpose, its key exports and main internal dependencies. Also write a conceptual package_overview. List files in directory order. Do not skip files.`, { label: `files:${g.key}`, phase: 'Survey', schema: FILES })))

const THEORY = { type: 'object', properties: {
  markdown: { type: 'string', description: 'the full Part 3 text in Markdown' },
  claims: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, where: { type: 'string', description: 'file:function or test that supports it' } }, required: ['claim', 'where'] } },
}, required: ['markdown', 'claims'] }
const theoryP = agent(`${SAFETY}\n${PROJECT}
YOUR TASK: write "Part 3: The Lean system" of the project report: a thorough description of the THEORETICAL system telelean uses at present, for a reader with a formal-methods background who wants to review and possibly change it. Not implementation details, but precise semantics, each rule's rationale, and where it lives so it can be changed. Derive everything from the CURRENT code and tests (core/src/project, core/src/kindChange.ts, core/src/edit, core/src/gate/*, runner/src/semantic/checkFile.ts, runner/src/gate/engine.ts, runner/src/lean/comparator.ts, runner/src/run/manager.ts and systemPrompt.ts, core/src/gate/adoption.ts, the cheat tests) and use docs/m1-plan.md, docs/m2-plan.md (section 3 was just aligned with the code), docs/design-amendments.md and 02/03 for intent. Cover at least:
1. The objects: nodes (ASSUMPTION/DERIVATION/GOAL), subjects, natural-language text vs Lean, code-less nodes, stance/rationale, declared premises.
2. The encoding: statements as "abbrev n : Prop := S", n.holds as axiom (assumption) / theorem (derivation) / absent (goal), conditional derivations, vocabulary declarations, presuppositions (T.exists), naming and binding of blocks to declarations.
3. The vocabulary discipline: the shape rule, what is forbidden and which smuggling attack each prohibition blocks.
4. Lean facts and statuses: footprints (#print axioms), how each status is derived, verified vs declared arrows, what "proved" means formally (state it as a precise property of the footprint), what "assumed", "pending", "broken", "stale" etc. mean.
5. Kind changes (D-11) as operations on the encoding and their effect on dependents (incl. conditional proofs).
6. The "These suffice" judgement (M2): inputs (selected premises P, target g), the run protocol (formalise -> freeze -> prove), the permitted axiom set as an explicit formula (incl. the rule that only proofs the user already had contribute), each gate check G0/G1/G3/G4/G5 and every named rule (new-axiom, footprint, carriers, existing-changed, statement-changed, vocabulary-shape, examples, markup...) as an invariant with the attack it blocks, the comparator's role, the retry loop (cap 3, revert), outcomes, ghost premises (what the gap proof must establish; adoption), Accept's re-check, questions/decisions.
7. What is NOT guaranteed: faithfulness of the Lean to the sentence, consistency/vacuity (M3), what TypeScript bookkeeping is trusted vs what Lean decides, examples, the opt-in reuseLeanBuild caveat, prototype sandbox limits, other known limitations.
8. A worked example on the Spyro sample: normative vs literal reading, with the actual Lean.
9. A table: rule -> where it lives (file/function) -> how to change it (setting or code).
Also list your key claims with supporting code locations.`, { label: 'theory:write', phase: 'Survey', schema: THEORY })

const FEATURES = { type: 'object', properties: { markdown: { type: 'string', description: 'the full Part 2 text in Markdown' } }, required: ['markdown'] }
const featuresP = agent(`${SAFETY}\n${PROJECT}
YOUR TASK: write "Part 2: Functionality and features" of the project report: everything the user can do now and what happens, verified against the code (packages/extension/package.json contributions, the extension's commands and settings, the webview UI, the runner behaviour) and docs/user-guide.md. Cover: setup/run directions (install from location, reload, Initialize Model Here, Open Board); the board (columns, cards, vocabulary group, uses dropdown, hover gloss and click highlight, copy button, text selection in code, arrows, statuses/glyphs/aura, subjects picker, Lean badge); M1 actions (A/D/G box with stance/why, edit, delete with dependents confirmation, kind changes with D-11 impact, re-order, Undo/Redo, history dropdown with revert and storage counter, git init offer, graph.json); M2 runs (consent, These suffice from the tray incl. zero premises, run panel, questions, retry notices and revert, review toggle, proposal overlay, raw Lean diff, report card, Accept/Feedback/Discard, ghosts and I hold this, attempts history, cancel, resume after reload, usage/quota display); every setting with default; safety features (sandbox, memory cap, path guard, env sanitising, quota tripwires, test isolation); limitations and known issues; what has not been done yet (real-Claude walkthrough, the modifications audit, two script tests not run, M3/M4/H) and the open user decision (where Raw Lean diff opens).`, { label: 'features:write', phase: 'Survey', schema: FEATURES })

phase('Fact-check')
const VER = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['accurate', 'minor-corrections', 'major-corrections'] },
  corrections: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, problem: { type: 'string' }, correct_statement: { type: 'string' }, evidence: { type: 'string' } }, required: ['claim', 'problem', 'correct_statement', 'evidence'] } },
  missing: { type: 'array', items: { type: 'string' } },
}, required: ['verdict', 'corrections', 'missing'] }
const checkedP = theoryP.then((t) => agent(`${SAFETY}\n${PROJECT}
YOUR TASK: independent, adversarial fact-check of a draft "Part 3: The Lean system". Check EVERY claim against the current code and tests (and, where cheap, small Lean experiments in scratch copies of mental_model). Look for wrong formulas (permitted set, status derivation), rules described that the code does not enforce, enforced rules the draft omits, overstated guarantees, and wrong code locations. Draft (JSON with markdown and claims):
${JSON.stringify(t, null, 1)}`, { label: 'theory:check', phase: 'Fact-check', schema: VER }).then((v) => ({ t, v })))

const [files, checked, features] = await Promise.all([filesP, checkedP, featuresP])

phase('Assemble')
const REPORT = { type: 'object', properties: { markdown: { type: 'string', description: 'the complete main report in Markdown' }, notes: { type: 'string' } }, required: ['markdown', 'notes'] }
const report = await agent(`${SAFETY}\n${PROJECT}
YOUR TASK: assemble the MAIN project report (Markdown) for the user, a formal-methods researcher who will review and possibly change the system. Structure:
- Title "telelean: project report", date 2026-11-02, a short status summary (M1 done; M2 implemented and verified with a fake backend; real-Claude walkthrough not yet run; what is paused).
- Part 1: Architecture. A high-level conceptual breakdown: processes (VS Code window, extension host, webview, sandboxed Lean/Lake, git, Claude Code CLI + MCP tool server), the four packages and their module groups (use the package overviews below), the main data flows (refresh, edit/undo/history, a run end to end, Accept), what is stored where (model folder, .telelean sidecars, git refs, extension storage, runs), trust boundaries. End with a pointer: "Per-file summaries: docs/project-report-files.md".
- Part 2: Functionality and features (use the draft below; tighten, keep it accurate).
- Part 3: The Lean system (use the theory draft below and APPLY every correction from the fact-check; integrate the 'missing' items). Keep formulas precise.
- Appendix: known limitations and open items; glossary of terms (shadow, freeze, footprint, permitted set, presupposition, ghost, comparator, gate loop...).
Write clearly, use tables where they help, and do not include the per-file list itself.
PACKAGE OVERVIEWS (from the per-file surveys):
${JSON.stringify(files.map((f, i) => ({ part: GROUPS[i].key, overview: f ? f.package_overview : '(survey failed)' })), null, 1)}
FEATURES DRAFT:
${features ? features.markdown : '(missing)'}
THEORY DRAFT:
${checked && checked.t ? checked.t.markdown : '(missing)'}
FACT-CHECK (apply all corrections):
${JSON.stringify(checked ? checked.v : null, null, 1)}`, { label: 'assemble', phase: 'Assemble', schema: REPORT })

return { files: files.map((f, i) => ({ part: GROUPS[i].key, result: f })), theory: checked ? checked.t : null, check: checked ? checked.v : null, features, report }
