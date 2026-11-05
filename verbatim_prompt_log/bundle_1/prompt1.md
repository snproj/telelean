# Idea

I would like to create a VS Code extension.

The goal of this extension would be to assist a user in creating an interactive map (at least clicking and dragging components) of the user's internal mental model about a subject, represented and supported by Lean code files that are in the directory that VSCode is currently in. The user would be able to modify the Lean model either directly by editing the files, or more commonly by prompting an AI. The prompts would be in natural language, BUT should be able to be marked by the user using a UI switch (and read by the extension) as either creating an ASSUMPTION, a DERIVATION or a GOAL.

An ASSUMPTION is an axiom that the user supplies based on what they feel is true about the world. An assumption should be annotated with a natural language description of why the user has that assumption.

A DERIVATION is something that can *purely* be derived from the ASSUMPTIONS -- it should never require new assumptions to be added to the model.

A GOAL is something that the user eventually wants to prove, but has not yet found a way there via ASSUMPTIONS and DERIVATIONS.

The extension will need to act as a harness where it can slot in an LLM (at least I must be able to slot in Claude using my current subscription because I want to use this). The extension should also include a text input box.

The extension tab itself should contain an interactive panel, which is visually split into three vertical sections, each containing a kind of node, and each being independently scrollable (because there might be many, many nodes):
1. A section listing all assumptions
2. A section listing all derivations
3. A section listing all goals

The extension must be able to draw arrows from any node in one section to a node in another section, so I think some kind of graph structure will emerge, and probably this will inform the choice of library to implement this part.

Nodes should also be able to move from one section to another; for instance, an assumption should also be promotable to a derivation, or a derivation made into an assumption, or a goal moved to a derivation once it's proven, etc etc.

An example use case of the harness might be something like:
1. I want to prove that "Cynder would not be a good addition to the new Spyro game", so I add this as a GOAL. The node is created, but no Lean code has been generated yet.
2. I know from being familiar with gaming lore that "Cynder is a character who has a dark past", so I add this as an ASSUMPTION, annotated with "familiar with gaming lore". The node is created, but no Lean code has been generated yet.
3. I know from gaming news that "The new Spyro game is PG", so I add this as an ASSUMPTION, annotated with "known from gaming news". The node is created, but no Lean code has been generated yet.
4. Similarly, I add an ASSUMPTION that "PG games cannot have characters with dark pasts"
5. Finally, I select the three assumptions, and also click on the goal. The options I select should be shown in a separate section below. I click a button, and the LLM generates a Lean model representing what I have created. The essence of the button in this case is to say that "I assert that the assumptions must be enough to prove the goal". The job of the LLM is to formulate the assumptions and the goal in Lean in some intuitive way, and generate signatures for the assumptions and goals, and prove the goal.
6. The LLM should ask questions to the user along the way; for instance, "do you want to model characters"? etc. which would help it understand the level of detail and the pragmatics (pragmatics in the sense it is used in linguistics; unspoken context) the user wants.
7. When the LLM is done, it will propose a diff (which must be overlayed graphically on the nodes, but also the user should be able to switch to seeing the diff to the Lean files themselves). This would cause several more nodes to be created in the extension window (added to the mental model); for instance, it might create a structure `Cynder` and a Prop `isCharacter`, or some other more fine-grained representation of the concept I am trying to bring across. The user can accept this, or else provide some feedback.

You should think about how to represent nodes not only in graphically in the extension, but also programatically. Each node must correspond to something in a Lean file in the current directory -- therefore, I suggest a markup notation that will go in Lean comments. Something like:

```
/-
@@ telelean
natural_name: "Cynder would not be a good addition to the new Spyro game"
type: GOAL
-/
def cynder_not_ ...
```

If the node does not yet have Lean code, then it should still be represented as a Lean comment with no accompanying Lean code. I don't think `sorry` would be the right thing to use for this, since that implies we do have a representation, but it's not inhabited yet.

We want the user to first see natural language, and only dive into Lean code when necessary, so each assumption, derivation and goal should have a natural language description (maybe in the Lean file, this would correspond to a docstring), and the user should be able to click on the node and expand it to see the Lean definition. Nodes that DO have a Lean representation should be visually marked as such, perhaps with a blue aura. Of course, the user is also able to see and edit the Lean source code directly, but he is expected to mostly work in the extension window.

The project might be big and the markup language representing nodes might grow in the future (we might also write separate scripts doing graph analysis on the nodes linked to each other etc), so let me know if an LSP is the right design decision.

For a similar idea, you can look at https://github.com/amosblomqvist/learnharness and https://learnharness.ai for inspiration, though the goals there (and probably the tech stack) are different from mine.

___

# Implementation

1. Read fully and understand the idea above. It is written by me, who has a background in formal methods, and an interest in linguistics, cognition and human-computer interaction. However, it might be messy and parts may be out of order, so consolidate points from the idea while keeping track that every sentence is still accounted for.

2. Understand any unspoken constraints from the idea above and raise them if it involves a significant design decision.

3. Sketch out a software architecture that would allow the idea to be implemented. Give me a list of software that you would want to install.

4. Once approved, implement the desired program in this directory. Test the basic functionality of the program and let me know when it is in a state that is good enough for me to start using it, giving me directions as to how to do so.

5. In `verbatim_prompt_log`, you see `bundle_1` with `prompt1.md`. From now on, log every prompt that I give (even if it's asked mid-turn) in a new bundle, and your response + any user-requested documents. You can look at `https://github.com/zilinc/spectec/tree/lean-backend-proof/spectec/src/test-lean-claude/claude-logging/verbatim_dialogue_log` for an example of the structure.