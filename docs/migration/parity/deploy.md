# Parity: deploy, backup and restore (task 8 local items)

Old behaviour: the root `Dockerfile` and `deploy/entrypoint.sh` (the old image), `docs/DEPLOY.md` (Coolify setup,
deploys, `/healthz`), the plan's manual snapshot (section 13). New: `apps/web/Dockerfile`,
`apps/web/Dockerfile.dockerignore`, `deploy/coolify/**`, `deploy/backup/**`, `scripts/convex-prod.sh`,
`scripts/backup-status.ts`, `.github/workflows/{restore-test,backup-freshness}.yml`, `docs/migration/cutover.md`,
`docs/migration/runbook-restore.md`. There is no screen in this slice, so there is nothing to look at on a phone.
Every row is checked by `node --test 'deploy/backup/test/*.test.ts'` (25 tests) or by the local runs on slot 6 on
2026-11-15 (22:36 to 23:05 UTC) quoted in the slice report.

| | Old | New | Note |
|---|---|---|---|
| [x] | Image: `node:24-bookworm-slim`, `npm ci --omit=dev`, whole repo copied | `apps/web/Dockerfile`: corepack pnpm 12.21.0, `pnpm fetch` + offline frozen install of `@atr/web...`, `vite build`, `pnpm deploy --prod --legacy`, runtime `node:24-slim` | Different on purpose: corepack on `node:24-slim` instead of `ghcr.io/pnpm/pnpm:12` (one pin, the root `packageManager`); `--legacy` because the workspace does not set `injectWorkspacePackages` (changing it would touch the lockfile). |
| [x] | Content (`places/ areas/ answers/ config/`) baked in at `/app` | Baked in at `/app/content`, `ATR_ROOT=/app/content` | |
| [x] | sharp works (glibc) | sharp checked in the build (a webp encode) and in the running image: `GET /map/dongmyo-flea-market.webp` 200, `image/webp`, `max-age=86400`, `file` says Web/P 1200x720 | Spike S16 PASS. |
| [x] | `HEALTHCHECK` with node `fetch` on `/healthz` (no curl) | Same, port from `PORT` (3000); container reported `healthy` | |
| [x] | Runs as root with `/data` volume, entrypoint chowns it | Runs as `node`; `web-cache:/data/cache` volume, `/app/content/.cache` links to it | Different on purpose: non-root; the platform's map and tile cache survives redeploys. |
| [x] | `/healthz` → `{"ok":true}` | `{"ok":true,"sha":"<GIT_SHA>"}`; `?deep=1` adds the Convex check | `GIT_SHA` build arg (Coolify: `$SOURCE_COMMIT`). |
| [x] | Sign-in with JavaScript off (form POST → 303 + cookie) | Same against the image: owner and guest POST `/login` → 303, Better Auth session cookie, `/trip` 200 | Checked before and after the S15 restore. |
| [x] | `.dockerignore` (root) for the old image | `apps/web/Dockerfile.dockerignore`, an allow-list | Different on purpose: BuildKit reads `<Dockerfile>.dockerignore`; an `apps/web/.dockerignore` would be ignored with the repo root as context. |
| [x] | (none) Convex service | `deploy/coolify/convex.compose.yaml`: backend + dashboard at the same commit sha as `deploy/convex-local`, dashboard on `127.0.0.1:6791` only, `mem_limit`, json-file log rotation | Tested: same sha, loopback port, no `SERVICE_URL_DASHBOARD`, rotation and limits on every service; `docker compose config` valid. |
| [x] | Env documented in DEPLOY.md | `deploy/coolify/env/*.template`, names only | A test fails on any value. |
| [x] | (none) production Convex commands | `scripts/convex-prod.sh`: mode-600 gitignored key file, https only, prints the host, asks to type it before every write, refuses `env get`, `env list --include-values` and values as arguments | `ATR_PROD_CONFIRM=<host>` answers one prompt for a scripted step; it must equal the host. |
| [x] | Manual snapshot: `ssh tar … \| age` on the laptop | `deploy/backup/backup.sh` (systemd timer 16:17 UTC): old `/data` staged, mid-line retry, parse check, manifest; Convex export + v1 bundle; env encrypted to the owner only; status object; rclone remote or local directory | The bucket is not chosen: `BACKUP_DEST` takes an absolute directory today. Ran against slot 6 to a local directory. |
| [x] | (none) | `deploy/backup/restore-convex.sh` on a fresh backend: env set, deploy, `import --replace-all`, accounts, verify | Spike S15 PASS: 0 differences (migrate verify), 32 tables / 99 documents equal, owner and guest present, owner signs in and gets a JWT. |
| [x] | (none) | `deploy/backup/restore-check.sh`: old object → manifest → old server on the restored files → sign-in → `/api/trip` counts | Ran on the local `old/` object: 14 files, 9 collections. |
| [ ] | (none) | `restore-test.yml` Convex leg as `ci_restore` | Code fixed by the integrator: the user is now `ci_restore` (Better Auth allows `[a-zA-Z0-9_.]`), in `admin.ts`, `restore-convex.sh`, `restore-test.yml` and the plan; `convex run admin:seedCiUser` with `ATR_CI_DEPLOYMENT=1` on a local backend returns `"created"`. Still unticked: the workflow has not run (no `gh` from here). |
| [ ] | (none) | `restore-test.yml` step 3's `pnpm e2e --grep @smoke` as `ci_restore` | Not wired: the Playwright `e2e-backend` web server re-deploys, re-seeds and replaces the restored data. Needs a Playwright mode that reuses an existing backend. |
| [x] | (none) | `backup-freshness.yml` + `scripts/backup-status.ts` | Both skip until `vars.BACKUP_REMOTE` is set; `backup-status.ts` exit 0 on the local store. |

## Rows not ticked

Two, both above, both blocked outside this slice's paths.
