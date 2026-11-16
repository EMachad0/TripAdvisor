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
