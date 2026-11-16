#!/usr/bin/env bash
# Nightly backup of the trip site (plan section 13). Runs on the VPS host from atr-backup.timer, or by hand:
#
#   deploy/backup/backup.sh                 the Convex leg (plus the old leg while OLD_DATA_DIR is set), then status
#   deploy/backup/backup.sh --now           the same, on demand (the cutover snapshot used exactly this path)
#   deploy/backup/backup.sh --leg old       one leg only: old | convex   (the status object is always written)
#   deploy/backup/backup.sh --config DIR    another config dir (default /root/.config/atr-backup)
#
# The old leg archives the retired old site's /data volume. It runs by default only while OLD_DATA_DIR is set in
# backup.env; leave OLD_DATA_DIR empty (or remove it) and the nightly job is the Convex leg alone.
#
# Objects, named by second (UTC) so a manual run never overwrites the nightly one; "newest" is the greatest key:
#   old/<ts>.tar.gz.age        old /data feedback/ + trip/ and manifest.json          age: owner + CI
#   convex/<ts>.tar.age        export.zip (convex export), v1-bundle.json, manifest   age: owner + CI
#   convex-env/<ts>.env.age    convex env list --include-values                       age: owner only
#   status/<ts>.json           {"ts", "diskFreeBytes"} in plaintext, nothing else
#
# Destination (BACKUP_DEST in backup.env): an rclone remote path such as `<remote>:<bucket>/atr` (put-only key:
# copyto with --s3-no-check-bucket --s3-no-head --no-check-dest), or an absolute local directory, which works
# today, before the bucket is chosen. Retention: the bucket's versioning and lifecycle rules for a remote; for a
# local directory this script keeps the 30 newest objects per prefix plus the newest of each of 12 older weeks.
#
# Host needs: bash, coreutils, tar, gzip, jq, age, docker (for the Convex CLI container) and rclone for a remote.
# No private key lives on the VPS; plaintext only ever sits in a mode-700 temp dir that is removed on exit.
# Nothing here prints a secret: the admin key is passed to the container by name (-e NAME), never as a value.
set -euo pipefail
umask 077

usage() { sed -n '2,25p' "$0"; exit 2; }

CONFIG_DIR="${ATR_BACKUP_CONFIG:-/root/.config/atr-backup}"
LEGS=()
while [[ $# -gt 0 ]]; do
	case "$1" in
		--now) shift ;; # same path as the timer; kept so runbooks read clearly
		--leg) [[ "${2:-}" =~ ^(old|convex)$ ]] || usage; LEGS=("$2"); shift 2 ;;
		--config) CONFIG_DIR="${2:?}"; shift 2 ;;
		-h | --help) usage ;;
		*) usage ;;
	esac
done

log() { printf 'backup: %s\n' "$*"; }
die() { printf 'backup: %s\n' "$*" >&2; exit 1; }

# KEY=value or KEY='value' from a file, without sourcing it (values may hold '|' or '$').
conf_get() { # file key
	local line
	line="$(grep -E "^$2=" "$1" | tail -n 1 || true)"
	line="${line#*=}"
	line="${line#\'}"; line="${line%\'}"
	line="${line#\"}"; line="${line%\"}"
	printf '%s' "$line"
}

file_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }
require_private() { # a file holding secrets must be owner-only
	[[ -f "$1" ]] || die "missing $1"
	local mode
	mode="$(file_mode "$1")"
	[[ "$mode" == 600 || "$mode" == 400 ]] || die "$1 must be mode 600 (is $mode)"
}

CONF="$CONFIG_DIR/backup.env"
[[ -f "$CONF" ]] || die "missing $CONF (template: deploy/coolify/env/backup.env.template)"
BACKUP_DEST="$(conf_get "$CONF" BACKUP_DEST)"
OLD_DATA_DIR="$(conf_get "$CONF" OLD_DATA_DIR)"
AGE_OWNER_RECIPIENT="$(conf_get "$CONF" AGE_OWNER_RECIPIENT)"
AGE_CI_RECIPIENT="$(conf_get "$CONF" AGE_CI_RECIPIENT)"
CONVEX_ENV_FILE="$(conf_get "$CONF" CONVEX_ENV_FILE)"; CONVEX_ENV_FILE="${CONVEX_ENV_FILE:-$CONFIG_DIR/convex.env}"
CONVEX_DOCKER_NETWORK="$(conf_get "$CONF" CONVEX_DOCKER_NETWORK)"; CONVEX_DOCKER_NETWORK="${CONVEX_DOCKER_NETWORK:-coolify}"
RCLONE_CONFIG_FILE="$(conf_get "$CONF" RCLONE_CONFIG)"; RCLONE_CONFIG_FILE="${RCLONE_CONFIG_FILE:-$CONFIG_DIR/rclone.conf}"
STATUS_DISK_PATH="$(conf_get "$CONF" STATUS_DISK_PATH)"; STATUS_DISK_PATH="${STATUS_DISK_PATH:-/}"
CONVEX_NODE_IMAGE="$(conf_get "$CONF" CONVEX_NODE_IMAGE)"; CONVEX_NODE_IMAGE="${CONVEX_NODE_IMAGE:-node:24-slim}"
CONVEX_CLI_VERSION=1.50.0

# Default legs: Convex, plus the old /data volume only while OLD_DATA_DIR names it.
if [[ ${#LEGS[@]} -eq 0 ]]; then
	if [[ -n "$OLD_DATA_DIR" ]]; then LEGS=(old convex); else LEGS=(convex); fi
fi

[[ -n "$BACKUP_DEST" ]] || die "BACKUP_DEST is not set in $CONF"
[[ "$AGE_OWNER_RECIPIENT" == age1* ]] || die "AGE_OWNER_RECIPIENT must be an age public key (age1…)"
[[ -z "$AGE_CI_RECIPIENT" || "$AGE_CI_RECIPIENT" == age1* ]] || die "AGE_CI_RECIPIENT must be an age public key"

# Overridable commands (a test can run age or the Convex CLI in a container): AGE, RCLONE, CONVEX_CLI.
read -r -a AGE_CMD <<<"${AGE:-age}"
read -r -a RCLONE_CMD <<<"${RCLONE:-rclone}"
command -v "${AGE_CMD[0]}" >/dev/null || die "age is not installed (apt install age)"
command -v jq >/dev/null || die "jq is not installed (apt install jq)"

is_local_dest() { [[ "$BACKUP_DEST" == /* ]]; }
if ! is_local_dest; then
	command -v "${RCLONE_CMD[0]}" >/dev/null || die "rclone is not installed"
	require_private "$RCLONE_CONFIG_FILE"
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/atr-backup.XXXXXX")"
chmod 700 "$STAGE"
trap 'rm -rf "$STAGE"' EXIT

sha256_of() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
bytes_of() { wc -c <"$1" | tr -d ' '; }
disk_free_bytes() { df -Pk "$1" | awk 'NR==2 {printf "%d", $4 * 1024}'; }

# Encrypt stdin to stdout for the given recipients (age reads and writes pipes only, so no key file is needed).
encrypt() { # recipients…
	local args=()
	for r in "$@"; do [[ -n "$r" ]] && args+=(-r "$r"); done
	"${AGE_CMD[@]}" "${args[@]}"
}

# ISO week (YYYY-WW) of a <YYYYMMDD>T… key, on GNU or BSD date.
week_of() {
	local d="${1:0:8}"
	date -u -d "$d" +%G-%V 2>/dev/null || date -u -j -f %Y%m%d "$d" +%G-%V
}

prune_local() { # prefix
	local dir="$BACKUP_DEST/$1" keep_newest=30 keep_weeks=12
	[[ -d "$dir" ]] || return 0
	local files=() f
	while IFS= read -r f; do files+=("$f"); done < <(find "$dir" -maxdepth 1 -type f -name '20*' -exec basename {} \; | sort -r)
	local i=0 weeks_kept=0 last_week="" week
	for f in "${files[@]+"${files[@]}"}"; do
		i=$((i + 1))
		[[ $i -le $keep_newest ]] && continue
		week="$(week_of "$f")"
		if [[ "$week" != "$last_week" && $weeks_kept -lt $keep_weeks ]]; then
			last_week="$week"; weeks_kept=$((weeks_kept + 1)); continue
		fi
		rm -f "$dir/$f"
	done
}

put() { # local file, object key (prefix/name)
	local src="$1" key="$2"
	if is_local_dest; then
		local dst="$BACKUP_DEST/$key"
		mkdir -p "$(dirname "$dst")"
		[[ ! -e "$dst" ]] || die "$key already exists; refusing to overwrite"
		cp "$src" "$dst.part" && mv "$dst.part" "$dst"
		prune_local "${key%%/*}"
	else
		"${RCLONE_CMD[@]}" --config "$RCLONE_CONFIG_FILE" copyto --s3-no-check-bucket --s3-no-head --no-check-dest \
			"$src" "$BACKUP_DEST/$key"
	fi
	log "uploaded $key ($(bytes_of "$src") bytes)"
}

# ---------------------------------------------------------------------------------------------------- old leg
# Copy one file; a JSONL whose last byte is not a newline is mid-write, so copy it again (3 tries).
stage_copy() { # src dst
	local try
	for try in 1 2 3; do
		cp -p "$1" "$2"
		if [[ "$2" != *.jsonl || ! -s "$2" || "$(tail -c 1 "$2" | od -An -c | tr -d ' ')" == '\n' ]]; then return 0; fi
		log "$(basename "$1") ends mid-line (try $try); copying again"
		sleep 1
	done
	die "$(basename "$1") still ends mid-line after 3 tries"
}

leg_old() {
	[[ -n "$OLD_DATA_DIR" ]] || die "OLD_DATA_DIR is not set in $CONF"
	[[ -d "$OLD_DATA_DIR/feedback" && -d "$OLD_DATA_DIR/trip" ]] || die "$OLD_DATA_DIR has no feedback/ and trip/"
	local work="$STAGE/old" entries="$STAGE/old-entries.jsonl" sub f rel lines
	mkdir -p "$work/feedback" "$work/trip"
	: >"$entries"
	for sub in feedback trip; do
		for f in "$OLD_DATA_DIR/$sub"/*; do
			[[ -f "$f" ]] || continue
			rel="$sub/$(basename "$f")"
			stage_copy "$f" "$work/$rel"
			case "$rel" in
				*.jsonl)
					# Every line is one JSON value (jq parses the stream; an empty line is skipped by both).
					jq -c . "$work/$rel" >/dev/null 2>&1 || die "$rel does not parse"
					lines="$(grep -c . "$work/$rel" || true)" ;;
				*.json)
					jq -e . "$work/$rel" >/dev/null 2>&1 || die "$rel does not parse"
					lines=1 ;;
				*) lines=0 ;;
			esac
			jq -cn --arg file "$rel" --argjson lines "$lines" --arg sha256 "$(sha256_of "$work/$rel")" \
				--argjson bytes "$(bytes_of "$work/$rel")" '{file: $file, lines: $lines, sha256: $sha256, bytes: $bytes, parse: "ok"}' \
				>>"$entries"
		done
	done
	jq -s --arg ts "$TS" --argjson free "$(disk_free_bytes "$OLD_DATA_DIR")" \
		'{ts: $ts, kind: "old", diskFreeBytes: $free, files: .}' "$entries" >"$work/manifest.json"
	tar -C "$work" -czf "$STAGE/old.tar.gz" manifest.json feedback trip
	encrypt "$AGE_OWNER_RECIPIENT" "$AGE_CI_RECIPIENT" <"$STAGE/old.tar.gz" >"$STAGE/old.tar.gz.age"
	rm -f "$STAGE/old.tar.gz"
	put "$STAGE/old.tar.gz.age" "old/$TS.tar.gz.age"
	log "old: $(jq '.files | length' "$work/manifest.json") file(s), $(jq '[.files[].lines] | add // 0' "$work/manifest.json") record(s)"
}

# ---------------------------------------------------------------------------------------------------- convex leg
# The Convex CLI, pinned. Default: a throwaway node container on the Coolify network, reading the URL and admin
# key from this process's environment by name. CONVEX_CLI overrides it (for example a local node + convex).
convex() {
	if [[ -n "${CONVEX_CLI:-}" ]]; then
		local cli
		read -r -a cli <<<"$CONVEX_CLI"
		(cd "$STAGE/convex" && "${cli[@]}" "$@")
	else
		docker run --rm -i --network "$CONVEX_DOCKER_NETWORK" -u "$(id -u):$(id -g)" \
			-e CONVEX_SELF_HOSTED_URL -e CONVEX_SELF_HOSTED_ADMIN_KEY \
			-e HOME=/tmp -e npm_config_cache=/tmp/npm -e npm_config_update_notifier=false \
			-v "$STAGE/convex:/work" -w /work "$CONVEX_NODE_IMAGE" npx --yes "convex@$CONVEX_CLI_VERSION" "$@"
	fi
}
convex_path() { if [[ -n "${CONVEX_CLI:-}" ]]; then printf '%s' "$STAGE/convex/$1"; else printf '/work/%s' "$1"; fi; }

leg_convex() {
	require_private "$CONVEX_ENV_FILE"
	CONVEX_SELF_HOSTED_URL="$(conf_get "$CONVEX_ENV_FILE" CONVEX_SELF_HOSTED_URL)"
	CONVEX_SELF_HOSTED_ADMIN_KEY="$(conf_get "$CONVEX_ENV_FILE" CONVEX_SELF_HOSTED_ADMIN_KEY)"
	[[ -n "$CONVEX_SELF_HOSTED_URL" && -n "$CONVEX_SELF_HOSTED_ADMIN_KEY" ]] ||
		die "$CONVEX_ENV_FILE needs CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY"
	export CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY
	local work="$STAGE/convex"
	mkdir -p "$work"
	chmod 777 "$work" # the CLI container runs as this uid, but some hosts remap it; the parent stays 700
	# The CLI insists on a package.json in its working directory, even for commands that need no code.
	printf '{"private": true, "dependencies": {"convex": "%s"}}\n' "$CONVEX_CLI_VERSION" >"$work/package.json"

	convex export --include-file-storage --path "$(convex_path export.zip)" >/dev/null
	[[ -s "$work/export.zip" ]] || die "convex export wrote nothing"
	# The v1 bundle (the same codec as GET /ops/export), through the admin key: no EXPORT_TOKEN on the VPS.
	convex run exporter:bundle '{}' >"$work/v1-bundle.json"
	jq -e '.format == "atr-v1-bundle"' "$work/v1-bundle.json" >/dev/null || die "exporter:bundle returned no bundle"
	jq --arg ts "$TS" --arg sha "$(sha256_of "$work/export.zip")" --argjson bytes "$(bytes_of "$work/export.zip")" \
		'{ts: $ts, kind: "convex", export: {file: "export.zip", sha256: $sha, bytes: $bytes},
		  v1: (.files | map_values({count, sha256}))}' "$work/v1-bundle.json" >"$work/manifest.json"
	tar -C "$work" -cf "$STAGE/convex.tar" export.zip v1-bundle.json manifest.json
	encrypt "$AGE_OWNER_RECIPIENT" "$AGE_CI_RECIPIENT" <"$STAGE/convex.tar" >"$STAGE/convex.tar.age"
	rm -f "$STAGE/convex.tar"
	put "$STAGE/convex.tar.age" "convex/$TS.tar.age"

	# Deployment env (BETTER_AUTH_SECRET, token hashes): straight from the CLI into age, owner recipient only.
	convex env list --include-values | encrypt "$AGE_OWNER_RECIPIENT" >"$STAGE/convex-env.age"
	put "$STAGE/convex-env.age" "convex-env/$TS.env.age"
	log "convex: $(jq '[.v1[].count] | add // 0' "$work/manifest.json") v1 record(s) in $(jq '.v1 | length' "$work/manifest.json") file(s)"
}

# ---------------------------------------------------------------------------------------------------- run
failed=()
for leg in "${LEGS[@]}"; do
	log "leg $leg ($TS)"
	# A subshell per leg, with errexit on inside it (an `if` around it would switch errexit off), so one failed
	# leg still lets the next one and the status object run.
	set +e
	(set -e; leg_"$leg")
	rc=$?
	set -e
	[[ $rc -eq 0 ]] || failed+=("$leg")
done

jq -n --arg ts "$TS" --argjson free "$(disk_free_bytes "$STATUS_DISK_PATH")" '{ts: $ts, diskFreeBytes: $free}' \
	>"$STAGE/status.json"
put "$STAGE/status.json" "status/$TS.json"

if [[ ${#failed[@]} -gt 0 ]]; then die "failed leg(s): ${failed[*]}"; fi
log "done ($TS)"
