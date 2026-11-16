#!/usr/bin/env bash
# Restore a Convex backup onto a FRESH backend (plan section 13, runbook docs/migration/runbook-restore.md, spike
# S15). The same script runs the real restore (--prod, every command through scripts/convex-prod.sh, which asks
# before each write), the nightly restore test and a local drill (--slot N, scripts/convex-local.sh).
#
#   deploy/backup/restore-convex.sh (--slot N | --prod) \
#       (--backup convex/<ts>.tar.age --identity <age identity> | --from <decrypted dir>) \
#       (--env-backup convex-env/<ts>.env.age | --env-file <file>) \
#       [--expect-users owner,guest] [--seed-file <file>] [--ci-user] [--signin-file <file>] \
#       [--site-url https://cvx.<site>] [--reset-jwks] [--keep]
#
# Steps: 1 env set --force --from-file   2 deploy   3 import --replace-all   4 re-seed accounts that are missing
#        5 verify: (a) @atr/migrate verify of the restored data against the backup's v1 bundle, 0 differences;
#                  (b) every table's document count (app and Better Auth component) equals the backup's export;
#                  (c) the expected usernames exist; (d) with --signin-file, that user signs in.
#
# Files (all private, never printed):
#   --seed-file    SEED_OWNER_USERNAME, SEED_OWNER_PASSWORD, SEED_GUEST_USERNAME, SEED_GUEST_PASSWORD (used only when
#                  an expected user is missing; set as temporary Convex env vars from stdin, then removed)
#   --signin-file  USERNAME and PASSWORD (E2E_OWNER_USERNAME / E2E_OWNER_PASSWORD are accepted too)
# --reset-jwks: restore WITHOUT Better Auth's jwks table, so the backend makes a new signing key. Required when the
# env file carries a different BETTER_AUTH_SECRET from the backup's (the restore test's fresh secret): the stored
# private key is encrypted with the old secret, and sign-in then works but no Convex JWT can be issued. Sessions
# and passwords survive; open tabs fetch a new JWT on their own.
# Decrypted files go to .cache/restore-<ts>/ (mode 700, gitignored) and are deleted on exit unless --keep.
set -euo pipefail
set +x
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
usage() { sed -n '2,23p' "$0"; exit 2; }
log() { printf 'restore: %s\n' "$*"; }
die() { printf 'restore: FAIL: %s\n' "$*" >&2; exit 1; }

MODE="" SLOT="" BACKUP="" IDENTITY="" FROM="" ENV_BACKUP="" ENV_FILE="" EXPECT="" SEED_FILE="" CI_USER=0
SIGNIN_FILE="" SITE="" KEEP=0 RESET_JWKS=0
while [[ $# -gt 0 ]]; do
	case "$1" in
		--slot) MODE=local; SLOT="${2:?}"; shift 2 ;;
		--prod) MODE=prod; shift ;;
		--backup) BACKUP="${2:?}"; shift 2 ;;
		--identity) IDENTITY="${2:?}"; shift 2 ;;
		--from) FROM="${2:?}"; shift 2 ;;
		--env-backup) ENV_BACKUP="${2:?}"; shift 2 ;;
		--env-file) ENV_FILE="${2:?}"; shift 2 ;;
		--expect-users) EXPECT="${2:?}"; shift 2 ;;
		--seed-file) SEED_FILE="${2:?}"; shift 2 ;;
		--ci-user) CI_USER=1; shift ;;
		--signin-file) SIGNIN_FILE="${2:?}"; shift 2 ;;
		--site-url) SITE="${2:?}"; shift 2 ;;
		--keep) KEEP=1; shift ;;
		--reset-jwks) RESET_JWKS=1; shift ;;
		*) usage ;;
	esac
done
[[ -n "$MODE" ]] || usage
[[ -n "$BACKUP" || -n "$FROM" ]] || die "--backup or --from is required"
[[ -n "$ENV_BACKUP" || -n "$ENV_FILE" ]] || die "--env-backup or --env-file is required"
if [[ -n "$BACKUP" || -n "$ENV_BACKUP" ]]; then [[ -n "$IDENTITY" ]] || die "--identity is required to decrypt"; fi
read -r -a AGE_CMD <<<"${AGE:-age}"

conf_get() { # file key: KEY=value or KEY='value', never sourced
	local line
	line="$(grep -E "^$2=" "$1" | tail -n 1 || true)"
	line="${line#*=}"
	line="${line#\'}"; line="${line%\'}"
	line="${line#\"}"; line="${line%\"}"
	printf '%s' "$line"
}
sha256_of() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
# The Convex CLI runs from apps/web, so every path given on the command line is made absolute first.
abs() { [[ -z "$1" || "$1" == /* ]] && printf '%s' "$1" || printf '%s/%s' "$(cd "$(dirname "$1")" && pwd)" "$(basename "$1")"; }
BACKUP="$(abs "$BACKUP")"; IDENTITY="$(abs "$IDENTITY")"; FROM="$(abs "$FROM")"; ENV_BACKUP="$(abs "$ENV_BACKUP")"
ENV_FILE="$(abs "$ENV_FILE")"; SEED_FILE="$(abs "$SEED_FILE")"; SIGNIN_FILE="$(abs "$SIGNIN_FILE")"

# ---------------------------------------------------------------------------------------------------- target
if [[ "$MODE" == local ]]; then
	[[ "$SLOT" =~ ^[0-8]$ ]] || die "--slot takes 0 to 8"
	export ATR_SLOT="$SLOT"
	cvx() { "$ROOT/scripts/convex-local.sh" convex "$@"; }
	cvx_deploy() { "$ROOT/scripts/convex-local.sh" deploy; }
	migrate() { (cd "$ROOT/packages/migrate" && node src/bin.ts "$@" --target local); }
	[[ -n "$SITE" ]] || SITE="http://127.0.0.1:$((3211 + 10 * SLOT))"
	TARGET_LABEL="local slot $SLOT"
else
	cvx() {
		case "$1" in
			env) shift; "$ROOT/scripts/convex-prod.sh" env "$@" ;;
			*) "$ROOT/scripts/convex-prod.sh" "$@" ;;
		esac
	}
	cvx_deploy() { "$ROOT/scripts/convex-prod.sh" deploy; }
	migrate() { "$ROOT/scripts/convex-prod.sh" migrate "$@"; }
	[[ -n "$SITE" ]] || die "--prod needs --site-url https://cvx.<site> (Convex HTTP actions origin)"
	TARGET_LABEL="production"
fi

# ---------------------------------------------------------------------------------------------------- inputs
TS="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$ROOT/.cache/restore-$TS"
mkdir -p "$WORK"
chmod 700 "$WORK"
cleanup() { if [[ $KEEP -eq 0 ]]; then rm -rf "$WORK"; else log "kept $WORK"; fi; }
trap cleanup EXIT

if [[ -n "$BACKUP" ]]; then
	"${AGE_CMD[@]}" -d -i "$IDENTITY" <"$BACKUP" | tar -C "$WORK" -xf - export.zip v1-bundle.json manifest.json
	FROM="$WORK"
fi
for f in export.zip v1-bundle.json manifest.json; do [[ -s "$FROM/$f" ]] || die "$FROM/$f is missing"; done
[[ "$(sha256_of "$FROM/export.zip")" == "$(jq -r .export.sha256 "$FROM/manifest.json")" ]] ||
	die "export.zip does not match its manifest sha256"
if [[ -n "$ENV_BACKUP" ]]; then
	ENV_FILE="$WORK/convex.env"
	"${AGE_CMD[@]}" -d -i "$IDENTITY" <"$ENV_BACKUP" >"$ENV_FILE"
fi
[[ -s "$ENV_FILE" ]] || die "the env file is empty"
SITE_URL="$(conf_get "$ENV_FILE" SITE_URL)"
[[ -n "$SITE_URL" ]] || die "the env file has no SITE_URL"
log "target: $TARGET_LABEL; backup taken $(jq -r .ts "$FROM/manifest.json")"

# ---------------------------------------------------------------------------------------------------- 1-3
log "1/5 env set --force --from-file ($(grep -cE '^[A-Z0-9_]+=' "$ENV_FILE") variable(s), names only below)"
grep -oE '^[A-Z0-9_]+' "$ENV_FILE" | sed 's/^/  /'
step() { # name, command…: output goes to a log in the private work dir, shown only on failure
	local name="$1"
	shift
	if ! "$@" >"$WORK/$name.log" 2>&1; then
		cat "$WORK/$name.log" >&2
		die "$name failed"
	fi
}
step env-set cvx env set --force --from-file "$ENV_FILE"

log "2/5 deploy"
step deploy cvx_deploy

log "3/5 import --replace-all"
IMPORT_ZIP="$FROM/export.zip"
if [[ $RESET_JWKS -eq 1 ]]; then
	# --replace-all clears every table missing from the import, so dropping the jwks entries empties that table.
	IMPORT_ZIP="$WORK/import.zip"
	cp "$FROM/export.zip" "$IMPORT_ZIP"
	zip -q -d "$IMPORT_ZIP" '_components/betterAuth/jwks/*'
	log "  without _components/betterAuth/jwks (--reset-jwks)"
fi
step import cvx import --replace-all --yes "$IMPORT_ZIP"
grep -E '^✔ Added [0-9]+ documents' "$WORK/import.log" | sed 's/^/  /' || true
# Snapshot the restored state now, before step 4 adds any account, for the table count check (5b).
step export-after cvx export --include-file-storage --path "$WORK/after.zip"

# ---------------------------------------------------------------------------------------------------- 4 accounts
users_json() { cvx run admin:accountCounts "$(jq -cn --arg u "$1" '{usernames: ($u | split(",") | map(select(. != "")))}')"; }

log "4/5 accounts"
if [[ -n "$EXPECT" ]]; then
	present="$(users_json "$EXPECT")"
	missing="$(jq -r '[to_entries[] | select(.value != true) | .key] | join(",")' <<<"$present")"
	if [[ -n "$missing" ]]; then
		[[ -n "$SEED_FILE" ]] || die "account(s) missing after import: $missing (pass --seed-file to re-seed)"
		log "re-seeding missing account(s): $missing"
		for n in SEED_OWNER_USERNAME SEED_OWNER_PASSWORD SEED_GUEST_USERNAME SEED_GUEST_PASSWORD; do
			printf '%s' "$(conf_get "$SEED_FILE" "$n")" | cvx env set "$n" >/dev/null
		done
		status=0
		cvx run admin:seedAccounts '{}' >/dev/null || status=$?
		for n in SEED_OWNER_USERNAME SEED_OWNER_PASSWORD SEED_GUEST_USERNAME SEED_GUEST_PASSWORD; do
			cvx env remove "$n" >/dev/null
		done
		[[ $status -eq 0 ]] || die "admin:seedAccounts failed"
	fi
fi
if [[ $CI_USER -eq 1 ]]; then
	log "seeding ci_restore (refused unless ATR_CI_DEPLOYMENT=1)"
	cvx run admin:seedCiUser '{}' >/dev/null
fi

# ---------------------------------------------------------------------------------------------------- 5 verify
log "5/5 verify"
fail=0

# (a) traveler data: the v1 bundle the backup carried vs an export-v1 of the restored deployment.
mkdir -p "$WORK/v1"
while IFS= read -r rel; do
	mkdir -p "$WORK/v1/$(dirname "$rel")"
	jq -j --arg k "$rel" '.files[$k].content' "$FROM/v1-bundle.json" >"$WORK/v1/$rel"
	[[ "$(sha256_of "$WORK/v1/$rel")" == "$(jq -r --arg k "$rel" '.files[$k].sha256' "$FROM/v1-bundle.json")" ]] ||
		die "bundle file $rel does not match its sha256"
done < <(jq -r '.files | keys[]' "$FROM/v1-bundle.json")
if migrate verify --src "$WORK/v1" --report "$WORK/verify" >"$WORK/verify.txt" 2>&1; then
	log "  (a) migrate verify: 0 differences"
else
	cat "$WORK/verify.txt" >&2
	log "  (a) migrate verify: DIFFERENCES"
	fail=1
fi

# (b) every table, the Better Auth component's included: document counts right after the import vs the backup's.
table_counts() { # zip -> "path count" lines
	local p
	unzip -Z1 "$1" | grep '/documents\.jsonl$' | sort | while IFS= read -r p; do
		printf '%s %s\n' "${p%/documents.jsonl}" "$(unzip -p "$1" "$p" | grep -c . || true)"
	done
}
table_counts "$IMPORT_ZIP" >"$WORK/counts-before.txt"
table_counts "$WORK/after.zip" >"$WORK/counts-after.txt"
if [[ $RESET_JWKS -eq 1 ]]; then # the new signing key is not in the backup
	sed -i.bak '\|^_components/betterAuth/jwks |d' "$WORK/counts-before.txt" "$WORK/counts-after.txt"
fi
if diff -u "$WORK/counts-before.txt" "$WORK/counts-after.txt" >"$WORK/counts.diff"; then
	log "  (b) $(wc -l <"$WORK/counts-before.txt" | tr -d ' ') tables, $(awk '{s += $2} END {print s + 0}' "$WORK/counts-before.txt") documents: 0 differences"
else
	cat "$WORK/counts.diff" >&2
	log "  (b) table counts: DIFFERENCES"
	fail=1
fi

# (c) the expected usernames.
if [[ -n "$EXPECT" ]]; then
	missing="$(users_json "$EXPECT" | jq -r '[to_entries[] | select(.value != true) | .key] | join(",")')"
	if [[ -z "$missing" ]]; then log "  (c) accounts present: $EXPECT"; else log "  (c) accounts MISSING: $missing"; fail=1; fi
fi

# (d) a real sign-in through Better Auth on the Convex site (password from the file, on stdin only).
if [[ -n "$SIGNIN_FILE" ]]; then
	user="$(conf_get "$SIGNIN_FILE" USERNAME)"; [[ -n "$user" ]] || user="$(conf_get "$SIGNIN_FILE" E2E_OWNER_USERNAME)"
	pw="$(conf_get "$SIGNIN_FILE" PASSWORD)"; [[ -n "$pw" ]] || pw="$(conf_get "$SIGNIN_FILE" E2E_OWNER_PASSWORD)"
	code="$(printf '%s' "$pw" | jq -Rsc --arg u "$user" '{username: $u, password: ., rememberMe: false}' |
		curl -sS -c "$WORK/cookies" -o "$WORK/signin.json" -w '%{http_code}' -X POST "$SITE/api/auth/sign-in/username" \
			-H 'content-type: application/json' -H "origin: $SITE_URL" --data-binary @-)"
	unset pw
	if [[ "$code" == 200 ]] && jq -e '.user.id // .token' "$WORK/signin.json" >/dev/null 2>&1; then
		log "  (d) sign-in as $user: ok"
		# The Convex JWT the app needs for every query: fails when the restored signing key cannot be decrypted
		# (a different BETTER_AUTH_SECRET without --reset-jwks).
		code="$(curl -sS -b "$WORK/cookies" -o "$WORK/token.json" -w '%{http_code}' "$SITE/api/auth/convex/token" \
			-H "origin: $SITE_URL")"
		if [[ "$code" == 200 ]] && jq -e '.token | length > 0' "$WORK/token.json" >/dev/null 2>&1; then
			log "  (d) Convex JWT for $user: ok"
		else
			log "  (d) Convex JWT for $user: FAILED (HTTP $code; a new BETTER_AUTH_SECRET needs --reset-jwks)"
			fail=1
		fi
	else
		log "  (d) sign-in as $user: FAILED (HTTP $code)"
		fail=1
	fi
fi

[[ $fail -eq 0 ]] || die "verify found problems (see above)"
log "restore verified on $TARGET_LABEL"
