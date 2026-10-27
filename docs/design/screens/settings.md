## 5.5.7 Settings

### Intent

The rare things: who you are in the household, your account, importing people, the household's
relationship types, API tokens, and which version is running. Settings is meant to grow to
account (incl. sign out), appearance (theme, accent, reduced motion), household (members,
invitations, relationship types, tags), data (export, import, backup) and auth; the rules below
are what it holds today. The household-wide checks are their own page (§5.5.8).

### Rules

#### The landing page

- A **Data** section, a **You** section (docs/02 §2.1.3) and an **Account** section (sign out
  only so far), ending with the **About** card.
- A **Privacy** section after *You* (docs/02 §2.10.1): the switch *Blur my private entries*
  with its hint, saved as it is flipped and confirmed in a toast. While it is on, *Device
  unlock* below it in one of three states: **set up** — a green *Set up* mark, *Set up here
  since …*, and a ghost *Forget on this device…* that opens a sunken confirm step in place
  (what stays private, that the passkey stays in the password manager, that other devices keep
  theirs; *Forget* in danger, *Keep it* focused, Escape keeps); **not set up** — a line on
  what it does and *Set up device unlock*; **not possible here** — one line saying a tap shows
  an entry instead.
- A **Household** section after *You* holds one link card, *Members* (docs/02 §2.1).
- *You* is a labelled person search select; it marks the same person as the identity card's
  *This is me* (§5.5.2).
- Settings links to *API tokens* under *API*.
- **About** shows the running version as the card's own line. When the release check is on, one
  line under it names the newest published release: a small `New` pill in soft primary, the
  version, and *Release notes* as an ordinary link, laid out to wrap on a narrow screen. Nothing
  to dismiss and nothing to act on in the app (docs/02 §2.17.1).

#### Members

- One card lists the current members, the viewer first: avatar, name with a *You* and an
  *Admin* pill, email, and how they sign in in a small line.
- For an admin, every other row ends in a ghost *Remove…* whose accessible name carries the
  name. It opens the sunken confirm step under the row (the person page's, not a modal): a
  heading, one line per consequence with its icon, the last-admin warning in `--danger`, and
  **Remove Nina** (danger) beside **Keep Nina** (ghost, focused). Escape keeps.
- A removal answers with a toast and no Undo; the row moves to *Former members*, a second card
  of muted rows with *Removed on* and the day.
- For an admin, each former row ends in a ghost *Restore…* (the `addPerson` icon), its
  accessible name carrying the name. It opens the same sunken confirm step: how they sign in
  again, that devices stay signed out, what of theirs comes back, and **Restore Nina**
  (primary) beside **Cancel** (ghost, focused). Escape cancels. A restore answers with a toast
  and the row moves back to the main card.
- A member sees the same lists without the buttons, and a line that only an admin removes or
  restores.

#### Import people

- The **Import people** wizard (docs/02 §2.16) is a three-step page: a numbered step strip, a
  count-tile preview with a *left out, and why* card, then the import result and the photos,
  under one progress bar.
- The photo step has two ways in: a folder picker for a Monica dump, and a single *Store photos*
  button for a JSON export or a vCard.
- A vCard gets a fourth step, **review** (docs/02 §2.16.2), between preview and import. A
  summary card first: how many contacts the file holds, count chips per kind, *Confirm all N
  strong matches* (primary) and *Skip the rest* (ghost).
- Then one card per contact to answer: a badge (green for a strong or changed match, amber for
  name only or several, plain for new) and why, the incoming contact beside the Stella person,
  *Would add* in `--success-text`, a conflict as a slim row — a small `--warning` icon
  with what differs, then *Stella* and *On the card* as two chips side by side, the picked one
  in `--primary-soft` with a `--primary` border; no box, so three conflicts stay short — and the four answers in a row. An answer folds the card to one
  line with *Change*; folded cards sink below the open ones.
- The contacts nobody matches are one checklist between the open and the folded cards: a row per
  contact (name, first email or phone), *Select all* / *Select none*, nothing ticked, and one
  button that adds the ticked ones and skips the rest.
- A sticky footer counts what is unanswered; *Import* stays disabled until it is none.
- On the upload step, *Skipped contacts* lists every skipped card (name, address book, day)
  with a ghost *Ask again*.
- With a linked Nextcloud book (docs/02 §2.16.3), the upload step opens with its panel: the
  `sync` icon and *Nextcloud address book*, one line on what is kept in step, *Last synced …*
  (or *Not synced yet*; a `--warning` line when the last try failed), and a secondary *Sync
  now* whose icon spins while it runs. A sync's result is one line under it. While new cards
  wait, *N new cards to review* with a primary *Review* opens the same review as a file; while
  differences wait, a link names how many.

#### Relationship types

- **Relationship types** (docs/02 §2.4) lists the household's own types as rows with a category
  dot and an *Edit* disclosure.
- Only where nothing uses the type, the row carries a `RemoveButton` with the usual Undo window;
  a type in use shows `used N×` in its place.
- The *Edit* disclosure ends with *Merge into another type*: a select of the types of the same
  shape and a secondary *Merge* button.
- A type an older import created before Stella had it built in carries a one-line hint with a
  primary *Merge into …* button under its row.
- The twelve built-in types follow as a plain, actionless list under *Built in*.
- The page is admin only; members see why.

#### API tokens

- *API tokens* (docs/02 §2.16.1) is every member's own page.
- A form (name, lifetime as a `select`) stands above the list of the member's tokens: name,
  *valid until* / *expired on*, *last used*, and a ghost *Revoke* whose accessible name carries
  the token's name.
- A new token appears **once**, in a `--primary`-bordered panel on `--primary-soft` above the
  form, with *Copy* and a ready-to-paste `curl` line against this very instance. Nothing on the
  page can show it again.
- *Revoke* has **no undo toast**, unlike every other removal (§5.7).
- The page's icon is `apiToken` (a key), not `private`.

### Why

The import's photo step differs by source because the formats differ: a Monica dump's pictures
are still on the Monica server, while a JSON export or a vCard carries them inside the file.

The review asks before it writes because a name is not an identity: a wrong *Same person*
would mix two people's facts. Most of an address book is people the family does not keep, so
the unmatched ones start unticked — adding is the choice, not skipping. A skip is for good, so
its way back sits where the next import starts.

The Nextcloud panel sits on the import page because a new card is reviewed exactly like a
file's; *Sync now* is there for someone who just added a contact on their phone and wants it
now rather than at the next opening.

The built-in types are listed without actions so their absence from the editable set reads as
deliberate.

Device unlock is a fact about this device, so it is shown and forgotten here, never listed
for other devices: Stella does not know them. Forgetting asks first because setting it up
again means the device's prompt once more; it removes nothing else.

The release line is a notice, not a banner: it informs and asks nothing.

Removing a member has no Undo window because sessions and tokens end at once, and an undo
would have to bring them back; the confirm step stands in for it, as for deleting a person.
*Restore* is the way back instead, a deliberate step of its own.

Restoring is confirmed too, though nothing is lost by it: it opens the door to the household
again, so it is weighed like the removal that closed it. Its submit is primary, not danger,
because nothing is removed.

A token is revoked because it may be in the wrong hands, and an undo grace period would be a
window for exactly those hands. `private` is about who sees a record, so tokens get their own
icon.
