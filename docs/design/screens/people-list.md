## 5.5.3 People list

### Intent

The directory is where a reader goes to find somebody: type a few letters or pick a tag, and
the person is there. It is a place to find people, not a to-do list.

### Rules

- A find-as-you-type field, tag chips, then **letter groups** by surname, each under a sticky
  letter heading.
- Each row is the avatar, the name (a lock for a private person), the description, the job on
  its own line behind a briefcase (truncated), and **last written about** on the right (*3
  weeks ago*, the date in its tooltip) — only when something has been; the row otherwise ends
  with the name. No column header names it.
- The heading counts people. A **⋯** beside it holds *Set last name for several…*, which turns
  the rows into ticks (docs/02 §2.2.4.3); while selecting it gives way to *Cancel*. The archived
  list has no ⋯.
- *Add person* lives in the shell, not on the page.
- The person you are wears the **You** chip (`--primary-soft` on `--primary`) next to their
  name (docs/02 §2.1.3).
- Once anyone is archived, an **Archived (N)** chip ends the tag row; it leads to the same list
  of the archived people, with the *last written about* column dropped (docs/02 §2.2).
- No data-quality checks on this page; they live in Settings (§5.5.8).

### Why

The checks moved to Settings so the directory stays a place to find people rather than a to-do
list. *Add person* is reachable from every page, so the directory does not repeat it.

Selecting does one thing here, so the menu names it: a bare *Select…* above the search left the
reader to guess what it was for. Most people have nothing written about them yet, and a column
of dashes under its own header made the list look unfinished on a wide screen; the date that is
there says enough without one.
