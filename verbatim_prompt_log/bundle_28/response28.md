They're in section 10 ("Questions for you") at the end of `verbatim_prompt_log/bundle_25/user_requested_documents/01_live_qa_design_note.md`. The note is in the repo, so it moves with it. Yes, you can deal with them in the new session. I've added a line to `START_HERE.md` telling the new session to expect your answers and log them as your decisions.

In short, with my recommendation for each:

1. **A or B?** A is a fresh Claude, with no tools, that sees only what you see. B continues the step's own conversation, in a copy without tools. *I recommend A.*
2. **Can you ask while a step runs?** (a) No, (b) yes, about the stage as it was when the step started, or (c) only while Claude waits for your answer. *I recommend (a).*
3. **Do answers reach later steps?** (a) Never, (b) only through a "Quote in note" button, or (c) automatically with the next Submit. *I recommend (a).*
4. **"Does it prove it?" while results are hidden:** (a) Claude declines and points to Show results, or (b) answers freely. *I recommend (a).*
5. **Effort for answers:** (a) medium, as a setting, or (b) high, like the steps. *I recommend (a).*
6. **Consent:** (a) once per model folder, separate from the run consent, (b) covered by the run consent, or (c) confirm every question. *I recommend (a).*

Answering costs nothing. Building the Q&A afterwards is a separate go-ahead: the note estimates about 2–2.7 M tokens for A, and B would add 0.5–1 M. This turn is logged in `bundle_28/`, so the new session's first turn will be 29; I've updated the handoff to say so.
