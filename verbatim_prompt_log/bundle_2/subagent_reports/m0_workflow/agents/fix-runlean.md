# fix:runlean (agent a488b57b975fce9f9)

## summary
All six verifier issues are fixed: the one major and all five minors, staying inside the assigned paths. The final full suite passed 47/47 (4 files, 22.5 s). I ran it three times and it passed every time. Both typechecks exit 0. Nothing was left behind: `~/.elan/known-projects` is still 36 lines, and no telelean scopes, keeper or bwrap processes, temp files or $HOME escape file remain.

- **Cancel race (major):** a run now registers for cancellation before its first `await`. A cancel that arrives while the run is still preparing means it never starts, and the status is `cancelled`. The verifier's two repros now return `cancelled`. In a probe, 31/31 aborts at 0–60 ms after the call came back `cancelled`, with no leaked units or processes.
- **OOM evidence:** I found the cause. With `OOMPolicy=stop`, systemd sends SIGTERM to every process in the scope, and the keeper died of it before the cgroup could be read. The keeper now survives SIGTERM using a handler, so its children do not inherit the change, and it waits until runLean releases it. In 20/20 OOM runs, plus a grandchild case, both signals were present and the peak was 256.0 MiB. `peakMemoryBytes` is never a stale earlier sample any more.
- **Comparator classifier:** I reproduced the bug first. A new fixture whose failing build prints a fake `bwrap:` line came back `could-not-start`. It now comes back `rejected/build-failed`. The verifier's six cheat overlays still give exactly the same verdicts as before.
- **freezeChallenge:** it now works in a copy of the snapshot, so the generated `sorry` file never lands in the agent's shadow. **API change for M1:** `freezeDir` is a new required option.
- **Tests:** the incremental-build check is now asserted, and the fixed sleeps were replaced with polling.

Changed files:
- /home/zhengyew/telelean/packages/runner/src/lean/runLean.ts
- /home/zhengyew/telelean/packages/runner/src/lean/comparator.ts
- /home/zhengyew/telelean/packages/runner/test/lean/sandbox.test.ts
- /home/zhengyew/telelean/packages/runner/test/lean/comparator.test.ts
- /home/zhengyew/telelean/packages/runner/test/lean/helpers.ts
- /home/zhengyew/telelean/test-fixtures/runner-lean/README.md
- /home/zhengyew/telelean/test-fixtures/runner-lean/overlays/noisy-build-error/Model/Spyro/Main.lean (new)

Scratch files are in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn2/fix-runlean/: `orig/` holds copies from before the fix, `exp/` holds the probes (`probe.ts`, `keeper.mjs`, `noisy.ts`, `cheats.ts`), and `run1.log`, `run2.log` and `run3.log` are the full test logs.

I did not run the Claude CLI, install anything or run git. I ran one heavy process at a time; MemAvailable never fell below about 36.7 GB.

## fixed
- **issue:** [major] A cancel issued before the scope exists was lost. runLean checked `signal.aborted` only before the preflight `await`, and attached the abort listener afterwards. cancelRun only saw runs that had already spawned. Verifier repro: status=ok instead of cancelled.
  - **change:** runLean now registers the run (an internal `RunCancellation` class) and attaches the abort listener before its first `await`.
- A cancel that arrives while the run is preparing is remembered. runLean then returns `cancelled` (detail '... before start', durationMs 0) without spawning anything.
- Once the run has spawned, `attach` sends cancels to the existing kill path.
- A cancel that arrives after the keeper has exited is ignored (`closed` flag), so it cannot turn a finished run into `cancelled`.
- cancelRun also signals runs that are still preparing.

New test 'does not lose a cancel that arrives before the scope exists' covers four cases: a signal already aborted, an abort in the same tick as the call, cancelRun right after the call, and an abort during a preflight that really runs (an equivalent `/usr/bin/sh` path forces a fresh preflight).

Probe results: '[abort same tick, first preflight] status=cancelled 0ms', '[cancelRun right after the call] signalled=1 status=cancelled', and '[abort at 0..60 ms] {"cancelled":31}; units left after 1.5 s: ""; strays: 0'.
- **issue:** [minor] In OOM runs, peakMemoryBytes could be stale (1.1 MiB was reported), and the cgroup oom_kill signal was missed in 3 of 14 runs. The test accepted the stale peak, and the claim that two signals agree was not reliably true.
  - **change:** Cause: with OOMPolicy=stop, systemd sends SIGTERM to the whole scope. The keeper (plain sh) died of it, so the cgroup vanished before the final read.

Fix:
- The keeper now runs `trap 't=1' TERM` and loops on `read` until a real EOF. It stays until runLean has read memory.events and memory.peak. Because the trap is a handler, not an ignore, children do not inherit it. SIGKILL (timeout, cancel, pdeathsig) still ends the keeper at once.
- I checked this on dash alone (exp/keeper.mjs): the keeper survives SIGTERM in both waits, keeps exit status 7, and a grandchild shows `SigIgn: 0000000000000000`.
- peakMemoryBytes is now reported only from a sample taken after the command finished, or just before a timeout or cancel kill. It is never reported for could-not-start; otherwise it is left out.
- The OOM detail also reads memory.events `oom`, so it can tell 'memory cap exceeded' apart from 'the machine ran out of memory'.
- The test now asserts both signals with a regex on the detail, and 200 MiB < peak ≤ 256 MiB.

Probe results: '[oom x20] {"oom+both-signals+peak-near-cap":20}'. The grandchild case gave 'memory cap 256M exceeded (cgroup oom=1 oom_kill=1, systemd Result=oom-kill)' with peak 256.0 MiB. The under-cap control stayed `ok` with peak 125.5 MiB.
- **issue:** [minor] The claim that a build from a copied .lake/build rebuilds 0 modules was logged but never asserted.
  - **change:** sandbox.test.ts now asserts `rebuilt === 0`. It also has a positive control: the same regex counts more than 0 'Built' lines in the cold build. Log line: '[build from a copied .lake/build] status=ok 207 ms, 24 build files copied, modules rebuilt: 0'.
- **issue:** [minor] classifyComparatorRun treated any line starting with 'bwrap: ', in stdout or stderr, as could-not-start before checking the judgement messages.
  - **change:** Reproduced first. New overlay `noisy-build-error`: an #eval that only prints a fake "bwrap: Can't mkdir /root ..." line and a fake 'Resolving dependencies' line, then a type error. Under the old code it gave `could-not-start`.

Lake 5.0.0's Check.lean and that run show where text goes: the solution's build log goes to stdout, while comparator's judgements and its own final error line go to stderr. The classifier now:
1. reads judgement messages from stderr only;
2. reports a nested sandbox as could-not-start only when a `bwrap: ` line sits directly before comparator's final stderr line `error: … exited with N`. This also covers the kernel step, where comparator prints 'kernel rejected the solution' even when its bwrap failed;
3. classes a run as kernel-rejected only when that final line is '<kernel> exited with', not 'Child exited with';
4. uses the furthest phase announced, so a repeated earlier phase line cannot move it back.

The noisy overlay is now rejected/build-failed with 'Type mismatch' in the message. A new real comparator test checks this, and new pure tests cover each source of confusion. Regression check: the verifier's six cheat overlays give the same verdicts as before (definition-mismatch, kind-mismatch, illegal-axiom sorryAx, statement-mismatch, missing-declaration, build-failed).
- **issue:** [minor] freezeChallenge wrote the generated `sorry` challenge module into the snapshot directory.
  - **change:** freezeChallenge now copies the snapshot with createShadow into a new required `freezeDir`, which must be absent or empty. It writes, builds and exports the challenge there and only reads the snapshot. Because .lake/build is copied too, the challenge build is incremental: '[freeze] snapshot build 908 ms; challenge build 411 ms (1 modules built)'.

The test builds the snapshot first, as production would, freezes twice, and asserts three things: the snapshot has no Model/TeleleanChallenge.lean, its source file list is unchanged, and both copies contain the sorry theorem.

This is an API change for M1: callers must pass freezeDir.
- **issue:** [minor] The timeout and cancel tests slept for a fixed 800–1200 ms, then expected exact process counts.
  - **change:** Added `waitForProcesses(pattern, count, timeoutMs)` to helpers.ts. It polls pgrep every 50 ms until a deadline. The timeout and cancel tests now use it. The timeout test's budget went from 2.5 s to 3 s for headroom. It now also asserts that a peak is reported, sampled just before the kill: '[timeout] status=timeout 3013 ms; sleeps during=2 after=0; peak 2.5 MiB'.

## not_fixed
- **issue:** Residual comparator spoofing. A failing build whose log deliberately prints comparator's later progress lines ('Running … kernel on solution' or 'Your solution is okay!') is classified could-not-start instead of build-failed.
  - **reason:** This is never a false accept: acceptance still needs lake to exit 0. It takes a deliberately adversarial solution, and the personal-prototype scope defers adversarial hardening. Accidental output, including the case the verifier raised, is now handled correctly.
- **issue:** The case where the kernel step's nested bwrap fails is covered only by a pure test with crafted output, not by a real run.
  - **reason:** I could not make only the kernel step's sandbox fail while the earlier steps succeed without modifying Lake. The rule it relies on (a 'bwrap:' line directly before comparator's final stderr line) is the same one the real resolve-step test (no-nested-dirs) checks.
- **issue:** Items from the original report that nobody tested are unchanged: a shadow under $HOME (the production layout), a project with real Lake dependencies, G1's per-declaration budgets, and the builder's no-setpriv negative control.
  - **reason:** These are outside this fix task. A shadow under $HOME would mean writing into $HOME, which is outside my allowed paths and the temp-file rule. M1 should run the suite once with TELELEAN_TEST_TMP pointing under ~/.config.
- **issue:** buildErrors keeps only the first line of each Lean error. For example, the message has 'Type mismatch' but not the 'has type … but is expected to have type …' lines after it.
  - **reason:** This is not a verifier issue. It affects how good the feedback is when the M2 gate loop re-prompts the LLM, so it belongs with the M2 work.

## test_output
Typecheck:
$ cd /home/zhengyew/telelean && npx tsc -p packages/runner/tsconfig.json --noEmit
tsc exit=0
$ npx tsc -p /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn2/fix-runlean/tsconfig.tests.json   (covers src/lean and test/lean)
tsc(tests) exit=0

Final run, using the exact task command. The wrapper /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn2/fix-runlean/run_tests.sh sets TELELEAN_TEST_TMP to my scratch dir and watches RAM:
$ cd packages/runner && npx vitest run test/lean
 Test Files  4 passed (4)
      Tests  47 passed (47)
   Duration  22.50s (tests 99%)
vitest exit=0
min MemAvailable during run: 37219 MiB
known-projects after: 36
scopes left: 0
stray keeper/bwrap processes: 0
tmp entries left: 0
home escape file present: no

Run 2 (--reporter=verbose --silent=false), 47/47 in 23.16 s. Key lines:
[freeze] snapshot build 908 ms; challenge build 411 ms (1 modules built), leanexport 602 ms, 18569 NDJSON lines
[comparator noisy-build-error] {"verdict":"rejected","reason":"build-failed","names":[],"message":"error: Model/Spyro/Main.lean:60:51: Type mismatch\nerror: build failed"} (failed, exit 1, 835 ms)
[sandboxed lake build] status=ok 903 ms, peak 94.8 MiB
[build from a copied .lake/build] status=ok 207 ms, 24 build files copied, modules rebuilt: 0
[oom] status=oom exit=null 206 ms peak=256.0 MiB detail=memory cap 256M exceeded (cgroup oom=1 oom_kill=1, systemd Result=oom-kill)
[timeout] status=timeout 3013 ms; sleeps during=2 after=0; peak 2.5 MiB
[cancel] abort=cancelled 111 ms; cancelRun=telelean-t865711c-11:cancelled, telelean-t865711c-12:cancelled
[early cancel] cancelled (0 ms, cancelled before start); cancelled (0 ms, cancelled by caller before start); cancelled (0 ms, cancelled via cancelRun before start); cancelled (0 ms, cancelled by caller before start); cancelRun signalled 1; strays 0
[known-projects] before=36 after=36

Run 1 (verbose) was also 47/47 in 23.58 s. Its comparator lines: honest {"verdict":"accepted"} (ok, exit 0, 1837 ms); weakened rejected/definition-mismatch ["Spyro.cynder_not_good"]; weakened-type rejected/statement-mismatch; unselected rejected/illegal-axiom ["Spyro.new_spyro_pg.holds"]; smuggled rejected/illegal-axiom ["Spyro.shortcut"]; no-nested-dirs could-not-start "bwrap: Can't mkdir /root: Read-only file system"; no-bwrap could-not-start (exit 2).

Before the fix, the old classifier on the noisy overlay (exp/noisy.ts):
[noisy-build-error] verdict={"verdict":"could-not-start","message":"comparator's own sandbox could not start: bwrap: Can't mkdir /root: Read-only file system"} status=failed exit=1
STDERR="error: build failed\nerror: Child exited with 1\n"   (the fake bwrap line was on STDOUT, inside the build log)

Probes after the fix (exp/probe.ts, exp/cheats.ts):
[abort same tick, first preflight] status=cancelled 0ms detail=cancelled by caller before start strays=0
[cancelRun right after the call] signalled=1 status=cancelled 0ms detail=cancelled via cancelRun before start strays=0
[abort during a fresh preflight] status=cancelled 0ms detail=cancelled by caller before start
[abort at 0..60 ms] {"cancelled":31}; units left after 1.5 s: ""; strays: 0
[oom x20] {"oom+both-signals+peak-near-cap":20}; units left: ""
[oom grandchild] status=oom exit=null stdout="" peak=256.0MiB detail=memory cap 256M exceeded (cgroup oom=1 oom_kill=1, systemd Result=oom-kill)
[under cap] status=ok peak=125.5MiB
[cheat assumption-altered] rejected definition-mismatch ["Spyro.pg_no_dark_past"] (exit 1, 1885 ms)
[cheat vocab-def] rejected kind-mismatch ["Spyro.GoodAddition"] (exit 1, 1723 ms)
[cheat sorry] rejected illegal-axiom ["sorryAx"] (exit 1, 1710 ms)
[cheat axiom-retyped] rejected statement-mismatch ["Spyro.new_spyro_pg.holds"] (exit 1, 1689 ms)
[cheat goal-missing] rejected missing-declaration ["Spyro.cynder_not_good.holds"] (exit 1, 1491 ms)
[cheat build-error] rejected build-failed [] (exit 1, 851 ms)

Keeper on dash alone (exp/keeper.mjs): fd3 '{ "keeper-bwrap-exit": 7 }' after a SIGTERM during the child wait; still alive after two SIGTERMs during the fd-4 wait ('keeper alive before release: true'); 'keeper exit code=7' after release; grandchild 'SigIgn: 0000000000000000'.

