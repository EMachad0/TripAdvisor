#!/usr/bin/env bash
# CI e2e setup, all at once (.github/workflows/ci.yml). Playwright's webServers start the backend and then build
# the app, one after the other; on a 2-core runner that is most of a minute. This runs three parts in parallel:
#
#   backend  scripts/convex-local.sh e2e-prepare (up, deploy, env, accounts, the e2e data set)
#   build    vite build of apps/web for this slot
#   browser  the Playwright browser; WebKit also gets its system packages (the runner image has Chromium's),
#            from ATR_APT_ARCHIVES when it holds their .debs
#
#   scripts/e2e-prepare.sh <chromium|webkit>
#
# Then `ATR_E2E_PREPARED=1 pnpm e2e …` only starts the built app (apps/web/playwright.config.ts). Each part logs to
# its own file, printed as a folded group with its time once all three are done; any failure fails the script.
# Honours ATR_SLOT like scripts/convex-local.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"
BROWSER="${1:-}"
[[ "$BROWSER" == chromium || "$BROWSER" == webkit ]] || {
	echo "usage: scripts/e2e-prepare.sh <chromium|webkit>" >&2
	exit 2
}
SLOT="${ATR_SLOT:-0}"
[[ "$SLOT" =~ ^[0-8]$ ]] || { echo "e2e-prepare: ATR_SLOT must be 0 to 8" >&2; exit 2; }
LOGS="$(mktemp -d)"

part_backend() { "$ROOT/scripts/convex-local.sh" e2e-prepare; }

part_build() {
	cd "$WEB"
	# Kit checks the declared env (src/env.ts) while it builds; the server reads the real values when it starts
	# (the web webServer in playwright.config.ts). The same slot ports as e2e/slot.ts.
	PUBLIC_CONVEX_URL="http://127.0.0.1:$((3210 + 10 * SLOT))" \
		PUBLIC_CONVEX_SITE_URL="http://127.0.0.1:$((3211 + 10 * SLOT))" \
		PUBLIC_SITE_URL="http://localhost:$((4173 + SLOT))" \
		node_modules/.bin/vite build
}

# WebKit's system packages (about 180). With ATR_APT_ARCHIVES holding their .debs (CI caches them), dpkg installs
# them with no network, and `install-deps --dry-run` (apt-get's simulation) then fails if any is still missing,
# say after a Playwright upgrade. Otherwise Playwright's install-deps runs apt-get update and install against the
# Ubuntu mirror, which has stalled for minutes on CI: each try gets 150 s, and there are two.
webkit_deps() {
	local archives="${ATR_APT_ARCHIVES:-}" try
	if [[ -n "$archives" ]] && compgen -G "$archives/*.deb" >/dev/null; then
		if sudo dpkg -i "$archives"/*.deb >/dev/null &&
			node_modules/.bin/playwright install-deps --dry-run webkit; then
			echo "e2e-prepare: WebKit packages installed from $archives"
			return 0
		fi
		echo "e2e-prepare: the cached packages are not enough; installing from the mirror"
	fi
	for try in 1 2; do
		if timeout 150 node_modules/.bin/playwright install-deps webkit; then return 0; fi
		echo "e2e-prepare: install-deps try $try failed or timed out"
	done
	return 1
}

part_browser() {
	cd "$WEB"
	if [[ "$BROWSER" == webkit ]]; then webkit_deps; fi
	node_modules/.bin/playwright install "$BROWSER"
}

# Each log line starts with the seconds since the script started, so the slow step of a part shows.
stamp() {
	local line
	while IFS= read -r line; do printf '%4d s  %s\n' "$SECONDS" "$line"; done
}

names=()
pids=()
for part in backend build browser; do
	(
		start=$SECONDS
		"part_$part" 2>&1 | stamp
		echo "e2e-prepare: $part done in $((SECONDS - start)) s"
	) >"$LOGS/$part.log" 2>&1 &
	names+=("$part")
	pids+=("$!")
done

failed=()
for i in "${!pids[@]}"; do
	name="${names[$i]}"
	if wait "${pids[$i]}"; then status=ok; else status=FAILED; failed+=("$name"); fi
	echo "::group::$name ($status)"
	cat "$LOGS/$name.log"
	echo "::endgroup::"
done
rm -rf "$LOGS"
if ((${#failed[@]} > 0)); then
	echo "e2e-prepare: failed: ${failed[*]}" >&2
	exit 1
fi
echo "e2e-prepare: backend, build and $BROWSER ready after $SECONDS s"
