export const meta = {
  name: 'slice-2k2-chain',
  description: 'Finish 2k2 (a model\'s data kept in its own folder) from the interrupted partial work: Opus builder, two Sonnet verifiers, Sonnet fixer and re-verifier, Haiku integrator with the real-Lean suite',
  phases: [{ title: 'Build' }, { title: 'Verify' }, { title: 'Fix' }, { title: 'Reverify' }, { title: 'Integrate' }],
}
const S = '/tmp/claude-1000/-home-zhengyew-telelean/3358448c-d9b7-4f38-afd0-3f73c08df70e/scratchpad'
const PATCHES = '/home/zhengyew/telelean/verbatim_prompt_log/bundle_32/evidence/patches'
const FINDING = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
    where: { type: 'string' },
    problem: { type: 'string' },
    evidence: { type: 'string' },
    fix: { type: 'string' },
  },
  required: ['id', 'severity', 'where', 'problem', 'fix'],
}
const FIND = { type: 'object', properties: { summary: { type: 'string' }, checks_run: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: FINDING } }, required: ['summary', 'findings'] }
const REV = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    checks_run: { type: 'array', items: { type: 'string' } },
    resolved: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, how: { type: 'string' } }, required: ['id', 'how'] } },
    findings: { type: 'array', items: FINDING, description: 'every finding still open (keep its original id) plus every new problem (new id, prefix R)' },
  },
  required: ['summary', 'resolved', 'findings'],
}
const INTEG = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true only if every check passed and the patch was saved' },
    summary: { type: 'string' },
    checks: { type: 'array', items: { type: 'string', description: 'command and its summary line' } },
    runner: { type: 'string', description: 'the full runner suite summary line(s)' },
    patch: { type: 'string' },
  },
  required: ['ok', 'summary', 'checks', 'runner'],
}
const FIXOUT = { type: 'object', properties: { report: { type: 'string', description: 'your full report as the prompt asks' }, notFixed: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'why'] } } }, required: ['report', 'notFixed'] }

const SPEC_LENS =
  "FIDELITY TO THE USER'S DESIGN, THE PLAN AND THE SPEC. The brief's DESIGN section is the user's own decision (turn 27); for 2k2 its REQUIREMENTS section holds the orchestrator's safety conditions, which bind equally. They override older plan text, docs/m2-plan.md and the architecture document where they conflict. Go through DESIGN (and REQUIREMENTS) item by item, every listed edge case and test included, and through the plan entries the builder wrote (§1.1, §6.1, §7.2, §8, and the tagged edits elsewhere). Check that the diff does each one, and nothing that contradicts them or the other plan contracts and autopilot decisions. Check that the builder's plan and doc edits leave no sentence stating the old rule (for example where run data lives, or that the review panel stays after the end) that a later builder or the user would follow. Check that the §6.1 tests exist and test what they claim, and that unrun suites are reported as unrun. Check the safety properties the spec cares about: nothing assumed without the user's individual Accept; no result shown before the meaning check; no state applied that no check judged; the user's decisions and notes never lost on rollback, reload, crash, Undo or Redo; Claude never reads or changes what it must not; run data never reaching git, the model's files or the board. Do NOT run builds or tests (another part of your work or another verifier does that only where told)."
const CODE_LENS =
  `CODE CORRECTNESS AND REGRESSIONS. Read the diff of this work: run ${S}/snapdiff2.sh <your scratch dir>/now.diff (every change against HEAD 99cff93, which already holds 2k1: the snapshot is exactly 2k2's work). Look for bugs, missed call sites (grep every changed symbol and text across core, runner, webview, extension, their tests, golden files and Playwright specs), broken behaviour, unhandled edge cases (empty, single, many, removal, unchanged, duplicate, reload mid-way, Undo/Redo) and tests that do not test what they claim. Then confirm the builder's verification claims yourself: run the brief's typecheck and unit-test commands ONE AT A TIME through capped.sh (vitest one worker, always with --no-cache --fsModuleCachePath=<your scratch dir>/fsmc and TMPDIR=<your scratch dir>/tmp; runner: only the test files the change touches, each under \`timeout 900\`, TELELEAN_TEST_TMP in your scratch dir). Quote the summary lines in checks_run.`
const COMBINED_LENS = 'FIDELITY AND CODE CORRECTNESS (two concerns, one reviewer). (1) ' + SPEC_LENS + ' (2) ' + CODE_LENS
const ADV_LENS =
  "ADVERSARIAL SAFETY. Assume the builder made a subtle mistake. Within this work's scope and its interaction with what slice 2 built, hunt for concrete states or event orders that make the code: (a) keep drawing or acting on an ended session, or treat a live session as ended (phase applying, an Apply that fails and returns to review, a reload or crash mid-Exit or mid-Apply, Dismiss, a late or stale session view); (b) let Claude's file tools, the Claude CLI, its tool server or hooks, or the Lean sandbox read or write outside ws/ now that ws/ sits inside the model folder ('..', absolute paths, symlinks, globs, grep roots, hidden-segment checks applied to the absolute path, bwrap binds), or let the CLI discover the model's git repository, a CLAUDE.md or .claude settings above ws/; (c) let run data reach git (the model's .gitignore, the self-ignoring .gitignore, telelean's history snapshots), the model's files, graph.json, a model-root discovery or Initialize; (d) let run activity trigger model reloads, Lean re-checks, drift notices or history snapshots; (e) let a recreated, moved or copied folder attach to a run or consent that is not its own, or let Exit/Stop of a moved run write into the wrong folder; (f) let pruning delete an active run, the consent file or anything that is not a run; (g) make a hidden result (RV-6) visible or inferable on the board through the new paths or texts; (h) lose an active session on reload or recovery with the new layout; (i) let any test or script write into a real model folder of the user's or VS Code's real storage. Trace each candidate through the actual code (file:line) and report it only if the trace holds. Then judge the tests: for each key rule, would some test fail if its key condition were inverted or dropped? (Reason it through; you may run the existing tests, capped, one at a time, --no-cache, in your scratch dir.) Report untested rules as findings, with the test to add. Read-only for the repository."

const EXTRACT = (id) => `${S}/extracts/plan_${id}.md`
const READX = (id) => `\n\nREADING RULE (quota): wherever your instructions say to read /home/zhengyew/telelean/docs/slice2-plan.md, read the extract ${EXTRACT(id)} instead; the builder regenerated it after writing ${id}'s plan entries. Open the full plan only for a section the extract cites but does not include (grep it for "${id}" to find this work's entries).`
const carryText = (c) => c.length ? `\n\nCARRY-OVERS FROM THE PREVIOUS SUB-SLICE'S REVIEW (mandatory, do these FIRST: fix each as its "fix" says, or better if you find a simpler sound fix, recording it in the plan's §8; each with a test that fails without the fix (mutation-checked) where it changes behaviour; list each in your report as fixed / not fixed (why)):\n${JSON.stringify(c, null, 1)}` : ''
const sev = (fs) => fs.filter((f) => f.severity === 'blocker' || f.severity === 'major').length
const brief = (fs) => fs.map((f) => ({ id: f.id, severity: f.severity, where: f.where, problem: String(f.problem).slice(0, 300) }))

async function runChain() {
  const out = []
  let carry = []
  for (const id of ['2k2']) {
    const built = await agent(
      `Your brief is the file ${S}/briefs/${id}.md. Read it completely, then read every file it tells you to read first, and do exactly what it says. You are the only agent writing code right now. Your final message is your report, as the brief specifies (include a section "Decisions for the orchestrator to log", each with its alternative).${carryText(carry)}`,
      { label: `build:${id}`, phase: 'Build' },
    )
    if (!built) { log(`STOP: builder ${id} returned nothing`); out.push({ id, stopped: 'builder returned nothing' }); break }
    const vprompt = (lens, key) =>
      `Read ${S}/briefs/verify_common.md (your role and rules) and the brief ${S}/briefs/${id}.md, then the files the brief cites. Your scratch dir: ${S}/v${id}-${key} (create it; write only there). The builder's report follows.${carry.length ? `\n\nThe builder also had these carry-overs from the previous sub-slice's review; check them too:\n${JSON.stringify(carry, null, 1)}` : ''}\n\n=== BUILDER REPORT ===\n${built}\n=== END OF REPORT ===\n\nYOUR LENS: ${lens}${READX(id)}`
    const verdicts = await parallel([
      () => agent(vprompt(COMBINED_LENS, 'fc'), { label: `verify:${id}:fc`, phase: 'Verify', schema: FIND, model: 'sonnet' }),
      () => agent(vprompt(ADV_LENS, 'adv'), { label: `verify:${id}:adv`, phase: 'Verify', schema: FIND, model: 'sonnet' }),
    ])
    const nVerdicts = verdicts.filter(Boolean).length
    let open = verdicts.map((v, k) => (v ? v.findings.map((f) => ({ ...f, id: `${['F', 'A'][k]}-${f.id}` })) : [])).flat()
    const first = { n: open.length, majors: sev(open) }
    log(`${id}: ${nVerdicts} verifier(s), ${open.length} findings, ${sev(open)} blocker/major`)
    const fixes = []
    for (let round = 1; round <= 2 && open.length > 0; round++) {
      const F = `${S}/f${id}r${round}`
      const fixedObj = await agent(
        `You are the FIXER (round ${round}) for ${id} of telelean. Read ${S}/builder_rules.md (mandatory) and the brief ${S}/briefs/${id}.md (its DESIGN section is the user's decision). Your scratch dir: ${F} (create it). FIRST run \`${S}/snapdiff2.sh ${F}/before.diff\`. Before you change any file, copy it to ${F}/backup/<its repo-relative path>, and append its repo-relative path to ${F}/changed_files.txt. Fix every blocker and major finding below (and minor ones when cheap and clearly right), in the working tree, without undoing the rest of the work. If you judge a finding wrong, do not change the code for it; say why. Every fix of a rule gets a test that fails without the fix (check it by mutation: break, see the test fail, restore byte for byte with cmp). Open design questions: decide them yourself as builder_rules.md says, never against the brief's DESIGN.${READX(id)} Then re-run the brief's verification commands (capped.sh, one at a time, vitest one worker with --no-cache --fsModuleCachePath=${F}/fsmc and TMPDIR=${F}/tmp; runner: only touched test files, timeout 900) and quote the summary lines. If you changed the plan, regenerate the extract: \`python3 -I ${S}/plan_extract.py ${id} ${EXTRACT(id)}\`. LAST, run \`${S}/snapdiff2.sh ${F}/after.diff\`.\n\n=== WORK REPORT ===\n${built}\n=== END ===\n\n${fixes.length ? `=== EARLIER FIX ROUNDS (reports) ===\n${fixes.map((x) => x.fixed).join('\n---\n')}\n=== END ===\n\n` : ''}=== FINDINGS (JSON) ===\n${JSON.stringify(open, null, 1)}\n=== END ===\n\nYour final message: for each finding, fixed / not fixed (why); files changed; mutation checks; verification output; "Decisions for the orchestrator to log" (each with its alternative); effects outside the repo and your scratch dir.`,
        { label: `fix:${id}:r${round}`, phase: 'Fix', schema: FIXOUT, model: 'sonnet' },
      )
      const fixed = fixedObj ? fixedObj.report : '(the fixer returned nothing)'
      const notFixed = new Set(fixedObj ? fixedObj.notFixed.map((x) => x.id) : open.map((f) => f.id))
      if (sev(open) === 0) {
        fixes.push({ round, fixed, rev: null })
        open = open.filter((f) => notFixed.has(f.id))
        log(`${id} round ${round}: only minor/nit findings, no re-verify; ${open.length} left as carry-overs`)
        break
      }
      const rev = await agent(
        `Read ${S}/briefs/verify_common.md (your role and rules: READ-ONLY for the repository) and the brief ${S}/briefs/${id}.md. Your scratch dir: ${S}/rv${id}r${round} (create it; write only there). You RE-VERIFY a fix round of ${id}. The fixer's changed files are listed in ${F}/changed_files.txt, with the pre-fix copies under ${F}/backup/ (compare: diff -u ${F}/backup/<path> /home/zhengyew/telelean/<path>); whole-tree snapshots before and after the fix are ${F}/before.diff and ${F}/after.diff. (1) For each finding below, decide whether it is resolved — truly fixed (trace the code; check the new test fails without the fix) or rightly rejected — or still open (say why). (2) Review the fixer's changes for regressions and new problems, with the same care as a first review. (3) Run the brief's typecheck and unit tests yourself (capped.sh, one at a time, vitest one worker with --no-cache --fsModuleCachePath=<your scratch dir>/fsmc and TMPDIR=<your scratch dir>/tmp) and quote the summary lines. Report resolved ids, and in findings every finding still open (original id) plus every new problem (new id starting with R${round}-).\n\n=== WORK REPORT ===\n${built}\n=== END ===\n\n=== FINDINGS OF THIS ROUND (JSON) ===\n${JSON.stringify(open, null, 1)}\n=== END ===\n\n=== FIXER REPORT ===\n${fixed}\n=== END ===${READX(id)}`,
        { label: `reverify:${id}:r${round}`, phase: 'Reverify', schema: REV, model: 'sonnet' },
      )
      fixes.push({ round, fixed, rev })
      open = rev ? rev.findings : open
      log(`${id} round ${round}: ${rev ? rev.resolved.length : '?'} resolved, ${open.length} open, ${sev(open)} blocker/major`)
      if (sev(open) === 0) break
    }
    if (sev(open) > 0) {
      log(`STOP after ${id}: ${sev(open)} blocker/major findings remain after 2 fix rounds`)
      out.push({ id, first, fixRounds: fixes.length, open: brief(open), stopped: 'blocker/major findings remain' })
      break
    }
    const T = `${S}/rcf_${id}`
    const integ = await agent(
      `You are the INTEGRATOR CHECK after ${id} of telelean. Read ${S}/builder_rules.md (mandatory). Do NOT edit, create or delete any file in the repository. Exceptions to the rules, for you only: you may run ${S}/recheck_full.sh and ${S}/savepatch2.sh.\n` +
      `1. Start the full check in the background: \`nohup ${S}/recheck_full.sh ${id} > /dev/null 2>&1 &\`. It runs tsc in five configs, vitest in core, webview and extension, then the FULL runner suite with real Lean (about 45-75 minutes in all, most of it the runner suite; one job at a time under the memory cap. This machine has 31 GB and the user is using it at the same time: if the summary reports skipped real-Lean tests (rc=98), report that as a failure; never try to free memory or touch the user's processes). Wait for it with \`timeout 540 sh -c 'until grep -q "^DONE" ${T}/summary.txt 2>/dev/null; do sleep 15; done'; cat ${T}/summary.txt\`, repeated until the summary ends with DONE (give up after 150 minutes and report). Every line must say rc=0; ${T}/failures.txt must be empty. For any nonzero rc, read ${T}/<name>.log and report each failure precisely (file, test name, error). Report tmp_leftovers (a nonzero count is a warning, not a failure; list them with \`find /tmp -maxdepth 1 -newer ${T}/start.marker -name 'telelean-*'\`).\n` +
      `2. Read-only safety checks, from /home/zhengyew/telelean: \`git diff --cached --stat\` prints nothing (nothing staged); \`git log -1 --format=%h\` prints 99cff93 (no new commits); \`git status --porcelain -- packages/extension/dist packages/extension/out\` prints nothing (the user's installed build, tracked in git, untouched); \`stat -c '%y %n' packages/extension/dist packages/extension/out\` shows dist at 2026-11-23 14:49:56.379326552 +0800 and out at 2026-11-23 14:49:56.532324640 +0800; \`ls -a packages/extension/out | grep -c '^.vite$'\` prints 0.\n` +
      `3. If and only if steps 1 and 2 all pass, run \`${S}/savepatch2.sh after_slice_${id}\` from /home/zhengyew/telelean and set ok=true. Otherwise set ok=false and do NOT save the patch.\n` +
      `Report every command with its summary line, and the runner suite's summary in "runner".`,
      { label: `integrate:${id}`, phase: 'Integrate', schema: INTEG, model: 'haiku' },
    )
    out.push({ id, first, fixRounds: fixes.length, open: brief(open), integ: integ ? { ok: integ.ok, summary: String(integ.summary).slice(0, 600), runner: integ.runner, patch: integ.patch } : null })
    if (!integ || !integ.ok) { log(`STOP after ${id}: integrator check failed`); break }
    log(`${id} done: ${integ.patch ?? 'patch saved'}; runner: ${integ.runner}`)
    carry = open
    if (carry.length) log(`${id}: ${carry.length} minor/nit findings carried into the next sub-slice`)
  }
  return { results: out, carryOut: brief(carry) }
}


const chainOut = await runChain()
return { chain: chainOut }
