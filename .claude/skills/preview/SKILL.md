---
name: preview
description: Run a local, demo-seeded production build of Stella so the owner can try a change in a real browser — from this machine or another device (tablet, phone) on the same network. Use when a change needs eyes in an actual browser rather than a test: native browser APIs, touch/drag gestures, PWA/fullscreen behaviour, or visual review before sign-off. Not for e2e (`bun run test:e2e`) and not for trialing a whole branch on the real family instance (`prod-trial`).
argument-hint: [--stop]
---

# Preview

A running instance with data already in it, for the owner to click around in — never make them
create a household first. Used for the manual-verification half of the delivery loop (`docs/08`
§8.4.1), and for anything the unit/e2e suites can't exercise because it depends on a real browser
(the native Fullscreen API, touch gestures, install/offline behaviour).

## Why a production build, not `bun run dev`

The dev server's HMR breaks when the browser opening it isn't on `localhost`: its client script
tries to reconnect a websocket against a host the other device can't reach, and the symptoms are
easy to mistake for an app bug — `TypeError: Importing a module script failed` in the console, a
page that silently reloads mid-interaction, a form POST that aborts with a 500 right as someone
submits it. A production build has no HMR, so none of that happens. Any code change needs a
rebuild and a restart; there is no watch mode here.

## Run it

```
.claude/skills/preview/preview.sh
```

Builds (`bun run build`) if needed, starts a production server (`bun ./build/index.js`) in the
background on port 4190 (override with `PORT=…`), bound to `0.0.0.0` so it's reachable from other
devices on the LAN, and prints both URLs plus the demo login. Data lives at
`.claude/skills/preview/data/` — isolated from the real `./data/stella.db` and from the e2e
suite's `./data/e2e/`, so this can never touch either. `SEED_DEMO=true` seeds the Brunner
household (plus the Widmer and Steiner families and a dozen circles) on first start; re-running
the script against the same data directory is idempotent (`onConflictDoNothing`) and just reuses
what's there.

Re-run the same command after every code change — it detects a server already running and, if
none is, rebuilds and restarts. Stop it when done:

```
.claude/skills/preview/preview.sh --stop
```

## Handing it off

Tell the owner the **network** URL (not `localhost` — that only resolves on this machine) and,
if the feature isn't reachable from the demo household's home screen, **which demo data exercises
it**: a short *scenario → circle/person → what to do*. The demo login is
`demo@stella.local` / `stella-demo-1234`; the login page also offers a one-click "Sign in as
demo" button.

## The one gotcha if you ever run this by hand instead

`ORIGIN` must equal exactly the URL the browser opens (`docs/07` §7.6) — adapter-node checks the
browser's `Origin` header against it on every POST, login included, and refuses a mismatch with
*"Cross-site POST form submissions are forbidden"*. The script sets it from the detected LAN IP
automatically; if you override `PORT` or run on a machine with more than one network interface,
make sure `ORIGIN`/`STELLA_URL` still say what's actually typed into the address bar.

## Cleanup

`preview.sh --stop` kills the server; the data directory is left in place so the next preview
picks up where the last one stopped. Delete `.claude/skills/preview/data/` to reset to a fresh
demo seed.
