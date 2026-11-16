# Runbook: restore Convex from a backup

Plan section 13. Use it for a lost or corrupted Convex volume, a new VPS, or a bad write that has to be undone. The
old site's own runbook is `runbook-restore-old.md` (task 2). Steps marked **(owner)** change production: the owner
confirms each one, and `scripts/convex-prod.sh` asks for the host before every write. You are responsible for every
command you run here, the same as if you typed it by hand.

The script is `deploy/backup/restore-convex.sh`, the same one the nightly restore test runs. It was drilled end to
end on 2026-11-15 (22:51 UTC) on a fresh local backend (spike S15): `migrate verify` 0 differences, 32 tables and 99
documents equal, owner and guest present, owner signs in and gets a Convex JWT, and the built `trip-web` image signs
in owner and guest after the restore.

## What a backup holds

| Object | Contents | Who can decrypt |
|---|---|---|
| `convex/<UTC ts>.tar.age` | `export.zip` (`convex export --include-file-storage`: every app table and the Better Auth component), `v1-bundle.json` (the v1 files, as `GET /ops/export`), `manifest.json` (export sha256, v1 counts) | owner, CI |
| `convex-env/<UTC ts>.env.age` | `convex env list --include-values` (`SITE_URL`, `TRUSTED_ORIGINS`, `BETTER_AUTH_SECRET`, the token hashes) | owner only |

## Steps

1. Get the owner age identity and the bucket read-only key from the password manager. Save the identity as
   `.cache/owner.agekey` (mode 600; `.cache/` is gitignored) and the rclone config as `~/.config/rclone/rclone.conf`.
2. Pick the backup: the newest pair with the same timestamp, unless you are undoing a bad write (then the last one
   before it).
   ```sh
   rclone lsf <remote>:<bucket>/atr/convex/ | sort | tail -n 3
   rclone copyto <remote>:<bucket>/atr/convex/<ts>.tar.age      .cache/restore-in/convex.tar.age
   rclone copyto <remote>:<bucket>/atr/convex-env/<ts>.env.age  .cache/restore-in/convex-env.age
   ```
   Until the bucket exists, the objects are in the local `BACKUP_DEST` directory on the VPS: copy them with
   `scp <vps>:<BACKUP_DEST>/convex/<ts>.tar.age .cache/restore-in/` (and the `convex-env/` one).
3. **(owner)** A fresh backend: in Coolify, stop `trip-web`; then either deploy a new Convex compose resource from
   `deploy/coolify/convex.compose.yaml` with a new `convex-data` volume, or (same VPS) stop the service, rename the
   volume and start it again. Generate a new admin key in the backend terminal (`./generate_admin_key.sh`) and write it
   to `apps/web/.env.convex-prod` (mode 600). Check: `scripts/convex-prod.sh status`.
4. **(owner)** Restore. It asks for the host before each write (env set, deploy, import):
   ```sh
   deploy/backup/restore-convex.sh --prod --site-url https://cvx.<site> \
     --backup .cache/restore-in/convex.tar.age --env-backup .cache/restore-in/convex-env.age \
     --identity .cache/owner.agekey --expect-users <owner username>,guest
   ```
   It runs `env set --force --from-file`, `deploy`, `import --replace-all`, then checks: `migrate verify` of the
   restored data against the backup's v1 bundle (0 differences), every table's document count against the backup's
   export, and that the usernames exist. Add `--signin-file <file>` (lines `USERNAME=` and `PASSWORD=`, mode 600) to
   also sign in and fetch a Convex JWT.
   - Accounts missing (a backup older than the accounts): add `--seed-file <file>` with `SEED_OWNER_USERNAME`,
     `SEED_OWNER_PASSWORD`, `SEED_GUEST_USERNAME`, `SEED_GUEST_PASSWORD` (mode 600). The script sets them as temporary
     Convex env vars from stdin, runs `admin:seedAccounts` and removes them; check after with
     `scripts/convex-prod.sh env list | grep -c '^SEED_'` (prints 0).
   - The env object lost or unreadable: write a new env file with `SITE_URL`, `TRUSTED_ORIGINS`, a NEW
     `BETTER_AUTH_SECRET`, `CONTENT_TOKEN_SHA256` and `EXPORT_TOKEN_SHA256`, pass it as `--env-file`, and add
     `--reset-jwks`: the stored JWT signing key is encrypted with the old secret, so without it sign-in works but no
     Convex JWT can be issued (seen in the drill: `/api/auth/convex/token` 500). Sessions and passwords survive.
5. **(owner)** In Coolify, start `trip-web` (if the Convex hosts changed, update `PUBLIC_CONVEX_URL` and
   `PUBLIC_CONVEX_SITE_URL` first). Check:
   ```sh
   curl -fsS 'https://<site>/healthz?deep=1'
   ```
   Then sign in on the phone and check the last change the traveler remembers.
6. Delete the plaintext: `rm -rf .cache/restore-in .cache/owner.agekey` (the script already deleted its own
   `.cache/restore-<ts>/`).

## Restore into the OLD site instead

The `v1-bundle.json` inside `convex/<ts>.tar.age` holds the v1 files. Unpack it with the script's `--keep` run, or:
`age -d -i .cache/owner.agekey .cache/restore-in/convex.tar.age | tar -xO v1-bundle.json > .cache/v1-bundle.json`,
then follow `runbook-restore-old.md` from its step 3 with those files (the rollback in `cutover.md` does exactly this).

## Drill locally (no production access)

```sh
ATR_SLOT=6 scripts/convex-local.sh e2e-backend   # or up + deploy + init-env + seed + seed-data on a slot
deploy/backup/backup.sh --config <dir>            # backup.env with BACKUP_DEST=<local dir>, CONVEX_DOCKER_NETWORK=host
ATR_SLOT=6 scripts/convex-local.sh reset && ATR_SLOT=6 scripts/convex-local.sh up
deploy/backup/restore-convex.sh --slot 6 --backup <dir>/convex/<ts>.tar.age --env-backup <dir>/convex-env/<ts>.env.age \
  --identity <owner key> --expect-users owner,guest --signin-file apps/web/.env.e2e.local.s6
```

On macOS, run the CLI container's staging dir under the repo (`TMPDIR=$PWD/.cache/tmp`): Docker Desktop does not
share `/var/folders` or `/private/tmp` into containers.
