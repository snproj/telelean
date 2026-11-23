Yes. Your installed telelean runs from `packages/extension/dist`, and the 2k2 builders and reviewers never write there. They change only the source files. So everything you test, reloads included, keeps running today's build (2k1) until the final rebuild.

A few things to watch:

1. **Commit before I start.** Today's changes to `dist`/`out`, the decisions log and bundles 29–31 should be committed first. The chain checks that HEAD doesn't move while it runs, so please don't commit again until I report 2k2 done. A commit in the middle makes the final check fail.
2. **The rebuild at the end.** I can stop just before rebuilding `dist`/`out`, so you choose when the switch happens. Before you reload into the 2k2 build, finish or Exit your open sessions, bongo's included. 2k2 looks for runs in the model folder, so sessions in VS Code's storage won't be found.
3. **Memory.** The full test run needs about 12 GB free, and this machine has 31 GB. Your own testing is fine (a board, Lean checks, a Claude run now and then), but avoid many heavy jobs at once. If the test run is short of memory, it fails and I re-run it, which costs time, not much quota.
4. **Quota.** Your Formalize runs and the 2k2 build draw on the same weekly quota. Budget about 2 M for 2k2 on top of your testing.

Your demo folders are safe: the tests use isolated copies and never touch them.

Shall I start 2k2? If so, tell me once you've committed, and say whether you want me to stop before the rebuild.
