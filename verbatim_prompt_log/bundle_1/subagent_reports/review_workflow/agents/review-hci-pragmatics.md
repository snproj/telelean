# review-hci-pragmatics

## Summary
The interaction design is thoughtful, and its core commitments suit this user. The user's words are an immutable specification (no LLM on add, G5 byte-identity). The "These suffice" button is read strictly, which matches the relevance implicature of picking premises. Gaps become visible ghost assumptions that the user adopts only with their own rationale. Declared (dashed) and verified (solid) edges are kept apart. DECISION records serve as explicit common ground. Nothing in my lens is a blocker: every explicit UI requirement (S4, S11, S15, S16, S26, S30, S31, S33, S40, S41) is met to the letter. The weak point is the shape of the workflow. The design treats the user's work as one forward pipeline: add, select, formalise, sign off, prove, accept. The user's own sketches show iterative revision instead. They pose queries that get yes/no answers (`self_evident ?- no`, `from [h1, h2] ?- no`). They formalise gradually, through mixed NL/formal states (`cynder "is a bad character to include in the" game`). They supersede earlier versions (`h1 is actually … superseding h1`; Ethics → Ethics₂ after the over-generation in smoking.lean). None of this has a sanctioned path in the design, and parts of it trip the gate. I verified on Lean 4.35.0 that the user's own record-style refinement makes h1's belief disappear from the axiom footprint. The design would therefore flag it as definitional smuggling or label it "self-evident", and h1's rationale would have no home.

Cognitive load: the concepts suit a formal-methods user, but the procedural and visual load is heavy for daily use. By my count the two-phase run (D-18) roughly doubles the user actions in the 4-sentence walkthrough, from about 13 to about 26. Most of the extra actions are low-risk ✓/✗ sign-offs, which invite rubber-stamping. Dashed lines change meaning between modes. The prompt box has two hidden modes (Instruct and Reply), and Reply blocks adding a node mid-run. One slightly mis-aimed drag turns a cosmetic reorder into a Lean rewrite that cascades to every dependent. Pragmatics: D-19 names enthymemes, genericity, modality, scope, definites and granularity. It misses phenomena the walkthrough itself contains. The user's own two phrasings differ in negation strength ("bad" in cynder.lean, "not good" in the prompt). The counterfactual "would" is dropped. "Good" and "dark" are evaluative or gradable. "Addition" and "new" trigger a presupposition and an indexical. Ratings form a scale. D-19 also collapses quantificational force and modal flavour into a single rule/norm/tendency choice. The protocol also lets Claude's reading become "common ground" without the user really agreeing to it: the recommended option is pre-selected, Claude decides which answers persist, choices beyond the question budget are never surfaced, and agent-worded DECISIONs carry `origin: user`.

Highest-value changes:
- Add refine/supersede and anti-goals.
- Record every argument attempt with its verdict, and allow 0-premise "Self-evident?" queries.
- Replace the always-blocking mid-run sign-off with pauses that trigger only on risk, plus an end review that judges meaning before proof status is shown.
- Add word-level alignment and a deterministic gloss in v1, plus a partial-formalisation level using «user phrase» predicates (verified to work).
- Bind sign-offs to both the NL and the Lean hashes.
- Mark provenance on every piece of agent-worded text.
- Keep assertions (A/D/G) apart from directives (Instruct/Reply).
- Make reclassification deliberate, previewed and undoable.

Two smaller side-findings were also verified: (1) ARIA `option` children are presentational, so the card buttons are hidden from assistive tech; (2) VS Code re-dispatches every webview keydown to the workbench, so r3's Alt+1/2/3 shortcut would also switch editor tabs.

## Issues
- **HCI-1** [major] doc all § 02 D-4, D-17, D-27 (G5, G6); 03 §3.2 fields, §3.4 TL106, §8.5 G5; 01 §3
  - problem: The user's sketches show revision as their main way of working. In cynder.lean, h1 "cynder is a character that explores a dark past" leads to `from [h1, h2] ?- no` (l.28), then `cynder instance_of Character { past: "dark" } superseding h1` (l.75-77), then `h1 is actually …` (l.100-103), then a bridging rule over fields (l.175). In smoking.lean, a principle's unwanted consequence (§6 `also_condemns_adult_smoking`) leads to a repaired successor (§7 `Ethics₂`). The design has no refine/supersede relation and no way to say "this should NOT follow". Its rules block or punish both moves. Kind changes are only A↔D↔G drags (D-17). G5 allows only G→D reclassification and requires stable decl names. TL106 warns "ASSUMPTION formalised as a non-axiom". D-4 treats a belief written into a def body as definitional smuggling. DEFINITION nodes have no `rationale` field. So an Instruct like "h1 is actually …" cannot pass the gate. Done by hand, it gets flagged, loses h1's "familiar with gaming lore", and makes h1 look self-evident. Doc 01 §3 cites cynder.lean only for the bridging premise and misses these refinement steps. S32's "more fine-grained representation" works only at first formalisation, not for later re-refinement.
  - evidence: Verified on Lean 4.35.0 with toolchain pin v4.35.0 and no Mathlib. Files are in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/review/hci-pragmatics/refine/.
- V1_before: the goal's footprint includes cynder_dark_past.
- V2a_record_def (the user's `cynder : Character := {past := "dark"}`): the goal statement and proof text are byte-identical and still compile. But the footprint loses cynder_dark_past, Character, cynder and HasDarkPast, and Lean prints "'cynder_dark_past' does not depend on any axioms". G6 would therefore flag h1 as "proved from zero assumptions".
- V2b_field_axiom: compiles, and the footprint shows cynder_past in place of cynder_dark_past, so a `refines:` link can map it back to h1.
Sketch quotes: /home/zhengyew/telelean_scripts/cynder.lean and smoking.lean.
  - fix: (1) Add markup fields `refines: <id>` / `supersedes: <id>` and a "Refine…" card action. The action can also be typed as `h1 is actually …`. It starts a run scoped to that node.
(2) Default pattern (V2b below): the refined belief stays an axiom, e.g. `cynder_past : cynder.past = "dark"`, and inherits h1's rationale. h1 stays on the board, re-proved as a DERIVATION from the refinement and shown collapsed under it as "h1 ⇐ refined by …". Dependents compile unchanged.
(3) If the user prefers record instances (V2a below), make that an explicit DECISION. The content-bearing DEFINITION then gets `realises: h1` and a required rationale. The assumption-set view should show "uses h1 (definitionally, via cynder)" instead of a smuggling or "self-evident" flag.
(4) Treat a Refine action as the user's authorisation for G5 to accept that node's A→D change and decl/statement change, followed by a fresh sign-off.
(5) Add an anti-goal flag ("should not follow"). If an anti-goal becomes provable, report over-generation and list its axiom footprint as the candidate premises to revise. The revision is a successor linked by `supersedes:`.
- **HCI-2** [major] doc 02 § D-18 (also 03 §7 'Statement sign-off view', §8.4, §14 'Sign-off fatigue')
  - problem: D-18 inserts a blocking statement sign-off mid-run and calls it "still 'propose a diff, accept or feedback'… The first diff just contains statements only". To the user it is a second, synchronous review that the spec does not have. S31/S33 describe a single diff "when the LLM is done". By my count, the walkthrough grows from about 13 user actions to about 26:
- 4 adds, 4 selects and the button press, about 3 answers, 1 accept (the spec's flow);
- plus about 2 actions to adopt the bridge premise;
- plus 11 sign-offs (A1–A3, the bridge, G, and about 6 vocabulary DEFINITION nodes), because §14 asks for sign-off on "user nodes, new DEFINITIONs and proposed assumptions".
Most of the added load is per-item ✓/✗ on low-risk signature items, which is a classic setup for rubber-stamping (r5 lists sign-off fatigue as a risk). The checkpoint also needs the user present partway through the run. Reviewing statements in the abstract cannot catch over-generation either, and that is the user's own test in smoking.lean §6. Most importantly, the anti-weakening guarantee comes from the comparator freeze, not from the timing of the human review. An automatic freeze at the end of phase A already blocks post-hoc weakening. What a mid-run human review adds is fixing errors before proof effort is spent, and seeing statements before a green ✓ biases judgement.
  - evidence: The action count is derived from 03 §10 (the E2E path), §14 and the D-19 budget. r5's Risks section names "sign-off fatigue". r1 [documented]: in-process SDK MCP tools are exempt from the idle timeout and MCP_TOOL_TIMEOUT is about 28 h, so long waits are fine, but a reload kills the held call. The automation-bias/anchoring rationale is my own inference from HCI literature and is not in the reports.
  - fix: Present D-18 with three honest options:
(a) as designed;
(b) auto-freeze at the end of phase A, then a single end-of-run review as in the spec. The review shows meaning first: each new or changed statement is judged with its proof status hidden, which counters automation bias. Proof results and consequences are revealed afterwards.
(c) hybrid (recommended): pause before proving only when something is risky. Risky means a content-bearing or closed-world definition, an existence commitment, a back-translation mismatch, or a statement never signed off before. Otherwise review at the end.
In every option:
- Auto-approve pure signature (`axiom T : Type`, uninterpreted predicates), shown as "auto" and revocable.
- Group vocabulary into one review item, and sort items by risk.
- Do the review in place on the cards rather than in the bottom thread strip: the card flips to "You said / Lean says", unrelated cards dim, and a stepper shows progress (e.g. "3 of 7").
- Persist pending checkpoints so they survive closing the panel or reloading the window.
- **HCI-3** [major] doc 02 § D-19 'When to ask' (cf. 01 IC-30; r5 'Clarifying questions')
  - problem: D-19 lists: bridging premises; generic vs universal; modality, quantifier scope, definite descriptions; granularity; open/closed world. It drops items that r5 recommended ("vague or gradable predicates… tense, defeasibility", presupposition) and that IC-30 raises. It also misses phenomena present in the acceptance example itself:
(i) Negation strength: contradictory `¬GoodAddition` vs contrary "bad". The user's own phrasings differ: cynder.lean l.7 says "cynder is a bad character to include in the game", while S18 says "would not be a good addition". The design's example silently picks the weaker reading (`theorem cynder_not_good : ¬ GoodAddition …`).
(ii) The counterfactual "would", which that encoding drops.
(iii) Evaluative, gradable "good" (good by whose standard?) and vague "dark past".
(iv) Presupposition triggers beyond definites: "addition" presupposes Cynder is not already in the game; "new" is indexical and time-relative.
(v) A scalar: ratings form an ordered scale (G < PG < PG-13), so does "PG games cannot…" hold a fortiori for G?
(vi) Word sense: "explores a dark past" (cynder.lean l.15) vs "has a dark past" (S20).
The card "a rule? a norm? a tendency?" also squeezes two axes into one choice: quantificational force (universal vs generic with exceptions) and modal flavour (deontic vs circumstantial). These need different bridge premises; under the norm reading, the game is merely not permitted to include Cynder.
  - evidence: Compared doc 02 D-19 with r5 lines 111-113. Vague/gradable, tense, defeasibility and presupposition appear in r5 but not in D-19. User phrasings are from /home/zhengyew/telelean_scripts/cynder.lean l.7 and l.15 vs prompt1.md S18/S20. The goal encoding is from 03 §3.3. The degree-plus-threshold pattern is from smoking.lean l.42-50.
  - fix: - Replace `ask_user.kind` with a `phenomenon` tag shown on the card, using terms this user will recognise: enthymeme, genericity, modal flavour/force, negation (contrary/contradictory), presupposition, scalar item, vagueness/gradability, evaluative standard, indexical, word sense, tense/aspect, granularity, closed world.
- Store each DECISION by dimension so it applies across nodes, e.g. "'cannot' in rating rules = deontic".
- Always offer "Leave it open (keep it uninterpreted)" and record that choice as a deliberate DECISION. Uninterpreted vocabulary is exactly underspecification.
- For gradable terms, offer the user's own smoking.lean pattern: a degree plus a threshold (`highChance ≤ risk a o`), with the threshold as a node that carries a rationale.
- For "tendency" readings, make defeasibility visible within monotonic Lean. Add an `¬ Abnormal g c` guard plus an explicit assumption "no exception applies to Cynder in the new Spyro game", which the user endorses with a why.
- Record an asserted-on date on user nodes so "new", "the game" and "I" can be resolved later.
- Add the negation-strength and "would" questions to the §10 walkthrough test.
- **HCI-4** [major] doc all § 02 D-19 'Question cards' / 'Answers are recorded'; 03 §3.3 DECISION example, §8.3 ask_user / finish
  - problem: The question and decision protocol lets Claude's reading become "common ground" without the user actually grounding it.
(a) r5 specifies "a pre-selected recommended option", and D-19 lists "a recommended choice". Pre-selection is a default nudge: pressing Enter accepts the LLM's reading, which defeats S30's purpose of learning the user's pragmatics.
(b) Whether an answer becomes a lasting DECISION is set by the agent (`persist: decision`), not chosen by the user.
(c) Beyond the 3-per-batch, 2-batch budget, the agent resolves things itself. `finish({decisions?})` exists, but no UI shows these unasked choices, and doc 02 dropped r5's "provisional decision shown in the proposal".
(d) The DECISION example says `origin: user`, but its sentence was written by the agent. One field conflates who decided with who worded it.
(e) There is no scope (whole model vs certain nodes), and revocation semantics are unspecified (r5 says "dependents become stale").
(f) DECISIONs live only in a drawer, away from the sentences whose reading they fix (split attention).
  - evidence: r5 line 117: "a pre-selected recommended option". r5 line 115: "Assume, and record as a provisional decision shown in the proposal" (absent from doc 02). 03 §3.3 DECISION block: `origin: user` on agent-composed text. 03 §8.3 ask_user: `persist: decision`.
  - fix: - Do not pre-select. Show "Claude's guess" only after the user answers or behind a reveal. "Decide for me" stays the explicit way to delegate.
- At answer time the user chooses the scope: this run / these nodes / whole model.
- List every interpretive choice the agent made without asking in the report card under "Assumed without asking", each with "Ask me instead" and "Change". Show these as ungrounded (a count badge on the drawer) until the user acknowledges them.
- Markup: `decided_by: user|delegated|agent-default`, `worded_by: agent|user`, `scope: model|nodes`, plus `affects:`.
- Revoking a DECISION marks the affected formalisations and sign-offs stale and offers re-formalisation.
- Put a ⚑n chip on affected cards, with the reading spelled out on hover.
- Make the budget user-adjustable (ask more / ask less), shrinking as DECISIONs accumulate, and allow conditional follow-up questions.
- **HCI-5** [major] doc all § 02 D-5, D-6, D-13, D-27 G6; 03 §2.1 `premises`, §7 SelectionTray, §8.6, §10, §11
  - problem: The user's sketches treat the sequent as a query whose yes/no answer is worth keeping: `self_evident ?- no`, then `from [h1, h2] ?- no` (cynder.lean l.11, l.25-28). The design works against this in four ways.
(a) r3's tray enables the button "only with ≥1 premise", r5 allows ≥0, and doc 03 does not settle it. The ≥1 rule blocks the user's first move, "is it self-evident?". G6 then reframes a "yes" as a vacuity alarm ("your `self_evident ?- yes`").
(b) Each node has one joint `premises` list ("one argument"). A second "These suffice" press for the same goal must either overwrite the earlier assertion or union it into a joint claim the user never made. Verdicts such as "insufficient" survive only in uncommitted session logs.
(c) Insufficiency is listed under "Failure modes" (§8.6), yet 01 §3 shows it is the expected first answer in the acceptance walkthrough. The only kernel-checked explanation, the plain-English countermodel, is deferred to v1.5. So the first-run explanation is the LLM's unverified prose.
(d) The hidden-premise path (question → ghost → own rationale → "add X to the selection?" → re-freeze) is spread across D-5, D-6, §8.3 and §10 and never specified as one user-facing flow. When several derivations are selected, there is also no way to pick which one is the target.
  - evidence: r3 line 262: "≥1 premise and exactly 1 goal". r5 line 66: "≥0 ASSUMPTIONs". 03 §2.1: `premises: string[]; // declared joint support (one argument)`. 02 D-27 G6 wording; 03 §8.6 heading and §11 roadmap. r5 verified the Ramsey certificates on the Cynder example.
  - fix: - Allow 0 premises and label that case "Self-evident?".
- Store each press as an argument record {premises, target, verdict: proved | insufficient | inconsistent, countermodel?, date}. Show the records as "Attempts" in the expanded card, and never overwrite or union them.
- Give the tray an explicit ⊢ target slot.
- Word results as answers, e.g. "No: these don't suffice. Here is a situation where all of them hold and the goal fails: …".
- Move the Ramsey countermodel certificate into v1; it is already prototyped and verified on Cynder. Otherwise label LLM gap explanations "unverified".
- Specify one hidden-premise card: the candidate premise (editable into the user's own words), "Do you hold this? Why?", and a single submit. Submitting creates the node, adds it to this argument without a second confirmation, and logs the original argument as "insufficient; needed X".
- Optionally accept typed queries in the prompt box that mirror the sketches (`from [h1, h2] ?- g`, `self_evident ?- g`), using user-chosen short handles.
- **HCI-6** [major] doc 03 § §7 'Statement sign-off view'; §8.3 propose_formalization; §4 node states; §11 (deterministic skeleton deferred to v1.5)
  - problem: Sign-off asks the user to compare whole sentences: their own against an LLM back-translation. People are poor at noticing small meaning shifts between paraphrases (semantic illusions, e.g. the Moses illusion). LLM paraphrases are also pragmatically enriched: a back-translator may render `¬ GoodAddition` as "would be a bad addition", hiding the very weakening the check should expose. The literal gloss that "cannot hallucinate" (r5) is deferred to v1.5. Nothing shows which of the user's words became which symbol, so dropped content stays invisible; in the walkthrough, "would" maps to nothing. The node states in 03 §4 are binary (informal vs formalised). The user's sketches pass through intermediate levels: entities extracted while the predicate is still their own words (`cynder "is a bad character to include in the" game`, cynder.lean l.121), then records with attributes, then rules over fields. S30's "level of detail" is exactly this ladder, and the design does not represent it.
  - evidence: Verified on Lean 4.35.0 with V3_nl_predicate.lean in the scratch dir: `axiom «is a bad character to include in the» : Character → Game → Prop` elaborates, and `#check` prints `«is a bad character to include in the» cynder game : Prop`. r5 describes the deterministic Expr→English skeleton as one that "cannot hallucinate"; 03 §11 puts it in v1.5. The Moses-illusion reference (Erickson & Mattson 1981) is my own and not in the reports.
  - fix: (1) Extend `propose_formalization` nodes[] with `alignment: [{span, decl}]`; the extension checks that each span occurs verbatim in natural_name. Render the user's sentence with aligned spans underlined (hover shows the symbol and its type), and highlight unaligned content words as "not represented: 'would'". Do this on cards and in sign-off; the Vocabulary group can then stay collapsed.
(2) Ship a minimal deterministic gloss in v1: quantifiers, connectives and negation in fixed English, with symbols named by their aligned spans. Make it the primary "Lean says", and keep the LLM back-translation as a secondary, independent check.
(3) Add a partial-formalisation level: entities typed, predicates uninterpreted and named with the user's own phrase as «guillemet» identifiers. Show a detail level per node, with "refine one level" linked to HCI-1.
- **HCI-7** [major] doc 03 § §14 'Sign-off fatigue … hash-bound'; §2.1 DerivedStatus 'signoff-stale'; 02 D-15 badge
  - problem: A faithfulness sign-off judges how two texts correspond: the user's words and the Lean statement. The only definition of the hash is r5's "formal_ok: <hash of the elaborated statement>". So if the user rewords a node, the "★ signed off" badge stays, even though the correspondence it certified may no longer hold. The user does reword between sessions:
- "explores a dark past" vs "has a dark past";
- "bad character to include" vs "would not be a good addition";
- "the game is PG" vs "The new Spyro game is PG".
G5 rightly freezes the agent out of natural_name. But the user's own rewordings keep no history, and neither do the DECISIONs and definitions that fixed the reading.
  - evidence: r5 line 152: "Per-node sign-off stored as formal_ok: <hash of the elaborated statement, toolchain-tagged>". Docs 02 and 03 never say the NL text is hashed, so this is plausible but not confirmed. The rewordings come from cynder.lean l.7, l.15, l.17 vs prompt1.md S18, S20, S22.
  - fix: Bind each sign-off to all of:
- hash(natural_name ‖ body);
- hash(elaborated statement);
- hashes of the DEFINITION decls on the statement path;
- the ids of the DECISIONs in force.
If any of these changes, mark the sign-off stale and say which side changed, e.g. "you reworded this since sign-off: 'explores' → 'has'". Keep a per-node wording history (text plus date) in a sidecar or the markup body, viewable in the expanded card. Let the user reword freely, with every version kept.
- **HCI-8** [major] doc 03 § §7 'Node card'; §3.3 examples; 02 D-10; 01 IC-29
  - problem: IC-29 requires that LLM-written descriptions "must be marked as such", yet the card spec has no provenance channel (checkbox, kind marker, "your sentence (wraps)", "because: …", chips). In r3's prototype screenshots, agent glosses look exactly like the user's sentences ("Characters and games are things we can talk about", "'has a dark past' is a property of characters"). The prototype's mock data even gives S24 a rationale the user never gave ("because: common sense about ratings"), and gives the bridge premise an agent-written "because: definition of 'addition'". That is a cautionary example of how easily invented words blend in. The doc's own DEFINITION example `natural_name: Characters that can appear in games` (for `lean: Character, cynder`) adds content ("can appear in games") that is not in `axiom Character : Type`, and it hides Cynder's existence commitment inside a node named after the type. `origin: user|agent` also cannot express "agent-worded, user-endorsed", which is the normal case for ghost premises and DECISIONs.
  - evidence: Viewed the r3 screenshots light_diff.png, hc_diff.png and dark_base.png under bundle_1/subagent_reports/research_workflow/artifacts/r3-ui-graph/shots/. prompt1.md S24 has no rationale. The DEFINITION example is in 03 §3.3. r5 recommended "provenance badges on every field and claim", but this did not reach the card spec.
  - fix: - Add a typographic provenance cue: the user's verbatim text plain; agent wording italic with a "Claude's wording" marker; never an agent-written `because:`.
- Add a "Say it in my words" action that turns agent wording into the user's own.
- Track provenance per field: `natural_name.by`, `endorsed_by`, `worded_by`.
- Generate vocabulary glosses deterministically from the alignment in HCI-6, or keep them to the bare term.
- Give each existence commitment its own chip or node ("assumes Cynder exists"). This makes presupposition accommodation visible.
- Add a webview test asserting that agent text never renders in user styling.
- **HCI-9** [major] doc 02 § D-17 Gestures (also 03 §7 'Gestures'; D-11)
  - problem: (a) Dragging a card within a column only changes layout.json. Dragging the same card into the next column, 56 px away, immediately rewrites Lean. A→D turns `axiom` into `theorem … := by sorry`, so every dependent becomes sorry-dependent ("conditional"). D→A discards a proof. There is no impact preview and no undo inside the board. Ctrl+Z inside a webview is caught by VS Code's webview shell and routed to the webview, not to the Lean file's undo stack.
(b) A click toggles selection while a double-click opens the source, so the first click of every double-click flips the selection. Click-to-select also makes reading, the main NL-first activity, prone to accidental selection.
(c) D-17 resolves the conflict between S25 ("click on the goal" to select) and S40 ("click on the node and expand it") as an unstarred default, although r3 had listed it as a decision for the user.
  - evidence: 02 D-11 and D-17 (A→D produces `sorry`). Verified in VS Code 1.140's webview pre/index.html that undo/redo keydowns are preventDefault-ed and forwarded (`isUndoRedo(e) … e.preventDefault()`). That the workbench then routes Undo to the webview DOM (execCommand('undo')) rather than the Lean file is my inference from the bundle. r3's 'Design decisions for user' lists click semantics.
  - fix: - Make reclassification deliberate. Cross-column drops go only onto labelled zones that appear after a short dwell, or onto the column header. Each zone states the impact computed from the graph, e.g. "Make Derivation: claimed until proved; 7 dependent results become conditional". Dropping on another column's plain list area cancels.
- Also offer "Move to ▸" in the context menu.
- After every semantic edit, show an in-board toast ("Moved to Derivations · Undo") that reverts through EditService.
- On D→A, keep the old proof in the node's history so it can be restored.
- Make click semantics a starred (★) decision. Suggested scheme: click = focus/inspect (highlights the support chain); checkbox, Space or Ctrl+click = add to the tray; chevron or Enter = expand; no double-click action (use an "Open in editor" button or Ctrl+Enter).
- **HCI-10** [major] doc 02 § D-16 (also 01 Appendix D #14; 03 §7 PromptBox)
  - problem: The four-position switch puts two different speech acts on one control. Assumption, Derivation and Goal are assertive or optative contributions to the model, matching the three marks in S4. Instruct is a directive to Claude that starts a run and uses quota. This invites mode errors: an assumption typed while the switch is on Instruct goes to Claude, and an instruction typed in Assumption mode becomes a junk node. It also suggests that Instruct is a fourth node kind. While a question is pending, the box turns into "Reply" and the A/D/G switch is disabled (01 App. D #14). So during a run the user cannot add a premise in their own words, which is the natural response to "do you also believe X?". Their contribution has to pass through agent-mediated answer text instead.
  - evidence: 02 D-16 text. 01 Appendix D #14: "switch the input box to 'answer' mode and disable the A/D/G switch". prompt1.md S4 lists exactly three marks.
  - fix: - Keep the prompt box to exactly A|D|G, as S4 specifies, and keep it usable during runs (D-33 already merges real-workspace edits).
- Move Instruct and feedback into the agent thread's own composer ("Ask Claude…").
- Answer each question inside its own card, with its own text field, so the main box never changes mode.
- Label the submit button by its effect: "Add assumption" or "Send to Claude".
- **HCI-11** [minor] doc 03 § §7 'Proposal overlay', 'Node card', 'EdgeEngine'; 02 D-13, D-15
  - problem: Visual channels are overloaded, and some change meaning by mode. Dashing means four different things: declared support (epistemic), added (diff), removed (diff card border) and ghost assumption. §7 says line pattern encodes epistemic status only "outside diff mode". So during proposal review, exactly when status matters, an added verified dependency is drawn long-dashed like a declared claim. That breaks "never colour alone" for edges.
The card face can carry about 10 status signals (λ, ✓, ✓✓, ⚠, ✗, stale, ★, no-rationale, existence-commitment, unsigned, signoff-stale, claimed, no-consistency-certificate). The screenshots show a "no Lean yet" chip on every informal card, which is noise. As the model matures, most cards glow blue, and an aura stands out only when it marks the minority. Full-sentence titles wrap to 2–3 lines and are truncated in tray chips; learnharness found full-sentence labels unworkable on real data.
  - evidence: 03 §7 'Line styles' vs the proposal-overlay table. r7's learnharness finding (vision.md, 2026-09-08): "full-sentence canvas labels proved unworkable". r3 screenshots dark_base.png and light_diff.png.
  - fix: - Reserve line pattern for epistemic status in every mode. Show diff status with colour plus a +/−/~ glyph plus a halo.
- Limit the card face to: aura, one proof glyph, one aggregate "needs attention" badge, and the provenance style. Move everything else to the expanded view or a tooltip.
- Drop the default "no Lean yet" chip, and add an "emphasise informal nodes" toggle.
- Allow optional user short handles (h1, h2, as in the sketches), shown as a chip and used in tray chips and Instruct. Clamp titles to 2 lines.
- Make the "▲ n linked" badges relative to the focused card whenever one is focused.
- **HCI-12** [minor] doc 02 § D-14, D-34 (also 03 §3.2, §7 PromptBox)
  - problem: The label "Why do you believe this?" presupposes belief. S24 ("PG games cannot have characters with dark pasts") is a rule or norm, which is plausibly why it came with no reason; D-14's "no rationale yet" badge treats that as an omission. The user's two rationales are evidentials: lore is common knowledge, news is a report. Yet evidential source is deferred to D-34. There is no way to suppose something for the sake of argument, which matters for counterfactual goals such as "would not be a good addition". DERIVATION has no "why" field, although the user's informal reason that it follows would be a free proof hint, in their own words.
  - evidence: r7 [inferred] evidentiality finding (Aikhenvald; "'PG games cannot…' is normative or definitional"). D-14 text. S5 defines ASSUMPTION in doxastic terms ("what they feel is true").
  - fix: - Add stance chips at entry: "I believe it", "It's a rule or definition", "Supposing, for argument". The why-label adapts: "Why do you believe it?", "Where does the rule come from?", "What are you exploring?".
- Add optional evidential chips: observed, reported, common knowledge, inferred, value judgment. This is one field and cheap enough for v1.
- Show no badge on stipulations.
- GOAL label: "Why do you care?" (03 §3.2 already defines this). DERIVATION label: "Why do you think it follows?", passed to the agent as a proof idea.
- **HCI-13** [minor] doc 03 § §7 'Theming and accessibility', 'Gestures'
  - problem: (a) §7 says "Columns are ARIA listboxes and cards are options". In WAI-ARIA 1.2, `option` is "Children Presentational: True". The card's checkbox, chevron, port, and the "Depends on / Used by" buttons, which §7 calls "the screen-reader route through the graph", are therefore hidden from assistive tech.
(b) VS Code re-dispatches every trusted webview keydown to the workbench, even when the webview has called preventDefault. So any webview shortcut also fires global VS Code bindings. r3's prototype hint "Alt+1/2/3 switches kind" collides with `workbench.action.openEditorAtIndex1–3` (Alt+1..9 on Linux, no when-clause), which would switch editor tabs. Doc 03's Alt+↑/↓ and Ctrl+Shift+←/→ hit no global binding in my (non-exhaustive) search.
  - evidence: Fetched WAI-ARIA 1.2 (w3.org/TR/wai-aria-1.2): role option, "Children Presentational: True".
Verified in the VS Code 1.140 bundle:
- `shouldForwardKeyEvent(e){return e.isTrusted||…}` and `handleKeyEvent` → `window.dispatchEvent`;
- `registerCommandAndKeybindingRule({id:"workbench.action.openEditorAtIndex"+i, when:void 0, primary:512|digit})`;
- the context key `activeWebviewPanelId` exists.
The Alt+1/2/3 hint appears in the r3 screenshots.
  - fix: - Use role=grid, or treegrid since cards expand, with rows and cells; or list/listitem with real buttons and aria-selected/aria-checked on the row.
- Contribute the board's shortcuts as real VS Code keybindings with `when: activeWebviewPanelId == 'telelean.board'`. They then appear in the Keyboard Shortcuts editor and can be rebound.
- Add a test that checks the board's shortcuts against VS Code's default keybindings for collisions.

## Strengths
- Adding a node never calls the LLM, natural_name is stored verbatim, and G5 enforces byte-identity. The user's words remain the specification the Lean is judged against (D-16, G5).
- The strict reading of 'These suffice' (D-5) matches the relevance implicature of choosing premises, and the 'unused selected premise' flag operationalises it. The obligation preview 'prove G from {A1, A2, A3}' and the tray's 'premises ⊢ goal' layout mirror the user's own sequent notation (`h1 … |- goal` in cynder.lean and bank.lean).
- Gaps are never patched silently. Ghost assumptions can be adopted only with the user's own rationale (D-6), so filling in a missing premise (enthymeme completion) is always explicit. This matches how the user found the bridging rule themselves (cynder.lean l.175).
- Question cards carry plain-language consequences, highlight the affected nodes on the board (deixis), and offer explicit 'decide for me' delegation. DECISION records make pragmatic choices inspectable and revocable common ground (IBIS-like).
- Declared (dashed) vs verified (solid) edges separate assertion from proof, the right epistemic distinction, and junction dots preserve joint support.
- The existence-commitment badge (D-3) is in effect presupposition accommodation made visible. Closed-world encodings are flagged as a pragmatic question (D-4).
- The board's engineering respects cognition: native scrolling and find, stubs and badges instead of edge clutter, hover-highlighted support chains, 'Depends on / Used by' relation lists, status never by colour alone, high-contrast outlines, reduced motion, and theme-overridable colours.
- The independent back-translation from a context-isolated session and the notation-off toggle are good faithfulness instruments; they would be strengthened by a literal deterministic gloss and word-level alignment.

## Questions the docs should ask the user
- Click semantics (S25 vs S40): should a single click on a card select it for the tray, or focus and expand it for reading? D-17 decided this without a star.
- When you write "h1 is actually …" (cynder.lean), which should happen: (a) h1 stays and becomes a consequence derived from the refined representation; (b) h1 is replaced; or (c) h1 is collapsed under its refinement? And may a belief live inside a definition (a record instance like `cynder := {past := "dark"}`), or must every belief remain an axiom?
- Which representation style should Claude default to: yours (records/frames with attribute fields, inductive enumerations, degree plus threshold for gradable terms, as in smoking.lean), or the uninterpreted predicates the design assumes?
- Should every 'These suffice' attempt and its verdict, including 'no' and countermodels, be kept as part of the model's history, like the `from [h1, h2] ?- no` log in your sketches?
- Two-phase run: (a) always pause mid-run for statement sign-off; (b) one end-of-run review that judges meaning before showing proof status; or (c) pause only when something is risky?
- Clarifying questions: roughly how many per run do you want? Should Claude's recommended answer be pre-selected, hidden until you answer, or shown alongside the options?
- Should every report list the interpretive choices Claude made without asking, and should those count as agreed only after you acknowledge them?
- Do you want 'anti-goals', statements that should NOT be provable, as a way to test your assumptions (smoking.lean §6 over-generation)?
- Should ASSUMPTION distinguish 'I believe it' from 'it's a rule or definition' from 'supposing for argument'? Did S24 have no reason because it is a rule?
- Do you want short node handles (h1, h2, …) and a typed query syntax that mirrors your sketches (`from [h1, h2] ?- g`, `self_evident ?- g`, `h1 is actually …`)?
- For evaluative goals like 'good addition': good by whose standard (players, the franchise, the rating board)? Should evaluative predicates always carry an explicit judge or standard?
- Should models be comparable across subjects (bayonetta.lean: 'compare cynder.lean: contrast cynder.goal'), e.g. via shared vocabulary or references across workspaces?
- Should Instruct and replies to Claude live in the A/D/G prompt box, or in a separate 'Ask Claude' composer in the agent thread?
