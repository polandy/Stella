# 07 — Deployment Guide

How to self-host **Stella** with Docker, behind your existing reverse proxy, using
**Authelia** as the OIDC single-sign-on provider.

> This guide documents the target operational setup. Some referenced files (the
> `Dockerfile`, `docker-compose.yml`) are created during milestone **M0**; the values
> here are the contract they implement.

## 7.1 Overview

```
                        ┌────────────────────────────────────────┐
  Browser ──HTTPS──▶    │  Reverse proxy (Traefik/Caddy/Nginx)    │
                        │   ├── auth.example.home  → Authelia      │
                        │   └── stella.example.home → Stella :3000 │
                        └────────────────────────────────────────┘
                                        │
                             OIDC (auth code + PKCE)
                                        │
                        Stella (Bun) ──▶ Authelia  (issues ID token)
                             │
                        /data volume  (kith… → stella.db + media/)
```

Stella is a single container. It keeps its state in one mounted volume (`/data`):
the SQLite database file and the media directory. It expects to sit **behind** a
reverse proxy that terminates TLS and also fronts Authelia.

## 7.1.1 Quick local trial (no proxy, no SSO)

To run the current build on your own machine for testing/review — no reverse proxy, no
Authelia — use the committed `Dockerfile` + `docker-compose.yml`:

```bash
cp .env.example .env                 # then set SESSION_SECRET and STELLA_URL=http://localhost:3000
openssl rand -hex 32                 # paste into SESSION_SECRET
./deploy.sh                          # build image + start; waits until healthy
```

`./deploy.sh` (also `bun run deploy`) rebuilds the image from the working tree and
restarts the container, so re-running it redeploys the latest code. `./deploy.sh logs`
follows logs, `./deploy.sh down` stops it. Open `http://localhost:3000` — the first visit
lands on `/setup` to create the local admin. State lives in `./data` (SQLite + media);
delete it to start clean.

> `docker-compose.yml` sets `ORIGIN=${STELLA_URL}`. adapter-node checks the browser's
> `Origin` header against `ORIGIN` on every POST, so if it doesn't match the URL you open,
> **all form submissions fail with 403**. Keep `STELLA_URL` equal to the address you browse to.

## 7.2 Prerequisites

- A host with Docker + Docker Compose.
- A reverse proxy already terminating TLS for your domains.
- A running **Authelia** instance reachable at a public issuer URL
  (e.g. `https://auth.example.home`).
- A DNS name for Stella (e.g. `https://stella.example.home`).

## 7.3 Directory layout on the host

```
/opt/stella/
├── docker-compose.yml
├── .env
└── data/                 # persistent volume (created on first run)
    ├── stella.db         # + stella.db-wal / stella.db-shm
    └── media/            # originals + thumbnails
```

## 7.4 `.env`

Copy `.env.example` (shipped in the repo) to `.env` and fill in secrets. Never commit
`.env`.

```dotenv
# --- Core ---
STELLA_URL=https://stella.example.home       # public base URL (used to build redirect URIs)
DATABASE_PATH=/data/stella.db
MEDIA_DIR=/data/media
SESSION_SECRET=change-me-64-hex-chars        # `openssl rand -hex 32`
TZ=Europe/Zurich

# --- Auth toggles ---
AUTH_LOCAL_ENABLED=true                       # keep true for a break-glass admin
AUTH_OIDC_ENABLED=true

# --- Test phase (leave off for real use) ---
SEED_DEMO=false                               # true → seed the Brunner demo dataset on startup (idempotent);
                                              # on a fresh DB also creates admin demo@stella.local / stella-demo-1234

# --- OIDC / Authelia ---
OIDC_ISSUER=https://auth.example.home         # discovery: {issuer}/.well-known/openid-configuration
OIDC_CLIENT_ID=stella
OIDC_CLIENT_SECRET=change-me                  # must match Authelia's stored hash (see 7.7)
OIDC_REDIRECT_URI=https://stella.example.home/login/sso/callback
OIDC_SCOPES=openid profile email groups
OIDC_PROVIDER_NAME=authelia

# --- OIDC authorization & mapping ---
OIDC_ALLOWED_GROUPS=stella-users              # only members of this group may sign in
OIDC_ADMIN_GROUPS=stella-admins               # these groups become Stella admins
OIDC_ALLOWED_EMAILS=                          # optional explicit allowlist (comma list)
OIDC_JIT_PROVISION=true                       # auto-create users on first SSO login
OIDC_LINK_BY_EMAIL=true                       # link to an existing local user by verified email (first login only)
OIDC_SYNC_ROLES=true                          # re-apply group→role each login
OIDC_SYNC_PROFILE=true                        # refresh name/email each login
OIDC_RP_LOGOUT=true                           # redirect to Authelia end_session on logout [M2]
```

Generate secrets:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # OIDC_CLIENT_SECRET (plaintext; Authelia stores its hash)
```

## 7.5 `docker-compose.yml`

Minimal, proxy-agnostic version (expose the port to your proxy network):

```yaml
services:
  stella:
    image: ghcr.io/andypollari/stella:latest   # or build: .
    container_name: stella
    restart: unless-stopped
    env_file: .env
    environment:
      - ORIGIN=${STELLA_URL}    # adapter-node CSRF: must equal the public URL (7.6)
    volumes:
      - ./data:/data
    expose:
      - "3000"                # reachable by the reverse proxy on the shared network
    # ports:
    #   - "127.0.0.1:3000:3000"   # uncomment to test locally without a proxy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    networks:
      - proxy

networks:
  proxy:
    external: true            # the network your reverse proxy already uses
```

### 7.5.1 Traefik labels (optional)

If you use Traefik, add labels instead of a separate proxy config:

```yaml
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.stella.rule=Host(`stella.example.home`)"
      - "traefik.http.routers.stella.entrypoints=websecure"
      - "traefik.http.routers.stella.tls.certresolver=le"
      - "traefik.http.services.stella.loadbalancer.server.port=3000"
```

> Note: Stella does **not** need Authelia's forward-auth middleware — it authenticates
> via OIDC itself. Do not put a `forwardauth` middleware in front of it, or users would
> be asked to log in twice.

## 7.6 Reverse proxy notes

- Terminate TLS at the proxy; forward plain HTTP to the container on port 3000.
- Pass through the `Host` header and `X-Forwarded-*` headers; Stella builds redirect URIs
  from `STELLA_URL`, so that must match the public URL exactly (scheme + host).
- adapter-node validates the browser `Origin` on POSTs against `ORIGIN` (compose sets it to
  `STELLA_URL`). A mismatch yields 403 on every form submit — keep the two in lockstep.
- Ensure both `stella.example.home` and `auth.example.home` are reachable from the user's
  browser (OIDC redirects happen in the browser).

## 7.7 Authelia OIDC client configuration

Register Stella as a **confidential** OIDC client in Authelia's configuration.

First, hash the client secret with Authelia's helper (use the **plaintext** you put in
`OIDC_CLIENT_SECRET`):

```bash
docker run --rm authelia/authelia:latest \
  authelia crypto hash generate pbkdf2 --variant sha512 --password 'your-oidc-client-secret'
```

Then add the client under `identity_providers.oidc.clients` in Authelia
(`configuration.yml`):

```yaml
identity_providers:
  oidc:
    # ... hmac_secret, issuer_private_key, etc. already configured ...
    clients:
      - client_id: stella
        client_name: Stella
        client_secret: '$pbkdf2-sha512$310000$...'   # the HASH from the command above
        public: false
        authorization_policy: two_factor              # or one_factor, your choice
        require_pkce: true
        pkce_challenge_method: S256
        redirect_uris:
          - https://stella.example.home/login/sso/callback
        scopes:
          - openid
          - profile
          - email
          - groups
        grant_types:
          - authorization_code
        response_types:
          - code
        userinfo_signed_response_alg: none
        token_endpoint_auth_method: client_secret_post
```

### 7.7.1 Groups

Create the groups Stella expects and assign your family members. In Authelia's user
database (`users_database.yml`):

```yaml
users:
  andy:
    displayname: "Andy"
    password: "$argon2id$..."
    email: andy@example.home
    groups:
      - stella-users
      - stella-admins        # → Stella admin
  partner:
    displayname: "Partner"
    password: "$argon2id$..."
    email: partner@example.home
    groups:
      - stella-users         # → Stella member
```

- `stella-users` → may sign in (gate).
- `stella-admins` → granted the Stella **admin** role (via `OIDC_ADMIN_GROUPS`).
- Users without `stella-users` are rejected by Stella with a clear message.

After editing Authelia config, restart/reload Authelia.

## 7.8 First run

1. `cd /opt/stella`, create `.env` (7.4) and `docker-compose.yml` (7.5).
2. `docker compose up -d`.
3. Watch logs: `docker compose logs -f stella`. Migrations run automatically on boot.
4. Open `https://stella.example.home`.
   - **With SSO:** click **“Sign in with SSO”**, authenticate at Authelia. The first
     user in `stella-admins` becomes the household admin; the household is created on
     first admin login.
   - **Break-glass / local:** if `AUTH_LOCAL_ENABLED=true`, the very first run also lets
     you create a local admin account (kept as `role_locked` so IdP sync can't demote it).
5. Invite the rest of the family (Settings → Household → Members), or just have them sign
   in via SSO if `OIDC_JIT_PROVISION=true` and they’re in `stella-users`.

## 7.9 Backups

State is entirely in `/data`.

- **Database (WAL-safe):**
  ```bash
  docker compose exec stella sqlite3 /data/stella.db ".backup '/data/backup-$(date +%F).db'"
  ```
  or use the admin **Settings → Data → Download backup** button (produces a single
  archive of DB + media).
- **Media:** back up `/data/media` (rsync/snapshot).
- **Whole volume:** stopping the container and copying `./data` is always safe.
- Automate with a cron job or your existing backup tooling. Test a restore periodically.

Restore = stop container, replace `./data` contents, start container.

## 7.10 Updates

```bash
cd /opt/stella
docker compose pull
docker compose up -d
```

Migrations run automatically on startup and are forward-only. Take a backup (7.9)
before major version bumps. Check `docs/06-roadmap.md` / release notes for breaking
changes.

## 7.11 Running without SSO (local-only)

For a quick trial or an environment without Authelia:

```dotenv
AUTH_LOCAL_ENABLED=true
AUTH_OIDC_ENABLED=false
```

The login page then shows only the email/password form; the first account created is the
admin. Everything else works identically.

## 7.12 Troubleshooting

| Symptom | Likely cause |
|---|---|
| Redirect loop / "invalid redirect_uri" | `OIDC_REDIRECT_URI` ≠ the URI registered in Authelia, or `STELLA_URL` mismatch. |
| "You are not authorized" after SSO login | User not in `OIDC_ALLOWED_GROUPS` (`stella-users`). |
| Logged in but not admin | User missing from `OIDC_ADMIN_GROUPS`, or `OIDC_SYNC_ROLES=false`. |
| Asked to log in twice | A `forwardauth` middleware is wrongly in front of Stella (7.5.1). |
| "invalid_client" at token exchange | `OIDC_CLIENT_SECRET` plaintext ≠ the hash stored in Authelia. |
| Images 404 / not persisted | `/data` volume not mounted, or `MEDIA_DIR` misconfigured. |
| Locked out (IdP misconfig) | Sign in with the local break-glass admin (7.11 / `AUTH_LOCAL_ENABLED`). |
