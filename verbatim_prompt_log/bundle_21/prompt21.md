# Prompt 21 (turn 21), verbatim

Sent 2026-11-18T15:04:07Z in the logged session (`20626c17-0334-4498-ad86-9dc24b7010ed`). Extracted programmatically from the session transcript. Everything after the `___` line was pasted from the user's draft file `scraps2.md`: the pasted text matches lines 4–28 of `/home/zhengyew/telelean/scraps2.md` as of 2026-11-18 (identical apart from leading and trailing whitespace; checked in Python). As in `prompt20.md`, the client's paste markers around that text are omitted here; nothing else is changed.

==================================================================
I want to add the following changes. Read through them and also add its changes to the specification, and watch out for + raise to me any unsafety. These mostly touch the (former) ASSUMPTION, DERIVATION, GOAL layout.

___

I also plan some changes to the ASSUMPTION, DERIVATION, GOAL split + the "this suffices" button.

I want to remove the DERIVATION / GOAL distinction -- the blue glow for formalization + a green glow for "proven" should suffice.

Also, instead of picking ASSUMPTIONS and 1 GOAL, I want to be able to draw multiple dependency arrows between nodes (where a dependency arrow from X to Y means "X leads to Y" / "Y is derived from X") before clicking the "this suffices" button -- also, I think in this new context "formalize for dependencies" would be a better name for the button, as it tells Claude to generate formalism that will support the dependency arrows (it can add or delete others if they aren't frozen). Also, the way the button works would be by selecting one or more dotted arrows and pressing the "formalize for dependencies" button.

If X Y and Z are all jointly sufficient together to prove A, then their arrows pointing at A should be visually "bound" by a green band.

Also, I need to add the capability to freeze arrows to prevent Claude from changing them if desired, as well as to freeze the *set* of dependencies of a card.

All Claude changes to dotted arrows must pass through human review, appearing as part of the review stage as an item that can be accepted or declined, but declining doesn't have the decline options. Declining would also decline the relevant cards.

As such, the three-column layout will also be changed: I want a single column of ASSUMPTIONS, and everything else will be on a scrollable and zoomable canvas. It will likely be good for the canvas to be zoomable out and in via the mouse scroll wheel (preferably zooming in and out from a point centered around the location of the cursor) + right mouse click and drag to move the camera, like in other apps like Miro or Prezi. Trackpads send wheel events too, so ctrl+wheel (a trackpad pinch) should also zoom

A right click without movement still opens the menu.

I will call these AXIOMS (prev. ASSUMPTIONS) vs PROPOSITIONS (prev. DERIVATIONS / GOALS)

Vocabulary and definitions should get their own scrollable columns outside of and above the AXIOMS/PROPOSITIONS space.

The user can drag a PROPOSITION to the AXIOMS column and it will lose all incoming arrows (since it no longer is derived from anything) and become an axiom. However, a user cannot just drag an AXIOM to the PROPOSITION canvas; he needs to draw dependencies from at least one other axiom to the desired axiom, and that axiom will automatically be transferred to the proposition canvas. When moving an axiom to the proposition canvas, its `axiom n.holds` stays, marked "pending proof", until a run proves it. Arrows that would create a cycle are refused. Keep a way to mark a proposition as following from nothing.

Arrows from the assumptions column into the canvas must follow pan and zoom.
==================================================================

(Context attached automatically by the IDE, not part of the message: the user had selected lines 4 to 28 of `scraps2.md`, the same text as the pasted part above.)
