export const meta = {
  name: 'slice-chain-v5',
  description: 'Build telelean sub-slices in order (quota-optimised, AP-38): Opus builder reading a plan extract, Sonnet verifiers (one for UI sub-slices), Sonnet fixer and re-verifier, Haiku integrator with the real-Lean suite; stop at the first failure',
  phases: [{ title: 'Build' }, { title: 'Verify' }, { title: 'Fix' }, { title: 'Reverify' }, { title: 'Integrate' }],
}
const S = '/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad'
const PATCHES = '/home/zhengyew/telelean/verbatim_prompt_log/bundle_21/evidence/patches'
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
const FIND = {
  type: 'object',
  properties: { summary: { type: 'string' }, checks_run: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: FINDING } },
  required: ['summary', 'findings'],
}
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
const SPEC_LENS =
  'FIDELITY TO THE BRIEF, THE PLAN AND THE SPEC. Go through the plan\'s entry for this work item by item and check the diff does each one, as the plan\'s contracts (§2, §2.9) and the cited spec clauses say, and nothing that contradicts them or the autopilot decisions (02_autopilot_decisions.md, AP-24 and later). Check the plan\'s §6 tests for this work exist and test what they claim. Check the safety properties the spec cares about (nothing assumed without the user\'s individual Accept; no result shown before the meaning check; no state applied that no check judged; no proof resting on what its question does not allow; the user\'s decisions never lost on rollback/reload/crash; Claude never changes kinds or the user\'s files where it must not). Do NOT run builds or tests (another verifier does); read only.'
const CODE_LENS =
  `CODE CORRECTNESS AND REGRESSIONS. Read the diff of this work (compare the current tree with the previous patch in ${PATCHES}/ to isolate it: e.g. run ${S}/snapdiff.sh <your scratch dir>/now.diff and compare with the previous patch file), look for bugs, missed call sites, broken behaviour, unhandled edge cases (empty, single, many, removal, unchanged, duplicate, reload mid-way) and tests that do not test what they claim. Then confirm the builder's verification claims yourself: run the brief's typecheck and unit-test commands ONE AT A TIME through capped.sh (vitest one worker, always with --no-cache --fsModuleCachePath=<your scratch dir>/fsmc and TMPDIR=<your scratch dir>/tmp; runner: only the test files the change touches, each under \`timeout 900\`, TELELEAN_TEST_TMP in your scratch dir). Quote the summary lines in checks_run.`
const COMBINED_LENS = 'FIDELITY AND CODE CORRECTNESS (two concerns, one reviewer). (1) ' + SPEC_LENS.replace('Do NOT run builds or tests (another verifier does); read only.', '') + ' (2) ' + CODE_LENS
const ADV_LENS =
  'ADVERSARIAL SAFETY. Assume the builder made a subtle mistake. Within this work\'s scope and its interaction with what earlier sub-slices built, hunt for concrete states or event orders that make the code: (a) treat something as accepted/assumed without the user\'s individual Accept; (b) show a result, or let it be inferred, before the meaning check; (c) apply or count a state that no check judged; (d) let a proof rest on something its question does not allow; (e) lose or silently change the user\'s decisions on rollback, Cancel, Retry, reload, crash, Undo/Redo; (f) let Claude change kinds, arrows, the user\'s files or anything the plan forbids; (g) show a misleading green, glow, badge or status. Trace each candidate through the actual code (file:line) and only report it if the trace holds. Then judge the tests: for each key rule, would some test fail if its key condition were inverted or dropped (reason it through; you may run the existing tests, capped, one at a time, --no-cache with your scratch dir)? Report untested rules as findings with the test to add. Read-only for the repository.'

const FIXOUT = { type: 'object', properties: { report: { type: 'string', description: 'your full report as the prompt asks' }, notFixed: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'why'] } } }, required: ['report', 'notFixed'] }
const UI = new Set(['2g', '2h', '2i'])
const EXTRACT = (id) => `${S}/extracts/plan_${id}.md`
const READX = (id) => `\n\nREADING RULE (quota, AP-38): wherever your instructions say to read /home/zhengyew/telelean/docs/slice2-plan.md, read the extract ${EXTRACT(id)} instead: it holds every part of the plan this sub-slice needs (its header lists what was left out). Open the full plan only for a section the extract cites but does not include, and then only that section.`
const results = []
let carry = args.carry || []
const carryText = (c) => c.length ? `\n\nCARRY-OVERS FROM THE PREVIOUS SUB-SLICE'S REVIEW (mandatory, do these FIRST: fix each as its "fix" says, or better if you find a simpler sound fix, recording it in the plan's §8; each with a test that fails without the fix (mutation-checked) where it changes behaviour; list each in your report as fixed / not fixed (why)):\n${JSON.stringify(c, null, 1)}` : ''
for (const raw of args.ids) {
  const entry = typeof raw === 'string' ? { id: raw } : raw
  const id = entry.id
  let built
  if (entry.review) {
    built = `This is a REVIEW-ONLY pass over work already built and fixed once. The earlier builders' and fixers' reports are in ${entry.reports}: read that file completely; treat it as the builder report.`
    log(`${id}: review-only pass`)
  } else {
    phase('Build')
    built = await agent(
      `Your brief is the file ${S}/briefs/${id}.md. Read it completely, then read every file it tells you to read first, and do exactly what it says. You are the only agent writing code right now. Your final message is your report, as the brief specifies (include a section "Decisions for the orchestrator to log", each with its alternative).${READX(id)}${carryText(carry)}`,
      { label: `build:${id}`, phase: 'Build' },
    )
    if (!built) { log(`STOP: builder ${id} returned nothing`); results.push({ id, stopped: 'builder returned nothing' }); break }
  }
  phase('Verify')
  const vprompt = (lens, key) =>
    `Read ${S}/briefs/verify_common.md (your role and rules) and the brief ${S}/briefs/${id}.md, then the files the brief cites. Your scratch dir: ${S}/v${id}-${key} (create it; write only there). The builder's report follows.${carry.length && !entry.review ? `\n\nThe builder also had these carry-overs from the previous sub-slice's review; check them too:\n${JSON.stringify(carry, null, 1)}` : ''}\n\n=== BUILDER REPORT ===\n${built}\n=== END OF REPORT ===\n\nYOUR LENS: ${lens}${READX(id)}`
  const verdicts = await parallel(UI.has(id) ? [
    () => agent(vprompt(COMBINED_LENS + ' Also cover the safety lens briefly: ' + ADV_LENS, 'fc'), { label: `verify:${id}:fc`, phase: 'Verify', schema: FIND, model: 'sonnet' }),
  ] : [
    () => agent(vprompt(COMBINED_LENS, 'fc'), { label: `verify:${id}:fc`, phase: 'Verify', schema: FIND, model: 'sonnet' }),
    () => agent(vprompt(ADV_LENS, 'adv'), { label: `verify:${id}:adv`, phase: 'Verify', schema: FIND, model: 'sonnet' }),
  ])
  const nVerdicts = verdicts.filter(Boolean).length
  let open = verdicts.map((v, k) => (v ? v.findings.map((f) => ({ ...f, id: `${['F', 'A'][k]}-${f.id}` })) : [])).flat()
  const sev = (fs) => fs.filter((f) => f.severity === 'blocker' || f.severity === 'major').length
  log(`${id}: ${nVerdicts} verifier(s), ${open.length} findings, ${sev(open)} blocker/major`)
  const fixes = []
  for (let round = 1; round <= 2 && open.length > 0; round++) {
    phase('Fix')
    const F = `${S}/f${id}r${round}`
    const fixedObj = await agent(
      `You are the FIXER (round ${round}) for ${id} of telelean. Read ${S}/builder_rules.md (mandatory) and the brief ${S}/briefs/${id}.md. Your scratch dir: ${F} (create it). FIRST run \`${S}/snapdiff.sh ${F}/before.diff\`. Before you change any file, copy it to ${F}/backup/<its repo-relative path>, and append its repo-relative path to ${F}/changed_files.txt. Fix every blocker and major finding below (and minor ones when cheap and clearly right), in the working tree, without undoing the rest of the work. If you judge a finding wrong, do not change the code for it; say why. Every fix of a rule gets a test that fails without the fix (check it by mutation: break, see the test fail, restore byte for byte with cmp). Open design questions: decide them yourself as builder_rules.md says.${READX(id)} Then re-run the brief's verification commands (capped.sh, one at a time, vitest one worker with --no-cache --fsModuleCachePath=${F}/fsmc and TMPDIR=${F}/tmp; runner: only touched test files, timeout 900) and quote the summary lines. LAST, run \`${S}/snapdiff.sh ${F}/after.diff\`.\n\n=== WORK REPORT ===\n${built}\n=== END ===\n\n${fixes.length ? `=== EARLIER FIX ROUNDS (reports) ===\n${fixes.map((x) => x.fixed).join('\n---\n')}\n=== END ===\n\n` : ''}=== FINDINGS (JSON) ===\n${JSON.stringify(open, null, 1)}\n=== END ===\n\nYour final message: for each finding, fixed / not fixed (why); files changed; mutation checks; verification output; "Decisions for the orchestrator to log" (each with its alternative); effects outside the repo and your scratch dir.`,
      { label: `fix:${id}:r${round}`, phase: 'Fix', schema: FIXOUT, model: 'sonnet' },
    )
    const fixed = fixedObj ? fixedObj.report : '(the fixer returned nothing)'
    const notFixed = new Set(fixedObj ? fixedObj.notFixed.map((x) => x.id) : open.map((f) => f.id))
    if (sev(open) === 0) {
      // AP-34: no re-verification after a round that fixed only minors and nits; what the fixer left goes on as carry-overs.
      fixes.push({ round, findings: open, fixed, rev: null })
      open = open.filter((f) => notFixed.has(f.id))
      log(`${id} round ${round}: only minor/nit findings, no re-verify; ${open.length} left as carry-overs`)
      break
    }
    phase('Reverify')
    const rev = await agent(
      `Read ${S}/briefs/verify_common.md (your role and rules: READ-ONLY for the repository) and the brief ${S}/briefs/${id}.md. Your scratch dir: ${S}/rv${id}r${round} (create it; write only there). You RE-VERIFY a fix round of ${id}. The fixer's changed files are listed in ${F}/changed_files.txt, with the pre-fix copies under ${F}/backup/ (compare: diff -u ${F}/backup/<path> /home/zhengyew/telelean/<path>); whole-tree snapshots before and after the fix are ${F}/before.diff and ${F}/after.diff. (1) For each finding below, decide whether it is resolved — truly fixed (trace the code; check the new test fails without the fix) or rightly rejected — or still open (say why). (2) Review the fixer's changes for regressions and new problems, with the same care as a first review. (3) Run the brief's typecheck and unit tests yourself (capped.sh, one at a time, vitest one worker with --no-cache --fsModuleCachePath=<your scratch dir>/fsmc and TMPDIR=<your scratch dir>/tmp) and quote the summary lines. Report resolved ids, and in findings every finding still open (original id) plus every new problem (new id starting with R${round}-).\n\n=== WORK REPORT ===\n${built}\n=== END ===\n\n=== FINDINGS OF THIS ROUND (JSON) ===\n${JSON.stringify(open, null, 1)}\n=== END ===\n\n=== FIXER REPORT ===\n${fixed}\n=== END ===${READX(id)}`,
      { label: `reverify:${id}:r${round}`, phase: 'Reverify', schema: REV, model: 'sonnet' },
    )
    fixes.push({ round, findings: open, fixed, rev })
    open = rev ? rev.findings : open
    log(`${id} round ${round}: ${rev ? rev.resolved.length : '?'} resolved, ${open.length} open, ${sev(open)} blocker/major`)
    if (sev(open) === 0) break
  }
  if (sev(open) > 0) {
    log(`STOP after ${id}: ${sev(open)} blocker/major findings remain after 2 fix rounds`)
    results.push({ id, built, verdicts, fixes, open, stopped: 'blocker/major findings remain' })
    break
  }
  phase('Integrate')
  const T = `${S}/rcf_${id}`
  const integ = await agent(
    `You are the INTEGRATOR CHECK after ${id} of telelean. Read ${S}/builder_rules.md (mandatory). Do NOT edit, create or delete any file in the repository. Exceptions to the rules, for you only: you may run ${S}/recheck_full.sh and ${S}/savepatch.sh.\n` +
    `1. Start the full check in the background: \`nohup ${S}/recheck_full.sh ${id} > /dev/null 2>&1 &\`. It runs tsc in five configs, vitest in core, webview and extension, then the FULL runner suite with real Lean (about 12-15 minutes in all; one job at a time under the memory cap). Wait for it with \`timeout 540 sh -c 'until grep -q "^DONE" ${T}/summary.txt 2>/dev/null; do sleep 15; done'; cat ${T}/summary.txt\`, repeated until the summary ends with DONE (give up after 60 minutes and report). Every line must say rc=0; ${T}/failures.txt must be empty. For any nonzero rc, read ${T}/<name>.log and report each failure precisely (file, test name, error). Report tmp_leftovers (a nonzero count is a warning, not a failure; list them with \`find /tmp -maxdepth 1 -newer ${T}/start.marker -name 'telelean-*'\`).\n` +
    `2. Read-only safety checks, from /home/zhengyew/telelean: \`git diff --cached --stat\` prints nothing (nothing staged); \`git log -1 --format=%h\` prints 187673d (no new commits); \`stat -c '%y %n' packages/extension/dist packages/extension/out\` shows both at 2026-11-19 13:47 (the user's installed build untouched); \`ls -a packages/extension/out | grep -c '^.vite$'\` prints 0.\n` +
    `3. If and only if steps 1 and 2 all pass, run \`${S}/savepatch.sh after_slice_${id}\` from /home/zhengyew/telelean and set ok=true. Otherwise set ok=false and do NOT save the patch.\n` +
    `Report every command with its summary line, and the runner suite's summary in "runner".`,
    { label: `integrate:${id}`, phase: 'Integrate', schema: INTEG, model: 'haiku' },
  )
  results.push({ id, built, verdicts, fixes, open, integ, carriedIn: carry })
  if (!integ || !integ.ok) {
    log(`STOP after ${id}: integrator check failed`)
    break
  }
  log(`${id} done: ${integ.patch ?? 'patch saved'}; runner: ${integ.runner}`)
  carry = open
  if (carry.length) log(`${id}: ${carry.length} minor/nit findings carried into the next sub-slice`)
}
return { results, carryOut: carry }
