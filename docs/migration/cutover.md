# Cutover and rollback runbook

> **History.** The cutover ran on 2026-11-16, and the old site was retired afterwards (plan task 13): `game/`, the
> root `Dockerfile` and `deploy/entrypoint.sh` are gone from the repo and `trip-site` is stopped. **Rollback to the old
> site (below) is no longer available**; to undo a bad write or recover data, restore Convex from a backup
> (`runbook-restore.md`). This page is kept as the record of how the cutover was done.

Plan sections 14 and 15, written as the commands to type, in order. `<site>` is the current site host
(`trip.187.53.115.237.sslip.io`, `docs/DEPLOY.md`); `<vps>` is the SSH login (`root@187.53.115.237`).

- **[PROD]** marks a step that changes production. The owner is present and confirms each one. Every Convex command
  goes through `scripts/convex-prod.sh`, which prints `target api.<site>` and asks you to type the host back before any
  write; stop if the printed host is anything else. You are responsible for each command run here, by hand or by an
  agent, exactly as if you typed it.
- Write the window's start time with its UTC offset (for example `2027-01-10 09:00 UTC+9`) at the top of the cutover PR.
- Expected write downtime: about 40 minutes (steps 3 to 8). Reads stay up the whole time on one of the two sites.
- Plaintext traveler data only ever lands under `.cache/` (gitignored). Delete it after step 11.

## Files this runbook uses

| File | What it does here |
|---|---|
| `deploy/backup/backup.sh` (on the VPS: `/usr/local/lib/atr-backup/backup.sh`) | `--now` snapshot of old `/data` and Convex, same path as the nightly timer |
| `deploy/backup/restore-check.sh` | download, decrypt and check an `old/` object; `--keep` leaves `.cache/snapshot-<ts>/` |
| `deploy/backup/restore-convex.sh` | full Convex restore (rollback fallback; `runbook-restore.md`) |
| `scripts/convex-prod.sh` | every production Convex command (`run`, `env`, `deploy`, `migrate`) |
| `scripts/backup-status.ts` | freshness and disk check of the backup store |
| `.github/workflows/restore-test.yml` | the restore test, run by hand on `mig/next` |
| `deploy/coolify/README.md`, `deploy/coolify/env/*.template` | Coolify settings and env names for `trip-web` and Convex |
| `packages/migrate` (`node src/bin.ts`, through `scripts/convex-prod.sh migrate`) | import, export-v1, verify |
| `scripts/diff-legacy.ts` (task 4, **not built yet**) | repo vs live differences, decided in `docs/migration/reconcile.md` |
| `ATR_READ_ONLY` on `trip-site` (task 2, **not built yet** in `game/server.js`) | old site read-only, sign-in still works |

Keys on the laptop: `apps/web/.env.convex-prod` (admin key, mode 600), the owner age identity saved for the window as
`.cache/owner.agekey` (mode 600), the bucket read-only rclone config.

## Before the window (day before)

0a. Go/no-go record (plan section 15): every gate ticked in the cutover PR, including `spikes-recorded S1 … S25`, the
    rehearsal in `docs/migration/rehearsal.md`, and `git diff <rehearsal commit> -- pnpm-lock.yaml` empty.

0b. Backups fresh and restorable:
```sh
node scripts/backup-status.ts --dest <remote>:<bucket>/atr --convex          # exit 0
gh workflow run restore-test.yml --ref mig/next && gh run watch              # both legs green
```

## Cutover

**1. [PROD] Snapshot before the window** (on the VPS, as root):
```sh
ssh <vps> 'systemctl start atr-backup.service && journalctl -u atr-backup.service -n 20 --no-pager'
gh workflow run restore-test.yml --ref mig/next && gh run watch
```
Check: the journal ends with `backup: done (<ts>)`; the workflow is green.

**2. Window start.** Confirm the go/no-go record in the PR. The owner says "go" in their own words.

**3. [PROD] Old site read-only.** Coolify → `trip-site` → env `ATR_READ_ONLY=1` → redeploy. Check:
```sh
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<site>/api/swipe          # 503
curl -s -o /dev/null -w '%{http_code}\n' -d 'username=x&password=y' https://<site>/login   # 303 or 401 page, not 503
curl -fsS https://<site>/healthz                                                     # {"ok":true}
```

**4. [PROD] Final snapshot, then reconcile:**
```sh
ssh <vps> 'systemctl start atr-backup.service && journalctl -u atr-backup.service -n 20 --no-pager'
deploy/backup/restore-check.sh latest --dest <remote>:<bucket>/atr --identity .cache/owner.agekey --keep
#   -> restore-check: kept .cache/snapshot-<ts>   (use this <ts> below)
node scripts/diff-legacy.ts --repo . --live .cache/snapshot-<ts>                      # exit 0
```
Check: `restore-check` reports the manifest match and the old server on the restored files; `diff-legacy` exits 0
(every new repo-only line marked dropped or "replay after step 10" in `docs/migration/reconcile.md`).

**5. [PROD] Freeze Convex and import:**
```sh
scripts/convex-prod.sh run ops:setWritesFrozen '{"value": true}'
scripts/convex-prod.sh run ops:getWritesFrozen '{}'                                  # true
scripts/convex-prod.sh migrate import --src .cache/snapshot-<ts>
scripts/convex-prod.sh migrate export-v1 --out .cache/cutover-export-<ts>
scripts/convex-prod.sh migrate verify --src .cache/snapshot-<ts>                     # exit 0
```
Check: `verify` exit 0 and its counts equal `.cache/snapshot-<ts>/manifest.json`; paste the `verify` table in the PR.
`migrate import --target prod` refuses unless writes are frozen.

**6. [PROD] Seed the two accounts** (values typed or piped, never arguments):
```sh
for n in SEED_OWNER_USERNAME SEED_OWNER_PASSWORD SEED_GUEST_USERNAME SEED_GUEST_PASSWORD; do
  scripts/convex-prod.sh env set "$n"          # type the value at the prompt
done
scripts/convex-prod.sh run admin:seedAccounts '{}'
for n in SEED_OWNER_USERNAME SEED_OWNER_PASSWORD SEED_GUEST_USERNAME SEED_GUEST_PASSWORD; do
  scripts/convex-prod.sh env remove "$n"
done
scripts/convex-prod.sh env list | grep -c '^SEED_'                                   # 0
```

**7. [PROD] Unfreeze:**
```sh
scripts/convex-prod.sh run ops:setWritesFrozen '{"value": false}'
```

**8a. [PROD] Convex SITE_URL:**
```sh
printf 'https://<site>' | scripts/convex-prod.sh env set SITE_URL
scripts/convex-prod.sh env list                                                      # SITE_URL listed
```

**8b. [PROD] Trusted origins and deploy.** `TRUSTED_ORIGINS` must hold `https://<site>,https://new.<site>` (set in
task 8; to change it: `printf 'https://<site>,https://new.<site>' | scripts/convex-prod.sh env set TRUSTED_ORIGINS`).
```sh
scripts/convex-prod.sh deploy                                                        # exit 0
```

**8c. [PROD] trip-web origin.** Coolify → `trip-web` → env `ORIGIN=https://<site>` and `PUBLIC_SITE_URL=https://<site>`
→ redeploy. Check: healthy in Coolify.

**8d. [PROD] Swap the domains.** Coolify: `trip-web` gets `https://<site>` (port 3000); `trip-site` gets
`https://old.<site>` (port 4400), still read-only. Check:
```sh
curl -fsS https://<site>/healthz                     # "sha" = the mig/next head: git rev-parse origin/mig/next
curl -fsS 'https://<site>/healthz?deep=1'            # ok true, convex ok
read -rs p && printf %s "$p" | curl -s -o /dev/null -D - -H 'accept: text/html' --data-urlencode username=<owner> \
  --data-urlencode password@- https://<site>/login | grep -iE '^(HTTP|set-cookie)'; unset p          # 303 + Set-Cookie
curl -fsS https://old.<site>/healthz                 # {"ok":true}
```

**9. Smoke against production:**
```sh
BASE_URL=https://<site> corepack pnpm e2e --grep @smoke --project desktop             # exit 0
```

**10. [PROD] People check.** Owner and guest sign in on the phone and the laptop; one real swipe and one trip edit;
replay every line marked "replay after step 10" in `docs/migration/reconcile.md`. Check:
```sh
./atr feedback pull --from-convex && ./atr trip pull --from-convex                   # both changes present
```

**11. [PROD] Merge and point at main.** Merge the cutover PR (`mig/next` → `main`: pull default, `platform/lib/site.js`
`ACTIVE_SITE = 'new'`, SKILL.md, docs) through a pull request, never a direct push. Coolify → `trip-web` → branch
`main` → redeploy. Then:
```sh
ssh <vps> 'systemctl start atr-backup.service && journalctl -u atr-backup.service -n 20 --no-pager'
curl -fsS https://<site>/healthz                                                     # sha = the merge commit
node scripts/backup-status.ts --dest <remote>:<bucket>/atr --convex                  # exit 0
rm -rf .cache/snapshot-* .cache/cutover-export-* .cache/owner.agekey
```
Check: new objects in `convex/` and `convex-env/`.

## Rollback

**No longer available: the old site was retired (task 13).** Kept as history.

Trigger: any smoke failure, a data mismatch, an auth lockout, or the traveler asks. Possible until task 13.

**R1. [PROD] Freeze:**
```sh
scripts/convex-prod.sh run ops:setWritesFrozen '{"value": true}'
```
R1b. Every signed-in device shows 0 unsynced. If one does not: unfreeze (`'{"value": false}'`), let the outbox drain,
freeze again. A device that cannot connect uses "Copy pending changes"; the owner replays those in the old site after R5.

**R2. Export twice, prove it stable, keep a copy:**
```sh
scripts/convex-prod.sh migrate export-v1 --out .cache/rollback/a
scripts/convex-prod.sh migrate export-v1 --out .cache/rollback/b
(cd packages/migrate && node src/bin.ts verify --src ../../.cache/rollback/a --against ../../.cache/rollback/b)   # exit 0
ssh <vps> '/usr/local/lib/atr-backup/backup.sh --now --leg convex'
```

**R3. [PROD] Write the export into the old volume** (as root on the VPS; the only planned write to the live old
volume). `<volume>` is `OLD_DATA_DIR` in `/root/.config/atr-backup/backup.env`.
```sh
ts=$(date -u +%Y%m%dT%H%M%SZ)
ssh <vps> "mkdir -p <volume>/pre-rollback-$ts && cp -a <volume>/feedback <volume>/trip <volume>/pre-rollback-$ts/"
tar -C .cache/rollback/a -czf - feedback trip | ssh <vps> "tar -C <volume> -xzf - && chown -R node:node <volume>/feedback <volume>/trip"
```

**R4. [PROD] Reverse step 8:**
- Coolify: `<site>` back to `trip-site`, `new.<site>` back to `trip-web`.
- Coolify → `trip-site`: remove `ATR_READ_ONLY`, redeploy.
- Coolify → `trip-web`: `ORIGIN` and `PUBLIC_SITE_URL` back to `https://new.<site>`, redeploy.
```sh
printf 'https://new.<site>' | scripts/convex-prod.sh env set SITE_URL
scripts/convex-prod.sh deploy
```

**R5. Check:**
```sh
curl -fsS https://<site>/healthz                      # {"ok":true} (old site)
deploy/backup/restore-check.sh latest --dest <remote>:<bucket>/atr --identity .cache/owner.agekey   # after a fresh backup.sh --now --leg old
```
Counts from `/api/trip` and `/api/state` equal the rollback export (`.cache/rollback/a`), the traveler's last write is
visible, and a no-JS login POST to `https://<site>/login` returns 303 with `Set-Cookie`.

**R6.** Revert `site.js` and the pull default in a pull request.

Dropped on rollback by design: Better Auth sessions, `members`, `tripChanges`, `appliedOps` and `userId`. None holds
traveler data; the old site uses its unchanged env passwords.

## If Convex itself is lost during the window

Follow `runbook-restore.md` with the newest `convex/` and `convex-env/` objects (taken at step 1, 4 or R2), then resume
here at the step that failed.
