#!/usr/bin/env bash
# Check an old/ backup restores (plan section 13, restore test steps 1 and 2): decrypt, check every file against the
# manifest, boot the OLD server on the restored files, sign in, and compare /api/trip with the files.
#
#   deploy/backup/restore-check.sh latest --dest <dir | remote:path> --identity <age identity>
#   deploy/backup/restore-check.sh <old/<ts>.tar.gz.age> --identity <age identity>
#
# Plaintext goes to .cache/snapshot-<ts>/ (mode 700, gitignored); --keep leaves it there (the cutover's step 4 uses
# it), otherwise it is deleted on exit. The old server runs on 127.0.0.1 with a throwaway password.
set -euo pipefail
set +x
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
log() { printf 'restore-check: %s\n' "$*"; }
die() { printf 'restore-check: FAIL: %s\n' "$*" >&2; exit 1; }
usage() { sed -n '2,10p' "$0"; exit 2; }

WHAT="${1:-}"; [[ -n "$WHAT" ]] || usage; shift
DEST="" IDENTITY="" KEEP=0 PORT="${OLD_PORT:-4499}"
while [[ $# -gt 0 ]]; do
	case "$1" in
		--dest) DEST="${2:?}"; shift 2 ;;
		--identity) IDENTITY="${2:?}"; shift 2 ;;
		--keep) KEEP=1; shift ;;
		*) usage ;;
	esac
done
[[ -n "$IDENTITY" ]] || die "--identity is required"
read -r -a AGE_CMD <<<"${AGE:-age}"
sha256_of() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

TS="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$ROOT/.cache/snapshot-$TS"
mkdir -p "$WORK"
chmod 700 "$WORK"
server=""
cleanup() {
	[[ -z "$server" ]] || kill "$server" 2>/dev/null || true
	if [[ $KEEP -eq 0 ]]; then rm -rf "$WORK"; else log "kept $WORK"; fi
}
trap cleanup EXIT

if [[ "$WHAT" == latest ]]; then
	[[ -n "$DEST" ]] || die "latest needs --dest"
	if [[ "$DEST" == /* ]]; then
		key="$(find "$DEST/old" -maxdepth 1 -name '20*.tar.gz.age' -exec basename {} \; | sort | tail -n 1)"
		[[ -n "$key" ]] || die "no object in $DEST/old"
		cp "$DEST/old/$key" "$WORK/object.age"
	else
		key="$(rclone lsf --files-only "$DEST/old/" | grep '^20.*\.tar\.gz\.age$' | sort | tail -n 1)"
		[[ -n "$key" ]] || die "no object in $DEST/old"
		rclone copyto "$DEST/old/$key" "$WORK/object.age"
	fi
	log "newest old/ object: $key"
	OBJECT="$WORK/object.age"
else
	OBJECT="$WHAT"
fi

"${AGE_CMD[@]}" -d -i "$IDENTITY" <"$OBJECT" | tar -C "$WORK" -xzf -
[[ -f "$WORK/manifest.json" ]] || die "no manifest.json in the object"

# 1. every file against the manifest
n=0
while IFS=$'\t' read -r file sha; do
	[[ -f "$WORK/$file" ]] || die "$file is in the manifest but not in the object"
	[[ "$(sha256_of "$WORK/$file")" == "$sha" ]] || die "$file does not match its sha256"
	n=$((n + 1))
done < <(jq -r '.files[] | [.file, .sha256] | @tsv' "$WORK/manifest.json")
log "manifest: $n file(s) match (backup $(jq -r .ts "$WORK/manifest.json"))"

# 2. the old server on the restored files
PW="ci-only-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
ATR_OWNER_PASSWORD="$PW" ATR_OWNER_USER=ci-owner node "$ROOT/game/server.js" --host 127.0.0.1 --port "$PORT" \
	--feedback "$WORK/feedback" --trip "$WORK/trip" >"$WORK/server.log" 2>&1 &
server=$!
for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null || { cat "$WORK/server.log" >&2; die "old server did not start"; }
code="$(printf '%s' "$PW" | curl -sS -c "$WORK/cookies" -o /dev/null -w '%{http_code}' \
	--data-urlencode username=ci-owner --data-urlencode password@- "http://127.0.0.1:$PORT/login")"
unset PW
[[ "$code" == 303 ]] || die "sign-in on the old server returned $code"
curl -fsS -b "$WORK/cookies" "http://127.0.0.1:$PORT/api/trip" >"$WORK/api-trip.json"
diffs=0
for f in "$WORK"/trip/*.json; do
	col="$(basename "$f" .json)"
	want="$(jq '[.[]? | select(.id | type == "string")] | length' "$f")"
	got="$(jq --arg c "$col" '.trip[$c] | length' "$WORK/api-trip.json")"
	if [[ "$want" != "$got" ]]; then log "  trip/$col: file $want, /api/trip $got"; diffs=$((diffs + 1)); fi
done
curl -fsS -b "$WORK/cookies" "http://127.0.0.1:$PORT/api/state" >/dev/null || die "/api/state failed"
[[ $diffs -eq 0 ]] || die "$diffs trip collection(s) differ"
log "old server on the restored files: /healthz ok, sign-in 303, /api/trip matches $(find "$WORK/trip" -name '*.json' | wc -l | tr -d ' ') collection(s)"
