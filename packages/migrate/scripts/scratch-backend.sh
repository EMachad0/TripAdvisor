#!/usr/bin/env bash
# A throwaway Convex backend for the migrate round trip, separate from the shared dev backend
# (scripts/convex-local.sh), so `import --replace` never touches anyone else's tables.
#
#   packages/migrate/scripts/scratch-backend.sh up      start it on 127.0.0.1:${MIGRATE_CONVEX_PORT:-3310}, push the
#                                                       schema and functions, write the admin key file
#   packages/migrate/scripts/scratch-backend.sh down    stop it and delete its data volume
#
# Same pinned image and compose file as the dev backend, another compose project and volume. The instance secret
# and admin key go to packages/migrate/.env.scratch (gitignored, mode 600) and are never printed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
COMPOSE_DIR="$ROOT/deploy/convex-local"
ENV_FILE="$HERE/.env.scratch"
PORT="${MIGRATE_CONVEX_PORT:-3310}"
SITE_PORT="${MIGRATE_CONVEX_SITE_PORT:-3311}"
PROJECT="atr-migrate-scratch"
CONVEX_BIN="$ROOT/apps/web/node_modules/convex/bin/main.js"

umask 077
rand() { node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'; }

compose() {
	INSTANCE_SECRET="$1" INSTANCE_NAME="$PROJECT" CONVEX_PORT="$PORT" CONVEX_SITE_PORT="$SITE_PORT" \
		docker compose -p "$PROJECT" -f "$COMPOSE_DIR/compose.yaml" "${@:2}"
}

secret() {
	[[ -f "$ENV_FILE" ]] && grep -q '^MIGRATE_INSTANCE_SECRET=' "$ENV_FILE" &&
		sed -n "s/^MIGRATE_INSTANCE_SECRET='\(.*\)'$/\1/p" "$ENV_FILE" && return
	rand
}

cmd_up() {
	local s key
	s="$(secret)"
	compose "$s" up -d --wait backend >/dev/null
	key="$(compose "$s" exec -T backend ./generate_admin_key.sh 2>/dev/null | tail -n 1 | tr -d '\r')"
	[[ "$key" == *"|"* ]] || { echo "scratch-backend: could not read the admin key" >&2; exit 1; }
	printf "MIGRATE_INSTANCE_SECRET='%s'\nCONVEX_SELF_HOSTED_URL='http://127.0.0.1:%s'\nCONVEX_SELF_HOSTED_ADMIN_KEY='%s'\n" \
		"$s" "$PORT" "$key" >"$ENV_FILE"
	chmod 600 "$ENV_FILE"
	# Push the schema (and functions) so imports are validated exactly as on the real deployment. No codegen:
	# apps/web/src/convex/_generated belongs to the integrator.
	(
		set -a
		# shellcheck disable=SC1090 # generated above
		. "$ENV_FILE"
		set +a
		cd "$ROOT/apps/web" && node "$CONVEX_BIN" deploy --yes --typecheck disable --codegen disable >/dev/null
	)
	echo "scratch-backend: http://127.0.0.1:$PORT ready; key in packages/migrate/.env.scratch (mode 600)"
}

cmd_down() {
	compose "$(secret)" down -v >/dev/null 2>&1 || true
	rm -f "$ENV_FILE"
	echo "scratch-backend: stopped and deleted"
}

case "${1:-}" in
	up) cmd_up ;;
	down) cmd_down ;;
	*) sed -n '2,10p' "$0"; exit 2 ;;
esac
