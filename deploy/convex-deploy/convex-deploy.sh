#!/usr/bin/env bash
# Deploys the Convex functions of whatever trip-web build is live. Runs on the VPS host from atr-convex-deploy.timer
# (every minute), or by hand:
#
#   deploy/convex-deploy/convex-deploy.sh              one tick: deploy if the live image's commit is not deployed yet
#   deploy/convex-deploy/convex-deploy.sh --force      deploy now, even if that commit is recorded or in backoff
#   deploy/convex-deploy/convex-deploy.sh --config DIR another config dir (default /root/.config/atr-convex-deploy)
#   deploy/convex-deploy/convex-deploy.sh --state DIR  another state dir (default /var/lib/atr-convex-deploy)
#
# One tick: find the running containers named <APP_UUID>-… (Coolify's trip-web), take the newest one, wait while it
# is not healthy yet (mid-rollout), read the commit from its IMAGE (GIT_SHA in the image's env, else the image tag:
# Coolify tags each build <app uuid>:<commit> and sets GIT_SHA only at run time; the container's env is never read,
# it holds the runtime secrets), and compare it with <state>/deployed-sha. When they differ, run `convex deploy` from that same image
# (`docker run --rm <image id>`), so the functions always come from the commit the live app was built from. The
# image carries src/convex, convex.json, the pinned convex CLI and everything the functions import.
#
# Failure: the sha is not recorded, <state>/failures holds "<sha> <attempts> <epoch>", and the next try waits
# 1, 2, 4 … 60 minutes (a new commit retries at once). A tick with nothing to do prints nothing.
#
# Config (<config>/convex-deploy.env, KEY=value, never sourced): APP_UUID (required), CONVEX_ENV_FILE (default
# /root/.config/atr-backup/convex.env, mode 600: CONVEX_SELF_HOSTED_URL, CONVEX_SELF_HOSTED_ADMIN_KEY),
# CONVEX_DOCKER_NETWORK (default coolify), DEPLOY_MEMORY (docker --memory of the deploy container, default 768m).
# Nothing here prints a secret: the admin key reaches the container by name (-e NAME), never as a value.
set -euo pipefail
set +x
umask 077

usage() { sed -n '2,23p' "$0"; exit 2; }

CONFIG_DIR="${ATR_CONVEX_DEPLOY_CONFIG:-/root/.config/atr-convex-deploy}"
STATE_DIR="${ATR_CONVEX_DEPLOY_STATE:-/var/lib/atr-convex-deploy}"
FORCE=0
while [[ $# -gt 0 ]]; do
	case "$1" in
		--force) FORCE=1; shift ;;
		--config) CONFIG_DIR="${2:?}"; shift 2 ;;
		--state) STATE_DIR="${2:?}"; shift 2 ;;
		-h | --help) usage ;;
		*) usage ;;
	esac
done

log() { printf 'convex-deploy: %s\n' "$*"; }
die() { printf 'convex-deploy: %s\n' "$*" >&2; exit 1; }

# KEY=value or KEY='value' from a file, without sourcing it (the admin key holds '|').
conf_get() { # file key
	local line
	line="$(grep -E "^$2=" "$1" | tail -n 1 || true)"
	line="${line#*=}"
	line="${line#\'}"; line="${line%\'}"
	line="${line#\"}"; line="${line%\"}"
	printf '%s' "$line"
}
file_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }

CONF="$CONFIG_DIR/convex-deploy.env"
[[ -f "$CONF" ]] || die "missing $CONF (template: deploy/coolify/env/convex-deploy.env.template)"
APP_UUID="$(conf_get "$CONF" APP_UUID)"
CONVEX_ENV_FILE="$(conf_get "$CONF" CONVEX_ENV_FILE)"; CONVEX_ENV_FILE="${CONVEX_ENV_FILE:-/root/.config/atr-backup/convex.env}"
CONVEX_DOCKER_NETWORK="$(conf_get "$CONF" CONVEX_DOCKER_NETWORK)"; CONVEX_DOCKER_NETWORK="${CONVEX_DOCKER_NETWORK:-coolify}"
DEPLOY_MEMORY="$(conf_get "$CONF" DEPLOY_MEMORY)"; DEPLOY_MEMORY="${DEPLOY_MEMORY:-768m}"
[[ "$APP_UUID" =~ ^[a-z0-9]+$ ]] || die "APP_UUID in $CONF must be the Coolify app uuid (lowercase letters and digits)"

NOW="${ATR_CONVEX_DEPLOY_NOW:-$(date +%s)}" # tests pin the clock
DEPLOYED_FILE="$STATE_DIR/deployed-sha"
FAILURES_FILE="$STATE_DIR/failures"
mkdir -p "$STATE_DIR"

# One run at a time (a manual run beside the timer's): a lock directory holding the owner's pid; a lock whose
# process is gone (killed by MemoryMax, a reboot) is taken over.
LOCK="$STATE_DIR/lock"
if ! mkdir "$LOCK" 2>/dev/null; then
	holder="$(cat "$LOCK/pid" 2>/dev/null || true)"
	if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
		log "another run (pid $holder) is in progress; skipping"
		exit 0
	fi
	log "taking over a stale lock (pid ${holder:-unknown})"
	rm -rf "$LOCK"
	mkdir "$LOCK" || die "could not take the lock $LOCK"
fi
printf '%s\n' "$$" >"$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

# The newest running <APP_UUID>-… container: "<created> <name> <image id> <health> <image ref>".
newest_app_container() {
	local ids=() id name
	while read -r id name; do
		[[ "$name" == "$APP_UUID" || "$name" == "$APP_UUID"-* ]] && ids+=("$id")
	done < <(docker ps --no-trunc --format '{{.ID}} {{.Names}}')
	[[ ${#ids[@]} -gt 0 ]] || return 0
	docker inspect --format \
		'{{.Created}} {{.Name}} {{.Image}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.Config.Image}}' \
		"${ids[@]}" | sort | tail -n 1
}

image_git_sha() { # image id
	docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" | sed -n 's/^GIT_SHA=//p' | tail -n 1
}

backoff_seconds() { # attempts so far -> seconds to wait: 60, 120, 240 … capped at 3600
	local n="$1" s=60
	while [[ $n -gt 1 && $s -lt 3600 ]]; do s=$((s * 2)); n=$((n - 1)); done
	[[ $s -le 3600 ]] || s=3600
	printf '%s' "$s"
}

record_failure() { # sha reason
	local attempts=1 prev_sha prev_attempts
	if [[ -f "$FAILURES_FILE" ]]; then
		read -r prev_sha prev_attempts _ <"$FAILURES_FILE" || true
		[[ "$prev_sha" == "$1" && "$prev_attempts" =~ ^[0-9]+$ ]] && attempts=$((prev_attempts + 1))
	fi
	printf '%s %s %s\n' "$1" "$attempts" "$NOW" >"$FAILURES_FILE.tmp" && mv "$FAILURES_FILE.tmp" "$FAILURES_FILE"
	die "$2 (attempt $attempts); next try in $(($(backoff_seconds "$attempts") / 60)) min, or run with --force"
}

line="$(newest_app_container)"
if [[ -z "$line" ]]; then
	log "no running container named $APP_UUID-…; nothing to do"
	exit 0
fi
read -r _created name image health image_ref <<<"$line"
name="${name#/}"
case "$health" in
	healthy | none) ;;
	*) log "newest container $name is $health (rollout in progress); waiting"; exit 0 ;;
esac

sha="$(image_git_sha "$image")"
# Coolify builds without the GIT_SHA build argument and tags the image <app uuid>:<commit>.
if [[ -z "$sha" && "${image_ref:-}" == *:* ]]; then sha="${image_ref##*:}"; fi
deployed="$(cat "$DEPLOYED_FILE" 2>/dev/null || true)"
if [[ ! "$sha" =~ ^[0-9a-f]{7,40}$ ]]; then
	# Keyed by image so a bad image backs off like a failed deploy, and a new image retries at once.
	key="image:${image#sha256:}"; key="${key:0:18}"
	if [[ $FORCE -eq 0 && -f "$FAILURES_FILE" ]]; then
		read -r f_sha f_attempts f_at <"$FAILURES_FILE" || true
		[[ "$f_sha" == "$key" && $NOW -lt $((f_at + $(backoff_seconds "$f_attempts"))) ]] && exit 0
	fi
	record_failure "$key" "image of $name has no usable GIT_SHA and no commit in its tag (build it with --build-arg GIT_SHA=<commit>)"
fi

[[ $FORCE -eq 1 || "$sha" != "$deployed" ]] || exit 0

if [[ $FORCE -eq 0 && -f "$FAILURES_FILE" ]]; then
	read -r f_sha f_attempts f_at <"$FAILURES_FILE" || true
	if [[ "$f_sha" == "$sha" && "$f_attempts" =~ ^[0-9]+$ && "$f_at" =~ ^[0-9]+$ ]] &&
		[[ $NOW -lt $((f_at + $(backoff_seconds "$f_attempts"))) ]]; then
		exit 0 # still backing off; the failure was logged when it happened
	fi
fi

[[ -f "$CONVEX_ENV_FILE" ]] || die "missing $CONVEX_ENV_FILE (template: deploy/coolify/env/convex-admin.env.template)"
mode="$(file_mode "$CONVEX_ENV_FILE")"
[[ "$mode" == 600 || "$mode" == 400 ]] || die "$CONVEX_ENV_FILE must be mode 600 (is $mode)"
CONVEX_SELF_HOSTED_URL="$(conf_get "$CONVEX_ENV_FILE" CONVEX_SELF_HOSTED_URL)"
CONVEX_SELF_HOSTED_ADMIN_KEY="$(conf_get "$CONVEX_ENV_FILE" CONVEX_SELF_HOSTED_ADMIN_KEY)"
[[ -n "$CONVEX_SELF_HOSTED_URL" && -n "$CONVEX_SELF_HOSTED_ADMIN_KEY" ]] ||
	die "$CONVEX_ENV_FILE needs CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY"
export CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY

log "deploying functions of ${sha:0:12} (container $name, image ${image#sha256:}) to $CONVEX_SELF_HOSTED_URL; recorded: ${deployed:-none}"
started="$(date +%s)"
# The image's own CLI and sources (WORKDIR /app/web, its non-root user). Read-only root, a private /tmp as HOME,
# low CPU weight and a memory cap so it never crowds the live app; the key goes in by name only.
set +e
docker run --rm --network "$CONVEX_DOCKER_NETWORK" --read-only --tmpfs /tmp:rw,size=256m \
	--memory "$DEPLOY_MEMORY" --cpu-shares 256 --label atr.convex-deploy=1 \
	-e CONVEX_SELF_HOSTED_URL -e CONVEX_SELF_HOSTED_ADMIN_KEY -e HOME=/tmp -e CI=1 \
	--entrypoint node "$image" node_modules/convex/bin/main.js deploy --yes --typecheck disable --codegen disable
rc=$?
set -e
if [[ $rc -ne 0 ]]; then record_failure "$sha" "convex deploy of ${sha:0:12} failed (exit $rc)"; fi

printf '%s\n' "$sha" >"$DEPLOYED_FILE.tmp" && mv "$DEPLOYED_FILE.tmp" "$DEPLOYED_FILE"
rm -f "$FAILURES_FILE"
log "deployed functions of ${sha:0:12} in $(($(date +%s) - started)) s"
