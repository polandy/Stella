# Concept — Reading Stella while it is out of reach

Status: **decided, not built** (§7). Its companion is `offline-capture.md`, which covers adding.
Together they are the whole offline story: out of reach, a member can **look anyone up** and
**write down what happened**. Changing or deleting what already exists stays online
(docs/04 §4.9, *Mutations become commands, not events*). Nothing here reopens that decision.

---

## 1. Why

Today a page is readable offline only if it was read online since the last update (docs/02
§2.18). That is a read-through cache, and it is fine for re-reading. It fails exactly when
Stella is needed away from home:
- **You are about to meet someone.** You want to know what her children are called, and you
  have not opened her page in weeks.
- **An update came in last night.** Every update starts from an empty cache, so on the train
  the next morning almost nothing is there. Only Settings is kept ahead.
- **What is there can be old.** A page cached a month ago shows a month-old person, and
  nothing says so.

Adding already works offline. Without reading it is half an app: you can write a note about
someone, but you cannot look up who they were.

---

## 2. What "readable offline" should mean

1. **Every person the member can see has a readable page**, whether it was opened or not:
   the person page and their journal.
2. **The places you start from are there:** Home, People, Circles and Settings.
3. **Lists and pickers are complete**, including the second line that tells namesakes apart
   (docs/02 §2.2.3). ⌘K already is: the app layout carries every visible person with those fields, and
   so does every cached page.
4. **Current as of the last time Stella was in reach, and it says so.** The offline line says
   how old the copy is (*"From this device, as of yesterday 18:04"*).
5. **Nothing that has stopped being visible stays readable.** A person deleted, merged or made
   private by someone else since must leave the device when it next reaches Stella.

**Not in scope:**
- Editing or deleting (see above).
- Full-text search and the graph page. The search page is a question (`?q=`) and is not kept
  (§2.18); ⌘K covers finding a person by name. The graph is a view over everything and would
  need its own offline data.
- Other members' private data. It never reaches the device, because every page is read
  through the access layer, as online.

---

## 3. Three ways to build it

| | **Keep the pages ahead (recommended)** | Directory + pages drawn on the device | Full local copy |
|---|---|---|---|
| What is stored | the same cached pages as today, fetched before they are read | a JSON directory, plus a second renderer for person pages | a database on the device |
| Rendering | the one SvelteKit page, as online | twice: server and device, kept in step by hand | twice |
| Access rules (§2.10) | as online: the server renders each page for this member | as online for the directory | also on the device |
| Staleness | per page, refreshed when in reach | per directory refresh | sync rules |
| Size | a refresh loop in the service worker, plus a prune | a second UI for every person section | a second application (rejected, docs/04 §4.9) |

- **Keep the pages ahead.** This extends what §2.18 already does for Settings (`KEPT_AHEAD`)
  to every person. The page shown offline is the page the server rendered, so it cannot drift
  from the online one. The price is traffic: one request per person and page when refreshed
  (§4.2).
- **A device-side renderer** would make every future change to a person page a change in two
  places. That is the trap of offline sync without its name.
- **A full local copy** was already rejected.

---

## 4. Keeping the pages ahead

### 4.1 What is kept

- `/`, `/contacts`, `/circles`, `/settings`: as soon as the app opens in reach.
- For every person in the layout's `people` list: `/contacts/<id>` and
  `/contacts/<id>/journal`, as page data (`__data.json`). The page shell is the same for
  every person and is kept once.
- Avatars, as they are small. Gallery and moment photos are **not** fetched ahead, only kept
  when seen, as today. They are the bulk of the bytes and the least needed on a train.

### 4.2 When it is refreshed

Refetching a few hundred pages on every app start costs data on a phone and battery. So the
refresh asks first what changed:
- **One cheap request** returns, for each person the member can see, a stamp of the last change
  to anything on their page. The server computes it through the access layer. It is a list of
  `(id, stamp)` pairs, a few kilobytes.
- **Only people whose stamp moved are refetched**, one at a time, in the background, while
  Stella stays in reach. A page the member opens meanwhile goes first, as today.
- **The stamp is the hard part.** `contact.updated_at` alone is not enough: a note, a moment
  naming them, a new relationship, or a photo changes their page without touching the contact
  row. Option: the latest `updated_at` over the rows the page is made of, as one grouped
  query. It needs measuring against a demo household before step 2 (§7).

### 4.3 Pruning

After each refresh, every kept page for a person **not** in the current list is deleted:
deleted, merged, made private by another member, or an archive import that changed ids.
Without this, a person who was taken away would stay readable on a phone. That is the one
real new risk here (§2, point 5).

### 4.4 Saying how old it is

The offline line (§2.18) gains the time the showing page was fetched. The service worker
already stores each response; the time comes from its `Date` header. Old copies are
normal and fine, but they must never look current.

### 4.5 Signing out

Unchanged: every kept page is thrown away (§2.18). With pages kept ahead there is simply more to
throw away. The bargain written down in §2.18 still holds: no encryption; it protects a device that
is handed on, not one left signed in.

---

## 5. Where it lives (docs/08 §8.3)

- **`src/lib/pwa/cache-policy.ts`** (pure, tested first) gains the pages to keep ahead for a
  given people list, and the prune: kept paths against the current list.
- **A refresh planner**, pure: given the stamps held and the stamps fetched, which pages to
  fetch and which to drop.
- **`src/service-worker.ts`** stays the adapter: it runs the plan, one request at a time, and
  decides nothing.
- **One scoped read** on the server for the stamps, in `src/lib/server/access/` or behind it,
  and one route for it.

---

## 6. Complexity, honestly

- **Small in code, large in traffic.** A planner, a prune, a stamp query and a route. Hard to
  get right: the stamp, and not flooding a phone on mobile data.
- **Test surface:** the planner and the prune are pure. The worker's part is covered like
  §2.18 today, in `e2e/pwa-offline.spec.ts` with the worker running.
- **Real new cost:** much more household data at rest on each device, and one more request on
  each app start in reach.

---

## 7. Decided with the maintainer (2026-09-29)

1. **Pages:** the person page **and** their journal, for every person the member can see. The
   journal is often what is read before meeting someone ("what was it last time?").
2. **Photos:** avatars only. Gallery and moment photos stay kept when seen, as today.
3. **Network:** refresh on any network, but only what changed (§4.2). After the first run
   that is a few kilobytes. A Wi-Fi-only rule is not used: Safari and Firefox do not say which
   network the phone is on, so on an iPhone it would never refresh.
4. **Order of work:**
   1. Keep Home, People and Circles ahead, as Settings is (`KEPT_AHEAD`), and show how old the
      copy is in the offline line (§4.4). This is small and fixes the empty cache after an
      update.
   2. Keep every person page and journal ahead, with the stamps (§4.2) and the prune (§4.3).

**Still to measure before step 2:** how large a person's page data is in the demo household.
Proposal: no limit unless all people together come to well over ~20 MB; above that, people
from the last year first.
