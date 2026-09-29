# Concept — Reading Stella while it is out of reach

Status: **built** (§7). Its companion is `offline-capture.md`, which covers adding.
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
- For every person in the layout's `people` list (the People directory; archived people are
  not in it): `/contacts/<id>` and `/contacts/<id>/journal`, as page data (`__data.json`),
  which is what a tap inside the app fetches. Not as whole documents: a person's address
  opened directly while out of reach (typed, or a link from outside the app) shows the offline
  page unless that page itself was read before. The app starts at Home, so every person is
  one tap away.
- Avatars, as they are small. Gallery and moment photos are **not** fetched ahead, only kept
  when seen, as today. They are the bulk of the bytes and the least needed on a train.

### 4.2 When it is refreshed

Refetching a few hundred pages on every app start costs data on a phone. So each page is
asked for with the tag of the copy held, and an unchanged one costs a bodiless `304`:
- **`GET /api/offline/people`** returns who the member can see now, with their avatar ids,
  through the same use-case as the People directory. A few kilobytes.
- **Every page's data carries an `ETag`**: a hash of exactly what this member was sent. The
  worker asks each kept person page with `If-None-Match`; only a changed page comes back in
  full. One request at a time, in the background, while Stella answers, at most every five
  minutes (`REFRESH_INTERVAL_MS`).
- **Why a content tag and not a change stamp** (decided 2026-09-30, replacing the stamp this
  section first proposed): a person page is made of much more than the person's own rows.
  Worked-out kinship, the map two steps out, relatives' names and mentions in other people's
  entries all come from the household. On the rows themselves, deletes leave nothing behind,
  and tags, mentions and photo edits carry no timestamp. A stamp would have been wrong in
  exactly the cases that matter. The tag compares what the member actually sees, so it cannot
  drift from the page. It costs the server a render per person per refresh: a median of 6 ms
  per page in the demo household.
- **No version order is needed.** The device never holds a newer page than the server, since
  nothing that exists is edited offline, so "different" always means "take the server's". The
  one race is on the device: a refresh and a page opened at the same moment. There the
  answer's `Date` decides, and a copy is never replaced by an older one (`isNewerCopy`).
- **A `304` re-dates the copy**: it was just confirmed current, so the offline line (§4.4)
  says when the knowledge is from, not when the bytes first arrived.

### 4.3 Pruning

After each refresh, every kept page for a person **not** in the current list is deleted:
deleted, merged, made private by another member, or an archive import that changed ids.
Without this, a person who was taken away would stay readable on a phone. That is the one
real new risk here (§2, point 5). Every form a page was kept in goes: the document, its data
and the journal beneath it (`keysToPrune`). A person archived since leaves too, and is
readable again once opened in reach. Nothing is pruned on an answer that is not a list, which
would otherwise empty the device. Photos stay as they are kept today, when seen: a pruned
person's avatar may remain in the cache, reachable from no page.

### 4.4 Saying how old it is

The offline line (§2.18) gains the time the showing page was fetched. The service worker
already stores each response; the time comes from its `Date` header. Old copies are
normal and fine, but they must never look current.

The line must also appear without a tap. The worker only learns that Stella is out of reach
when a request fails, and a page left open makes none, so the page asks the worker to check
`/healthz` when the device goes offline or online and when the app comes back into view. A
device that reports itself offline is believed at once (flight mode can hang a request rather
than fail it); one that reports itself online is checked, since online is not in reach. There
is no timer: the connection dropping *while the app stays open on a network that cannot
reach Stella* is still noticed only on the next tap.

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
      update. **Built:** the worker tracks, per window, when the page on screen was kept and
      sends it with the reachability report (`keptAt`); `src/lib/pwa/copy-age.ts` words it.
   2. Keep every person page and journal ahead, with the refresh (§4.2) and the prune (§4.3).
      **Built:** `src/lib/pwa/people-ahead.ts` plans, `src/lib/server/http/etag.ts` tags,
      `GET /api/offline/people` lists, and the worker runs it.

**Measured before step 2** (demo household, 25 people): a person page's data is 23 KB on
average (32 KB at most), a journal's 5 KB. That is about 28 KB a person, so 500 people come to
about 14 MB, under the ~20 MB where a limit would start. So there is no limit. A whole page as
a document would be about 100 KB, which is one more reason to keep the data only. A full
refresh of the demo household takes about a quarter of a second.
