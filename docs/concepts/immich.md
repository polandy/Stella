# Concept — A person's photos, from Immich

Status: **slices 1, 2 and 5 built** (*Connect + link*, *Glimpse*, *Use as photo*, docs/02 §2.24); slices 3–4 are not. The decisions taken with the maintainer on 2026-10-01 are
listed in §9; one point (phone deep links) waits for a test on the device. Facts about Immich
are taken from its OpenAPI spec at v3.2.4 (2026-09) and are cited in §10.

---

## 1. Why

The household's photos already live in Immich, and Immich already knows who is in them. Its
face recognition groups faces into *people*, and the family gives those people names.
Stella knows the same people from the other side: who they are, how they are related, what
happened. Today the two never meet. To see Julia's photos you leave Stella, open Immich, and
search for her again.

The goal is small. **Stella should know which Immich person a contact is, so it can show a
glimpse of their photos and take you to all of them in one tap.** Stella does not become a
photo app. Immich stays the place where photos are kept, browsed and shared.

---

## 2. What Immich allows (technical findings)

| Need | Immich API | Scope the key needs |
|---|---|---|
| Who the key belongs to | `GET /api/users/me` | `user.read` |
| Find a person by name | `GET /api/search/person?name=…` | `person.read` |
| List all named people (for matching) | `GET /api/people?page=&size=` (≤1000 per page) | `person.read` |
| A person's face | `GET /api/people/{id}/thumbnail` | `person.read` |
| How many photos | `GET /api/people/{id}/statistics` → `{assets}` | `person.statistics` |
| Their latest photos | `POST /api/search/metadata` with `filter.personIds.any`, `orderBy`, `size`, `cursor` (v3.2+) | `asset.read` |
| **Photos of A and B together** | same, with `filter.personIds.all: [A, B]` | `asset.read` |
| A photo's image | `GET /api/assets/{id}/thumbnail?size=thumbnail\|preview` | `asset.view` |
| Write a name or birthday back (later, §7) | `PUT /api/people` (bulk) | `person.update` |
| Version check (no auth) | `GET /api/server/version` | — |

Five facts shape the design:

1. **Faces belong to one Immich user.** A *person* in Immich has an owner, and partner
   sharing explicitly does not share people or face data. The household key (§9) therefore
   sees **one library**: the people named in it, and the photos in it. Photos that only exist
   in another member's library are out of reach, and a partner-shared photo is not searchable
   by the key owner's faces. (Immich 3.2 *cluster groups* and 3.3 *person sharing* may change
   this; both are new and opt-in, see §7.)
2. **The only credential is an API key.** Immich is an OIDC *client* only; it hands out no
   tokens to other apps. Keys can be **scoped** read-only.
3. **The browser cannot fetch Immich images directly.** An `<img>` cannot send the
   `x-api-key` header, and production Immich sends no CORS headers. Images go **through
   Stella's server**, which also keeps the key out of the browser.
4. **The API is stable within a major version.** Breaking changes only come with a new
   major. Stella uses the `filter`/`cursor` search form, which is v3.2+; it checks
   `GET /api/server/version` and says plainly when the server is older.
5. **Deep links.** The web app has stable paths: `/people/{id}`, `/people/{id}/photos/{asset}`,
   `/photos/{asset}`. They show the photos only to someone **logged into the key owner's
   account**; anyone else lands on Immich's sign-in or an empty page. Stella still gives the
   link to every member (§4.3), on purpose. The mobile apps open only
   `https://my.immich.app/people/{id}` (app link) or `immich://people?id=…`; a link to the
   household's own Immich domain stays in the browser.

---

## 3. Three ways to do it

| | A. Jump only | **B. Link + glimpse (chosen)** | C. Mirror into Stella |
|---|---|---|---|
| What Stella stores | a URL per contact | the Immich person id per contact | copies of the photos |
| On the person page | "Open in Immich" | a strip of their latest photos, a count, a small viewer | a full gallery |
| Calls to Immich | none | on view, through a proxy | a sync job |
| Who benefits | only the key owner (fact 5) | the whole household | the whole household |
| Size | an afternoon | a feature of the size of the cropper | a second photo system |

**A alone does not work for a household key**: the jump lands nowhere for everyone but the
key owner. **C is rejected**: it duplicates storage, needs a sync that knows about deletions,
and leaves Immich's control over the photos behind.

---

## 4. What a member sees (UX)

### 4.1 Setting it up, once

The admin sets `IMMICH_URL` and `IMMICH_API_KEY` (§6). The key is created in the admin's
Immich under *Account settings → API keys* with the read scopes of §2 and nothing else.

*Settings → Immich* shows every member the state in one line — "Connected to Andy's Immich ·
3.2.4" — or what is wrong ("The key cannot read people — it needs *person.read*"). For the
admin it also says, plainly, what the key means: **everyone in the household can see the
photos of the people linked from this library.** Without `IMMICH_URL` the feature does not
appear anywhere.

### 4.2 Matching people — the moment that has to feel good

*Settings → Immich → Find your people* is a review list in the style of the relationship
suggestions (docs/02 §2.4.1): one row per likely match, **the Immich face next to the Stella
avatar**, both names, the photo count. Any member can work through it; a link is household
data like a relationship.

- **Matching is by name**, done by a pure function: the full name equal after folding case
  and accents (`Müller` = `Mueller` = `muller`) is a *likely* match; a nickname or a first
  name alone is a *maybe*. Unnamed and hidden Immich people are skipped, and so are people
  already linked.
- A likely match has **Link** ready: one tap per row, or **Link all likely** at the top. A
  maybe asks, and two Immich people with the same name show both faces side by side.
- What is left unmatched is not a problem to solve. The list ends, and it can be run again
  after more faces are named in Immich.
- The face does the real work here: you recognise your aunt faster than you read her name.

### 4.3 On the person page

The Photos section gains a row **below** Stella's own gallery, for a linked contact:

- **"In Immich · 1,284 photos"**, then one horizontal strip of the latest 12 thumbnails,
  newest first. It is a glimpse, not a gallery: no grid, no paging beyond *Show more*.
- Tapping a thumbnail opens a **small viewer in Stella**, the existing lightbox at Immich's
  `preview` size, with left/right through the strip. It works for everyone, whatever their
  own Immich account.
- **Open in Immich** (on the heading and in the viewer) appears for **every member who sees
  the contact**, whenever Immich answered for that person. Stella compares no emails and does
  not wait for the connection check. The link opens Immich as it is: someone not signed into
  the key owner's account lands on Immich's sign-in or an empty page (fact 5). That is accepted
  on purpose, over hiding the link from everyone but the key owner (decision 2026-10-04).
- **"You and Julia"**: when the viewer's own contact (docs/02 §2.1.3) is linked too, a
  chip switches the strip to photos of both together (`personIds.all`). For a couple or a
  parent and child, *Together* also appears on the relationship row.
- **Use as photo** in the viewer is the one way Immich content enters Stella: the existing
  cropper (docs/02 §2.14) cuts a square from the preview, and it becomes an ordinary Stella
  photo. It is a deliberate copy by a person, never a sync.
- An unlinked contact shows only a quiet *Find in Immich* in the section's menu: a picker of
  Immich faces, searched by the contact's name. A linked one has *Unlink* there.

### 4.4 On the phone

Undecided until tested (§9.6). Until then, *Open in Immich* is the web link to the
household's own domain, which opens in the browser. Behind a forward-auth gateway, that link
passes the gateway's login first and then Immich's own sign-in. The key owner is usually
signed into both already. The test, on the Pixel 9 Pro, with the
app installed and without: `https://my.immich.app/people/{id}` and `immich://people?id=…`.

### 4.5 Loading and failure

- The strip reserves its height and shows placeholder tiles, so the page does not jump.
- Immich down, key revoked, person deleted in Immich: the strip disappears and one line says
  "Immich didn't answer" or "This person is no longer in Immich — unlink?". The rest of the
  page never waits for Immich: the strip loads after the page, not in its `load`.
- Offline (docs/concepts/offline-reading.md): the strip is not shown. Nothing from Immich is
  kept on the device: the proxy answers `Cache-Control: private, no-store`, and the service
  worker never keeps anything under `/media/immich` nor the strip's list (§9.10).

---

## 5. Privacy and visibility

The household chose shared over private here, in line with *shared by default*. What keeps
that safe:

- **The link follows the contact.** Whoever can see a contact sees its Immich strip; a
  private contact's link and photos are seen only by those who see the contact (docs/02
  §2.10). The link is checked in the access layer like any child record.
- **Only the photos of linked people, never the library.** The proxy does not take a bare
  asset id. Every image URL Stella hands out is **signed** (HMAC-SHA256 over the contact id,
  the Immich person id, the asset id, the size and an expiry a day out), and is issued only
  after the access layer has let the viewer see that contact. On every request the proxy checks
  the signature and its expiry, then — through the access layer — that the viewer still sees
  the contact, and that the contact is still linked to the person the photo was listed for.
  Guessing or reusing ids from elsewhere gets nothing, and an unlink ends every URL issued
  before it.
- **Faces go through the same proxy** (§9.10). The picker's faces are signed for the contact
  the picker was opened on, and served only while the viewer sees that contact.
- **Immich's own hiding is respected.** Only photos in the timeline are fetched: the search
  asks for `filter.visibility.eq = 'timeline'` (v3.2 form), so archived photos, the locked
  folder and hidden assets are never asked for, and the parser drops any that come back anyway,
  trashed ones too. Hidden people are never offered.
- **The key never reaches a browser**, is never logged, and lives only in the environment,
  like the OIDC client secret.
- Nothing from Immich is written into Stella except by *Use as photo*.

---

## 6. Architecture

Following the GitHub release feed, the existing outbound-call pattern
(`domain/release/feed.ts` → `release/github-feed.ts` → `services.ts`):

- **Config** (`config.ts`): `IMMICH_URL` (how the server reaches Immich, may be internal),
  `IMMICH_PUBLIC_URL` (what links point to; defaults to `IMMICH_URL`), `IMMICH_API_KEY`.
  Both URL and key, or neither; one without the other fails at start. docs/04's "no outbound
  calls except OIDC" line is updated, as the update check already broke it.
- **Reaching Immich.** `IMMICH_URL` should be Immich's **internal** address when the two
  containers share a network (e.g. `http://immich-server:2283`). The calls then skip the
  reverse proxy, TLS, and any rate limiting or forward-auth in front of the public name. A
  forward-auth gateway (Authelia and the like) in front of `IMMICH_PUBLIC_URL` does no harm,
  because only browsers follow that URL. If `IMMICH_URL` has to be the public name, its `/api`
  path must bypass the gateway. Otherwise a call carrying `x-api-key` is redirected to a
  login page.
- **Port** `ImmichGateway` in `src/lib/server/domain/immich/`, narrow: `owner`, `version`,
  `listPeople`, `searchPeople`, `person`, `personStatistics`, `personThumbnail`,
  `latestAssets(personId, limit, cursor)` (slice 4 widens it to several people and a mode) and
  `assetImage(assetId, size)`, plus **pure parsers** for every untrusted payload.
- **Pure** matching in `src/lib/immich/match.ts` (name folding, likely/maybe) and a pure
  link builder (web, and later app links) — both test-first.
- **Adapter** `src/lib/server/immich/http-gateway.ts`: injected `fetch`, a timeout, a capped
  body for JSON, 401/403/404 mapped to typed outcomes rather than throws.
- **Proxy route** `src/routes/media/immich/[token]/+server.ts`: signed-in member only,
  verifies the signature and expiry, the contact's visibility and its link, and sends the bytes
  back with `Cache-Control: private, no-store` (§9.10). Only ordinary image content types pass,
  never SVG. The token is `payload.mac`: the signed fields as base64url JSON, and an
  HMAC-SHA256 over them with `SESSION_SECRET` (`domain/immich/signed-media.ts`).
- **Strip route** `src/routes/(app)/contacts/[id]/immich/photos/+server.ts?cursor=`: a page of
  twelve, newest first, each photo with a signed `thumbnail` and `preview` URL. Fetched by the
  Photos card after the page, never in its `load`.
- **Data model** (docs/03): one table,
  `immich_link(contact_id pk fk → contact, immich_person_id, linked_by, linked_at)`. Deleted
  with the contact, carried through a merge (docs/02 §2.2; two links on a merge keep the
  survivor's), written to the activity log, and part of export and restore.
- **Tests**: unit tests on the pure parts and the use-cases with a fake gateway; the e2e
  server wires the same fake, so no e2e needs a real Immich.

---

## 7. Later, not now

- **Writing back** — Stella knows full names and birthdays Immich lacks; Immich shows ages
  on photos from them. One tap, *"Give Immich Julia's name and birthday"*, needs
  `person.update` on the key. It comes after reading has been lived with.
- **Suggesting people** from Immich faces that are named but not in Stella yet.
- **More than one library**: per-member keys, or Immich 3.3 person sharing, if photos in the
  other members' libraries turn out to be missed.

---

## 8. Slices

1. **Connect + link** — config, the status line, *Find in Immich* / *Unlink* on the person
   page, the count, and *Open in Immich* for every member.
2. **Glimpse** — the signed proxy, the strip and the viewer.
3. **Matching list** — the review of §4.2.
4. **Together** — the *You and Julia* chip and the relationship-row chip.
5. **Use as photo** from the viewer, and *From Immich* in the picture's chooser — built (docs/02
   §2.24.6, decisions §9.13–16).

Each slice is one PR with its UI, its docs (docs/02, docs/03, `using-stella.md`,
`install.md` for the variables) and its unit tests; e2e after sign-off.

---

## 9. Decisions (2026-10-01)

1. **One household key**, set by the admin in the environment — not a key per member.
2. **The key is the maintainer's own account**; the other members have their own Immich
   accounts. Hence the viewer inside Stella. *Open in Immich* is shown to every member all the
   same (revised 2026-10-04): it shows the photos only in the key owner's session, and the
   others land on Immich's sign-in or an empty page.
3. **Immich photos are shared with the household**, following the contact's visibility (§5).
4. **Any member can link** a contact to an Immich person, like any other household data.
5. **Immich 3.2 or newer.** Older servers get a clear message, and Stella keeps one code path.
6. **Phone deep links: test first** (§4.4), then choose between `my.immich.app` and
   `immich://`. Until then, the web link.
7. **No writing back in the first version** (§7).

Decided with the maintainer on 2026-10-04, while building slice 1:

8. **One Immich person is one contact.** A face already linked elsewhere is refused, naming the
   other person only to a member who may see them, and the picker greys such a face out with the
   same words. A merge keeps the survivor's link.
9. **The picker stays open to every member**, and so the face thumbnail route stays unsigned
   until slice 2 brings the signed proxy for photos (§5, docs/04 §4.9).

Decided while building slice 2 (2026-10-04):

10. **Faces move onto the signed proxy; the unsigned face route is gone.** One rule is easier to
    keep than a rule and an exception: Stella serves no image from Immich without a signature it
    issued, after the access layer let the viewer see a contact. The unsigned route took any
    Immich person id from any signed-in member, so it also served the faces of people hidden in
    Immich, which the picker never offers. Signing costs nothing the picker notices: its route
    already answers each face, and now adds the face's URL, signed for the contact the picker is
    for. The same proxy, the same checks, the same cache rule.
11. **Nothing from Immich is cached, not even privately.** The proxy answers `private,
    no-store` (§6 had planned `max-age=86400`): Immich may delete, archive or lock a photo away
    at any moment, the household chose to keep nothing of Immich on a device (§4.5), and a
    signed URL changes with every page anyway, so a cache would rarely be hit. A token works for
    a day, as §5 planned — long enough for a page left open, and the proxy re-checks the viewer
    and the link on every request regardless.
12. **The strip shows photos only**, no videos: the viewer is a photo viewer, and a video's
    still frame there would read as a photo. The count on the line stays Immich's own, videos
    included.

Decided while building slice 5 (2026-10-05):

13. **The browser cuts, the server checks.** The square is cut from the preview in the browser,
    through the cropper and the canvas re-encode every new picture takes (docs/02 §2.14), so the
    server keeps needing no image library and no metadata of the preview reaches it. The server
    takes the square only with the preview's signed token, for the person whose page it is, after
    the proxy's own checks (signature, expiry, the access layer, the link) — and asks Immich
    nothing then, so no asset id from a browser is ever fetched. It does not ask Immich again
    whether the face is in the photo: the token already says Stella listed that photo for that
    person.
14. **The date comes from Immich, signed.** When the strip is listed, the preview's token carries
    when Immich says the photo was taken (`localDateTime` as the camera's wall clock, else
    `fileCreatedAt` in UTC). *Use as photo* dates the copy by that, never by a date a browser
    sends or by what EXIF an Immich preview may or may not keep.
15. **It is the avatar path, not a framing.** The copy is a new photo the person wears, at 512 px
    like an uploaded avatar, and the previous one drops back into the gallery with the same toast.
    There is no framing to change later: the original is Immich's, and Stella keeps only the
    square that was chosen.

Decided with the maintainer on 2026-10-05, on reviewing slice 5:

16. **Immich in the picture's chooser too.** Tapping the person's picture offers Immich beside a
    file: with Immich configured the tap always opens the chooser (before, only when group photos
    existed), with *Choose a picture…*, the group photos as before, and *From Immich*. A linked
    person's section shows their latest Immich photos — the strip's signed list, the same tokens —
    and a pick goes through the cropper and the same *Use as photo* path. An unlinked person's
    section offers *Find in Immich*, the face picker; after linking, the photos appear. Without
    Immich the tap behaves exactly as before.

---

## 10. Sources

- Immich OpenAPI spec, v3.2.4: `open-api/immich-openapi-specs.json` in immich-app/immich
- Versioning policy: https://docs.immich.app/install/upgrading/
- Partner sharing (people not shared): https://docs.immich.app/features/partner-sharing
- Immich as OIDC client only: https://docs.immich.app/administration/oauth
- Scoped API keys: immich-app/immich PR #11824, UI PR #18179
- Mobile people deep link: immich-app/immich PR #25686; `mobile/lib/services/deep_link.service.dart`
- Proxying images filtered by person: https://github.com/damongolding/immich-kiosk
- The `<img>`-with-key trap in another CRM: https://github.com/kith-crm/kith/issues/41
