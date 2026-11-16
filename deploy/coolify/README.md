# Coolify resources for the trip site

Plan section 12. Values never go in the repo: every file under `env/` lists names only. `<site>` is the current site
host (`docs/DEPLOY.md`); it is an sslip.io name, so `api.<site>` and `cvx.<site>` resolve with no DNS
records (`dig +short api.<site>` to check). Every step here is a production step the owner confirms.

| Resource | Source | Domains | Volume | Env (names) |
|---|---|---|---|---|
| `convex` (Docker Compose) | `deploy/coolify/convex.compose.yaml` | backend `:3210` → `https://api.<site>`, `:3211` → `https://cvx.<site>`; dashboard none (`127.0.0.1:6791` only) | `convex-data:/convex/data` | `env/convex.env.template` |
| `trip-web` (Dockerfile) | repo, branch `main`, Dockerfile `apps/web/Dockerfile`, build context `/` (repo root) | `https://<site>` → `3000` | `web-cache:/data/cache` | `env/trip-web.env.template` |

The old app `trip-site` (root `Dockerfile`, `game/server.js`, volume `/data`) was retired after the cutover of
2026-11-16 and its code removed from the repo. The backup job archives its `/data` only while `OLD_DATA_DIR` is set in
`backup.env`.

Convex deployment env (inside Convex, set with `scripts/convex-prod.sh env set`): `env/convex-deployment.env.template`.
The admin key file (laptop and VPS): `env/convex-admin.env.template`. Backup job config: `env/backup.env.template`.

## Convex service

1. New resource → Docker Compose → paste `convex.compose.yaml`. Keep the image tags exactly as in the file (the same
   commit sha as `deploy/convex-local/compose.yaml`; `node --test 'deploy/backup/test/*.test.ts'` checks it).
2. Env: `INSTANCE_SECRET` (`openssl rand -hex 32`, typed into Coolify, kept), `CONVEX_CLOUD_ORIGIN=https://api.<site>`,
   `CONVEX_SITE_ORIGIN=https://cvx.<site>`.
3. Domains: backend service → `https://api.<site>:3210,https://cvx.<site>:3211` (Coolify's "domain:port" form). No
   domain on the dashboard.
4. Deploy, then in the backend container's terminal: `./generate_admin_key.sh`. Put the key in the password manager,
   then in `apps/web/.env.convex-prod` on the laptop and `/root/.config/atr-backup/convex.env` on the VPS (both mode
   600, single-quoted). Check: `scripts/convex-prod.sh status`.
5. Dashboard: `ssh -L 6791:localhost:6791 <vps>`, open `http://localhost:6791`, sign in with the admin key. Check on
   the VPS: `ss -ltn | grep 6791` shows `127.0.0.1:6791` only.

Limits in the compose file: backend `mem_limit: 1g`, dashboard `256m`; both log with `json-file`, `max-size: 10m`,
`max-file: 3`. Revisit the backend limit with spike S23's numbers.

## trip-web

- Build pack: Dockerfile; Dockerfile location `/apps/web/Dockerfile`; base directory `/` (the build needs the whole
  workspace; `apps/web/Dockerfile.dockerignore` keeps the context to what the build reads, about 380 MB of content).
- Build argument: `GIT_SHA=$SOURCE_COMMIT` (Coolify provides `SOURCE_COMMIT`); `/healthz` reports it.
- Custom Docker options (Coolify → Advanced): `--memory=512m --log-opt max-size=10m --log-opt max-file=3`. At idle
  the app uses about 140 MB.
- Health check: the image has a `HEALTHCHECK` on `/healthz` (node `fetch`, no curl in the image). Leave Coolify's own
  check off.
- Persistent storage: volume `web-cache` mounted at `/data/cache` (map tiles and rendered maps; `/app/content/.cache`
  links there).
- Build needs on the 1 CPU / 4 GB VPS: `pnpm fetch` + offline install peak about 830 MB, `vite build` about 690 MB
  (measured under a 1 GB, 1 CPU cap); the V8 heap is capped at 1.5 GB by `NODE_OPTIONS`. About 1 minute with a warm
  BuildKit cache. The image is about 510 MB compressed (1.4 GB unpacked: 360 MB of content, 195 MB node_modules).

## Backup job

`deploy/backup/` holds the scripts and the systemd units. Install on the VPS (owner-confirmed):

```sh
apt-get install -y age jq rclone          # rclone only once the bucket exists
install -d -m 700 /root/.config/atr-backup
# backup.env from env/backup.env.template, convex.env from env/convex-admin.env.template, both mode 600
install -D -m 755 deploy/backup/backup.sh /usr/local/lib/atr-backup/backup.sh
install -m 644 deploy/backup/atr-backup.service deploy/backup/atr-backup.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now atr-backup.timer
systemctl start atr-backup.service && journalctl -u atr-backup.service -n 50
```

## Convex functions deploy job

A merge to `main` makes Coolify roll out a new `trip-web`; `atr-convex-deploy.timer` then deploys that build's Convex
functions (`apps/web/src/convex`) with no one running a command. `deploy/convex-deploy/` holds the script and the
systemd units.

How it works: every minute the script finds the running `trip-web` containers (named `<APP_UUID>-…`), takes the
newest, waits while it is not healthy yet (mid-rollout), reads the commit from its image (`GIT_SHA` in the image env, else the image tag, which Coolify sets to the commit) and compares it with
`/var/lib/atr-convex-deploy/deployed-sha`. When they differ it runs `convex deploy --yes --typecheck disable
--codegen disable` in a throwaway container of that same image (the image carries `src/convex`, `convex.json`, the
pinned CLI and `@atr/shared`), so the functions always match the commit the live app was built from, a Coolify
rollback included. The admin key comes from the backup job's `/root/.config/atr-backup/convex.env` and reaches the
container by name only (`-e CONVEX_SELF_HOSTED_ADMIN_KEY`); it is never in GitHub, in the `trip-web` image or its
runtime env, in argv or in the journal. The deploy container joins the `coolify` network, runs read-only as the
image's `node` user and is capped at `DEPLOY_MEMORY` (768m; a deploy peaks around 340 MB and takes a few seconds).
A tick with nothing to do logs nothing. A failed deploy records nothing, exits non-zero (the unit shows failed) and
retries after 1, 2, 4 … 60 minutes; a newer commit retries at once.

Ordering: the functions land within about a minute *after* the new app is live, so for that window the new app talks
to the previous functions. Additive changes are fine. A breaking change (a schema change existing documents fail, a
removed or renamed function the old app still calls, an argument change both sides must agree on) still needs a
person: deploy it in steps (widen, deploy, then narrow) or run `scripts/convex-prod.sh deploy` by hand. If a deploy
fails on schema validation the timer keeps retrying with backoff until the data or the code is fixed.

Install on the VPS (owner-confirmed), from a checkout of `main` that includes this job, and only once `/healthz`
reports a commit whose image carries the functions (this PR's merge or later; an older image makes the first run
fail and back off):

```sh
install -d -m 700 /root/.config/atr-convex-deploy
# convex-deploy.env from env/convex-deploy.env.template (mode 600); APP_UUID is the trip-web app's Coolify uuid
( umask 077; printf 'APP_UUID=xbgdnounik78nabmkmecl45d\n' >/root/.config/atr-convex-deploy/convex-deploy.env )
# the admin key file is the backup job's: /root/.config/atr-backup/convex.env (mode 600), nothing new to create
install -D -m 755 deploy/convex-deploy/convex-deploy.sh /usr/local/lib/atr-convex-deploy/convex-deploy.sh
install -m 644 deploy/convex-deploy/atr-convex-deploy.service deploy/convex-deploy/atr-convex-deploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl start atr-convex-deploy.service; journalctl -u atr-convex-deploy.service -n 30 --no-pager   # first run deploys once
cat /var/lib/atr-convex-deploy/deployed-sha       # equals the sha in /healthz
systemctl enable --now atr-convex-deploy.timer
```

Config keys (`/root/.config/atr-convex-deploy/convex-deploy.env`, names in `env/convex-deploy.env.template`):
`APP_UUID` (required), `CONVEX_ENV_FILE` (default `/root/.config/atr-backup/convex.env`), `CONVEX_DOCKER_NETWORK`
(default `coolify`), `DEPLOY_MEMORY` (default `768m`).

- Did it run: `systemctl list-timers atr-convex-deploy.timer`; `systemctl status atr-convex-deploy.service`;
  `journalctl -u atr-convex-deploy.service --since today` (only deploys, waits and failures are logged);
  `cat /var/lib/atr-convex-deploy/deployed-sha` against `curl -s https://<site>/healthz`;
  `/var/lib/atr-convex-deploy/failures` exists only while a commit is failing (`<sha> <attempts> <epoch>`).
- Run a tick now: `systemctl start atr-convex-deploy.service` (a no-op when the live commit is deployed).
- Force a deploy of the live commit (also skips a backoff): `/usr/local/lib/atr-convex-deploy/convex-deploy.sh --force`.
- Disable: `systemctl disable --now atr-convex-deploy.timer`. Deploys are then by hand again:
  `scripts/convex-prod.sh deploy` from the laptop, which keeps working either way (it does not touch the job's state;
  the job redeploys only when the live commit changes).
- Update the job after a change to `deploy/convex-deploy/`: repeat the two `install` lines and `systemctl daemon-reload`.
