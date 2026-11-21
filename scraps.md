This space is for me to draft prompts outside the Claude Code window. If you're reading this file, ignore it. If you're reading this as part of a prompt, then I forgot to delete this header when copying; perform the following instructions.

___

You are taking over a previous session. The dialogue between me and it is recorded in verbatim_prompt_log. Read it exhaustively and then adopt the same standing instructions as the previous session, especially regarding logging and safety.

___

I want you to first read through the following specification, then look for any inconsistencies or fill in any irregular language / weird ordering or edge cases / introduce any convenient sub-concepts to make it more readable, then propose it back to me for approval. Give me a summary of the areas you have changed. If any of the specifications cause logic / formalization safety issues (e.g. something like "A definition can quietly carry a belief, so Accept needs your yes for each" that I have overlooked), then raise it to me. Then, if I approve, amend the edit system to fit the specification.

___

**SPECIFICATION** This specification is aimed at affording the user more granular and systematic control over the cards and changes to them, and reducing the amounts of special cards, giving cards a uniform base set of capabilities.

CONTEXT MENU: A section of the toolbar labelled "Context Menu" that gets filled with a set of icons relevant to the currently selected items. If nothing is selected, it should say "Select some items to see possible actions here."

EDIT SESSIONS: I want a neat system for edit sessions that works like the following:
    1. If an edit session was created by the "transform cards" button, then it will ask the user to make the first TRANSFORM.
    2. Claude will perform the desired changes according to either the transform, or the "these suffice" if it was created via that button.
    3. The edit session will then enter the first REVIEW STAGE.

REVIEW STAGE:
    1. In a review stage, Claude proposes a list of 3 kinds of items: Changes to existing cards, creation of new cards, deletion of existing cards.
    2. The user can cycle through these "review items" (UI similar to the current one with "Statement 1", "Statement 2" etc but instead as a scrollable list, and labeled as "Add <name of card>", "Change <name of card>", "Delete <name of card>", etc) (For readability, a "Change" where only the Lean definition is being filled in can be labeled in the scrollable list as "Formalize <name of card>", and you can have one item for all the vocabulary. The "Claude suggests", though should be treated as just regular new cards with their own entries.). There will be a table showing the status of all review items, which can either be "in review", "accepted" or "declined".
    3. Each review item starts out at "in review", and the user can either accept or decline it. Accepting it means that until its status is changed by the user, its definition is FROZEN for that edit session. Declining comes with DECLINE OPTIONS elaborated on below. The user cannot end a review stage if any item is still "in review".
    4. The user also is able to select multiple cards and accept or decline them as a group. This is also how the user would effect a multi-card TRANSFORM, by declining multiple cards together and choosing the TRANSFORM option.
    5. At any point during a REVIEW STAGE, the user is also able to select some goals and assumptions and select "these suffice". Since an EDIT SESSION is already active, this will just cause Claude to immediately do the inference and edit the Lean model accordingly. It should never edit currently "accepted" / frozen cards, but may ask the user to unfreeze / unaccept them if it thinks it is important.
    6. The user clicks "submit review" to end a review stage. If a review stage has any cards which are not accepted, then Claude will take appropriate actions for those cards and start the next review stage. An edit session ends successfully when all changes are accepted. An edit session can also be exited, in which case all its changes are cancelled.
    7. When an edit session ends, the frozen/unfrozen status of *all cards* must be restored to what it was before the edit session was initiated (this probably means the global frozen status of all cards must be stored somewhere).
    8. There should be a warning/confirmation popup before an edit session ends, successfully or not. This window should also tell him which cards / card fields will be automatically frozen / unfrozen after the session ends (see FROZEN).

DECLINE OPTIONS: Declining comes with some options, of which the user must pick one.
    1. Don't create this card for the rest of the current edit session (like a blacklist)
    2. Adjust this card (the user makes some TRANSFORM)
    3. Mark the card as "shaky"; i.e. Claude can do what it wishes with the card. This is useful when you want to, say, accept 2/5 cards and then ask Claude to reshuffle the other 3; some might be the same but others could change or be removed / split into more cards etc. The main constraint is that when multiple cards are marked as shaky in a review stage, then Claude cannot regenerate the *exact* configuration of shaky cards in the next review stage.

TRANSFORM: The interface by which the user proposes to transform the current selected set of cards into a different set of cards
    1. The user should have a window where he can see all the proposed cards, starting with an exact copy of the set of cards he selected. This means that if he immediately selects "ok" to accept the cards proposal, he has made 0 changes.
    2. The user should be able to create a new card.
    3. The user should be able to drag a card into a trash section, where the card is still visible if he wants to drag it back, or delete it permanently.
    4. When a new card is created, all fields are left "fuzzy", meaning if the user doesn't specify a value, Claude will try and autofill it after the user clicks "submit transform". "fuzzy" should be demarcated clearly for all affected fields.
    5. The user can manually fill in a card's fields, which would make that field FROZEN.
    6. The user can also tick a checkbox that controls whether Claude will generate more cards to fill gaps if it sees fit, or if it will strictly stick to the current set of cards.
    7. The user is also able to write prose instructions for Claude in a textbox to guide it on any vague parts.
    8. The user finishes by clicking "submit transform".
    9. The user must be able to do this for any card, including "CLAUDE SUGGESTS" or Vocabulary cards.
    10. You should only allow edits at all for sensible fields of course; i.e. don't allow edits for fields like "Depends on" or "Used by".

FROZEN: This is a status applied to cards or card fields
    1. This status is applied to cards or card fields in situations like when the user manually edits a field, accepts a card, etc. It should manifest visually as an aura that must not clash with the one for Lean formalization.
    2. Importantly, Claude can *never* edit a frozen card under any circumstances. If claude wants to edit a frozen field, it MUST ask the user to unfreeze it *first*, and the user must manually unfreeze it by selecting the card (or multiple cards) and clicking an unfreeze option on the CONTEXT MENU. Then Claude can edit it not because the user has "given approval", but specifically and mechanically because the card itself is no longer frozen.
    3. The only time frozen status can be removed automatically is if a card was frozen during an EDIT SESSION and that same session has ended.
    4. At ALL times (at all stages in all interfaces) where a card or its fields are visible, a user should be able to select a card or its fields and click a "freeze" or "unfreeze" option in the CONTEXT MENU at any time.
    5. At ALL times (at all stages in all interfaces) where a card or its fields are visible, a user should be able to select a card or its fields and click a "freeze all other cards" or "unfreeze all other cards" option in the CONTEXT MENU at any time.

INITIATING EDIT SESSIONS: A user can initiate an edit session by (at least) these actions
    1. Using the "these suffice" button when no edit session is currently active
    2. Selecting one or more cards, and then clicking an "initiate edit session" option on the CONTEXT MENU. This will make every non-selected card FROZEN.
    3. The user should not be able to edit fields directly on the "Current" tab.

REFERENCE SYSTEM:
    1. I want a reference system (similar to Github's for pull requests, issues, comments etc) where I can reference another card, or any of its fields, clearly and conveniently. It should trigger a dropdown menu upon typing a symbol like "#", etc.

___

Finally, I have some questions:

1. Explain to me what the "fully explicit" checkbox does?

2. What is the difference between the "Claude suggests" cards and the "Statement 1", "Statement 2" etc in the review UI?

3. Where does the "definitions" show up in the main card graph?
