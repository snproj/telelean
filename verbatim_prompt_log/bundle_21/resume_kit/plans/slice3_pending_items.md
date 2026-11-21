# Slice-3 plan items pending for the pre-build refresh (apply before building slice 3)

1. AP30-8 (minor, from the amendment workflow's last recheck; full text in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/amend_open_after_r2.json): 3p's base-commit re-check must also evict the engine's cached models of the base commit (every `models` entry for this run and that commit), or key the facts-model by the stored facts' identity; plus the 3p test (judge builds B's model from keyless facts → base-commit re-check replaces the file → next judge compares by meaningKey exactly).
2. AP30-1 r3 (slice-3 side): cheat 24's `@[init]` variant gains the hygienic spelling `@[init.«_@».x._hyg]` (by hand in 3a, through the runner in 3d); D3-52 cites the macro-scope rule beside the `init` rule.
3. Refresh the whole plan against slice 2's final §8 change log and code (names, contracts and decisions the slice-2 builders changed), before 3a starts.

## Slices 4 and 5 (paused by the user's AP-34; resume only with their go-ahead)
- Plans: scratchpad/plans/slice4-plan.md and slice5-plan.md (after AP-31 and two fix loops); open findings at the pause: scratchpad/plans/slices45_open_final.json.
- Before building: a fresh critic round (the judge's open item 6) and a refresh against the final slice-2/3 code; then move the plans to docs/.
