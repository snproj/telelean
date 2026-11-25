About a minute for the rebuild itself, and about 5 minutes end to end if you want the full re-check.

- **The rebuild:** a few seconds. The same two steps took under a second each on the scratch copy (webview build 0.3 s, extension bundle about 1 s). With startup and a check that `dist`/`out` changed as expected, call it about a minute.
- **An optional re-check:** about 1.5 minutes. This reruns the VS Code suites against your real `dist`, rather than the identical scratch build they already passed on.
- **No subagents,** so it costs very little quota.

The main wait on your side is finishing or Exiting your open sessions first, then reloading VS Code afterwards.
