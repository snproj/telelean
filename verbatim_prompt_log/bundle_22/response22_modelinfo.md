# Model / session metadata for response22 (turn 22), final, 2026-11-22 ~16:05 SGT

Turn 22 ran from 2026-11-21 15:16Z (the takeover message) to 2026-11-22 ~08:05Z, in session `c398a83b-d60f-46a4-ad9a-8d926e6fdd1b` on the new machine (AP-39). The context was compacted during the turn (see `response22_interim.md` for where).

## Model identity
- **Main loop:** Opus 5.5 (`claude-opus-5-5`); knowledge cutoff June 2026. **Ultracode** was on (the system confirmed it).
- **Subagents (AP-38):**
  - builders on Opus;
  - verifiers, fixers and re-verifiers on Sonnet (`claude-sonnet-5-5`);
  - integrators on Haiku (`claude-haiku-5-5`).
  - The VS Code test fixers, their checker and the AP-entry draft agent ran on Sonnet.
- **Claude used by telelean itself:** none. No real-Claude telelean run was started, and every test ran with `TELELEAN_NO_REAL_CLAUDE=1`.

## Runs this turn
| Run | What | Agents | Subagent tokens (from the completion notices) |
|---|---|---|---|
| `wf_bee8fde1-76d` | chain v5: 2e, 2f, 2g, 2h (2h's full check re-run by me, AP-40) | 19 | 4,659,072 |
| `wf_2f71cf32-72e` | chain v5: 2i | 4 | 690,945 |
| `wf_46e69f5f-f31` | the two VS Code suite failures: 2 fixers and 1 checker | 3 | 269,234 |
| agent `a47965e1dad55c080` | draft of AP-41 and AP-42 | 1 | 91,912 |
| **Total** | | **27** | **5,711,163** |

## Token use by model
Summed from the transcripts, deduplicated by message id.

| Who | Model | Messages | Output | Cache writes | Cache reads |
|---|---|---|---|---|---|
| Subagents | Opus 5.5 | 1,624 | 1,949,597 | 8,139,328 | 708,878,180 |
| Subagents | Sonnet 5.5 | 722 | 540,655 | 3,258,839 | 82,304,903 |
| Subagents | Haiku 5.5 | 50 | 18,196 | 974,219 | 872,001 |
| Main loop | Opus 5.5 | 150 | 207,628 | 686,720 | 21,623,886 |

## Honest gaps
- **Not visible to me:** the plan's quota percentage and the rate-limit state. The figures above are token counts, not quota.
- **The "subagent tokens" column** is the workflow notices' own figure. Its exact definition is not documented to me, so the per-model table is the better guide.
- **The RAM guard** (`bjfk3yen2`, MemAvailable < 1.5 GB) never fired. I stopped it at the end of the turn.
