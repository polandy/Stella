# Installation & first run

Everything Stella needs is one container and one folder. This guide takes you from nothing
to a running household, and then covers backups and updates so it keeps running.

If you want the full operational reference — reverse-proxy details, every configuration
value, Authelia's OIDC client block — see [07 — Deployment](07-deployment.md). This page
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
| `SESSION_SECRET` | A long random string. Generate one with `openssl rand -hex 32`. |
| `STELLA_URL` | **Exactly** the address you will type into the browser, including `http://` or `https://` and the port. |

`STELLA_URL` matters more than it looks. Stella checks that form submissions come from the
address it expects, so if it says `http://localhost:3000` and you open
`http://192.168.1.20:3000`, every save fails. Use the address the family will actually use.

Everything else in `.env` has a sensible default; leave it alone for now.

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

[07 — Deployment §7.5.0](07-deployment.md#750-where-the-image-comes-from) explains why it is
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
the container's port 3000 and set `STELLA_URL` to the public address. Two things to get
right:

- The proxy must pass the `Host` and `X-Forwarded-*` headers through.
- `STELLA_URL` must match the public address exactly, scheme included.

[07 — Deployment §7.5 and §7.6](07-deployment.md#75-docker-composeyml) has ready-made
compose and Traefik snippets.

## Signing in with your existing single sign-on

If your household already logs into things through **Authelia**, Stella can use it: one
password for everyone, two-factor if you have it, and access controlled by group
membership. Turn on `AUTH_OIDC_ENABLED` and fill in the `OIDC_*` values.

Keep `AUTH_LOCAL_ENABLED=true` alongside it. That leaves you one local administrator to
get back in with if the identity provider ever misbehaves.

The full setup — hashing the client secret, the client block for Authelia's config, which
groups to create — is in [07 — Deployment §7.7](07-deployment.md#77-authelia-oidc-client-configuration).

## Showing people's photos from Immich

If the household keeps its photos in [Immich](https://immich.app) 3.2 or newer, Stella can
learn which Immich person each contact is: the person page then says how many photos Immich
has of them, and takes you there in one tap. It is optional; without these values nothing of
it appears.

1. **Create a key in your own Immich account** — the admin's, not a shared one: *Account
   settings → API keys → New API key*. Give it only these read permissions: `user.read`,
   `person.read` and `person.statistics`. Stella never writes to Immich.
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
many photos of a linked person it holds, following who may see that person in Stella, and gets
*Open in Immich*. That link shows the photos only to you, signed into your own Immich account;
everyone else lands on Immich's sign-in or an empty page.

## Backups

Everything Stella knows lives in one place: the `/data` volume, holding the database file
and the photos. Nothing else needs backing up.

The safe, boring way:

```sh
volume=$(docker volume ls -q --filter name=stella-data)   # the volume Stella uses
./deploy.sh down                                          # stop it so nothing is mid-write
docker run --rm -v "$volume":/data -v "$PWD":/out \
  alpine tar czf /out/stella-backup-$(date +%F).tar.gz -C /data .
./deploy.sh                                               # start it again
```

Copy that archive somewhere else — another machine, an external disk, wherever your other
backups go. Restoring is the same command with `tar xzf`, onto a stopped container.

Test a restore once in a while. A backup nobody has ever restored is a hope, not a backup.

## Updating

```sh
git pull
./deploy.sh
```

Database changes are applied automatically on startup and only ever move forward. Take a
backup first if it has been a while since the last one.

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
| The page never loads | Container not healthy — check `./deploy.sh logs`. |
| Photos vanish after a restart | The data volume is not mounted. |
| "You are not authorized" after signing in with SSO | The account is missing the group listed in `OIDC_ALLOWED_GROUPS`. |
| Locked out after an SSO change | Sign in with the local administrator account instead. |

A longer table, including the OIDC-specific failures, is in
[07 — Deployment §7.12](07-deployment.md#712-troubleshooting).
