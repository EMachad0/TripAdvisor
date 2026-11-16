#!/usr/bin/env bash
# Check an old/ backup (the retired old site's /data) still restores: decrypt it and check every file against its
# manifest, and that every JSON and JSONL file parses. (Until the old site was retired this also booted the old
# server on the restored files; that server is gone. The live data is in Convex: restore-convex.sh.)
#
#   deploy/backup/restore-check.sh latest --dest <dir | remote:path> --identity <age identity>
#   deploy/backup/restore-check.sh <old/<ts>.tar.gz.age> --identity <age identity>
#
# Plaintext goes to .cache/snapshot-<ts>/ (mode 700, gitignored); --keep leaves it there, otherwise it is deleted on
# exit.
set -euo pipefail
set +x
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
log() { printf 'restore-check: %s\n' "$*"; }
die() { printf 'restore-check: FAIL: %s\n' "$*" >&2; exit 1; }
usage() { sed -n '2,9p' "$0"; exit 2; }

WHAT="${1:-}"; [[ -n "$WHAT" ]] || usage; shift
DEST="" IDENTITY="" KEEP=0
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
cleanup() {
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

# 2. every JSON and JSONL file parses
for f in "$WORK"/feedback/* "$WORK"/trip/*; do
	[[ -f "$f" ]] || continue
	case "$f" in
		*.jsonl) jq -c . "$f" >/dev/null 2>&1 || die "${f#"$WORK"/} does not parse" ;;
		*.json) jq -e . "$f" >/dev/null 2>&1 || die "${f#"$WORK"/} does not parse" ;;
	esac
done
log "every JSON and JSONL file parses ($(find "$WORK/trip" -name '*.json' | wc -l | tr -d ' ') trip collection(s))"
