# 01 — The idea, consolidated (Step 1)

*Answers Implementation step 1 (S45–S47). Step 2 (unspoken constraints → decisions) is in `02_design_decisions.md`; step 3 (architecture + software list) is in `03_architecture.md`.*

**How to read this.** `S1`–`S55` number the sentences of `bundle_1/prompt1.md` in order. Each consolidated point below cites the sentences it came from and a requirement ID (`SEM-`, `DATA-`, `UI-`, `LLM-`, `LEAN-`, `NFR-`, `PROC-`). Appendix A lists every sentence verbatim with the IDs it feeds, so you can check that nothing was dropped; Appendix B has the full requirement statements; Appendix C lists the implied constraints (`IC-`), which `02_design_decisions.md` turns into decisions.

---

## 1. The idea in one paragraph

**telelean** is a VS Code extension for externalising a person's mental model of a subject as a small formal theory. The person writes beliefs in natural language and tags each one as an **ASSUMPTION** (taken as given, with *their* reason for holding it), a **DERIVATION** (follows *purely* from the assumptions), or a **GOAL** (wanted, but not yet reached). Every node lives in the workspace's Lean files as a marked-up comment, with or without Lean code. The extension shows the nodes as a three-column, draggable map with arrows. An LLM — at minimum Claude through the user's own subscription — does the formalising on request. Given a selection the user asserts is sufficient ("these assumptions must be enough to prove this goal"), it asks clarifying questions about level of detail and unspoken context (pragmatics), writes the Lean, proves the goal, and proposes the result as a diff. The diff is shown on the map and as file diffs, and the user accepts it or replies with feedback.

---

## 2. Consolidated points (de-duplicated, re-ordered)

### 2.1 What the node kinds mean
1. **ASSUMPTION**: an axiom the user supplies because they feel it is true about the world. It carries a natural-language note on *why* they hold it, e.g. "familiar with gaming lore". — SEM-1, DATA-5 · S5, S6, S20, S22, S24
2. **DERIVATION**: something that can be derived *purely* from the assumptions; it must never need a new assumption. — SEM-2 · S7
3. **GOAL**: something the user wants to prove but has no route to yet via assumptions and derivations. — SEM-3 · S8, S18
4. **Kinds can change**: A→D (promotion), D→A, G→D "once it's proven", "etc etc". — SEM-4 · S16
5. **The central button** means *"I assert that the assumptions must be enough to prove the goal"*. The user selects assumptions plus a goal and presses it. — SEM-5 · S25, S28
6. **Unformalised ≠ uninhabited.** A node without Lean code is only a comment, never `sorry`, because `sorry` would claim a representation exists. — SEM-6 · S19/S21/S23, S38, S39

### 2.2 How nodes are represented
7. The Lean files in the folder VS Code has open *are* the model. Every node corresponds to something in one of them. — DATA-1 · S2, S35
8. Node metadata goes in a markup inside Lean comments, opened by `@@ telelean`, with at least `natural_name` and `type`. The exact syntax is open ("Something like"). — DATA-2 · S35, S36, S37
9. A node with no code yet is a comment block with no declaration after it. — DATA-3 · S19/S21/S23, S38, S39
10. Every node has a natural-language description that is shown first, possibly as the Lean docstring. — DATA-4 · S37, S40
11. Assumptions carry their rationale, captured when they are added. — DATA-5 · S6, S20, S22
12. Nodes and the graph the arrows form need a *programmatic* representation, not only a visual one. — DATA-6 · S15, S34
13. Separate scripts must be able to analyse the graph. — DATA-7 · S43
14. The model can be changed two ways, by editing the files or through the AI, and both stay in sync with the map. — DATA-8 · S3, S42

### 2.3 The panel and interaction
15. An interactive map with at least click-and-drag. — UI-1 · S2
16. The extension's tab holds one panel split into **three vertical sections: assumptions | derivations | goals**. — UI-2 · S11–S14
17. Each section scrolls **independently**, because there may be very many nodes. — UI-3 · S11
18. **Arrows** can be drawn from any node in one section to a node in another. A graph emerges, and that should drive the choice of library. — UI-4, UI-16 · S15
19. Nodes can be **moved between sections** (promote/demote). — UI-5 · S16
20. A **text input box** with a **switch** that marks a prompt as creating an ASSUMPTION, DERIVATION or GOAL. The extension reads the switch; it does not guess the kind. — UI-6, UI-7 · S4, S10
21. Adding through the box creates the node immediately, **with no Lean code generated**. An assumption is annotated with its rationale. — UI-8 · S18–S24
22. **Multi-select across sections.** The selection is shown in a **separate section below** the columns. — UI-9 · S25, S26
23. **A button** sends the selection to the LLM with the sufficiency meaning. — UI-10 · S27, S28
24. The LLM's proposal is a **diff overlaid on the nodes**, including newly created ones, with a **switch to the raw Lean file diffs**. — UI-11 · S31, S32
25. The user **accepts, or gives feedback**. — UI-12 · S33
26. **Natural language first.** Clicking a node expands it to show its Lean definition. — UI-13 · S40
27. Nodes **with** a Lean representation are visibly marked, e.g. with a **blue aura**. — UI-14 · S41
28. The panel is the main workspace, and editing Lean directly is always possible. — UI-15 · S3, S42

### 2.4 The LLM harness
29. The extension is a **harness with a pluggable LLM slot**. Claude through the user's **current subscription** is the minimum, because you intend to use it. — LLM-1, LLM-2 · S9
30. Prompting the AI in natural language is the usual way to change the model. — LLM-7 · S3, S4
31. On the button: **formulate the selected assumptions and goal in Lean "in some intuitive way", generate their signatures, and prove the goal.** — LLM-4 · S27, S29
32. **Ask clarifying questions along the way** ("do you want to model characters?") to pin down the level of detail and the pragmatics. — LLM-3 · S30
33. The result is a **proposed diff** that takes effect only when accepted; feedback continues the iteration. — LLM-5 · S31, S33
34. The LLM may add **finer-grained support declarations** (a structure `Cynder`, a Prop `isCharacter`), which become new nodes. — LLM-6 · S32

### 2.5 Lean
35. "Proven" means Lean accepts the proof, with no errors and no `sorry`. — LEAN-1 · S16, S29
36. The text suggests an encoding: assumptions as axioms, a goal introduced by a `def` (the example), and signatures generated by the LLM. — LEAN-2 · S5, S29, S37

### 2.6 Non-functional
37. It is a **VS Code extension**. — NFR-1 · S1
38. It must scale to many nodes and big projects. — NFR-2 · S11, S43
39. **Advise whether an LSP is the right design.** Short answer: *not now*. A core library, a CLI with a versioned JSON export, and in-process VS Code providers serve the stated needs, and an LSP can wrap the same core later. See `03_architecture.md` §9. — NFR-3 · S43
40. The markup must be able to grow: versioned and extensible. — NFR-4 · S43

### 2.7 How I am to work
41. Read the idea fully, then consolidate it with every sentence accounted for (this document). — PROC-1, PROC-2 · S45, S47
42. Raise unspoken constraints that involve significant decisions (`02_design_decisions.md`). — PROC-3 · S48
43. Sketch an architecture, including the programmatic node representation, and list software to install (`03_architecture.md`). — PROC-4, PROC-5 · S34, S49, S50
44. Implement in `/home/zhengyew/telelean` **only after approval**. Then test, and tell you when it is good enough to start using, with directions. — PROC-6, PROC-7 · S51, S52
45. Log every prompt, even mid-turn ones, in a new bundle with my response and any requested documents, following the spectec layout. — PROC-8 · S53–S55
46. Use learnharness for inspiration, not as a template (PROC-9 · S44). Write for a reader with a formal-methods background and an interest in linguistics, cognition and HCI (PROC-10 · S46).

---

## 3. What the walkthrough (S17–S33) tells us

The walkthrough is the de facto acceptance test (IC-25). Formalising it during research surfaced three things:

- **The three assumptions, as stated, do not entail the goal.** From "Cynder has a dark past", "the new Spyro game is PG" and "PG games cannot have characters with dark pasts" you get *"the new Spyro game cannot have Cynder"*. Getting to *"Cynder would not be a good addition"* needs a bridge, e.g. "a character that cannot appear in a game is not a good addition to it". One research agent checked this mechanically. It built a countermodel, accepted by the Lean kernel with no axioms, in which all three assumptions hold and the goal fails. A correct run therefore has to **ask you about the bridging premise, or propose it as a new ASSUMPTION for you to endorse with your own reason**, and never slip it in. This is exactly the pragmatics S30 asks the LLM to surface. Your sketch `~/telelean_scripts/cynder.lean` reaches the same point (`from [h1, h2] ?- no`, followed by a bridging rule). I only read it, because your Lean server had it open.
- **Assumption 4 (S24) has no rationale**, although S6 says assumptions "should" be annotated. I treat the rationale as strongly encouraged, not mandatory (D-14).
- **`sorry`, read through S39.** By your own reasoning, `sorry` means "we have a representation, but it is not inhabited yet". That is precisely a formalised-but-unproved statement. So I read S39 as: no `sorry` for code-less nodes, and `sorry` as the honest marker for formalised-unproved ones (D-2 offers a sorry-free alternative).

---

## Appendix A — Sentence-by-sentence traceability (S1–S55)

Every sentence of `bundle_1/prompt1.md`, verbatim and in order (headings and the `___` rule are structural and not counted; the fenced code block counts as one unit; S19/S21/S23 are the same sentence repeated and are counted separately). The right column lists the consolidated requirement IDs (Appendix B) and implied-constraint IDs (Appendix C, decided in `02_design_decisions.md`) that each sentence feeds. `CONTEXT` = motivation only, no requirement. A script checked that all 55 sentences occur verbatim in the prompt, that nothing else is left uncovered, and that every ID below exists and every requirement/constraint is cited by at least one sentence.

| # | Sect. | Sentence (verbatim) | → Requirement / constraint IDs | Note |
|---|---|---|---|---|
| S1 | Idea | I would like to create a VS Code extension. | NFR-1 | Headings ('# Idea', '# Implementation') and the '___' rule are structural and not counted as sentences. |
| S2 | Idea | The goal of this extension would be to assist a user in creating an interactive map (at least clicking and dragging components) of the user's internal mental model about a subject, represented and supported by Lean code files that are in the directory that VSCode is currently in. | UI-1, DATA-1, IC-9, IC-15, IC-16 |  |
| S3 | Idea | The user would be able to modify the Lean model either directly by editing the files, or more commonly by prompting an AI. | DATA-8, UI-15, LLM-7, IC-7, IC-13 |  |
| S4 | Idea | The prompts would be in natural language, BUT should be able to be marked by the user using a UI switch (and read by the extension) as either creating an ASSUMPTION, a DERIVATION or a GOAL. | UI-6, UI-7, LLM-7, IC-6, IC-7 |  |
| S5 | Idea | An ASSUMPTION is an axiom that the user supplies based on what they feel is true about the world. | SEM-1, LEAN-2, IC-1, IC-2, IC-30 |  |
| S6 | Idea | An assumption should be annotated with a natural language description of why the user has that assumption. | DATA-5, IC-29 |  |
| S7 | Idea | A DERIVATION is something that can *purely* be derived from the ASSUMPTIONS -- it should never require new assumptions to be added to the model. | SEM-2, IC-1, IC-6, IC-10, IC-21 |  |
| S8 | Idea | A GOAL is something that the user eventually wants to prove, but has not yet found a way there via ASSUMPTIONS and DERIVATIONS. | SEM-3, IC-6, IC-31 |  |
| S9 | Idea | The extension will need to act as a harness where it can slot in an LLM (at least I must be able to slot in Claude using my current subscription because I want to use this). | LLM-1, LLM-2, PROC-7, IC-11, IC-12, IC-27, IC-32, IC-34 |  |
| S10 | Idea | The extension should also include a text input box. | UI-6, IC-7 |  |
| S11 | Idea | The extension tab itself should contain an interactive panel, which is visually split into three vertical sections, each containing a kind of node, and each being independently scrollable (because there might be many, many nodes): | UI-2, UI-3, NFR-2, IC-4, IC-17, IC-18 |  |
| S12 | Idea | 1. A section listing all assumptions | UI-2 |  |
| S13 | Idea | 2. A section listing all derivations | UI-2 |  |
| S14 | Idea | 3. A section listing all goals | UI-2 |  |
| S15 | Idea | The extension must be able to draw arrows from any node in one section to a node in another section, so I think some kind of graph structure will emerge, and probably this will inform the choice of library to implement this part. | UI-4, UI-16, DATA-6, IC-5, IC-18 |  |
| S16 | Idea | Nodes should also be able to move from one section to another; for instance, an assumption should also be promotable to a derivation, or a derivation made into an assumption, or a goal moved to a derivation once it's proven, etc etc. | SEM-4, UI-5, LEAN-1, IC-6, IC-22 |  |
| S17 | Idea | An example use case of the harness might be something like: | IC-25, CONTEXT | Introduces the illustrative walkthrough S18-S33; 'might be something like' marks it as an example rather than an exhaustive specification. Carries no requirement by itself beyond making the walkthrough the de facto acceptance scenario (IC-25). |
| S18 | Idea | 1. I want to prove that "Cynder would not be a good addition to the new Spyro game", so I add this as a GOAL. | SEM-3, UI-7, UI-8, IC-7 |  |
| S19 | Idea | The node is created, but no Lean code has been generated yet. | SEM-6, DATA-3, UI-8, IC-7 | The identical sentence recurs as S21 and S23; each occurrence is counted separately. |
| S20 | Idea | 2. I know from being familiar with gaming lore that "Cynder is a character who has a dark past", so I add this as an ASSUMPTION, annotated with "familiar with gaming lore". | SEM-1, DATA-5, UI-7, UI-8, IC-30 |  |
| S21 | Idea | The node is created, but no Lean code has been generated yet. | SEM-6, DATA-3, UI-8, IC-7 |  |
| S22 | Idea | 3. I know from gaming news that "The new Spyro game is PG", so I add this as an ASSUMPTION, annotated with "known from gaming news". | SEM-1, DATA-5, UI-7, UI-8 |  |
| S23 | Idea | The node is created, but no Lean code has been generated yet. | SEM-6, DATA-3, UI-8, IC-7 |  |
| S24 | Idea | 4. Similarly, I add an ASSUMPTION that "PG games cannot have characters with dark pasts" | SEM-1, UI-7, UI-8, IC-30 | No terminal period in the source. Unlike S20/S22, no rationale annotation is given (see tensions). |
| S25 | Idea | 5. Finally, I select the three assumptions, and also click on the goal. | SEM-5, UI-9, IC-18, IC-31 |  |
| S26 | Idea | The options I select should be shown in a separate section below. | UI-9 |  |
| S27 | Idea | I click a button, and the LLM generates a Lean model representing what I have created. | UI-10, LLM-4, IC-7 |  |
| S28 | Idea | The essence of the button in this case is to say that "I assert that the assumptions must be enough to prove the goal". | SEM-5, UI-10, IC-1, IC-2, IC-10, IC-31 |  |
| S29 | Idea | The job of the LLM is to formulate the assumptions and the goal in Lean in some intuitive way, and generate signatures for the assumptions and goals, and prove the goal. | LLM-4, LEAN-1, LEAN-2, IC-3, IC-14, IC-21 |  |
| S30 | Idea | 6. The LLM should ask questions to the user along the way; for instance, "do you want to model characters"? etc. which would help it understand the level of detail and the pragmatics (pragmatics in the sense it is used in linguistics; unspoken context) the user wants. | LLM-3, IC-3, IC-12, IC-28 | Kept as one sentence: the '?' closes the quoted example question and 'etc. which would help ...' continues the same sentence. |
| S31 | Idea | 7. When the LLM is done, it will propose a diff (which must be overlayed graphically on the nodes, but also the user should be able to switch to seeing the diff to the Lean files themselves). | UI-11, LLM-5, IC-3, IC-13, IC-26 |  |
| S32 | Idea | This would cause several more nodes to be created in the extension window (added to the mental model); for instance, it might create a structure `Cynder` and a Prop `isCharacter`, or some other more fine-grained representation of the concept I am trying to bring across. | UI-11, LLM-6, IC-4, IC-23, IC-29 |  |
| S33 | Idea | The user can accept this, or else provide some feedback. | UI-12, LLM-5, IC-26, IC-28 |  |
| S34 | Idea | You should think about how to represent nodes not only in graphically in the extension, but also programatically. | DATA-6, PROC-4 | Addressed to the implementer: a design task, not a runtime feature. |
| S35 | Idea | Each node must correspond to something in a Lean file in the current directory -- therefore, I suggest a markup notation that will go in Lean comments. | DATA-1, DATA-2, IC-8, IC-19, IC-23 |  |
| S36 | Idea | Something like: | DATA-2 | Introduces the code example S37 and signals that its syntax is only a suggestion. |
| S37 | Idea | <code>/-<br>@@ telelean<br>natural_name: "Cynder would not be a good addition to the new Spyro game"<br>type: GOAL<br>-/<br>def cynder_not_ ...</code> | DATA-2, DATA-4, LEAN-2, IC-8, IC-24 | Fenced code block counted as one unit. |
| S38 | Idea | If the node does not yet have Lean code, then it should still be represented as a Lean comment with no accompanying Lean code. | SEM-6, DATA-3, IC-15, IC-19 |  |
| S39 | Idea | I don't think `sorry` would be the right thing to use for this, since that implies we do have a representation, but it's not inhabited yet. | SEM-6, DATA-3, IC-6, IC-24 |  |
| S40 | Idea | We want the user to first see natural language, and only dive into Lean code when necessary, so each assumption, derivation and goal should have a natural language description (maybe in the Lean file, this would correspond to a docstring), and the user should be able to click on the node and expand it to see the Lean definition. | DATA-4, UI-13, IC-3, IC-17, IC-19 |  |
| S41 | Idea | Nodes that DO have a Lean representation should be visually marked as such, perhaps with a blue aura. | UI-14, IC-6 |  |
| S42 | Idea | Of course, the user is also able to see and edit the Lean source code directly, but he is expected to mostly work in the extension window. | DATA-8, UI-15, IC-13, IC-17 |  |
| S43 | Idea | The project might be big and the markup language representing nodes might grow in the future (we might also write separate scripts doing graph analysis on the nodes linked to each other etc), so let me know if an LSP is the right design decision. | DATA-7, NFR-2, NFR-3, NFR-4, IC-5, IC-19, IC-20, IC-32 |  |
| S44 | Idea | For a similar idea, you can look at https://github.com/amosblomqvist/learnharness and https://learnharness.ai for inspiration, though the goals there (and probably the tech stack) are different from mine. | PROC-9 |  |
| S45 | Implementation | 1. Read fully and understand the idea above. | PROC-1 |  |
| S46 | Implementation | It is written by me, who has a background in formal methods, and an interest in linguistics, cognition and human-computer interaction. | PROC-10 | The author's background, which sets how deep and in what terms the analysis should be written; it adds no product feature. |
| S47 | Implementation | However, it might be messy and parts may be out of order, so consolidate points from the idea while keeping track that every sentence is still accounted for. | PROC-2 |  |
| S48 | Implementation | 2. Understand any unspoken constraints from the idea above and raise them if it involves a significant design decision. | PROC-3 |  |
| S49 | Implementation | 3. Sketch out a software architecture that would allow the idea to be implemented. | PROC-4 |  |
| S50 | Implementation | Give me a list of software that you would want to install. | PROC-5 |  |
| S51 | Implementation | 4. Once approved, implement the desired program in this directory. | PROC-6, IC-15 |  |
| S52 | Implementation | Test the basic functionality of the program and let me know when it is in a state that is good enough for me to start using it, giving me directions as to how to do so. | PROC-7, IC-25 |  |
| S53 | Implementation | 5. In `verbatim_prompt_log`, you see `bundle_1` with `prompt1.md`. | PROC-8, IC-33 |  |
| S54 | Implementation | From now on, log every prompt that I give (even if it's asked mid-turn) in a new bundle, and your response + any user-requested documents. | PROC-8, IC-33 |  |
| S55 | Implementation | You can look at `https://github.com/zilinc/spectec/tree/lean-backend-proof/spectec/src/test-lean-claude/claude-logging/verbatim_dialogue_log` for an example of the structure. | PROC-8 |  |

## Appendix B — Consolidated requirements (with source sentences)

### Semantics (what the node kinds mean)

| ID | Strength | Requirement | Sources | Open point |
|---|---|---|---|---|
| SEM-1 | must | ASSUMPTION semantics: an ASSUMPTION is an axiom the user supplies, expressing what they feel is true about the world; it is accepted without proof and is the trusted base from which DERIVATIONS are obtained. | S5, S20, S22, S24 | 'Axiom' may mean a literal Lean `axiom` or, more loosely, an unproved premise (hypothesis), see IC-1. Beliefs are often defeasible or graded (IC-30). |
| SEM-2 | must | DERIVATION semantics: a DERIVATION can be derived purely from the ASSUMPTIONS and must never require new assumptions to be added to the model. | S7 | Whether a DERIVATION node may exist before its proof does (T5), and whether vocabulary declarations count as 'new assumptions' (IC-4). |
| SEM-3 | must | GOAL semantics: a GOAL is a statement the user eventually wants to prove, for which no route via ASSUMPTIONS and DERIVATIONS has been found yet. | S8, S18 | What happens to a GOAL once a proof is found (T6). |
| SEM-4 | should | Kind changes: nodes can change kind, e.g., an ASSUMPTION promoted to a DERIVATION, a DERIVATION made into an ASSUMPTION, a GOAL moved to DERIVATION once it is proven, and other transitions ('etc etc'). Each transition must leave the node consistent with SEM-1..SEM-3. | S16 | Which transitions need a proof or user confirmation, and whether GOAL to DERIVATION happens automatically on proof (IC-22, T6). |
| SEM-5 | must | Sufficiency assertion: selecting assumptions and a goal and pressing the button means 'I assert that the assumptions must be enough to prove the goal'. The proof obligation is the goal from (only) the selected assumptions. | S25, S28 | Whether derivations may be selected as premises (T16), and how 'only the selected ones' is enforced when assumptions are global axioms (T7). |
| SEM-6 | should | Unformalized vs. uninhabited: a node without Lean code is in a different state from a node whose Lean representation exists but is not yet proved (inhabited). `sorry` must not be used for the former. | S19, S21, S23, S38, S39 | Whether `sorry` is acceptable for formalized-but-unproven nodes (T11). |

### Data representation

| ID | Strength | Requirement | Sources | Open point |
|---|---|---|---|---|
| DATA-1 | must | The Lean files in the directory VS Code currently has open represent and support the mental model: every node must correspond to something in a Lean file in that directory. | S2, S35 | What 'current directory' means with no folder or several workspace folders open (IC-16); whether the folder must be a Lake project (IC-15); whether every Lean declaration must be a node (IC-23). |
| DATA-2 | should | Node metadata is written in a markup notation inside Lean comments: a block opened by a sentinel (`@@ telelean`) with key-value fields, at least `natural_name` and `type` (ASSUMPTION \| DERIVATION \| GOAL), placed with the Lean declaration it annotates. The exact syntax is open ('Something like'). | S35, S36, S37 | Fields missing from the example (id, rationale, description, edges, binding to the declaration) and grammar details (T10, IC-8, IC-19). |
| DATA-3 | should | A node that has no Lean code yet is still stored in a Lean file, as a markup comment with no Lean declaration after it, not as `sorry`. | S19, S21, S23, S38, S39 | Which file receives new comment-only nodes (IC-15). |
| DATA-4 | should | Every assumption, derivation and goal has a natural-language description that is shown before any Lean; in the Lean file this may correspond to the declaration's docstring. | S37, S40 | How `natural_name`, a longer description, and a docstring relate; a docstring cannot exist without a declaration (IC-19, T10). |
| DATA-5 | should | Assumption nodes carry a natural-language rationale explaining why the user holds the assumption (e.g., 'familiar with gaming lore', 'known from gaming news'), captured when the assumption is added. | S6, S20, S22 | Optional or mandatory (T9); the example markup in S37 has no field for it. |
| DATA-6 | should | Design a programmatic representation of nodes and of the graph the arrows form (node id, kind, NL text, rationale, Lean binding, status, edges), not only a graphical one. | S15, S34 | In-memory model vs. persisted schema, and what is stored vs. computed (IC-5, IC-6, IC-9). |
| DATA-7 | could | The graph of nodes and their links should be accessible to separate scripts (e.g., graph analysis) outside the extension UI. | S43 | Access through files, a CLI export, an LSP, or Lean metaprograms (IC-20). |
| DATA-8 | must | Two-way sync: the user can change the model by editing Lean files directly and can view and edit the source at any time. Such edits are reflected in the map, and changes made in the map or by the LLM are written back to the files. | S3, S42 | How conflicts are handled while an LLM run is in progress (IC-13). |

### UI and interaction

| ID | Strength | Requirement | Sources | Open point |
|---|---|---|---|---|
| UI-1 | must | Provide an interactive map of the user's internal mental model about a subject, supporting at least clicking and dragging components. | S2 | A free 2-D map vs. the column layout of UI-2 (T1). |
| UI-2 | should | The extension tab contains an interactive panel visually split into three vertical sections, each containing one kind of node: (1) all assumptions, (2) all derivations, (3) all goals. | S11, S12, S13, S14 | 'Extension tab' could be an editor-area panel or a sidebar view (IC-17); where vocabulary nodes go (T8). |
| UI-3 | should | Each of the three sections scrolls independently, because there may be many, many nodes. | S11 |  |
| UI-4 | must | The extension must be able to draw arrows from any node in one section to a node in another section. | S15 | User-drawn vs. computed arrows (T2); arrows within one section (T3); direction and meaning (IC-5). |
| UI-5 | should | Nodes can be moved from one section to another in the panel (promotion or demotion between kinds). | S16 | Gesture (drag or command) and validation (IC-22). |
| UI-6 | should | Include a text input box for natural-language prompts. | S4, S10 | Whether submitting creates a node, prompts the LLM, or both (T4). |
| UI-7 | must | Provide a UI switch with which the user marks a prompt as creating an ASSUMPTION, a DERIVATION or a GOAL. The extension reads this marking: the kind is declared by the user, not inferred. | S4, S18, S20, S22, S24 |  |
| UI-8 | should | Adding a node through the input box creates it immediately in the matching section, without generating any Lean code. For assumptions, the user can attach the rationale when creating it. | S18, S19, S20, S21, S22, S23, S24 | How the rationale is entered (IC-7). |
| UI-9 | should | Nodes can be multi-selected across sections (e.g., three assumptions plus a goal), and the current selection is shown in a separate section below the columns. | S25, S26 |  |
| UI-10 | should | A button sends the current selection to the LLM with the meaning 'these assumptions must be enough to prove the goal'. | S27, S28 | Behavior for other kinds of selection (IC-31). |
| UI-11 | must | The LLM's proposed diff must be overlaid graphically on the nodes (including newly created nodes), and the user must be able to switch to the diff of the Lean files themselves. | S31, S32 | Shown inside the panel or in VS Code's diff editor (T21); partial acceptance (IC-26). |
| UI-12 | should | The user can accept the proposed change or instead give feedback. | S33 | Accepting per node or per hunk is not stated (IC-26). |
| UI-13 | should | Natural language first: nodes show their NL description by default, and the user looks at Lean only when necessary, by clicking a node to expand it and see its Lean definition. | S40 |  |
| UI-14 | should | Nodes that have a Lean representation are visually marked as such (e.g., with a blue aura). | S41 | A binary marker vs. the proof-status cues that are also needed (T15). |
| UI-15 | should | The extension window is the user's primary workspace; viewing and editing the Lean source directly remains possible. | S3, S42 |  |
| UI-16 | question-to-answer | Recommend the rendering/graph library for nodes and arrows, given that a graph structure emerges from the arrows. | S15 | Constrained by the three independently scrolled columns (IC-18). |

### LLM harness

| ID | Strength | Requirement | Sources | Open point |
|---|---|---|---|---|
| LLM-1 | must | The extension acts as a harness into which an LLM can be slotted (the provider is pluggable). | S9 | Whether 'slotting in' happens at the level of a completion API or an agent runtime (T17, IC-11). |
| LLM-2 | must | At minimum, Claude must be usable through the user's current Claude subscription, because the user intends to actually use the tool. | S9 | Which route to use and the policy limits on it (IC-11). |
| LLM-3 | should | During a run, the LLM asks the user clarifying questions (e.g., 'do you want to model characters?') to learn the desired level of detail and pragmatics (unspoken context). The harness passes the questions to the UI and returns the answers. | S30 | How answers are entered in the UI and whether they are stored (T14, IC-28). |
| LLM-4 | must | When the selection button is pressed, the LLM generates a Lean model of what the user created: it formulates the selected assumptions and goal in Lean in an intuitive way, generates their signatures, and proves the goal. | S27, S29 | What to do when the selected assumptions are not enough (IC-10). |
| LLM-5 | must | LLM changes arrive as a proposed diff that takes effect only after the user accepts it; feedback continues the iteration. | S31, S33 |  |
| LLM-6 | should | The LLM may introduce finer-grained supporting declarations (e.g., a structure `Cynder`, a Prop `isCharacter`), which become additional nodes in the mental model. | S32 | Which section these nodes belong in (T8, IC-4). |
| LLM-7 | must | Prompting the AI in natural language is the primary ('more common') way to change the Lean model; each prompt carries the user's A/D/G marking. | S3, S4 |  |

### Lean verification

| ID | Strength | Requirement | Sources | Open point |
|---|---|---|---|---|
| LEAN-1 | must | Proofs are checked by Lean: a goal or derivation counts as proven only if the Lean code containing its proof elaborates with no errors and no `sorry`. | S16, S29 | Whether the axiom footprint must also be checked (IC-1, IC-21). |
| LEAN-2 | could | Lean encoding suggested by the text: an ASSUMPTION is an axiom (a Lean `axiom`), a GOAL's statement is a Lean definition (the example uses `def cynder_not_ ...`), and the LLM generates signatures for assumptions and goals. | S5, S29, S37 | Axioms vs. hypotheses (IC-1); separating statement from proof (IC-24). |

### Non-functional

| ID | Strength | Requirement | Sources | Open point |
|---|---|---|---|---|
| NFR-1 | must | The product is a VS Code extension. | S1 |  |
| NFR-2 | should | Scale to many, many nodes and to big projects: independently scrollable columns, and responsive parsing, rendering and checking. | S11, S43 |  |
| NFR-3 | question-to-answer | Advise whether an LSP (language server) is the right design decision, given a project that may be big, a node markup language that may grow, and separate graph-analysis scripts. | S43 | Lean already provides a language server for `.lean` files (IC-20, T18). |
| NFR-4 | should | Design the node markup language to evolve (a versioned, extensible schema), since it might grow in the future. | S43 |  |

### Process / meta (how I should work)

| ID | Strength | Requirement | Sources | Open point |
|---|---|---|---|---|
| PROC-1 | must | Read the whole idea and understand it. | S45 |  |
| PROC-2 | must | Consolidate the possibly messy, out-of-order idea into de-duplicated points while keeping track that every sentence is accounted for. | S47 |  |
| PROC-3 | must | Identify unspoken constraints and raise those that involve a significant design decision. | S48 |  |
| PROC-4 | must | Sketch a software architecture that would allow the idea to be implemented, including how nodes are represented in code as well as on screen. | S34, S49 |  |
| PROC-5 | must | Give a list of software to install; installing waits for approval. | S50 |  |
| PROC-6 | must | Implement the program in this directory (/home/zhengyew/telelean), but only after the design is approved. | S51 |  |
| PROC-7 | must | Test the basic functionality, say when it is good enough for the user to start using (the user wants to actually use it), and give directions for doing so. | S9, S52 |  |
| PROC-8 | must | From now on, log every user prompt verbatim (including prompts given mid-turn) in a new bundle under `verbatim_prompt_log/` (bundle_1/prompt1.md already exists), together with the assistant's response and any user-requested documents, following the structure of the referenced spectec `verbatim_dialogue_log` example. | S53, S54, S55 | Which bundle holds the response to prompt 1, and how mid-turn prompts are bundled (T20). |
| PROC-9 | could | Look at learnharness (GitHub repo and website) for inspiration, without adopting its goals or (probably) its tech stack. | S44 |  |
| PROC-10 | should | Write the analysis and design rationale for an author with a formal-methods background and interests in linguistics, cognition and HCI: precise logical terminology and explicit attention to pragmatics and interaction design. | S46 |  |

## Appendix C — Implied (unspoken) constraints

Each of these is resolved — or turned into a question for you — in `02_design_decisions.md` (the D-numbers there cite these IC-numbers).

| ID | Significance | Constraint | Derived from |
|---|---|---|---|
| IC-1 | high | Decide how ASSUMPTIONS are encoded in Lean: as global `axiom`s (the user's word) or as hypotheses (section variables, explicit theorem binders, or a bundled structure of assumptions). Whichever is chosen, each theorem's dependency set (its axiom footprint) must be a first-class, machine-checked fact. | S5, S7, S28, SEM-1, SEM-2, SEM-5, LEAN-2 |
| IC-2 | high | The assumption set may be inconsistent (real belief sets often are), and an inconsistent set makes every GOAL provable. Such proofs must not be presented as meaningful. | S5, S28, SEM-1, SEM-5, IC-1 |
| IC-3 | high | Lean certifies the Lean statement, not the user's natural-language statement. Whether a formalization is faithful (the gap between NL and Lean) can only be judged by the user, so reviewing formal statements must be a first-class part of accepting a diff. | S29, S30, S31, S40, LLM-4, UI-11, UI-13 |
| IC-4 | high | Supporting declarations created by the LLM (e.g., `structure Cynder`, Prop `isCharacter`) are neither assumptions, derivations nor goals. S32 says they become nodes, but the panel has only three columns, so where they live and how they count for purity has to be decided. | S11, S32, UI-2, LLM-6, SEM-2 |
| IC-5 | high | Decide whether arrows are claims drawn by the user, dependencies computed from Lean, or both, and fix their direction and meaning. | S15, S43, UI-4, DATA-6, DATA-7, SEM-5 |
| IC-6 | high | Model a node's proof status separately from its kind (ASSUMPTION/DERIVATION/GOAL), and compute it from Lean rather than storing it by hand. | S4, S7, S8, S16, S39, S41, SEM-2, SEM-3, SEM-6, UI-14, LEAN-1 |
| IC-7 | high | Define what submitting the input box does. In the walkthrough, the A/D/G switch creates informal nodes without invoking the LLM, while elsewhere the box is described as the way to prompt the AI. | S3, S4, S10, S18, S19, S21, S23, S27, UI-6, UI-7, UI-8, LLM-7, DATA-5 |
| IC-8 | high | Nodes need a stable identifier, carried in the markup, that is independent of their NL text and their Lean name. | S35, S37, UI-4, UI-9, UI-11, DATA-2, DATA-7 |
| IC-9 | high | Layout and other UI-only state need a home other than the Lean source: positions or order within columns, collapsed state, user-drawn arrows if not kept in the markup, selections, pending diffs, and LLM session ids. | S2, UI-1, UI-3, DATA-1, DATA-6 |
| IC-10 | high | Set hard limits on what the LLM may change by itself. It never silently adds propositional assumptions, changes a node's kind, rewrites the user's NL statements or rationales, or alters the formal statement of an accepted node. Any such change is a flagged proposal that needs explicit acceptance. | S7, S28, SEM-1, SEM-2, SEM-5, DATA-5, LLM-3, LLM-4, LLM-6, UI-7 |
| IC-11 | high | Using 'Claude ... using my current subscription' means driving the user's own locally installed, logged-in Claude Code, through the CLI's headless mode or the Agent SDK (which runs the Claude Code binary), rather than the metered Claude API. That route has specific constraints on authentication and usage. | S9, LLM-1, LLM-2 |
| IC-12 | high | The harness must be an agent loop that can be interrupted and that talks in both directions, not a single completion call. | S9, S30, LLM-3, LLM-4, LLM-5 |
| IC-13 | high | User edits and LLM edits happen at the same time and must be coordinated. | S3, S31, S42, DATA-8, LLM-5 |
| IC-14 | high | How long Lean takes to elaborate, and the resources it uses, shape both the proving loop and the status display. The dependency set (core Lean vs. Mathlib) and the checking mechanism must be chosen deliberately. | S29, LEAN-1, UI-14, NFR-2 |
| IC-15 | high | 'The directory that VSCode is currently in' must be, or be turned into, a Lake project with a defined file layout for nodes. | S2, S38, S51, DATA-1, DATA-3, PROC-6, SEM-4 |
| IC-16 | medium | Handle VS Code windows with no folder or with several workspace folders, nested Lake packages, and dependency sources. | S2, DATA-1, NFR-2 |
| IC-17 | high | Because the user will mostly work in the extension window, the panel must be a full workspace in the editor area, with saved state, theming, accessibility, and its own view of Lean diagnostics. | S11, S40, S42, UI-2, UI-13, UI-14, UI-15 |
| IC-18 | high | Drawing arrows between nodes in three independently scrolled columns rules out a naive single-canvas graph library, and the gestures need deliberate design. | S11, S15, S25, UI-1, UI-3, UI-4, UI-5, UI-9, UI-13, UI-16, NFR-2 |
| IC-19 | high | Plain `/- -/` comments are invisible to Lean itself, and docstrings cannot exist without a declaration. Where the markup is placed and how it is written therefore decide who can read node metadata. | S35, S38, S40, S43, DATA-2, DATA-3, DATA-4, NFR-3, NFR-4 |
| IC-20 | high | The LSP question has to take into account that Lean already runs its own language server on these `.lean` files, and that graph-analysis scripts do not speak LSP. | S43, NFR-3, NFR-4, DATA-7 |
| IC-21 | high | The extension must verify every LLM proposal independently instead of trusting the LLM's report of success. | S7, S29, LEAN-1, SEM-2, SEM-5, LLM-5 |
| IC-22 | high | Moving a node between sections is a semantic operation on Lean code, not just a UI relocation, and Lean's declaration order constrains it. | S16, SEM-1, SEM-2, SEM-3, SEM-4, UI-5, DATA-5, IC-15 |
| IC-23 | medium | In practice nodes and Lean declarations are not one-to-one, so the rules of the mapping must be spelled out. | S32, S35, DATA-1, DATA-8, LLM-6, UI-13 |
| IC-24 | medium | Separate a statement from its proof, as the `def` in the S37 example suggests. This gives every node kind a lifecycle without `sorry`. | S37, S39, LEAN-2, SEM-3, SEM-6 |
| IC-25 | medium | The Cynder/Spyro walkthrough is the de facto acceptance scenario. It should be automated with a mock LLM, plus a manual smoke test against real Claude. | S17, S52, PROC-7, UI-7, UI-8, UI-9, UI-10, UI-11, UI-12, LLM-3, LLM-4 |
| IC-26 | medium | Diffs must be computed and shown per node as well as per file, applied atomically, and be reversible. | S31, S33, UI-11, UI-12, LLM-5 |
| IC-27 | medium | The agent must be sandboxed and briefed: its tools and scope restricted, and a fixed brief on the telelean conventions provided. | S9, LLM-1, LLM-4, LLM-5, IC-10, IC-11, IC-13, IC-21 |
| IC-28 | medium | The user's answers to the LLM's questions, and their feedback, are pragmatic modeling decisions (shared common ground). They should be saved and reused. | S30, S33, LLM-3, LLM-5 |
| IC-29 | medium | Record who wrote each piece of text. The user's NL statements are the specification and must not be overwritten, and descriptions written by the LLM must be marked as such. | S6, S32, DATA-4, DATA-5, LLM-6 |
| IC-30 | medium | Lean's logic is classical, monotonic and crisp, while the beliefs in a mental model are often defeasible, vague or graded. How such generalizations are encoded is a modeling decision the system must make visible. | S5, S20, S24, SEM-1, LLM-3 |
| IC-31 | medium | Define what each kind of selection means for the button, and which other actions the button may need. | S8, S25, S28, UI-9, UI-10, SEM-5 |
| IC-32 | medium | Context and token budget: as the model grows, the LLM must reuse existing vocabulary while receiving only the relevant part of the project. | S9, S43, LLM-2, LLM-4, LLM-6, NFR-2, IC-11 |
| IC-33 | medium | The verbatim prompt log records the development conversation and is kept by the assistant; it is not a runtime feature of the extension. The main session must write it on every turn, including prompts that arrive mid-turn. | S53, S54, PROC-8 |
| IC-34 | low | When Claude is used, the content of the user's mental model and Lean files leaves the machine. | S9, LLM-2, DATA-1 |

## Appendix D — Tensions between sentences, and how the design resolves them

1. **S2 asks for an 'interactive map ... (at least clicking and dragging components)', which suggests free 2-D placement, but S11-S14 put nodes in three vertical lists by kind. It is unclear what dragging does and what the 'components' are.** (S2, S11, S12, S13, S14)  
   → Treat the columns as the layout. Dragging within a column reorders (the order is saved per IC-9); dragging across columns requests a kind change (S16, gated per IC-22); dragging from a node handle draws an arrow (S15). 'Components' means nodes. A free-form graph view for analysis can be added later.
2. **Who draws the arrows? 'The extension must be able to draw arrows' (S15) can mean edges the user draws or edges the extension computes from Lean dependencies; S25-S29 suggest dependencies are established by the LLM's proof.** (S15, S25, S28, S29)  
   → Support both as distinct edge types, intended and actual (IC-5), and ask the user which one is primary.
3. **S15 allows arrows only 'from any node in one section to a node in another section', but S8 says goals are reached via derivations (chains of derivations and lemmas), and vocabulary nodes (S32) relate to nodes in the same column. Dependencies computed from Lean will include edges within a column.** (S15, S8, S32)  
   → Allow edges within a column (drawn as arcs inside the column, or shown on hover), and ask whether the restriction was intended.
4. **S3/S4 describe the text box as the way to prompt the AI, with the A/D/G switch, but S18-S24 create nodes from it with no LLM involved, and S27 invokes the LLM only through the button.** (S3, S4, S10, S18, S20, S22, S24, S27)  
   → The text box plus switch creates informal nodes without the LLM. The LLM runs only on explicit actions (the button on a selection, 'formalize' on a node) and through a conversation strip for answers and feedback. Offer an opt-in setting to formalize automatically on create.
5. **S7 defines a DERIVATION as purely derivable from the assumptions, but the switch (S4) and moves (S16) let the user create a node in DERIVATIONS, or move one there, before any proof exists.** (S7, S4, S16)  
   → Keep the kind assigned by the user but compute the status (IC-6). An unproved DERIVATION is shown as 'claimed' and triggers or offers an LLM proof attempt; it becomes a full derivation only once verified.
6. **When the button's proof succeeds (S28-S29) and is accepted (S33), does the goal stay in GOALS marked as proved, or move to DERIVATIONS? S8 defines a goal as not yet reached, and S16 says a goal moves to derivations 'once it's proven', but not whether this happens automatically.** (S8, S16, S28, S29, S33)  
   → When a verified proof is accepted, move the node to DERIVATIONS (or offer a one-click move) and keep a 'was a goal' badge as history. Never move a node without verification.
7. **S5 calls assumptions axioms, which are global in Lean, but S25/S28 assert that a *selected subset* suffices. With global axioms, a proof may silently use assumptions that were not selected.** (S5, S25, S28)  
   → Check the axiom footprint against the selection (IC-1, IC-21), or encode assumptions as hypotheses in the signature of the goal theorem.
8. **S32 has the LLM create vocabulary nodes (structure `Cynder`, Prop `isCharacter`), but the panel has exactly three columns, one per kind (S11). S7 forbids new assumptions while S29 requires signatures, and vocabulary declared with `axiom` counts as new axioms in Lean.** (S32, S11, S7, S29)  
   → Introduce a vocabulary/definition sub-kind, shown in the ASSUMPTIONS column or as chips or a collapsible strip. Prefer encodings that add no axioms (`structure`, `inductive`, `opaque`), and ask the user (IC-4).
9. **S6 says assumptions should be annotated with a rationale, but the fourth assumption in the walkthrough (S24) has none.** (S6, S24)  
   → Treat the rationale as strongly encouraged but optional: allow creating an assumption without one, show a 'no rationale' indicator, and ask for it later. Always ask for it on assumptions the LLM suggests.
10. **The markup example (S37) has only `natural_name` and `type`, but other sentences call for a rationale (S6), an NL description that may be a docstring (S40), arrows (S15), a link to the Lean code (S35), and nodes without code (S38). A docstring cannot stand alone without a declaration, and the NL text would end up in two places.** (S37, S6, S15, S35, S38, S40)  
   → Define markup schema v1 with `id`, `type`, `natural_name` (the user's statement verbatim), `rationale` (for assumptions), an optional `description`, optional intended edges, a `decl` link, and provenance. Keep the markup as the single source of NL text, and optionally copy it into a generated docstring for formalized nodes.
11. **S39 rejects `sorry` for nodes without code because it implies an uninhabited representation, which suggests `sorry` would be appropriate once a node is formalized but unproven. Yet S37 represents a GOAL with a `def`, a statement-as-definition that needs no `sorry` at all.** (S39, S37, S8, S29)  
   → Separate statement from proof (IC-24): informal means comment only; formalized means `def stmt : Prop`; proved means a theorem inhabiting it. Allow `sorry` only temporarily, and never count it as proved.
12. **S35 says each node corresponds to something in a Lean file, but the map also has state with no natural place in Lean (the layout from S2, user-drawn arrows from S15), and Lean files will contain declarations that are not nodes (direct edits, S42).** (S35, S2, S15, S42)  
   → Every node gets a markup block, but not every Lean declaration is a node. Store the layout in a sidecar file keyed by node id; store intended edges in the markup or the sidecar (decide per IC-9); show unmarked declarations as 'untracked'.
13. **Click and drag each do two jobs: click selects (S25) and expands (S40); drag moves nodes (S2, S16) and draws arrows (S15).** (S2, S15, S16, S25, S40)  
   → Give each action its own affordance: click or a checkbox to select (with a modifier for multi-select), a chevron or double-click to expand, drag the body to move, drag from a port to draw an arrow. Provide keyboard equivalents for all of them.
14. **S30 has the LLM ask questions 'along the way', but the walkthrough reads as a single button-then-diff flow (S27, S31). The only input surface is the text box with the A/D/G switch (S4, S10), and the kind marking means nothing for an answer.** (S30, S27, S31, S4, S10)  
   → Add a conversation/question strip with multiple-choice cards and a free-text 'Other' option, backed by AskUserQuestion or a custom ask_user tool. While a question is pending, switch the input box to 'answer' mode and disable the A/D/G switch.
15. **S41 marks only whether a node has a Lean representation (the blue aura), but S7, S8 and S16 depend on whether it is proved. A formalized but unproved goal and a proved derivation would look the same.** (S41, S7, S8, S16)  
   → Keep the blue aura for 'has a Lean representation' as requested, and add separate status badges or icons: proved, unproved, broken, claimed.
16. **The walkthrough selects only assumptions plus a goal (S25; S28: 'the assumptions must be enough'), but S8 says goals are reached via ASSUMPTIONS and DERIVATIONS. Can derivations be selected as premises?** (S25, S28, S8)  
   → Allow derivations in the selection as lemmas. The sufficiency check then becomes: the footprint must lie within the selected assumptions together with the footprints of the selected derivations.
17. **S9 asks for a pluggable LLM ('slot in an LLM'), but the required Claude route through the subscription means driving Claude Code, an agent runtime with its own tools, while other providers expose plain completion APIs. Anthropic's policy also bars third-party products from offering claude.ai login.** (S9)  
   → Define the harness interface at the agent level: a task goes in; events, questions and a diff come out. Expose the extension's tools via MCP so other agents can reuse them. Ship a Claude Code adapter for personal subscription use, and keep an API-key adapter path for anything distributed.
18. **S43 asks whether an LSP is right, but the node markup lives inside `.lean` files (S35) that Lean's own language server already serves, and the direct editing in S42 happens in those same files.** (S43, S35, S42)  
   → Recommend a headless core library plus a CLI (graph export for scripts), used by the extension. Defer a markup LSP, or go Lean-native with attributes, commands and Lean server RPC (IC-19, IC-20).
19. **'The directory that VSCode is currently in' and 'the current directory' (S2, S35) are the user's model workspace, whereas 'this directory' in S51 is where the extension's code is implemented (/home/zhengyew/telelean).** (S2, S35, S51)  
   → Keep the extension source in /home/zhengyew/telelean. The model workspace is whatever folder VS Code has open when the extension runs. Ship a sample model project (the Spyro walkthrough) for testing and for the usage directions.
20. **S54 says to log every prompt 'in a new bundle', yet S53 notes that bundle_1 already holds prompt1.md. Where do the response to prompt 1 and its requested documents go, and how are mid-turn prompts bundled?** (S53, S54, S55)  
   → Follow the convention already used in bundle_2 (promptN.md, responseN.md, and extra documents such as responseN_modelinfo.md). The response to prompt 1 and its documents go in bundle_1, and every later prompt, including mid-turn ones, gets its own bundle. Check this against the referenced spectec example.
21. **The user is expected to 'mostly work in the extension window' (S42), yet expanding a node to see its Lean definition (S40) and switching to the diff of the Lean files (S31) both need Lean views. It is unclear whether these appear inside the panel or as regular VS Code editors.** (S42, S40, S31)  
   → Show Lean snippets inline in the panel (read-only, syntax-highlighted) when a node is expanded. For full-file views, open VS Code's native diff editor or editor in a side split, launched from the panel.
