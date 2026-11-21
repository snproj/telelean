# amend:slice2-probe

Agent `a54e6ecc331740da6` of workflow `wf_16a1ea15-88d`. Verbatim output (JSON alongside).

I amended /home/zhengyew/telelean/docs/slice2-plan.md, the only file I edited. All edits were small exact-string replacements, each made after re-reading its region. I did not change any §8 line I did not write. A builder appended its 2b1b entry while I worked, and my §8 line now sits after it, just before §9. Nothing was run: no Lean, tsc, vitest or builds, and no git changes.

**One decision you need to act on: the core half goes into 2b2.** §0 says 2b3 changes no core source, because 2g runs beside it. But the fail-closed rule needs a new core field and core judging changes, so I put that part into 2b2, the next core sub-slice that has not started. 2b2's brief must include it. If 2b2's brief has already gone out, move the bullet to 2c1 or 2c2; any core sub-slice before 2b3a works.

## What I changed, section by section

**§1 (order of work)**
- The 2b3 row now says it has two parts, run one after the other (D2-75):
  - 2b3a: the probe isolated in its own Lean job, its measurement, and the recordings and core's Spyro facts regenerated with it.
  - 2b3b: the engine, unchanged.
  - Its "After" column reads "2c2 (2b3b after 2b3a)".
- The "if a builder runs out of room" note now says 2b3 is split from the start.

**§1.1 (scope of each sub-slice)**
- **2b2 gets one new bullet, the core half** (because 2b3 changes no core source):
  - `LeanFacts.probe`, `ProbeRunFacts` and `probeFailure` (with its sentences) in `facts.ts`.
  - In `review/items.ts`, every draft with a declaration is marked `factsMissing` when the judged state's probe failed. This reuses fixer 2a's ADV-3 path for modules that did not build.
  - The `facts` problem in `review/judge.ts` and the backstop's `facts` refusal both name the cause.
  - `fakeFacts` gains a `probe` option.
- **2b3 is now two entries.**
  - 2b3a:
    - First, with real Lean, confirm that the probe job can load the built Spyro modules with `Lean.importModules` and that its `valueConsts` equal 1d's. If not, the builder stops and you choose the fallback or the alternative.
    - Files: a new `semantic/probeFile.ts`; `checkFile.ts` loses its in-file probe and the probe's imports, and `valueProbeLines` gains the type walk and a `modules` option; `refresh.ts` runs the probe job and drops AP-21's second run; `gate/scratch.ts` keeps the ghost's in-file probe (with the type walk); `gate/findings.ts` and `engine.ts` handle a failed probe at check, freeze and gate.
    - A new overlay `probe-forge` for the cheat test.
    - The measurement.
    - It ends with your regeneration of the recordings and core's three Spyro facts files.
  - 2b3b: its scope bullets are unchanged.

**§2.1 (facts)**
- The heading now names 2b3a and 2b2.
- The probe's output line is still one line with both keys, one entry per probed name, `null` for a name Lean's environment lacks. All existing names are kept: `parseValueProbe`, the `telelean-value-consts` key, `valueProbeLines`.
- **"The probe is isolated"** (new) explains why (S3-1) and specifies:
  - The file, in outline: `import Lean.CoreM`, `import Lean.Util.FoldConsts`, then an `#eval show IO Unit` that calls `Lean.importModules` on the check file's imports and runs 1d's walk plus the type walk over that environment. Names and modules are passed as JSON-escaped string literals, as today.
  - How it runs: a second job right after the check file, in the same refresh, after the memory guard, as `lake env lean --stdin --json` under runLean with the check's timeout and memory cap.
  - How it is read: the information message at the `#eval` line, then `parseValueProbe`, then `toDeclFacts`.
  - The check file keeps only `#check`, `#print`, `#print axioms` and `type_of%`, with no probe imports. AP-21's second run goes, and those 1d tests change.
  - If `importModules` cannot load the model: the builder stops, and you choose between reading the constants from `lake env leanexport`'s kernel export or D2-75's alternative.
- **A ts contract block** for `LeanFacts.probe?`. `ProbeRunFacts` has statuses ok, cut, failed, oom, timeout, cancelled and could-not-start (the same set as slice 3's `meaning` marker), plus `durationMs`, `peakMemoryBytes` and `detail`. It also adds `probeFailure(facts)`. Sandbox failures of the probe job end the refresh with that status, as the check job's do.
- **"A failed probe never passes."** A `cut` or `failed` probe leaves no constants, and the cause is reported as a check problem. `probeFailure` gives the sentence "telelean could not read what the declarations of this state use in Lean: ‹cause›."
  - At check, freeze and gate, the rules run as usual. If they find nothing, or only B.2's `source-only`, the result is an `environment` outcome with that sentence (next to slice 1e's `unseenProofEnvironment`). Otherwise their findings fail the check. Nothing passes either way, and only real findings count as attempts.
  - At `stage`, the judgement is partial through ADV-3: records are kept, nothing is reverted except no-longer-builds, Accepts wait, and a `facts` problem shows the sentence plus "Apply stays disabled until telelean can read it."
  - At `final` and in the backstop, the refusal is `facts` with the cause.
- **"Compared approximately only where telelean cannot do better":**
  - B's facts whose probe failed refuse nothing, and comparisons with B go without the missing constants.
  - The same holds for S₀'s facts when S₀'s own probe failed.
  - Facts without the marker (old recordings, a converted v1 run's base facts) keep D2-25's fallbacks.
  - F's facts are always fresh, so the final check and the backstop never pass a state whose probe failed. The board falls back to references, as in 1d.
- **The ghost check keeps its in-file probe.** The residual is stated: forged constants can only affect a draft's gap check and its facts before the premise is written. Everything that counts is judged again with the isolated probe (`writePremise`, `complete`'s gate, D2-23 and RV-5 at the next judge, and the backstop at Apply). A model name that clashes with `Lean.CoreM` still makes the ghost check's imports fail, which refuses the suggestion.
- **Cost** is measured in 2b3a for the check, the probe job and the whole refresh, against 1d's 1.5× threshold.
- **Recordings** are regenerated at the end of 2b3a, with new `probe-spyro.lean` and `probe-spyro.jsonl`; core's three Spyro facts files get the same. 2b3b starts after that.

**§4.10 (backstop):** the `facts` refusal uses `probeFailure`'s sentence when F's probe failed.

**§6.1 (tests)**
- **2b2** gets a "failed probe" bullet:
  - a partial stage judgement, with records kept and no B.2 reverts;
  - `final` not ok;
  - the backstop names the cause;
  - `probeFailure` for each status;
  - facts without the marker, or B's facts with a failed probe, refuse nothing.
- **2b3 becomes 2b3a and 2b3b.** 2b3a's list:
  - the `importModules` check first;
  - the cheat with real Lean: the `probe-forge` overlay adds a high-priority `ToString String` instance and a `ForIn m Lean.Loop Unit` instance. The isolated probe still gives the true constants, while 1d's in-file `#eval` on the same model prints the forged ones;
  - 1d's clash model: one check and one probe job, status `ok`, with constants;
  - the existing probe tests, plus "the check file has no `#eval`";
  - the fail-closed parsing cases: `cut`, and `failed` (an error, no line, an unreadable line, the wrong number of entries), plus a sandbox failure ending the refresh;
  - the `environment` outcome at the gate;
  - the cost report and the regenerated recordings.
- **2b3b** gains one engine test: `judge` and `finalCheck` on a failed probe give a partial stage judgement and a failed final check, never an `environment` outcome.

**§7.2 (decisions)**
- D2-30 is annotated "since 2b3a its own Lean job, D2-75".
- D2-41 is annotated "from the isolated probe; a judged state whose probe failed is refused".
- New **D2-75** "AUTOPILOT DECISION (2026-11-20, AP-30)". Its alternative is to keep the in-file probe and accept the residual (the refuter's major-not-blocker view). Its fallback is the leanexport parser. *To reverse:* before 2b3a is built, restore the single probe bullet; afterwards, put the `#eval` back in the check file with refresh's second run, delete `probeFile.ts`, and either keep or drop the marker's refusals.

**§7.3:** the recorded-facts regeneration now happens at the end of 2b3a with the isolated probe.

**§7.4:** the decisions range is now D2-1–D2-75. The slice-2 log entry must also say in plain words that AP-21's second run is gone and that a model whose names clash with the probe's imports now keeps its constants.

**§8:** one line, "orchestrator, 2026-11-20 (slice-3 ultra review S3-1, AP-30)", listing the move, the split, the fail-closed rule, the residual, the 2b2 core half and the sections touched.

## Unverified points and limits

- I could not run Lean. Whether `importModules` works inside `#eval` on 4.35 (search path, `.olean` loading, and the fields of `Lean.Import` under the module system) is confirmed only by 2b3a's mandatory first step. The fallback is written into the plan.
- An `#eval`'s output is a single Lean message. So any cut at runLean's 32 MB cap loses the whole line, and slice 2 treats every cut as a failure of the whole probe.
- I did not add a step that re-checks the base facts. B with a failed probe, or B without the marker, stays approximate for the session; slice 3's once-per-load re-check is still its own job.

## What the slice-3 plan must now say differently

1. **Header, §1 row and §1.1 for 3p.** 3p no longer creates the isolated job. It adds the normalised `Repr` walk and the meaning lines to 2b3a's `semantic/probeFile.ts`, or adds a `meaningProbe.ts` that file calls. Delete from 3p:
   - "`checkFile.ts` loses its value probe…" and "refresh's second run without the probe" (done in 2b3a);
   - the `importModules` confirmation (done in 2b3a). 3p confirms only the new parts.
   - 3p's cost is measured as the increase over 2b3a's probe job.
2. **§0 "Slice 2 stays green":** remove the item "3p moves the value probe out of the check file … their 1d tests change"; 2b3a did it. The recordings gate before 3b now regenerates `probe-spyro.*`, "as 2b3a did".
3. **§2.1 "The probe is isolated":** reword it as slice 2's job (D2-75) extended by 3p. "Old recordings" now means slice 2's: two jobs, the `probe` marker, the constants line, no meaning lines. "No probe-off mode … AP-21's second run is gone" is already true from slice 2.
4. **The marker.** Slice 2 adds `LeanFacts.probe`. Slice 3's `LeanFacts.meaning` should stay as the marker that the meaning part ran, or be folded into `probe` with a flag. Either way, facts written by 2b3a's probe have `probe` but no keys, so slice 3's FID-4 base re-check ("marker absent") must keep reading the meaning marker, not `probe`.
5. **`MeaningMissing` 'cut'.** Because the `#eval` output is one Lean message, a cut at 32 MB loses every line. A per-declaration `cut` therefore cannot happen: a cut is a failure of the whole probe, which slice 2 already refuses. With texts up to 2 MB each, 3p should either send the meaning texts another way (for example runLean's `stdoutFile`, or hashing inside the probe) or reword `cut` as a failure of the whole probe.
6. **S3-2 rule alignment.** Slice 2 already handles a probe that failed as a whole through `probeFailure`:
   - `environment` at step purposes only when the rules find nothing else, or only `source-only`;
   - a partial stage through ADV-3's `factsMissing`;
   - `facts` at `final` and in the backstop.
   Slice 3's `no-key` must not be reported per name when `probeFailure` is set, or slice 2's step-purpose mapping must treat `no-key` like `source-only`. Otherwise the planned `environment` outcome for a failure of the whole probe becomes counted findings. Slice 3 should reuse `probeFailure`'s sentences for its "the meaning check failed" cause.
7. **D3-52.** It now covers only `meaningKey` riding on D2-75's job. Its *Alternative* and *To reverse* must no longer describe isolating or un-isolating the probe; that is D2-75's reverse. The ghost residual should cite D2-75.
8. **Cheat 24.** The constant-forging variant is now covered in slice 2 (2b3a's `probe-forge` overlay, real Lean). 3p's real-Lean run can reuse that overlay for `meaningKey`.
9. **§7.3 AP entry.** The sentence "the meaning probe now runs as its own job (D3-52), so AP-21's … is gone" moves to slice 2's entry (D2-75). Slice 3's entry only needs to say the meaning check was added to that job.
10. **`fakeFacts({ meaningKey: true })`** should also set slice 2's `probe` marker.
