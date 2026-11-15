#!/bin/sh
# Container start: refuse to run without the owner's password, seed the volume on first boot, drop root, serve.
set -eu
DATA="${ATR_STATE_DIR:-/data}"

if [ -z "${ATR_OWNER_PASSWORD:-}" ]; then
  echo "ATR_OWNER_PASSWORD is not set. Set it in Coolify (Environment Variables) before deploying: the site is public." >&2
  exit 1
fi
if [ -z "${ATR_GUEST_PASSWORD:-}" ]; then
  echo "ATR_GUEST_PASSWORD is not set: the read-only guest account is off."
fi

# First boot only: the image carries the repo's feedback/ and trip/ as a starting point.
# After that the volume is the only copy the site writes to, and deploys never touch it.
mkdir -p "$DATA"
for d in feedback trip; do
  if [ ! -d "$DATA/$d" ]; then
    mkdir -p "$DATA/$d"
    if [ -d "/app/$d" ]; then cp -R "/app/$d/." "$DATA/$d/"; fi
    echo "seeded $DATA/$d from the image"
  fi
done
mkdir -p "$DATA/cache"
rm -rf /app/.cache && ln -s "$DATA/cache" /app/.cache

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA"
  exec setpriv --reuid=node --regid=node --init-groups \
    node game/server.js --host 0.0.0.0 --port "${PORT:-4400}" --feedback "$DATA/feedback" --trip "$DATA/trip"
fi
exec node game/server.js --host 0.0.0.0 --port "${PORT:-4400}" --feedback "$DATA/feedback" --trip "$DATA/trip"
