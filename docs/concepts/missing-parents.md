# Missing parents in the family tree — concept

*Status: building (roadmap M3, docs/06). Folded into docs/02 §2.7, docs/05 §5.8 and the graph
screen file once built, then deleted.*

## Problem

The family tree draws only the parents somebody entered. Where a person's parents — or one of
two — are missing, the row above has a silent gap, and nothing invites filling it.

## Decisions

1. **Who gets a placeholder** — only the centre's direct ancestor line: the centre, their
   parents and their grandparents (three generations; the placeholders stand at most in the
   great-grandparent row). Not every person on the map: an aunt's or a friend's missing parents
   are not the question the tree around one person asks, and seven slots at most keep a large
   family from filling with plus signs.
2. **One slot per gap** — nobody on record: one *Add a parent of X* slot over X (adding one
   turns it into the next case); one parent on record: one *Add X's other parent* slot beside
   that parent, joined to them by a dashed bar, the child's drop from its middle as for any
   couple. Two or more parents: none.
3. **Missing means missing from what the viewer may see**, not from what the map has opened
   so far: a parent who is in the household's graph but not yet on the map is behind the
   person's "+N" already, so no slot; a parent the viewer may not see (private to somebody
   else) is indistinguishable from none, as everywhere (docs/03 §3.7).
4. **Not a node** — the filters, the "+N" badges, the hidden-neighbour counts, the selection
   and the connection path never count a slot. It is drawn only while the map is arranged as
   a family tree around a person, and goes when the map leaves the tree.
5. **Room** — the slot is laid out like a person in its generation (the tree measures it as
   it measures a name), so the row makes room for it and the order keeps lines from crossing.
6. **Reading and walking** — a dashed ring with a plus, its line dashed. The keyboard walk
   steps onto it like onto a person; the live line names it as a button (*Add a parent of
   Lena, button*), and Enter does what a tap does.
7. **Tap** — opens X's page with *Add relationship* open and the type preset to *Child of*,
   so the person picked or created becomes X's parent (`?relate=&as=reverse:parent_child`).
   Full screen is left first, so the form is not underneath the map.
8. **Who sees it** — whoever may add a relationship. The rule is the access layer's
   (`canAddRelationships`): every member may link two people they both see; the slots appear
   only for people the access-scoped graph contains.
