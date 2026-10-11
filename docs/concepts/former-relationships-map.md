# Former relationships on the map — concept

**Status:** in build (one PR). Folded into docs/02 §2.7, docs/05 §5.8 and
`docs/design/screens/graph.md` once built; this file is deleted in the same PR.

## Problem

A link can be marked `former` (docs/03 §3.3) — an ex-partner, a former colleague. Kinship already
stops reasoning through it (§2.4.1), and the person page reads it with a quiet *former* chip and
lists it last (§2.4). The map (§2.7) draws it like any current link, so an ex-wife and a wife look
the same, and in the family tree an ex-couple is drawn as the couple their children hang from.

## Decisions

1. **How a former link reads on the map.** A **dashed, muted line**: its category's colour mixed
   halfway toward `--fg-subtle`, then deepened to the same 3:1 floor every line keeps
   (`ensureContrast`), thinner than a current line and dashed with a longer dash than a
   circle's line, so the two never read alike. Its name says it: *Spouse of · former* /
   *Ehepartner von · ehemalig*. Lines on the canvas have no DOM, so the name is also what a
   screen reader and the hover read — one string, no second wording.
2. **Shown by default, a switch hides them.** A **Former links** switch in the Filter menu, on
   by default and remembered per device like the other switches. Off, `applyFilters` drops every
   former link, so the "+N" count, *Expand* and the people they alone brought in follow it. A
   saved view keeps it like any switch; a view saved before it existed takes the default (on).
   It is a switch, not a seventh line-kind chip: a former link has a kind and a category of its
   own already, and the chips are the legend of those.
3. **The family tree** keeps a former partner link as a link — the two still stand side by side
   and their line is drawn, dashed — but **never as a parent pair**: the children of an ex-couple
   hang from each parent's own drop rather than from the middle of a bar that says they are
   together. The role under a name says it too: *Wife · former*. Among several lines to one
   person, a current one names them before a former one.
4. **The connection path** still travels a former link: an ex-partner is still how two people
   know each other. It ignores derived lines for its own reason (docs/04 §4.9), not this one.
5. **The person page and the pickers** already set former links apart and need nothing new: the
   People card reads them with the *former* chip and lists them last (§2.4); the pickers' namesake
   line counts only current links (§2.2.3); the surname suggestion never reads a former
   partnership (§2.2). The map embedded on the person page is the same explorer and follows 1–3.

## Out of scope

Hiding former links on the person page; a different arrangement for someone with both a former
and a current partner (the tree keeps whichever order its crossings rule picks).
