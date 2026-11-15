#!/usr/bin/env bash
# Start the old site's image with a throwaway volume and check it serves (plan section 9, old-site job).
set -euo pipefail
image="$1"
port="${OLD_SITE_PORT:-4400}"
data="$(mktemp -d)"
chmod 777 "$data"
cid="$(docker run -d -e ATR_OWNER_PASSWORD=ci-only-not-a-real-password -v "$data:/data" -p "127.0.0.1:$port:4400" "$image")"
trap 'docker rm -f "$cid" >/dev/null; rm -rf "$data"' EXIT
for _ in $(seq 1 60); do
	if curl -fsS http://127.0.0.1:$port/healthz >/dev/null 2>&1; then break; fi
	sleep 1
done
curl -fsS http://127.0.0.1:$port/healthz
echo
status="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$port/api/trip)"
echo "GET /api/trip -> $status"
[[ "$status" == "401" || "$status" == "200" ]]
