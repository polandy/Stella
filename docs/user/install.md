# Installation & first run

Everything Stella needs is one container and one folder. This guide takes you from nothing
to a running household, and then covers backups and updates so it keeps running.

If you want the full operational reference — reverse-proxy details, every configuration
value, Authelia's OIDC client block — see [07 — Deployment](../dev/07-deployment.md). This page
is the short road.

## What you need

- A machine that is on when the family wants to use Stella: a Raspberry Pi, a NAS, a
  small server, an old laptop. Stella is happy with very little memory.
- **Docker** with Docker Compose on that machine.
- Optionally, a name to reach it by (`stella.home`, `stella.example.com`) and a reverse
  proxy — only if you want more than `http://<machine>:3000`.

## 1. Get the files

```sh
git clone https://github.com/polandy/Stella.git stella
cd stella
```

## 2. Set two values

```sh
cp .env.example .env
```

Open `.env` and set:

| Setting | What to put there |
|---|---|
| `SESSION_SECRET` | A long random string, at least 32 characters. Generate one with `openssl rand -hex 32`. Stella refuses to start in production with a short one or the example value. |
| `STELLA_URL` | **Exactly** the address you will type into the browser, including `http://` or `https://` and the port. |

`STELLA_URL` matters more than it looks. Stella checks that form submissions come from the
address it expects, so if it says `http://localhost:3000` and you open
`http://192.168.1.20:3000`, every save fails. Use the address the family will actually use.

Everything else in `.env` has a sensible default; leave it alone for now.

**Reaching it from other devices.** Stella listens on the machine itself only
(`127.0.0.1:3000`), so nothing else on the network can reach it until you say so. To let the
family's phones and laptops in over the LAN, add `STELLA_BIND=0.0.0.0` to `.env` and set
`STELLA_URL` to the machine's LAN address, e.g. `http://192.168.1.20:3000`. Behind a reverse
proxy on the same machine, leave the default and point the proxy at `127.0.0.1:3000`.

## 3. Start it

```sh
./deploy.sh
```

This builds the image, starts the container and waits until it reports healthy. It is safe
to run again at any time — that is also how you apply changes.

- `./deploy.sh logs` — follow what it is doing
- `./deploy.sh down` — stop it

Building takes a few minutes the first time. If you would rather not build at all, every
release is published as a container image. In `docker-compose.yml`, delete the `build: .`
line and change the `image:` line beside it to:

```yaml
    image: ghcr.io/polandy/stella:latest
```

Then start it with `docker compose up -d` rather than `./deploy.sh`, which builds by design.

[07 — Deployment §7.5.0](../dev/07-deployment.md#750-where-the-image-comes-from) explains why it is
worth pinning a digest rather than following a tag.

## 4. Create the first account

Open the address you put in `STELLA_URL`. The first visit lands on a setup page where you
create the household and its first account — that is you, as administrator.

From then on, `/login` asks for that email and password.

## 5. Bring in the family

Everyone in the household gets their own account, so the stream can say who wrote what,
and so "private" means private to one person rather than to the household.

Right now there are two ways in:

- **With single sign-on** — anyone in the group you allow (see below) is given an account
  the first time they sign in. Nothing to do per person.
- **Without it** — only the account created in step 4 exists. A screen for inviting the
  rest of the household is still to come; until then, single sign-on is the way to give
  everyone their own login.

## Coming from Monica, or from an address book?

Sign in as the admin, open **Settings → Import people**, and hand it an export of your Monica
— the JSON file or a database dump — or a vCard from any address book. It shows what it found
before writing anything, and afterwards brings the photos over. The whole story, including how
to make a dump, is in
[using-stella.md](using-stella.md#moving-in-from-monica-or-from-an-address-book).

## Trying it with demo data first

If you want to look around before deciding, set `SEED_DEMO=true` in `.env` and run
`./deploy.sh` again. Stella fills itself with a fictional family — the Brunners — and puts
a **Sign in as demo user** button on the login page. The demo household has two members, so
the story shows more than one name; the second one signs in as `nina@stella.local` with the
same password.

Turn it back off (`SEED_DEMO=false`) before you put real people in, and start from a clean
database: `docker compose down -v` removes the demo data for good.

## Running it behind your own domain

If you already have a reverse proxy (Traefik, Caddy, nginx) terminating HTTPS, point it at
the container's port 3000 and set `STELLA_URL` to the public address. Three things to get
right:

- The proxy must pass the `Host` and `X-Forwarded-*` headers through.
- `STELLA_URL` must match the public address exactly, scheme included.
- If Stella is reachable from the internet with password sign-in on, let the proxy limit how
  often one address may try to sign in — Stella itself does not (see
  [07 §7.6](../dev/07-deployment.md#76-reverse-proxy-notes)).

The calendar links members subscribe to (*Settings → Calendar*) are built from `STELLA_URL`,
and it is the phone's calendar — or Google's servers, for Google Calendar — that fetches them.
So the address must be reachable from there: a link on a LAN-only address works on the phones
at home only, and Google Calendar needs it reachable from the internet.

[07 — Deployment §7.5 and §7.6](../dev/07-deployment.md#75-docker-composeyml) has ready-made
compose and Traefik snippets.

## Signing in with your existing single sign-on

If your household already logs into things through **Authelia**, Stella can use it: one
password for everyone, two-factor if you have it, and access controlled by group
membership. Turn on `AUTH_OIDC_ENABLED` and fill in the `OIDC_*` values.

Keep `AUTH_LOCAL_ENABLED=true` alongside it. That leaves you one local administrator to
get back in with if the identity provider ever misbehaves.

The full setup — hashing the client secret, the client block for Authelia's config, which
groups to create — is in [07 — Deployment §7.7](../dev/07-deployment.md#77-authelia-oidc-client-configuration).

## Showing people's photos from Immich

If the household keeps its photos in [Immich](https://immich.app) 3.2 or newer, Stella can
learn which Immich person each contact is: the person page then says how many photos Immich
has of them, shows their latest, and takes you there in one tap. It is optional; without these values nothing of
it appears.

1. **Create a key in your own Immich account** — the admin's, not a shared one: *Account
   settings → API keys → New API key*. Give it only these read permissions: `user.read`,
   `person.read`, `person.statistics`, `asset.read`, `asset.view` and `timeline.read`. Stella
   never writes to Immich. A key made for an earlier Stella may lack `asset.read` and `asset.view`: Settings says so, and the
   strip of photos stays away until the key has them. `timeline.read` is optional: without it
   Settings warns, and the photo picker shows days and search but not the years and months.
2. **Add three lines to `.env`:**

   ```
   IMMICH_URL=http://immich-server:2283
   IMMICH_PUBLIC_URL=https://immich.example.com
   IMMICH_API_KEY=the-key-you-just-created
   ```

   - `IMMICH_URL` is how Stella's server reaches Immich. When both run as containers on the same
     Docker network, use Immich's **internal** address, as above: the calls then skip your reverse
     proxy, TLS and any login gateway in front of the public name.
   - `IMMICH_PUBLIC_URL` is where *Open in Immich* links point — the address you open Immich at
     in a browser. Leave it out and it is the same as `IMMICH_URL`.
   - `IMMICH_URL` and `IMMICH_API_KEY` go together: with one but not the other, Stella refuses to
     start and says so.
3. Run `./deploy.sh` again, then open **Settings → Immich**. It says *Connected to …'s Immich*,
   or exactly what is wrong — a key without one of the permissions, a key Immich refused, an
   Immich older than 3.2, or no answer at all.

**Behind a login gateway.** If Immich's public address sits behind forward-auth (Authelia and
the like), that does no harm to `IMMICH_PUBLIC_URL`: only browsers follow it, and you are
signed in there anyway. But if `IMMICH_URL` has to be that public address, the gateway must let
its `/api` path through without a login — otherwise every call Stella makes is sent to the login
page, and Settings says Immich did not answer.

**What the key means.** It reads one library — yours. Everyone in the household can see how
many photos of a linked person it holds and their latest photos, following who may see that
person in Stella, and gets *Open in Immich*. Stella fetches those photos itself and keeps none
of them, on the server or on anyone's device. That link shows the photos only to you, signed into your own Immich account;
everyone else lands on Immich's sign-in or an empty page.
Beyond the linked people, every member can browse **your whole library** by day and search it
when they add a photo to a moment, a journal entry or a gallery, and copy the photos they pick
into Stella. Archived, locked and trashed photos never show. If that is more than you want to
share, leave Immich unconnected.

## Linking the household's Nextcloud address book

If the family's phones sync their contacts with Nextcloud, Stella can keep that address book
and itself in step — names, phone numbers, emails, addresses, birthdays and photos, both ways
(*Keeping Stella and Nextcloud in step* in the user guide). It is optional; without these
values nothing of it appears. Stella links **one** address book for the whole household.

1. **Create an app password** for the Nextcloud user whose address book it is (or who it is
   shared with, with write access): *Personal settings → Security → Create new app password*.
2. **Copy the book's address**: in Nextcloud's Contacts, *Settings* → the book's ⋯ menu →
   *Copy link*. It looks like
   `https://cloud.example.com/remote.php/dav/addressbooks/users/family/contacts/`.
3. **Add three lines to `.env`:**

   ```
   NEXTCLOUD_ADDRESS_BOOK_URL=https://cloud.example.com/remote.php/dav/addressbooks/users/family/contacts/
   NEXTCLOUD_USER=family
   NEXTCLOUD_APP_PASSWORD=the-app-password
   ```

   The three go together: with one or two alone, Stella refuses to start and says so. The app
   password stays in `.env` — Stella never logs it, never shows it and never puts it in the
   database or a backup.
4. Run `./deploy.sh` again, then open **Settings → Import people** and press **Sync now**. The
   first sync offers every card as one review: answer it once and, from then on, only new
   cards are asked about.

Private people never go to Nextcloud, and deleting a contact there never deletes anyone in
Stella. To unlink the book, remove the three lines and deploy again; the address book keeps
everything Stella wrote to it.

## Backups

Everything Stella knows lives in one place: the `/data` volume, holding the database file
and the photos. Nothing else needs backing up.

`scripts/backup.sh` takes one while Stella keeps running. It writes a consistent copy of the
database and the photos into a single archive, `stella-backup-<date and time>.tar.gz`, and keeps
the newest 14 there:

```sh
scripts/backup.sh /srv/backups/stella               # keep the newest 14
scripts/backup.sh --keep 30 /srv/backups/stella     # or another number
```

It works on the container named `stella`, the name `docker-compose.yml` gives it; add
`--container <name>` for another one. Never copy `stella.db` by hand while Stella runs: the
newest changes may still sit beside it in `stella.db-wal`, and the copy would be broken without
saying so.

**Every night, on its own.** With systemd, two small files do it. `/etc/systemd/system/stella-backup.service`:

```ini
[Unit]
Description=Back up Stella

[Service]
Type=oneshot
ExecStart=/opt/stella/scripts/backup.sh --keep 14 /srv/backups/stella
```

and `/etc/systemd/system/stella-backup.timer`:

```ini
[Unit]
Description=Back up Stella every night

[Timer]
OnCalendar=*-*-* 03:15
Persistent=true

[Install]
WantedBy=timers.target
```

Then `systemctl enable --now stella-backup.timer`. `Persistent=true` catches up on a night the
machine was off; `systemctl list-timers stella-backup` shows the next run and
`journalctl -u stella-backup` the last ones. Without systemd, a cron line does the same:
`15 3 * * * /opt/stella/scripts/backup.sh /srv/backups/stella`. Point the paths at your checkout
and wherever the archives should go.

Copy the archives somewhere else as well — another machine, an external disk, wherever your
other backups go. A backup on the same disk does not survive the disk.

**Restoring** replaces the database and the photos with those from the archive:

```sh
./deploy.sh down
volume=$(docker volume ls -q --filter name=stella-data)   # the volume Stella uses
scripts/restore.sh /srv/backups/stella/stella-backup-<date>.tar.gz "$volume"
./deploy.sh
```

`scripts/restore.sh` refuses while Stella still runs on that volume. It also takes a folder on
the host in place of a volume name, if your `/data` is one.

Test a restore once in a while. A backup nobody has ever restored is a hope, not a backup.

## Updating

```sh
git pull
./deploy.sh
```

**Once, if you installed 0.1.0 or earlier:** Stella no longer runs as the all-powerful root
user inside its container, so the data it wrote back then has to be handed over to it a
single time, before the update starts:

```sh
./deploy.sh down
volume=$(docker volume ls -q --filter name=stella-data)
docker run --rm -v "$volume":/data alpine chown -R 1000:1000 /data
git pull
./deploy.sh
```

Without it, the container stops right after starting, complaining about a *readonly
database*. A fresh install needs none of this.

Database changes are applied automatically on startup and only ever move forward. Before it
applies any, Stella copies the database to `backups/pre-<version>.db` in the data volume and
keeps the last three such copies, so a failed update can be rolled back (docs/dev/07 §7.10).
That copy lives on the same disk, so keep taking the backup above as well. Going back to an
older version on a database a newer one already changed is refused at start-up, with
*The database was migrated by a newer Stella* in the log. An update that adds a rule a stored row
already breaks stops at start-up too, changing nothing and naming the rule
(`CHECK constraint failed: …`). When an update also moves data into a
new shape — gifts imported from Monica as notes becoming entries on the **Gifts** card, say —
the server log says what it moved and what it left as it was (`./deploy.sh logs`, or
`docker compose logs stella`;
details in docs/dev/07 §7.10).

### Being told when there is something to update to

Stella does this on its own: **Settings → About** names the newest published release beside
the one you are running, with a link to what changed. The server asks GitHub at most once a
day on behalf of everyone, sends nothing about your household, and never downloads or
installs anything — updating stays the two commands above. Set `UPDATE_CHECK=false` in `.env`
and restart if you'd rather Stella asked nobody anything.

## Moving to another machine

Stella has no state outside its data volume, so moving house is: back up on the old
machine, install on the new one, restore the archive before the first start.

## When something is wrong

| What you see | What it usually is |
|---|---|
| Every save fails, nothing is stored | `STELLA_URL` does not match the address in the browser's bar. |
| The page never loads | Container not healthy — check `./deploy.sh logs`. Healthy means the database can be read and written. |
| Photos vanish after a restart | The data volume is not mounted. |
| "You are not authorized" after signing in with SSO | The account is missing the group listed in `OIDC_ALLOWED_GROUPS`. |
| Locked out after an SSO change | Sign in with the local administrator account instead. |
| Stops at start-up with `CHECK constraint failed: …` | A stored row breaks a rule the update added; nothing was changed. See 07 §7.12. |

A longer table, including the OIDC-specific failures, is in
[07 — Deployment §7.12](../dev/07-deployment.md#712-troubleshooting).
