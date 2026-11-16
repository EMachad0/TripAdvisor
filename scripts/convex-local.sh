#!/usr/bin/env bash
# The local (dev and CI) self-hosted Convex backend: deploy/convex-local/compose.yaml.
#
#   scripts/convex-local.sh up        start the backend (127.0.0.1:3210/3211), create the admin key on first run
#   scripts/convex-local.sh key       (re)generate the admin key into apps/web/.env.convex-local (mode 600)
#   scripts/convex-local.sh init-env  set SITE_URL, TRUSTED_ORIGINS, BETTER_AUTH_SECRET and test switches
#   scripts/convex-local.sh deploy    push apps/web/src/convex to the backend
#   scripts/convex-local.sh seed      seed the owner and guest accounts from apps/web/.env.e2e.local
#   scripts/convex-local.sh seed-data load the e2e data set: packages/migrate/fixtures/e2e (feedback + trip, replacing
#                                     those tables) and the content index of its content root (places, areas, legs)
#   scripts/convex-local.sh e2e-backend  up + deploy + init-env + seed + seed-data, then wait (Playwright webServer)
#   scripts/convex-local.sh convex …  any convex CLI command against the local backend (run, env, logs, …)
#   scripts/convex-local.sh down      stop it (data kept);  reset: stop and delete the data volume
#   scripts/convex-local.sh status    print this slot's ports, compose project and files
#
# Parallel slots: ATR_SLOT=<1..8> (default 0) gives every command its own compose project and data volume
# (atr-convex-local-s<n>), ports (3210+10n / 3211+10n), app origin (http://localhost:<4173+n>) and env files
# (suffix .s<n>). Slot 0 is exactly the plain setup. See docs/migration/DEV.md.
#
# Secrets (instance secret, admin key, generated test passwords and tokens) are written to gitignored files with
# mode 600 and never printed. This script refuses to talk to anything but 127.0.0.1.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$ROOT/deploy/convex-local"
WEB="$ROOT/apps/web"

# The slot (keep the numbers in step with apps/web/e2e/slot.ts).
SLOT="${ATR_SLOT:-0}"
[[ "$SLOT" =~ ^[0-8]$ ]] || { echo "convex-local: ATR_SLOT must be 0 to 8" >&2; exit 2; }
if [[ "$SLOT" == 0 ]]; then SUFFIX=""; PROJECT="atr-convex-local"; INSTANCE="atr-local"
else SUFFIX=".s$SLOT"; PROJECT="atr-convex-local-s$SLOT"; INSTANCE="atr-local-s$SLOT"; fi
COMPOSE_ENV="$COMPOSE_DIR/.env$SUFFIX"
KEY_FILE="$WEB/.env.convex-local$SUFFIX"
E2E_FILE="$WEB/.env.e2e.local$SUFFIX"
TOKENS_FILE="$WEB/.env.tokens.local$SUFFIX"
if [[ "$SLOT" == 0 ]]; then
	PORT="${CONVEX_PORT:-3210}"
	SITE_PORT="${CONVEX_SITE_PORT:-3211}"
	DASHBOARD_PORT="${DASHBOARD_PORT:-6791}"
else
	PORT=$((3210 + 10 * SLOT))
	SITE_PORT=$((3211 + 10 * SLOT))
	DASHBOARD_PORT=$((6791 + SLOT))
fi
APP_ORIGIN="${PUBLIC_SITE_URL:-http://localhost:$((4173 + SLOT))}"
E2E_DATA="$ROOT/packages/migrate/fixtures/e2e"

umask 077
compose() {
	CONVEX_PORT="$PORT" CONVEX_SITE_PORT="$SITE_PORT" DASHBOARD_PORT="$DASHBOARD_PORT" INSTANCE_NAME="$INSTANCE" \
		docker compose -p "$PROJECT" --project-directory "$COMPOSE_DIR" --env-file "$COMPOSE_ENV" \
		-f "$COMPOSE_DIR/compose.yaml" "$@"
}
rand() { node -e 'process.stdout.write(require("node:crypto").randomBytes(Number(process.argv[1])).toString(process.argv[2]))' "$1" "$2"; }

ensure_compose_env() {
	if [[ ! -f "$COMPOSE_ENV" ]]; then
		printf 'INSTANCE_SECRET=%s\n' "$(rand 32 hex)" >"$COMPOSE_ENV"
		chmod 600 "$COMPOSE_ENV"
	fi
}

load_key() {
	[[ -f "$KEY_FILE" ]] || { echo "convex-local: no admin key yet; run scripts/convex-local.sh up" >&2; exit 1; }
	grep -qE "^CONVEX_SELF_HOSTED_ADMIN_KEY='[^']+'$" "$KEY_FILE" || {
		echo "convex-local: apps/web/.env.convex-local$SUFFIX is malformed; run scripts/convex-local.sh key" >&2
		exit 1
	}
	set -a
	# shellcheck disable=SC1090 # generated file: CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY
	. "$KEY_FILE" 2>/dev/null
	set +a
	case "$CONVEX_SELF_HOSTED_URL" in
		"http://127.0.0.1:$PORT") ;;
		http://127.0.0.1:*) echo "convex-local: apps/web/.env.convex-local$SUFFIX is for another port; run key" >&2; exit 1 ;;
		*) echo "convex-local: refusing a non-local backend" >&2; exit 1 ;;
	esac
}

CONVEX_BIN="$WEB/node_modules/convex/bin/main.js"
convex_cli() { load_key; cd "$WEB" && exec node "$CONVEX_BIN" "$@"; }

cmd_key() {
	ensure_compose_env
	local key
	key="$(compose exec -T backend ./generate_admin_key.sh 2>/dev/null | tail -n 1 | tr -d '\r')"
	[[ "$key" == *"|"* ]] || { echo "convex-local: could not read the admin key from the backend" >&2; exit 1; }
	# Single-quoted: the key contains '|', which an unquoted value would turn into a pipe when sourced.
	printf "CONVEX_SELF_HOSTED_URL='http://127.0.0.1:%s'\nCONVEX_SELF_HOSTED_ADMIN_KEY='%s'\n" "$PORT" "$key" >"$KEY_FILE"
	chmod 600 "$KEY_FILE"
	echo "convex-local: admin key written to apps/web/.env.convex-local$SUFFIX (mode 600)"
}

cmd_up() {
	ensure_compose_env
	compose up -d --wait backend
	[[ -f "$KEY_FILE" ]] || cmd_key
	echo "convex-local: slot $SLOT backend on http://127.0.0.1:$PORT (HTTP actions on :$SITE_PORT)"
}

set_env() { # name, value from stdin
	(load_key; cd "$WEB" && node "$CONVEX_BIN" env set "$1" >/dev/null)
}

# CONTENT_TOKEN and EXPORT_TOKEN for this slot (apps/web/e2e/slot.ts ensureTokensFile writes the same file).
ensure_tokens_file() {
	if [[ ! -f "$TOKENS_FILE" ]]; then
		printf 'CONTENT_TOKEN=%s\nEXPORT_TOKEN=%s\n' "$(rand 24 base64url)" "$(rand 24 base64url)" >"$TOKENS_FILE"
		chmod 600 "$TOKENS_FILE"
	fi
}
token_of() { sed -n "s/^$1=//p" "$TOKENS_FILE"; }
sha256_stdin() { node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>process.stdout.write(require("node:crypto").createHash("sha256").update(s).digest("hex")))'; }

cmd_init_env() {
	local names
	names="$(load_key; cd "$WEB" && node "$CONVEX_BIN" env list --names-only 2>/dev/null || true)"
	printf '%s' "$APP_ORIGIN" | set_env SITE_URL
	printf '%s' "${TRUSTED_ORIGINS:-http://127.0.0.1:4173,http://localhost:5173,http://127.0.0.1:5173}" | set_env TRUSTED_ORIGINS
	if ! grep -qx 'BETTER_AUTH_SECRET' <<<"$names"; then rand 32 base64 | set_env BETTER_AUTH_SECRET; fi
	# Test-deployment switches (never set on prod): the CI-only probes, a short JWT for spike S9, and a sign-in
	# backstop high enough for a Playwright run.
	printf '1' | set_env ATR_CI_DEPLOYMENT
	printf '%s' "${JWT_EXPIRATION_SECONDS:-60}" | set_env JWT_EXPIRATION_SECONDS
	printf '%s' "${AUTH_SIGNIN_LIMIT_PER_MINUTE:-200}" | set_env AUTH_SIGNIN_LIMIT_PER_MINUTE
	# Only the hashes go to Convex; the tokens stay in apps/web/.env.tokens.local$SUFFIX.
	ensure_tokens_file
	token_of CONTENT_TOKEN | tr -d '\n' | sha256_stdin | set_env CONTENT_TOKEN_SHA256
	token_of EXPORT_TOKEN | tr -d '\n' | sha256_stdin | set_env EXPORT_TOKEN_SHA256
	echo "convex-local: SITE_URL, TRUSTED_ORIGINS, BETTER_AUTH_SECRET, token hashes and the test switches set"
}

cmd_deploy() {
	load_key
	# Slot 0 also regenerates src/convex/_generated (as before); other slots never write it, so two concurrent
	# deploys in one checkout cannot interleave writes to the generated files.
	local codegen=()
	[[ "$SLOT" == 0 ]] || codegen=(--codegen disable)
	cd "$WEB" && node "$CONVEX_BIN" deploy --yes --typecheck disable ${codegen[@]+"${codegen[@]}"}
}

ensure_e2e_file() {
	if [[ ! -f "$E2E_FILE" ]]; then
		printf 'E2E_OWNER_USERNAME=owner\nE2E_OWNER_PASSWORD=%s\nE2E_GUEST_USERNAME=guest\nE2E_GUEST_PASSWORD=%s\n' \
			"$(rand 18 base64url)" "$(rand 18 base64url)" >"$E2E_FILE"
		chmod 600 "$E2E_FILE"
		echo "convex-local: generated test passwords in apps/web/.env.e2e.local$SUFFIX (mode 600)"
	fi
}

cmd_seed() {
	ensure_e2e_file
	set -a
	# shellcheck disable=SC1090 # generated file with the local test accounts
	. "$E2E_FILE"
	set +a
	printf '%s' "$E2E_OWNER_USERNAME" | set_env SEED_OWNER_USERNAME
	printf '%s' "$E2E_OWNER_PASSWORD" | set_env SEED_OWNER_PASSWORD
	printf '%s' "$E2E_GUEST_USERNAME" | set_env SEED_GUEST_USERNAME
	printf '%s' "$E2E_GUEST_PASSWORD" | set_env SEED_GUEST_PASSWORD
	local status=0
	(load_key; cd "$WEB" && node "$CONVEX_BIN" run admin:seedAccounts '{}') || status=$?
	for n in SEED_OWNER_USERNAME SEED_OWNER_PASSWORD SEED_GUEST_USERNAME SEED_GUEST_PASSWORD; do
		(load_key; cd "$WEB" && node "$CONVEX_BIN" env remove "$n" >/dev/null)
	done
	return "$status"
}

# The e2e data set: feedback and trip tables from packages/migrate/fixtures/e2e (each table replaced atomically,
# so a rerun starts from the same data), then the content index of its content root through POST
# /ops/content-index (the same route trip-web uses at boot).
cmd_seed_data() {
	ensure_tokens_file
	(cd "$ROOT/packages/migrate" && ATR_SLOT="$SLOT" node src/bin.ts import --src "$E2E_DATA" --target local \
		--report "$ROOT/.cache/e2e-seed$SUFFIX")
	(CONTENT_TOKEN="$(token_of CONTENT_TOKEN)" ATR_ROOT="$E2E_DATA/content" \
		node "$WEB/scripts/content-index.ts" --fixtures --publish "http://127.0.0.1:$SITE_PORT")
}

cmd_status() {
	printf 'slot %s: compose project %s, convex http://127.0.0.1:%s (site :%s), app %s\n' \
		"$SLOT" "$PROJECT" "$PORT" "$SITE_PORT" "$APP_ORIGIN"
	printf 'files: %s %s %s %s\n' "${COMPOSE_ENV#"$ROOT/"}" "${KEY_FILE#"$ROOT/"}" "${E2E_FILE#"$ROOT/"}" \
		"${TOKENS_FILE#"$ROOT/"}"
}

# Everything Playwright needs, then stay in the foreground (its webServer stops this process at the end; the
# container keeps running for the next run).
cmd_e2e_backend() {
	cmd_up
	cmd_deploy
	cmd_init_env
	cmd_seed
	cmd_seed_data
	echo "convex-local: e2e backend ready"
	exec tail -f /dev/null
}

case "${1:-}" in
	up) cmd_up ;;
	e2e-backend) cmd_e2e_backend ;;
	key) cmd_key ;;
	init-env) cmd_init_env ;;
	deploy) cmd_deploy ;;
	seed) cmd_seed ;;
	seed-data) cmd_seed_data ;;
	status) cmd_status ;;
	convex) shift; convex_cli "$@" ;;
	down) compose down ;;
	reset) compose down -v; rm -f "$KEY_FILE" ;;
	*) sed -n '2,24p' "$0"; exit 2 ;;
esac
