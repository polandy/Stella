# Concept — Photos of a circle, by role

Status: **concept agreed, mockup next, not built.** Decided with the maintainer on 2026-10-02
(§7).

---

## 1. Why

A circle is a group of people over a period of time: a class, a team, a course. The photo
that best says who these people are is usually a **group photo**, such as the class photo, the
team on the pitch, or the teachers at the summer party. Today a circle has no pictures at all,
so the faces stay scattered over individual galleries.

Many circles hold several groups, and the circle page already lists its members **by role**
(*Student · 18*, *Teacher · 2*, docs/02 §2.4.2). A photo that carries the same role can sit
right above the group it shows, so the page reads: *these are the students*, followed by the
students.

---

## 2. What a circle photo is

- A circle has a **gallery** of any number of photos. Nothing is replaced. The class photo
  of every school year stays, each dated by the day it was added.
- Each photo optionally carries **one role** of that circle. *No role* means the photo shows
  the circle as a whole.
- The role is **picked from the roles the circle already uses**, plus *No role*. It cannot be
  typed freely, so a photo always lands on a real group and a typo never makes a group that
  only exists on a photo. Roles that differ only in case are one role, by the same folding
  rule the members list uses.
- A circle photo is a photo like a person's (docs/02 §2.14). It is processed in the browser
  (EXIF and GPS never leave the device), it is **shared or private**, it can be captioned,
  and it can be **pinned as a favourite**. It belongs to exactly one circle and to nobody's
  gallery.

---

## 3. Where it shows

### 3.1 The circle page

- **Cover.** The circle's cover is its *cover photo*: the photo **without a role** that is
  pinned as a favourite most recently, otherwise the newest without a role. It sits at the
  top of the page as a wide strip, filled from the centre with no cropping step: about 3:1
  on a phone, flatter on a wide screen. A circle without such a photo looks as it does
  today.
- **Role banners.** Above each role group in the members list sits that role's *lead photo*,
  chosen by the same rule (favourite first, otherwise newest), in the same strip format.
  A group whose role has no photo looks as it does today. *No role* never gets a banner,
  because its photos are the cover.
- A tap on the cover or a banner opens the **lightbox** on that photo, walking only the photos
  of the same role (or of *No role*).
- **Photos section.** Below the members is a *Photos* section. It shows a square grid,
  favourites first, then newest first, each tile with its date, a role label and a lock when
  private. **Role chips** (*All*, one per role present, with counts) filter the grid, and only
  appear when there is more than one to choose between. *Add photos* takes several files at
  once; the upload form asks for the role (preset to the active chip) and *shared or private*.
  An empty section offers *Add photos* and nothing else.
- **Lightbox.** Shows the picture, its date and caption, the role (changeable), *Pin as
  favourite* / *Unpin favourite*, shared/private and *Remove*. Keyboard behaviour is the
  person gallery's (Escape, arrow keys, focus back to the tile).

### 3.2 The Circles overview

A card whose circle has a cover photo carries it as a **flat strip on top**, above name, kind,
member count and faces. Cards without a cover stay as they are.

### 3.3 The household feed

A new circle photo appears in *What's new* (docs/02 §2.11): *Anna added a photo to Class 1B*,
with its thumbnail, linking to the circle. A private photo is in the uploader's feed only. As
with every feed entry, only additions are listed, never changes.

---

## 4. Rules at the edges

- **A role that loses all its members** (everyone re-roled, removed, or left): the photo
  **keeps its role**. It stays in the gallery with its role label and is reachable through
  that role's chip. Its banner has no group to stand above, so it is not shown. When the
  role comes back, the banner does too. Matching ignores case.
- **The role of a photo with no members** can still be changed in the lightbox. The picker
  offers the circle's current roles and the photo's own role, so nothing is lost by opening
  it.
- **Who may do what.** Shared/private and *Remove* are for the photo's uploader. Caption,
  role and favourite describe and organise the household's view of the circle, so **anyone
  who can see the photo** may change them. This differs from the person gallery, where the
  caption is the uploader's (docs/02 §2.14).
- **Visibility.** A circle photo is visible when its circle is visible and the photo is
  (shared, or private and the actor's own). This goes through the access layer like every
  other record (docs/03 §3.7). A private circle's photos are private with it.
- **Deleting a circle** deletes its photos and both stored files of each. **Archiving** a
  circle keeps them.
- **Nesting.** A parent circle does not show its children's photos: a school's cover is the
  school's, not the newest class photo.

---

## 5. Offline and portability

- **Offline.** Adding circle photos is queued exactly like a person's gallery photos
  (docs/concepts/offline-capture.md §4): a photo taken without network is kept on the device
  and sent once it is back, at most once. Changing role, pin or visibility is a change, not
  an addition, so it is not queued, as with pins today.
- **Archive.** The export carries circle photos with their circle, role, caption, pin and
  visibility. A restore that refuses a circle refuses its photos.

---

## 6. Shape of the change (for implementation)

- **Data.** Two nullable columns on `photo`: `circle_id` (the circle the photo belongs to; the
  repository removes the photo with its circle, like `journal_entry_id`) and `circle_role`
  (text, the role as picked). A photo has at most one owner: contact, journal entry or
  circle.
- **Pure logic, test-first** (`src/lib/server/domain/media/` or `…/circles/`): choosing the
  cover and each role's lead photo, grid order (reusing `gallery-order.ts`), role-chip counts,
  and the role options for the picker (current roles plus the photo's own role, folded by
  case).
- **Domain use-cases** with `deps` (repository, clock, idGenerator): add, set role, pin/unpin,
  caption, re-scope, remove. They reuse the gallery upload path for storage.
- **UI.** The circle page gets the cover, role banners and the Photos section, reusing the
  lightbox and the upload processing from the person gallery. The overview card gets the
  strip. All copy is in English and German.
- **Docs.** docs/02 §2.4.2 and §2.14, docs/03 §photo, docs/05 (cards, circle page),
  `using-stella.md`.

---

## 7. Decisions (2026-10-02)

| # | Question | Decision |
|---|---|---|
| 1 | How many photos per circle? | A gallery, any number |
| 2 | Where does a photo with a role show? | As a banner above that role's group |
| 3 | And a photo without a role? | It is the circle's cover (page and overview card) |
| 4 | How is the role chosen? | Only from the circle's existing roles, or *No role* |
| 5 | Which photo leads when there are several? | The favourite, otherwise the newest |
| 6 | A role with no members left? | The photo keeps its role, and its banner returns with the role |
| 7 | Where is the full gallery? | A *Photos* section on the circle page, filterable by role |
| 8 | How is the strip cropped? | Automatically, from the centre; the lightbox shows the whole photo |
| 9 | Offline? | Queued, like person gallery photos |
| 10 | Household feed? | Yes, with thumbnail |
| 11 | Overview card? | A flat strip on top, only when there is a cover |
| 12 | Who may edit? | Anyone who sees it: caption, role, favourite. The uploader: shared/private, remove |
| 13 | Nested circles? | A parent never shows its children's photos |
