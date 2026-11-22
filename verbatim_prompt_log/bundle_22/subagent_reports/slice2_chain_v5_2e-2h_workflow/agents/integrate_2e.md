# integrate:2e

Agent `a461f68a72451bbbf` of workflow `wf_bee8fde1-76d`. Verbatim output (JSON alongside).

- **ok:** True
- **summary:** Integrator check after slice 2e passed. All five tsc configs returned rc=0, the core, webview and extension vitest suites passed in full, and the full runner suite with real Lean passed (785 passed, 28 skipped, matching the 28 expected skips). The read-only safety checks passed (nothing staged, HEAD still 1473ca0, dist/out untouched, timestamps unchanged, no .vite folder, no telelean temp leftovers, failures.txt empty). The patch was saved to /home/zhengyew/telelean/verbatim_prompt_log/bundle_21/evidence/patches/after_slice_2e.patch (6066518 bytes, 406 files). No repository files were edited by me, and no Playwright or VS Code tests were run.
- **checks:**
  - tsc_core rc=0
  - tsc_runner rc=0
  - tsc_web rc=0
  - tsc_webnode rc=0
  - tsc_ext rc=0
  - vt_core rc=0 Test Files 76 passed (76) Tests 1133 passed (1133)
  - vt_web rc=0 Test Files 19 passed (19) Tests 314 passed (314)
  - vt_ext rc=0 Test Files 22 passed (22) Tests 217 passed (217)
  - vt_runner rc=0 Test Files 73 passed | 1 skipped (74) Tests 785 passed | 28 skipped (813)
  - git diff --cached --stat: empty
  - git log -1 --format=%h: 1473ca0
  - git status --porcelain -- packages/extension/dist packages/extension/out: empty
  - stat dist and out: 2026-11-21 05:56:37 both
  - ls -a packages/extension/out | grep -c '^.vite$': 0
  - savepatch.sh after_slice_2e: saved 6066518 bytes, 406 files
- **runner:** vt_runner rc=0 Test Files 73 passed | 1 skipped (74)  Tests 785 passed | 28 skipped (813); expected skips 28; tmp_leftovers=0
