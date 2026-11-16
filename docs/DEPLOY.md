# Deploying the trip site

The site is `trip-web` (the SvelteKit app in `apps/web`, built from `apps/web/Dockerfile`) with its self-hosted Convex
backend `convex`, both on a VPS under Coolify. The Coolify resources, env names, build settings and the backup job are
in [`deploy/coolify/README.md`](../deploy/coolify/README.md).

- Site: https://trip.187.53.115.237.sslip.io (owner and guest logins)
- Convex: `https://api.<site>` (backend) and `https://cvx.<site>` (HTTP actions, `GET /ops/export`); the dashboard
  is bound to `127.0.0.1:6791` on the VPS (SSH tunnel only)
- Coolify dashboard: http://187.53.115.237:8000 (project "Asia Trip")
- Server: `ssh root@187.53.115.237`

The old app (`trip-site`, `game/server.js`) was retired after the cutover of 2026-11-16; its code is gone from the
repo (git history has it) and rolling back to it is no longer possible. `docs/migration/cutover.md` is the record of
the cutover.

## What lives where

| Data | Lives in | Changes by |
|---|---|---|
| Code, `places/`, `areas/`, `answers/`, `config/` | Git, baked into the `trip-web` image | A merge to `main`, which Coolify deploys |
| Swipes, duels, notes, route and the trip collections (legs, days, tasks, bag, budget, spend…) | Convex (`convex-data` volume) | The site, as the traveler uses it; `./atr trip set\|update\|delete` |
| Map tiles and rendered maps | `web-cache` volume (`/data/cache`) | The site |

`feedback/` and `trip/` in git are a historical snapshot (see their README). Curators read the live data with
`./atr feedback pull` and `./atr trip pull`, which write `.cache/feedback-live/` and `.cache/trip-live/`.

Production Convex commands go through `scripts/convex-prod.sh` (it prints the host and asks first); its `deploy` is
the manual path, for when the deploy job is off or a change has to land before the app. Backups: the
nightly `atr-backup.timer` on the VPS (`deploy/backup/`), checked by the `restore-test` and `backup-freshness`
workflows; restoring is `docs/migration/runbook-restore.md`.

## How an agent ships a change

1. Work on a branch; run `corepack pnpm verify` (format, lint, typecheck, tests, e2e; see `docs/migration/DEV.md`).
2. Open a pull request against `main`. CI runs `verify` and `e2e` (both skip content-only PRs). Never push to `main`.
3. A merge to `main` makes Coolify build and deploy `trip-web`; the running container serves until the new one is
   healthy. Within about a minute after that, `atr-convex-deploy.timer` on the VPS deploys the Convex functions
   (`apps/web/src/convex`) from that same image; nobody runs a command. For that minute the new app talks to the
   previous functions, so a breaking schema or API change still needs a person (ship it in steps, or
   `scripts/convex-prod.sh deploy` by hand). Details: the "Convex functions deploy job" section of
   [`deploy/coolify/README.md`](../deploy/coolify/README.md).
4. Check it: `curl -s https://trip.187.53.115.237.sslip.io/healthz` reports `{"ok":true,"sha":"<deployed commit>"}`;
   on the VPS, `/var/lib/atr-convex-deploy/deployed-sha` holds the same sha once the functions are deployed
   (`journalctl -u atr-convex-deploy.service` shows the deploy).

Answer cards (`answers/*.md`) ship with `./atr answers publish <file>`: it opens a pull request from a temporary
worktree, merges it and waits until `/healthz` reports the merge commit. The site URL it uses is in
`platform/lib/site.js`.

## Try the image locally

```bash
docker build -f apps/web/Dockerfile --build-arg GIT_SHA="$(git rev-parse HEAD)" -t trip-web .
```

The image needs a Convex backend and its env (`deploy/coolify/env/trip-web.env.template`); for local work use the dev
setup in `docs/migration/DEV.md` instead.
