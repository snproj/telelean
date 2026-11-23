---
name: prompt-logging-instruction
description: "Standing order in telelean — one verbatim_prompt_log bundle per user TURN (mid-turn prompts go in the same bundle), with my response, interim replies, modelinfo, requested docs and ALL subagent reports"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 03a29d54-7342-40e3-b5f0-2697a62c93ef
  modified: 2026-10-31T18:46:47.461Z
---

In /home/zhengyew/telelean, log each user **turn** as one bundle under `verbatim_prompt_log/`. Layout follows the user's own naming (they created `bundle_1/prompt1.md`) combined with their reference log (github.com/zilinc/spectec, branch lean-backend-proof, `spectec/src/test-lean-claude/claude-logging/verbatim_dialogue_log`):

```
verbatim_prompt_log/bundle_N/
  promptN.md                 # the turn's opening prompt, verbatim
  promptN_midturn.md         # every message the user sends while I'm still working, verbatim, in order
  responseN.md               # my final reply for the turn
  responseN_interim.md       # interim replies I sent during the turn (if any), verbatim
  responseN_modelinfo.md     # model id, effort, session id, date, harness, workflows/agents used, honest gaps
  user_requested_documents/  # documents the prompt asked for
  subagent_reports/          # ALL subagents' full responses/reports (verbatim JSON + readable .md), workflow scripts (= their prompts), small evidence artifacts
```

**Why:** The user keeps a verbatim audit trail of the human–AI dialogue. Corrections on 2026-11-01: (1) mid-turn messages are part of the same turn and go in the same bundle, not new bundles (I first created bundle_2/bundle_3 and had to merge them back); (2) "save not only your response, but all your subagent's responses / reports".

**How to apply:** At the start of a new turn, create the next `bundle_N` and save the prompt verbatim. Append mid-turn messages to `promptN_midturn.md` as they arrive. After any workflow or agent finishes, copy its outputs into `subagent_reports/`. The harness stops subagents from writing report files, so take their outputs from the workflow `journal.jsonl`. Skip registry dumps, downloads and build dirs. Write `responseN.md` and `responseN_modelinfo.md` at the end. Never overwrite files the user wrote themselves. Related: [[telelean-project]].

**Lessons (2026-11-01, turn 9):** (1) every user turn gets a bundle, including short Q&A turns. I skipped turns 4-8 and had to back-fill them. If the user says "don't modify anything", log that turn at the start of the next one and say so. (2) Take `responseN.md` verbatim from the session transcript (`~/.claude/projects/-home-zhengyew-telelean/<session>.jsonl`, assistant text blocks), not from a draft: my emitted text can differ from the draft file, as `bundle_2/response2.md` did. Bundles are numbered by turn.
