Trial an unreleased branch or open PR live on the real family Stella instance, before it is
merged/released — because "the maintainer verifies it in the running app" (`docs/08` §8.4.1)
sometimes means the real app, not a local build. Use this when asked to deploy, try out, or test
a feature/branch/PR "on prod", "auf der family-instanz", "live", or similar — as opposed to a
local trial (`docs/07` §7.1.1), which needs no special care.

This file is the source of truth for the procedure; `docs/07-deployment.md` §7.1.2 just points
here for anyone reading the deployment guide top to bottom.

1. **Backup first.** Confirm a recent DB snapshot exists (the app's own `/data/db-dump/*.db`, or
   the paired backup service) before touching anything — a branch can carry a migration.
2. **Build the image locally** on the deploy host itself (it doubles as the build host — no
   registry push needed): `docker build -t <app>:pr-<n>-test .` from the branch's working tree.
3. **Point the deployed module at it, temporarily.** The real compose file is *not* this repo's
   generic `docker-compose.yml` — it is managed by NixOS + a GitOps agent (`skipper-cd`) from a
   separate infra repo (e.g. `/etc/nixos/modules/<name>/docker-compose.yml`, which *is* that
   repo's own git working tree — never edit `skipper-cd`'s own internal checkout instead). Edit it
   (needs `sudo`): comment out the pinned `image:` line in place (so reverting is a one-line
   diff) and add:
   ```yaml
   image: <app>:pr-<n>-test
   pull_policy: never   # local-only tag; never try to pull it from a registry
   ```
4. **Apply with the smallest lever that works**: `sudo systemctl restart docker-compose-<name>.service`
   re-runs `docker compose up -d` against the edited file — no full `nixos-rebuild` and no git
   push needed for a compose-file-only change. Reach for `sudo nixos-rebuild test` (not `switch`,
   so a reboot still reverts) only if the change touches more than the compose file.
5. **Verify**: `docker ps --filter name=<name>` shows the new image and `healthy`; check
   `docker logs <name>` and hit `/healthz` from inside the container if it has no `wget`/`curl`.
6. **Revert when the trial is done** (or before merging for real): uncomment the pinned `image:`
   line, delete the two temporary lines, restart the unit again. Never let a trial linger past the
   session that needed it.

Guardrails, non-negotiable:

- **Never dump a running container's full environment** (`docker inspect <name> --format
  '{{json .Config.Env}}'` or similar) — compose resolves real secrets into it, and a broad env
  dump leaks them into command output/logs that this tool cannot un-print. Inspect narrowly
  (image, networks, mounts, health) instead. If a secret is ever printed by mistake anyway,
  say so immediately and tell the owner to rotate it — don't just move on.
- **Never push the throwaway tag anywhere, and never commit the temporary compose edit** to the
  infra repo — it is local, host-only, disposable state.
- Confirm with the owner before doing this at all if there is any doubt it is really wanted —
  this runs unreleased code on the instance a real household depends on.
