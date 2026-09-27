# Concept — Adding to Stella while it is out of reach

Status: **being built, moments first.** The decision is logged in `docs/04-architecture.md`
§4.9 (*Mutations become commands, not events*), the structure is docs/04 §4.11.2, and what a
member sees is docs/02 §2.18. This paper is the plan behind it. Built so far: the command
dispatcher and its receipts, `POST /api/commands`, and keeping a moment with its photos on
the phone. Everything decided while the maintainer was away is listed in §8, for review.

---

## 1. Why

Stella lives on the household's own network. The common way to be out of reach is not a
dead phone. It is a phone on mobile data, away from home. That is also exactly when there is
something to write down: you met Julia at the lake, and her brother is Marco. Today the
sentence has to wait until you are home, and by then it is gone. §2.22 exists so that capture
takes one sentence. Being away from home should not make it take a memory.

So the need is **adding**, not editing. Nobody needs to rename a person or retype a
relationship from a train. That split is what keeps this small.

---

## 2. Four ways to build it

| | **Commands + add-only outbox (chosen)** | Outbox bolted on to moments | Full offline sync | Event sourcing |
|---|---|---|---|---|
| What is true | the tables, as today | the tables | the tables, plus a copy on each device | the event log; tables are derived from it |
| What can be written offline | anything that **adds** | a moment | anything | anything |
| Conflicts | **none**: an addition never contradicts another | none | a merge rule per table, and a UI for "Lena changed this too" | the same as full sync: replaying an edit does not settle whose edit wins |
| Access rules (§2.10) | checked on arrival, in the one access layer | same | also on the device, and after revocations | same as full sync if events are made offline |
| Deleting means gone | yes | yes | yes, with tombstones | **no**: the log keeps what was deleted, unless every event is encrypted per person and the key thrown away |
| Size | a refactor done one route at a time, then an outbox about the size of §2.18 | about the size of §2.18 | a second application | a rewrite of every use-case, query, export and restore |

- **Moments-only outbox.** This was this paper's first version. It is not wrong, but it
  builds a one-off path for one kind of addition. Every later offline addition, such as a
  logged call, would need its own endpoint and its own idempotency.
- **Full offline sync.** Rejected. It puts a second authz path on the device. It needs a
  conflict UI in a family app that should never ask "which version wins?". And it overlaps
  the "real-time collaborative editing" that the roadmap lists as maybe-never.
- **Event sourcing.** Rejected, although it is the idea that led here:
  - **It breaks a promise Stella makes.** Deleting a person removes them (§2.2), and private
    stays private. An append-only log keeps every name and every private sentence ever
    written. Undoing that means per-person encryption keys, which is a project of its own.
  - **It does not remove the hard part of offline.** The hard part is not storing and
    replaying changes. It is deciding what an offline edit means when someone else changed
    or deleted the same person in the meantime. That rule is needed with or without events.
    Adding only is what removes it, and that works on plain tables.
- **What is kept from event sourcing is the part that helps:** every change becomes a
  named, serialisable, idempotent **command**.

---

## 3. The foundation: commands

A **command** is one intent from one member:

```ts
interface Command {
	id: string; // a ULID like every id (docs/03 §3.1), made where the command is issued
	type: 'moment.capture' | 'contact.add' | 'interaction.log' | …;
	payload: unknown; // validated per type at the edge
	issuedAt: number; // when the member did it, not when it arrived
}
```

- **One dispatcher** in `src/lib/server/domain/commands/` applies a command. It looks up the
  command's handler, which is today's use-case (`captureMoment`, `createContact`, …), and
  answers with a typed outcome: *applied*, *already applied*, or *refused* with a `Phrase`.
  Access is checked by the handler's reads, as today. The dispatcher adds no authz of its own.
- **Every command type declares its kind:** *add*, *change* or *remove*. Only *add* commands
  may be queued on a device (§4). The server enforces this, not only the client.
- **Idempotency lives in one place.** A `command_receipt` row (command id, member, outcome,
  time) is written in the same transaction as the command's effect. It is **kept for good**. A
  row holds no content, and a household makes a few thousand a year, so a phone that was
  offline for months still cannot send anything twice, and there is no clean-up job. A command id seen
  before answers with the stored outcome and changes nothing. This makes resending safe for
  every command at once. Before, it would have needed solving once per endpoint.
- **The tables stay the truth.** Receipts are never replayed, and nothing is derived from them.
  `activity_log` keeps its narrow job (docs/04 §4.9).
- **Form actions and `/api/v1` call the dispatcher.** This gives one path per change, whether
  it comes from a form, a script or the outbox. The migration goes route by route, and each
  route is its own small PR. `moment.capture` is the first command, because it is the first
  one the outbox needs.
- **Side effects of the refactor, not goals:** a uniform shape for the Undo window and one place
  to see every change a household makes.

---

## 4. The outbox: adding while out of reach

### 4.1 What can be added

**Everything that adds a row, from the first version:**
- a moment, with people created inline;
- a person;
- a logged call or visit (§2.6);
- a note;
- a relationship;
- a tag on a person;
- a person added to a circle.

Setting a field on someone who already exists is a *change*, even when the field was empty:
a birthday, a name, a photo as avatar. Answering a suggestion or the household review is
a change too. None of these are queued.

Every form that adds works on its cached page as it does online. A relationship is the
addition most likely to be refused on arrival, because its guardrails (§2.4) are checked
against the household as it is *then*. It is kept as *Could not send*, like anything else.

### 4.2 What a member sees

- **The composer works as usual.** On a phone, the *What happened?* sheet opens as it does
  online. The offline line above the page (§2.18) is already showing. The save button says
  **Save for later** instead of **Save**.
- **Mentions and pickers still work**, from the directory (§4.5). *Create "Name"* still works;
  the person is added before the moment is.
- **Photos, from the first version.** A photo is often why there is a moment at all. It is
  processed in the browser exactly as online: downscaled, location data stripped. The result
  is kept with the queued item in IndexedDB, under the same per-moment limit as online.
  - If the device refuses the storage, *Save for later* fails visibly and the text stays in
    the composer. Nothing is half-saved.
  - Photos are sent after the item's text is confirmed. A photo that fails to upload keeps
    only that photo waiting, not the moment.
- **Unsent items stay visible, where they will land.**
  - In the stream they sit at the top as *Not sent yet*: a dashed edge and a hollow dot.
    Tapping one opens it for editing.
  - On a person's page, an unsent note, tag or relationship shows the same way, in its own
    section.
  - *Could not send* uses the danger colour and says why. The shell's activity indicator (`src/lib/sync`) counts them. They look
  different from sent items, so nobody takes them for household knowledge that others can
  already see.
- **Sending is automatic.** It happens once Stella answers again: the service worker already
  reports reachability to the page (§2.18, `reachability.ts`), and opening the app triggers
  it too. Background Sync is not relied on, because Safari and Firefox do not have it.

### 4.3 Editing what has not been sent yet

Something written offline has been seen by nobody else, so changing it is private to the
device and cannot conflict.

- **Until it is sent, an item can be edited or discarded.** Editing replaces the queued
  command's payload. Nothing is queued on top of it.
- **The device therefore only ever sends additions.** If you add Vesna offline and then give her
  a birthday, the queue holds one `contact.add` with the birthday in it, never an add
  followed by a change. The server never sees an offline *change*, so it never has to judge
  one.
- **While an item is being sent, it is locked.** Otherwise an edit could land in the moment
  between the server storing the item and the device hearing so, and be lost. If the send
  fails for want of a connection, the item unlocks and is editable again.
- **Once the server confirms it, the item is household data.** It leaves the outbox. From
  then on it is edited online, like anything else. Offline it is read-only, like every
  cached page.

### 4.4 What can go wrong on arrival, and what happens then

Every command is checked again on arrival, with today's rules. It is never "trusted because it
was valid when written".

| On arrival | Result |
|---|---|
| everything still valid | applied, and removed from the outbox |
| a mentioned person was deleted, merged or made invisible to the author | **kept** as *Could not send*, with the reason; editable, resendable or discardable; never dropped silently |
| it refers to an item that could not be sent (a moment about an offline-added Vesna whose add was refused) | held as *Could not send* too, naming what it waits for |
| the session has expired (e.g. the OIDC session ended) | waits; sent after signing in again |
| the same command arrives twice (the connection dropped after the server applied it) | *already applied*, via its receipt (§3), however late |
| a relationship that the guardrails now refuse (e.g. someone else linked the two meanwhile) | *Could not send*, with the guardrail's reason |
| the anchor's journal already has an entry on that day, from any device | appended to it, never replaced, as for every moment (§2.22.1) |

The rule behind the table: **the outbox is the only copy of what the member wrote.** Nothing
leaves it until the server has confirmed it, or the member discards it.

**Order matters.** Items reference each other by their device-made ids, so a moment can name
a person added in the same offline stretch. The outbox sends in the order things were
written, and an item never goes before one it depends on.

### 4.5 The directory

For mentions and pickers to work offline, the device needs what they choose from. That is new
data at rest:
- **every person the member can see**: id, display name, avatar id, visibility;
- **the household's relationship types, tags and the circles the member can see**, by id and
  name.

It is fetched through the access layer like any other read. For a household of a few hundred
people it is tens of kilobytes; the cached pages already hold far more. It is refreshed whenever the
app is reachable. It is deleted on sign-out, as the cached pages are (§2.18). The same
bargain applies as for those pages, and it is written down the same way: no encryption; it
protects a device that is handed on, not one left signed in.

It is scoped per viewer. A private person another member created is never in it, just as they
are never in search.

### 4.6 Signing out with something unsent

Signing out deletes the device's cached pages (§2.18). The outbox must not be deleted
silently with them. The sign-out form therefore says *"2 items have not been sent yet"* and
offers:

- **Keep and sign out:** they wait, tied to that member, and are sent after the next sign-in by
  the same member.
- **Discard them.**

A different member signing in on the device never sees or sends someone else's outbox.

---

## 5. Where it lives (docs/08 §8.3)

- **`src/lib/server/domain/commands/`**: the command registry (type → kind + handler) and the
  dispatcher, pure over ports. It is tested first with the existing fakes.
- **`command_receipt`**: a new table and its repository, and a `docs/03` section when it is
  built.
- **`src/lib/pwa/outbox.ts`**: pure and tested first. It holds:
  - the item states: pending → sending → gone, or pending → sending → could-not-send;
  - folding an edit into a pending item;
  - the dependency order;
  - turning the server's outcome into one of the §4.4 rows.
- **`src/lib/pwa/outbox-store.ts`**: the IndexedDB adapter. It decides nothing.
- **One route**, `POST /api/commands`, that takes a batch of queued commands in order and
  answers one outcome each. It accepts only *add* commands. It is deliberately not "replay
  every failed POST": that design looks cheap and is not, because it would replay deletes,
  sign-outs and imports, possibly days later.
- **The directory** is one scoped read and one cached JSON response. The cache policy
  (`cache-policy.ts`) gains a rule for it, and the sign-out purge gains the outbox check.
  For moments it is not needed yet: the cached Home page already carries the composer's
  candidate list, which is exactly the people a moment may mention.

---

## 6. Decided with the maintainer

1. **What can be added offline:** everything that adds a row, from the first version (§4.1).
   The recommendation was moments only, to begin with. It was set wider, at the cost of an
   offline path in every adding form.
2. **Receipts:** kept for good (§3).
3. **Directory:** every person the member can see, plus types, tags and circles (§4.5).
4. **Photos:** from the first version (§4.2). The recommendation was a second step.
5. **Looks:** unsent items sit where they will land, marked as drafts (§4.2). The sketch goes
   into docs/05 with the outbox PR.
6. **Same-day moments** used to replace each other, online too. Since #154 a second one is
   appended (§2.22.1).

Still open: whether an archive (§2.15) should carry the receipts. Without them, a phone that
has not sent yet could send twice to a household restored onto a new server. This is rare
enough to decide when the receipt table is built.

---

## 7. Complexity, honestly

- **The command layer**:
  - **A refactor, not a rewrite.** Use-cases stay as they are. Each route moves behind the
    dispatcher on its own, and the app works at every step in between.
  - **Size:** the dispatcher, one table and one route. The bulk is the mechanical migration,
    about one small PR per area.
- **The outbox**:
  - **Larger than §2.18, because of the scope decided in §6.** The core is still one pure
    module, one IndexedDB adapter, one endpoint and a scoped directory read. On top of that:
    - every adding form (about seven) gets an offline path and a draft state on its page;
    - photos are stored and sent;
    - relationships can be refused on arrival.
  - **The cheap way to build it:** moments first, end to end, then one form per PR. The scope
    stays what was decided; only the order is chosen.
  - **Editing unsent items adds a little.** It needs folding an edit into a pending item and
    the send-time lock. It needs no conflict rule, because nothing that others have seen is
    ever changed offline.
- **Architecture unchanged.** The server stays the only authority, and access is still
  checked in one place.
- **Real new cost:**
  - Household data held on the device outside the page cache: the directory and the outbox.
  - A test surface that is hard to drive without races: offline, then online, then a send.
    That needs the same deterministic seams as the reachability banner.

---

## 8. Decided while the maintainer was away — to review

The maintainer asked for the build to go ahead on these recommendations and for every choice to
be written down, to go through together later. Each line says what was chosen and why; the
ones marked **(deviates)** differ from something said earlier and need a yes or no.

**Server**

1. **Receipts travel in the archive.** The archive test demands every table be exported or
   excluded with a reason. Exported, a household restored onto a new server still recognises
   what an unsent phone already delivered. This settles the one question §6 left open.
2. **Command ids are ULIDs (deviates).** §3 first said UUIDv7; every other id in Stella is a
   ULID (docs/03 §3.1), and the `ulid` package already runs in the browser. Same properties
   (sortable, made anywhere), one format.
3. **A claim pending for over a minute is taken over.** A run that stopped between claiming
   and finishing would otherwise block its command for ever. The cost is a possible duplicate
   after a crash, preferred to something presumed saved and never written.
4. **A refusal releases the claim; our own error answers `failed`.** A refusal (a domain
   error with a message, e.g. "mention at least one person") lets the corrected command be
   sent again. Anything else is ours: the phone keeps the command and tries again later, and
   the server logs it. So every domain check a kept command can meet must throw a
   `TranslatableError` — a plain `Error` would be retried for ever (see 9).
5. **`POST /api/commands` takes up to 50 commands, reads only `application/json`,** and is
   signed in by the session cookie like any page. JSON cannot be posted cross-site without a
   CORS preflight, so it needs no form token; a `text/plain` post that looks like JSON is
   refused with 415. Photos go to `POST /api/commands/photo` as multipart instead.
6. **Photos are commands of their own** (`moment.photo`, naming their moment), sent after the
   moment has arrived. The online form action attaches photos through the same command, so a
   save whose answer was lost resends the very same photos without doubling any. A photo whose
   entry was deleted meanwhile is refused (*Could not send a photo*). No size cap beyond the
   existing per-photo limits (§6.4).
7. **Every form that adds now saves as a command, online too** — Home's composer, a person's
   note, call, tag, circle and relationship forms, and *Add person*. One path whether it comes
   from a form, a phone or a script; the price is that these actions now go through the
   dispatcher even when nothing is offline.
8. **The person page's checks moved into the domain.** Notes (`writeNote`), calls
   (`logInteractionChecked`) and relationships (`addRelationshipChecked`) each got one
   use-case holding what the route used to check, and tags and circles a shared guard
   (`onVisibleContact`). Visible change: adding something to a person who is no longer
   visible now answers with an inline error instead of a 404 page.
9. **Every refusal reads as a sentence.** Where an addition could fail with a plain error — a
   relationship type deleted meanwhile, say — the checked use-case now refuses with a message,
   because a kept command would otherwise be retried for ever.

**Phone**

10. **Online saves stay on the form actions (deviates, slightly).** A form does not route
    every save through the outbox. With JavaScript it posts to the same action as before,
    carrying a `commandId`, and the outbox is used only when Stella is known to be out of
    reach or the answer to a save is lost. Inline errors and the *"Link Julia and Marco?"*
    hint keep working. The visible difference: saving no longer reloads the whole page.
11. **Two forms stopped posting natively (deviates from older comments).** The call log posted
    natively so the story timeline got a fresh page; the timeline is now keyed on the page's
    story instead. *Add person* posted natively too. Both now save through `enhance` like the
    other sections — which is what lets them keep something offline.
12. **When sending is tried:** app opened, Stella reported reachable, tab back in view, the
    phone joining a network (`online` event), and right after saving. No timer — the same
    reason the reachability banner does not poll.
13. **The outbox is one IndexedDB record,** changed in one transaction at a time, so two open
    tabs cannot overwrite each other's items. Not encrypted, like the cached pages (§4.5).
14. **Kept items show where they will land.** A moment under the capture field (not at the
    top of the stream — **deviates from §6.5**: on a phone the rail can sit above the stream
    and pushed them out of sight); a note, call or relationship at the top of its section on
    the person's page; a tag or circle as a dashed chip beside the real ones; a new person as a
    notice on *Add person*. Home lists every kept item, whoever it is about, with the name
    stored when it was kept (`about`), since nothing can be looked up offline.
15. **Editing:** moments, notes and calls reopen in their own form, which then saves into the
    kept copy. **Tags, circles and relationships offer *Discard* only (deviates from
    "editable until sent")** — a word or a link is quicker entered again than edited. A moment
    Stella already has, with only photos waiting, can no longer be edited, only discarded.
16. **Discarding asks twice, inline** (*This device holds the only copy.* → *Discard for
    good*), rather than an undo toast — there is no server copy for an undo to fall back on.
    Chips discard in one click: what is lost is one word.
17. **A kept moment shows its text as typed** (`@LenaBrunner`), not with names resolved, a photo
    *count* rather than thumbnails, and a moment sent later offers no *"Link …?"* hint.
18. **The phone's composer sheet opens without a round trip** (SvelteKit shallow routing), so
    the pencil works offline. From another page it still links to `/?compose`; the service
    worker answers that offline with the kept Home page (`standInFor`).
19. **The composer's default day is the device's own date** when it is later than the day the
    cached page was rendered with — a page kept since yesterday would otherwise date today's
    moment yesterday.
20. **A person kept offline gets no page and no relative link.** *Add person* announces them as
    kept and empties itself; the duplicate check's *link as relative* needs Stella and is not
    carried over.
21. **Signing out asks, inline** under the button: *Keep and sign out* / *Discard and sign
    out* / *Cancel*, as §4.6 planned, only when something is waiting.

**Scope and tests**

22. **Every addition is built:** moments (with photos), notes, calls and visits, tags, circles,
    relationships and a new person. Ordering between queued items is not needed: a note or a
    link can only be added on a person's page, and a person kept offline has no page until
    Stella has them.
23. **The Playwright e2e is not written** — it waits for the maintainer's check in the app, as
    always. Every flow was tried in the browser with throwaway specs (not committed), and the
    full existing suite passes. The e2e suite blocks service workers (a Chromium crash, see
    `playwright.config.ts`), so the worker's part is covered by unit tests of the pure policy
    and by trying it on a phone.

**Found on the way**

24. **A picker bug the old full-page reload hid:** after saving, SvelteKit returns focus to the
    page, and the composer's pending "close the picker" timer then closed it under whoever was
    already typing the next moment. The timer is now cancelled when the field is used again.
25. **A flaky e2e on `main`:** `graph-role-groups.spec.ts` › *tucks the links within a group
    away when that switch is off* failed once in a full run and passed twice on its own. It
    touches nothing this work changed; it breaks the no-race rule and deserves its own look.
