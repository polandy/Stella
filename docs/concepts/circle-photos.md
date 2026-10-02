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
- **Deleting a circle** deletes its photos and their stored files, after turning any profile
  pictures cut from them into the people's own photos (§5.4). **Archiving** a circle keeps them.
- **Nesting.** A parent circle does not show its children's photos: a school's cover is the
  school's, not the newest class photo.

---

## 5. A profile picture cut from a group photo

A class photo already holds everybody's face. Instead of hunting for a picture of each child,
the household can **cut each person's profile picture out of the group photo**.

### 5.1 Where it starts

- **From the lightbox** of a circle photo: *Use as profile picture for …* asks for the person,
  with the circle's members listed first (those in the photo's role ahead of the rest) and a
  search over everyone the actor can see. The cropper then opens on the full picture.
- **From the person page**: choosing a photo for someone offers, next to their own gallery,
  the photos of the circles they belong to. Picking one opens the same cropper. The offer
  appears only when at least one of their circles holds a photo the actor can see; otherwise
  choosing a photo looks as it does today.
- **One after another.** After a cut made from the lightbox, the dialog offers *Next person*,
  so a whole class gets its pictures in one sitting. People who already wear a cut of this
  photo are marked in the person list.

### 5.2 What is stored

- The profile picture is a **framing of the circle photo** (docs/03 §photo): the square
  chosen, rendered once, belonging to that person. Nothing is copied into the person's
  gallery, and the group photo stays one photo. A circle photo has at most **one framing per
  person**; choosing again for the same person replaces it.
- The framing is rendered at a size that stays sharp (1024 px rather than the avatar's 512),
  so it can later stand on its own as a photo (§5.4).
- **Changing the profile picture** keeps the old cut, as with any avatar today: the cut the
  person wore becomes **a photo of their own** in their gallery, dated like the group photo
  and marked *from Class 1B*. Everything someone ever wore as a profile picture is therefore
  in their gallery. Nothing is re-encoded: the framing row is turned into a gallery photo.
- Such a photo remembers the group photo it was **cut from** (a reference, no copy). The person's
  **Photos** tab shows a row *On group photos*: every circle photo the person was cut from,
  the one they wear now and earlier ones, each with its circle's name and a tap into the
  circle. A group photo that is gone, or that the viewer cannot see, is not listed.

### 5.3 Resolution

- **Circle photos are kept up to 4096 px** on their longest edge (person and journal photos
  stay at 1600 px). Processing stays in the browser, so EXIF and GPS are still dropped.
- Three variants are stored: the full picture, a 1600 px view and the thumbnail. The grid and
  the lightbox load the view and the thumbnail; only the cropper loads the full picture.
- The cropper's zoom limit follows the picture instead of the fixed 6×: it may zoom until the
  square is about 256 px of the original, so a face in a class photo can fill the frame
  without being blown up past its detail.

### 5.4 When the group photo goes away

- **Removing** a circle photo that is someone's profile picture asks first: *This photo is
  the profile picture of 4 people.* On confirmation, each person's framing becomes **a photo
  of their own**, in their gallery and still worn as their profile picture, and only then is
  the group photo removed. Nobody's picture disappears.
- **Making it private** asks the same, and does the same: the cuts become the people's own
  shared photos, and only the group photo turns private.
- Removing a whole circle does the same for all its photos (with one combined question).
- The framing already holds its rendered square, so turning it into a photo moves no bytes
  through an image library on the server.

---

## 6. Offline and portability

- **Offline.** Adding circle photos is queued exactly like a person's gallery photos
  (docs/concepts/offline-capture.md §4): a photo taken without network is kept on the device
  and sent once it is back, at most once. Changing role, pin or visibility is a change, not
  an addition, so it is not queued, as with pins today.
- **Archive.** The export carries circle photos with their circle, role, caption, pin and
  visibility, and each framing with its person and square. A restore that refuses a circle
  refuses its photos, and a framing whose photo is refused is refused with it.

---

## 7. Shape of the change (for implementation)

- **Data.** Two nullable columns on `photo`: `circle_id` (the circle the photo belongs to; the
  repository removes the photo with its circle, like `journal_entry_id`) and `circle_role`
  (text, the role as picked). A photo has at most one owner: contact, journal entry or
  circle.
- **Pure logic, test-first** (`src/lib/server/domain/media/` or `…/circles/`): choosing the
  cover and each role's lead photo, grid order (reusing `gallery-order.ts`), role-chip counts,
  and the role options for the picker (current roles plus the photo's own role, folded by
  case).
- **Group-photo profile pictures.** A framing may now belong to a circle photo, one per
  person (`framing_of` + `contact_id`). A third stored variant for circle photos: the 1600 px
  view beside the full picture (up to 4096 px) and the thumbnail. Pure, test-first: the
  cropper's zoom limit from the picture's size, and which framings a removal or a switch to
  private must turn into photos first. The turning itself is one transaction: the framing row
  becomes a gallery photo of its person (and stays their avatar when it was worn), then the
  group photo goes. The same turning runs when someone switches away from a cut. A
  nullable `cut_from` on `photo` remembers the group photo for the *On group photos* row.
- **Domain use-cases** with `deps` (repository, clock, idGenerator): add, set role, pin/unpin,
  caption, re-scope, remove, frame for a person. They reuse the gallery upload path for storage.
- **UI.** The circle page gets the cover, role banners and the Photos section, reusing the
  lightbox and the upload processing from the person gallery. The overview card gets the
  strip. All copy is in English and German.
- **Docs.** docs/02 §2.4.2 and §2.14, docs/03 §photo, docs/05 (cards, circle page),
  `using-stella.md`.

---

## 8. Decisions (2026-10-02)

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
| 14 | Profile picture from a group photo? | Yes: from the lightbox, and from the person page when one of their circles has photos |
| 15 | Several people from one photo? | Yes, one after another (*Next person*) |
| 16 | How is the cut stored? | As a framing of the circle photo (a reference, no copy) |
| 17 | The group photo is removed? | Warn, then each cut becomes the person's own photo and stays worn |
| 18 | The group photo turns private? | Warn, then the same as removing |
| 19 | Visible on the person page? | Yes: an *On group photos* row in the Photos tab |
| 21 | The person gets another profile picture? | The old cut becomes their own gallery photo, as avatars do today |
| 20 | Resolution? | Circle photos up to 4096 px; zoom limit follows the picture |
