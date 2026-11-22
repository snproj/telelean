# integrate:2i

Agent `ab2af0239bedac8bc` of workflow `wf_2f71cf32-72e`. Verbatim output (JSON alongside).

- **ok:** True
- **summary:** Integrator check after slice 2i passed. All five tsc configs are rc=0. Vitest is green in core, webview, extension and the full runner suite with real Lean. Read-only safety checks passed before and after the run. Patch saved to /home/zhengyew/telelean/verbatim_prompt_log/bundle_21/evidence/patches/after_slice_2i.patch (7160689 bytes, 441 files). tmp_leftovers=0. No repo files were edited and nothing was staged or committed.
- **checks:**
  - tsc_core rc=0 (tsconfig.test.json)
  - tsc_runner rc=0 (tsconfig.test.json)
  - tsc_web rc=0 (webview tsconfig.json)
  - tsc_webnode rc=0 (webview tsconfig.node.json)
  - tsc_ext rc=0 (extension tsconfig.json)
  - vt_core rc=0  Test Files 76 passed (76)  Tests 1142 passed (1142)
  - vt_web rc=0  Test Files 24 passed (24)  Tests 435 passed (435)
  - vt_ext rc=0  Test Files 22 passed (22)  Tests 216 passed (216)
  - vt_runner rc=0  Test Files 77 passed (77)  Tests 883 passed | 1 skipped (884)  (skips = 1, expected 1: the opt-in real-Claude test)
  - failures.txt is empty
  - tmp_leftovers=0
  - git diff --cached --stat: empty (nothing staged)
  - git log -1 --format=%h: 1473ca0
  - git status --porcelain -- packages/extension/dist packages/extension/out: empty
  - stat dist and out: both 2026-11-21 05:56:37 (sub-second .088 / .113)
  - ls -a packages/extension/out | grep -c '^.vite$': 0
  - savepatch.sh after_slice_2i: 7160689 bytes, 441 files, rc=0
- **runner:** vt_runner rc=0  Test Files 77 passed (77)  Tests 883 passed | 1 skipped (884). Expected skips = 1 (opt-in real-Claude test); no failures.
