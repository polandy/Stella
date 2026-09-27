# Concept — Capturing while Stella is out of reach

Status: **concept only**. Nothing decided, nothing built. This paper asks whether Stella should
let a member *write* while it cannot be reached and send it once it can, and what the smallest
honest version of that would be. It extends `docs/02-features.md` §2.18, which today rules
offline writing out of scope for v1: *"offline Stella is something you read, not something you
add to."*

---

## 1. Why

Stella lives on the household's own network. The common way to be out of reach is not a
dead phone. It is a phone on mobile data, away from home. That is also exactly when there is
something to write down: you met Julia at the lake, and her brother is Marco. Today the
sentence has to wait until you are home, and by then it is gone. §2.22 exists so that capture
takes one sentence. Being away from home should not make it take a memory.

So the need is **capture**, not editing. Nobody needs to rename a person or retype a
relationship from a train. That split is what keeps this small.

---

## 2. Two ways to build it

| | **A. Offline outbox (proposed)** | **B. Full offline sync** |
|---|---|---|
| What can be written offline | a new **moment** (§2.22.1), including people created inline | anything: edits, deletes, relationships, circles, … |
| Conflicts | **none**: writes only add, and two additions never contradict | every table needs a merge rule; there must be a UI for "Lena changed this too" |
| Data on the device | the pages already cached, plus a small **directory** of the people you may mention | a local copy of the household database, kept in step |
| Server side | one idempotent capture endpoint | a sync protocol, change tracking or version vectors, tombstones for deletes |
| Access rules (§2.10) | checked again on the server when the moment arrives, as today | have to hold on the device as well, and after revocations |
| Rough size | about the size of §2.18 itself | a second application; plausibly more than everything shipped so far |

**B is rejected.** It breaks the rule that the central access layer is the only authz path.
A local database has to decide on its own what a member may see. It also needs a conflict UI
in a family app that should never ask "which version wins?". And it overlaps the "real-time
collaborative editing" that the roadmap already lists as maybe-never. The rest of this paper
is A.

---

## 3. The offline outbox

### 3.1 What a member sees

- **The composer works as usual.** On a phone, the *What happened?* sheet opens as it does
  online. The offline line above the page (§2.18) is already showing. The save button says
  **Save for later** instead of **Save**.
- **Mentions still autocomplete**, from the directory (§3.3). *Create "Name"* still works;
  the new person is created when the moment is sent.
- **Photos: not in the first version.** A downscaled photo is hundreds of kilobytes per
  item, and a failed replay would have to keep it too. It could be added later without
  changing anything else here.
- **Saved moments stay visible.** They show at the top of the stream as *Not sent yet*,
  marked like a draft. The shell's activity indicator (`src/lib/sync`) counts them. They
  look different from sent items, so nobody takes them for household knowledge that others
  can already see.
- **Sending is automatic.** It happens once Stella answers again: the service worker already
  reports reachability to the page (§2.18, `reachability.ts`), and opening the app triggers
  it too. Background Sync is not relied on, because Safari and Firefox do not have it; it
  could be used where it exists as a bonus.

### 3.2 What can go wrong on arrival, and what happens then

Every moment is checked again on arrival, with today's rules. It is never "trusted because it
was valid when written".

| On arrival | Result |
|---|---|
| everything still valid | stored as a normal moment and removed from the outbox |
| a mentioned person was deleted, merged or made invisible to the author | **kept in the outbox** as *Could not send*, with the reason and the text to copy; never dropped silently |
| the session has expired (e.g. the OIDC session ended) | waits; it is sent after signing in again |
| the same moment arrives twice (connection lost after the server saved it) | the second copy is a no-op, via the client-generated id (§3.4) |
| the anchor's journal already has an entry on that day, from any device | **appended** to it, never replaced (§3.5) |

The rule behind the table: **the outbox is the only copy of what the member wrote.** Nothing
leaves it until the server has confirmed it stored the moment, or the member discards it.

### 3.3 The directory

For mentions to work offline, the device needs the names it may mention. That is new data
at rest: a compact list (id, display name, avatar id, visibility) of the people the member
can see, fetched through the access layer like any other read. It is refreshed whenever the
app is reachable. It is deleted on sign-out, as the cached pages are (§2.18). The same
bargain applies as for those pages, and it is written down the same way: no encryption; it
protects a device that is handed on, not one left signed in.

It is scoped per viewer. A private person another member created is never in it, just as they
are never in search.

### 3.4 Idempotency

A moment gets its id **on the device** (UUIDv7, matching docs/03 §IDs) and is sent with it.
A person created inline gets one too. The capture endpoint treats a known id as "already
done" and answers as if it had just stored it. This is what makes resending safe. It is also
the only part of the design that needs a server change that is not an endpoint.

### 3.5 The same-day slot must append, not replace

A journal entry is unique per (contact, author, day, visibility), and saving into an occupied
slot **replaces the body** (`saveJournalEntry`, docs/02 §2.20). Offline this would destroy
data. Suppose you write a moment about Julia on the train and another one at home that
evening, on the laptop. When the phone reconnects, it replaces the evening entry with the
morning one.

So an arriving moment has to **append** to the existing entry, for example separated by a
rule, as a second paragraph. The same question already exists online, for two moments about
the same person on the same day. It should be answered once for both, before this feature.
It is listed as an open question below.

### 3.6 Signing out with something unsent

Signing out deletes the device's cached pages (§2.18). The outbox must not be deleted
silently with them. The sign-out form therefore says *"2 moments have not been sent yet"*
and offers **Keep and sign out** (they wait, tied to that member, and are sent after the
next sign-in by the same member) or **Discard them**. A different member signing in on the
device never sees or sends someone else's outbox.

---

## 4. Where it lives (docs/08 §8.3)

- **`src/lib/pwa/outbox.ts`**: pure and tested first. The outbox's states (pending →
  sending → sent | failed) and when each item may be resent. It also turns the server's
  answer into one of the §3.2 outcomes.
- **`src/lib/pwa/outbox-store.ts`**: the IndexedDB adapter. It decides nothing.
- **`src/lib/server/domain/moments`**: capture learns the client-supplied id (idempotency)
  and appending into an occupied slot. Both are domain rules, unit-tested with the existing
  fakes.
- **One route**, e.g. `POST /api/moments`, that takes a moment as JSON and answers with a
  typed outcome. It stays separate from the form action, because the service worker must
  not replay arbitrary form POSTs. A generic "queue every failed POST" is the design that
  looks cheap and is not: it would replay deletes, sign-outs and imports, possibly days
  later.
- **The directory** is one scoped read and one cached JSON response. The cache policy
  (`cache-policy.ts`) gains a rule for it, and the sign-out purge gains the outbox check.

---

## 5. Open questions

1. **Append format** for a second moment in the same day slot, online and offline (§3.5).
   It blocks both.
2. **Directory size.** Is a list of every visible person acceptable at rest on a phone, or
   only the people the member has recently opened? The full list makes mentions work; the
   short list leaks less.
3. **Photos** in a second step (§3.1): with a size cap, or not at all?
4. **What "Not sent yet" looks like** in the stream on a phone. This needs a sketch in
   docs/05 before it is built.

---

## 6. Complexity, honestly

- **A (this paper)**:
  - **About the size of §2.18.** One pure module, one IndexedDB adapter, one endpoint, a
    domain change in capture, a scoped directory read, and three UI states: *Save for
    later*, *Not sent yet* and *Could not send*.
  - **Architecture unchanged.** The server stays the only authority, and access is still
    checked in one place.
  - **Real new cost**: household data held on the device outside the page cache (the
    directory and the outbox), and a test surface that is hard to drive without races:
    offline, then online, then a replay. That needs the same deterministic seams as the
    reachability banner.
- **B**:
  - **A second application.** It changes the architecture's central promise, and is not
    recommended.
