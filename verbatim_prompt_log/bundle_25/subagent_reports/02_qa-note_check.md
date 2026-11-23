# Subagent report: qa-note:check (agent afd3b096cd69b7331, workflow wf_93090c56-47b)

Meta: {"agentType": "workflow-subagent", "isBuiltIn": true, "description": "qa-note:check", "workflowPhase": "Design note", "spawnDepth": 1, "requestShape": "foreground", "requestNonInteractive": true, "model": "sonnet", "pickedEffortModel": "claude-opus-5-5", "inWorkflowRun": true}

Verbatim return value:

````
Fact-check of /home/zhengyew/telelean/verbatim_prompt_log/bundle_25/user_requested_documents/01_live_qa_design_note.md is done. 7 minimal in-place edits; no recommendation or question changed in substance. Nothing else was touched, and nothing was built or run.

Checked and correct (file:line cites match the code): the CLI flags and the five file tools (claudeCli.ts:75-121, `--setting-sources=` at 113, `--max-budget-usd` at 117, partial messages at 100); the hook (confinement.ts:115-147); bwrap wrapping only Lean (runLean.ts:1-23); the init event listing tools and servers (types.ts:102-114); the permission_denied and tool_use parsing (streamJson.ts:245, 288-289, 333-334); env cleaning and the subscription check (env.ts, claudeCli.ts:465-493); AgentText and D-15; one conversation per session (session.ts:2-3); the masked view (view.ts:636-685); the twins tests (session.twins.test.ts:67, 114); the step prompts (prompts.ts:216-418); the consent code (runs.ts:50-63, host.ts:496-508); RunPanel.tsx:397-421; the stepRunning text (texts.ts:89, D2-62); the review keys A, D and arrows, which are already off in text fields; the Socrates run at 6 requests and $0.141; the live-check double opt-in; `session/transcript.jsonl`; the default of keeping 10 runs; the effort basis (2i at about 0.69 M, 2e-2h at about 1.2 M each, from bundle_23).

Corrections made:
1. Section 2, hook line: today's guard still allows the file tools inside `ws/`. Refusing every tool needs a new policy mode, so I said it is a small code change.
2. Section 2, flags to verify: `--fork-session` (Option B) is also absent from the repo and needs the `--help` check, like `--tools=` and `--no-session-persistence`. I could not check any of the three against `claude --help`, because running the CLI is barred here.
3. Section 3, Option B cost: "the Socrates conversation alone was about 12 k tokens" became "wrote about 12 k tokens to the cache (system prompt, tools and conversation)". The report's figure is cache-write tokens, not the conversation alone.
4. Section 4: the 5-minute prompt-cache benefit is now marked "may", not measured.
5. Section 5: "a question on a small model is roughly 4-6 cents" was wrong about the model. The steps and the Socrates run use the default claude-opus-5-5. It now says "on the default model (Opus 5.5, as the steps use) ... my estimate, not measured". The "about a third of the Socrates run" arithmetic still holds ($0.14).
6. Section 7: "newest 10 runs are kept" is now "by default", since it is the `telelean.run.keepRuns` setting.
7. Question 5(a): "Medium, Opus 5.5's own default" is unsupported in the repo. Only `docs/DEMO.md` suggests medium, for demo speed. I reworded it and said that "Opus 5.5's own default" is unchecked.

Concerns for the user:
- The 4-6 cent figure, the 3-5 k token size and the effort totals (2-2.7 M) are estimates only. The note says the live check would measure the token size.
- Option B's claims about the prompt cache and about the API rejecting Claude's earlier hidden reasoning stay unverified; the note already says so for the second.
- Design points not yet in code: killing the process on a tool event, the "Stopped" message and the policy mode are all new. Using FakeBackend for the Q&A no-effects test is a design choice, since FakeBackend is built around step tools.
- The note is still about 2,000 words, over the 1.5-page target; I did not cut it.
````
