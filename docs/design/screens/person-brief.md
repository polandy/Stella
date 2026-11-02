## 5.5.17 A person's brief

### Intent

A member about to see someone — in the car, at the door, the evening before — wants what to
know about them in under a minute, on the phone, or on paper for whoever comes along.

### Rules

- **`/contacts/<id>/brief`**, reached from *Brief before a visit* in the person page's ⋯ menu
  and from the palette's *Brief for …*; the breadcrumbs read *Home / People / Anna / Brief*. Mockup:
  https://claude.ai/artifact/NK8uEo6HML8329KbMv9uiH
- One narrow column (`max-w-xl`). A header card: the avatar (56 px), the name in the serif face,
  *48 years · born 3 March 1978* under it, and a small *Print* button with the printer icon.
- **Coming up** is a card of its own, a link: the gift icon for a birthday, else the calendar,
  *Mia turns 13* and *in 12 days*. It has no heading — the line says what it is.
- The other blocks are cards headed in small capitals, in this order: *Family & home*, *Pinned
  notes*, *Lately*, *To do*, *Gift ideas*, *How we met*. A block with nothing in it is not
  drawn, never an empty heading.
- Every row is a link with a sunken hover, one line, to where the row is edited. A relative:
  name, the role (*daughter*), the age right-aligned. A home: the home icon, the address, *with
  Ben, Mia* under it. A note: the pin, its title in medium weight, its first words. *Lately*: a
  short date column, the kind's icon, the line. A to-do: its title and due date (`TodoDue`). An
  idea: the bulb, its title and occasion.
- Private notes and *Lately* rows are veiled (`Veil passive`, §5.10) with a *Private* mark; a
  private to-do or idea has the mark alone, as on its card.
- *How we met* is set in the serif face, like the profile's quote.
- With no block at all, `EmptyState` with the brief icon: *Nothing on record to brief you on
  yet — their page is where it gets added.*
- *Open the whole page* closes the page, a centred link.
- **Print**: the navigation, *Print* and *Open the whole page* are hidden; *Coming up* spans
  the sheet and the other blocks fall into two columns, none split across a page; no shadows;
  the light theme whatever the screen's, handed back after; a line under the name says *Brief ·
  2 November 2026*.

### Why

Its own page rather than the top of the person page, because the person page is for keeping
and the brief for reading: here nothing can be tapped into an editor by accident, and the
order is the doorstep's — what is coming up, who lives there, what not to forget. Every row
still leads to where it is kept, so a wrong fact is one tap from being fixed. Printed, because
a grandparent going along may not have the app; two columns, so it fits one sheet.
