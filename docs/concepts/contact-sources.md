# Concept — Contacts from other address books

**Status:** decided, stage 1 not yet built. When stage 1 is built, its part moves into §2.16, docs/03 and
`docs/design/screens/settings.md`, and only stage 2 stays here.

People already sit in other address books: Google Contacts, and Nextcloud, which the family's
phones sync with. This concept brings them into Stella **matched against the people already
there** instead of creating a second copy. Today a vCard import matches nothing (§2.16, *A
vCard is read too*): every card is a new person under `vcard:contact:<uid>`, so anyone Stella
already knows comes in twice.

Two stages:

1. **The matching review** for any `.vcf`, whichever address book wrote it. One review step in
   the import wizard; the answers are remembered.
2. **The live Nextcloud link**: two-way, reusing the remembered answers of stage 1.

Decided for both:

- Nextcloud stays. Stella links to it in both directions: name, phones, emails, addresses (a
  shared home's line included), birthday and photo.
- Stella does **not** become a CardDAV server for now (docs/06).
- **Private people never go out.**
- People only in Stella, and people only in Nextcloud, stay where they are unless linked.
- A delete in Nextcloud only **unlinks**. It never deletes or archives anyone in Stella.

---

## 1. Stage 1: the matching review

### 1.1 What the exports look like

Built from synthetic exports (never real ones). They live with the tests as fixtures from step 1
on (`src/lib/server/domain/import/fixtures/`).

| | Google: Contacts → Export → *vCard (for iOS Contacts)* | Google: Takeout → Contacts, vCard | Nextcloud: Contacts → address book → *Download* |
|---|---|---|---|
| Version | 3.0 | 3.0 | 3.0 (Sabre converts a 4.0 upload to 3.0) |
| `UID` | **none** | **none** | a UUID, the same one CardDAV serves |
| `PRODID` | none | none | `-//Sabre//Sabre VObject …` or `-//Nextcloud Contacts v…` |
| Photo | **a URL** `PHOTO:https://lh3.googleusercontent.com/contacts/…` | a URL | **inline**: `PHOTO;ENCODING=b;TYPE=JPEG:…`, or (from the web app) `PHOTO;VALUE=URI:data:image/jpeg;base64\,…` with the comma escaped |
| Labels | `TYPE=HOME/WORK/CELL`, and a custom label as `itemN.X-ABLabel` grouped with its `itemN.EMAIL`/`TEL`/`ADR`, sometimes empty | the same | `TYPE=HOME/WORK/CELL/VOICE` only |
| Groups | `CATEGORIES:myContacts,starred,Family` (the first two are Google's own) | the same | `CATEGORIES:Family,…`, the contact groups |
| Birthday, no year | `BDAY:--0407` | `BDAY:--04-07` | `BDAY;VALUE=DATE:--0407` |
| Organisation | `ORG:Company;Department`, `TITLE` | `ORG` | `ORG`, `TITLE` |

What the current reader (`domain/import/vcard.ts`) gets wrong with these, fixed in step 1:

- **No UID at Google** → the id is a fingerprint of the whole card, which changes on any edit,
  so a re-run sees a different card. Fixed by the key in 1.4.
- `myContacts` and `starred` become tags. They are dropped.
- Labels are dropped. Mapped in 1.3.
- Nextcloud's `base64\,` keeps the backslash, so the photo's data URL is broken. Unescape before
  reading.
- A Google photo is a URL and is left out without a word. The report now counts it (1.6).

### 1.2 Matching

Candidates are only people the importing member may see (`contactVisibleTo`) **and** who are
not archived (`contactBrowsableBy`). A private person of someone else is never a candidate,
never named, never counted.

| Strength | Rule |
|---|---|
| **strong** | the card shares a normalised **email** (trimmed, lower-case) or **phone** with exactly one person |
| **weak** | only the **full name** agrees, folded like `possibleDuplicates` (§2.16.1): case, accents and word order ignored |
| several | more than one person reaches the card by any rule: the member picks, nothing is preselected |
| none | a *New person* card |

A phone is normalised to digits with a leading `+`: `0041 79 …` and `+41 79 …` are one number.
A national `079 …` has no country, so it is compared by its last nine digits against the
numbers Stella holds. That is enough to make someone a *candidate*, never a strong match on its
own. Stella has no household country yet; open: whether to add one so `079 …` reads as
`+41 79 …`.

Pure, in `src/lib/import-match/` (step 1): `normaliseEmail`, `normalisePhone`, `foldName`,
`candidatesFor(card, people) → { person, strength, reasons[] }[]`.

### 1.3 What *Same person* writes

**Missing facts only**, compared the API import's way (§2.16.1, *Fields complete, never change*):

- emails, phones, addresses and websites the person does not have (kind + value, ignoring case
  and spacing; an address also against the line of a home they live in);
- birthday, nickname, company, job, if empty;
- the photo, if the person has none and the card carries one inline;
- tags from `CATEGORIES`, minus Google's `myContacts` and `starred`. Groups become tags, not
  circles: a circle has a kind and a period, which a group does not know.

Labels carry over: `HOME` → *Home*, `WORK` → *Work*, `CELL` → *Mobile* (in the member's
language), an `X-ABLabel` as typed; `INTERNET`, `VOICE`, `PREF` say nothing and are ignored.

**Conflicts** are a differing **birthday** or **name** (first or last). The card shows both;
*Keep Stella's* is selected, *Take the card's* replaces it. Everything else that differs (a
second address, another company) is not a conflict: the fields are added beside it, and a
different company or job is shown as *not taken over*.

The merge plan per card is pure: `mergePlan(card, person) → { add: Fact[], conflicts:
Conflict[], kept: Fact[] }`.

### 1.4 The remembered answer

A new table, `contact_source_link` (step 2, docs/03):

| column | notes |
|---|---|
| household_id | |
| source | `vcard:google`, `vcard:nextcloud`, `vcard:other`; `nextcloud:<address book>` in stage 2 |
| external_uid | the card's key, below |
| contact_id | the person it is; null when skipped. Cascade: deleting the person deletes the link |
| state | `'linked' \| 'skipped'` |
| card_hash | fingerprint of the card as last answered, so a re-run asks only about a changed card |
| answered_by / answered_at | |

Unique on `(household_id, source, external_uid)`.

**The key.** A card's `UID` when it has a usable one: Nextcloud always does, and the UID in its
`.vcf` is the one CardDAV serves, so a person linked by a file today is already linked in
stage 2. A Google card has none, so its key is the contact id in its photo URL when there is a
photo, otherwise the folded name plus its first email or phone. If someone is renamed in
Google, the card is new next time. It then matches its person strongly by email or phone and
costs one tap.

**The source** is read from the file: a Sabre or Nextcloud `PRODID` is `vcard:nextcloud`; no
`UID` together with `X-ABLabel`, `myContacts` or a `googleusercontent` photo is `vcard:google`;
anything else is `vcard:other`.

**A skip is for good.** A skipped card is not asked about again, even when it changed. *Skipped
contacts* on the import page lists them with *Ask again*, as *Show declined* does (§2.4.1).
Like `suggestion_dismissal`, the row belongs to the household, not the member who tapped.

### 1.5 The review step

Between *preview* and *import* the vCard wizard gains a **Review** step. One card per incoming
contact that needs an answer, strong matches first, then weak, several, new:

- left: the incoming contact (name, emails, phones, address, birthday, organisation, groups);
- right: the suggested Stella person, with *Would add* (the facts of 1.3) and any conflict;
- four answers: **Same person**, **Pick someone else** (the household search, only browsable
  people), **New person**, **Skip**.

A strong match is preselected *Same person*. A weak match, several candidates and no candidate
start unanswered. **Confirm all N strong matches** at the top accepts the strong ones in one tap,
and the list closes to what is left. Import stays disabled while a card is unanswered; *Skip the
rest* answers all of them at once.

A card already linked to a person, unchanged since (`card_hash`), is not shown at all. If it
changed, the card is shown again with only the new facts. A skipped card is never shown.

Mockup: `contact-sources.html` beside this file (en + de, Latte + Mocha, phone + desktop), with
`contact-sources-*.png`.

### 1.6 Applying

One transaction (`applyContactReview`, step 3), with deps injected:

- *Same person*: the merge plan's facts and the chosen conflict sides, link `linked`;
- *Pick someone else*: the same, against that person;
- *New person*: the existing vCard mapping for that card, the new person's link `linked`;
- *Skip*: link `skipped`.

Each written through the access layer: never a private person the member does not own, never
an archived one, checked again at write time and refused (`ContactGoneError`) rather than
trusted from the review. One `activity_log` row per import as the member (*imported 4 people
and completed 11 from a Google export*), in their language like the API import's line.
A re-run is idempotent: linked and unchanged cards are left out, skipped ones too.

The report adds: *N photos are only links in a Google export and were not imported*.

---

## 2. Stage 2: the live Nextcloud link

Decided above; built after stage 1 with its own prompt. It reuses `contact_source_link` with
`source = nextcloud:<address book>` and the matching review for every card it has not met
before.

- **Into Stella:** a changed card in Nextcloud updates its linked person by the stage-1 rules:
  missing facts are added, a conflict is asked about. A new card is a review card. A deleted
  card unlinks.
- **Out of Stella:** a change to a linked, **shared** person's name, phones, emails, addresses
  (a shared home's line included), birthday or photo is written to their card. A private person
  is never written, not even when linked; making a linked person private unlinks them first,
  after a confirm. A person not linked is never pushed.

**Open questions:**

1. **Change detection:** `sync-collection` (RFC 6578, Sabre supports it) or `getctag` polling,
   and how often: on a schedule (every 15 minutes?), on opening Stella, or a manual *Sync now*.
2. **Conflict UI:** where a conflict raised by a sync waits for an answer. Under *Data quality*
   beside the other checks, or a badge on the import page; and what happens to a person edited
   on both sides between two syncs (who wins until answered).
3. **Credentials:** the Nextcloud URL, user and **app password**. As env config (`docs/07`,
   `config.ts`), or entered by the admin in Settings and stored server-side. Env is simpler and
   keeps the secret out of the database and the archive.
4. **Attribution:** `activity_log` needs a non-member actor, *Nextcloud*, or the member whose app
   password it is.
5. **Photo direction:** both ways, Stella → Nextcloud only, or Nextcloud only when Stella has
   none; and what an Immich-backed avatar sends.
6. **Which address book:** one household address book, or every member's own, each linked
   separately (a person in two books has two links).
