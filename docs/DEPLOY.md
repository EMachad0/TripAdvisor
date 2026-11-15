# Deploying the trip site

The site runs on a VPS under Coolify, built from the `Dockerfile` at the repo root.

## What lives where

| Data | Lives in | Changes by |
|---|---|---|
| Code, `places/`, `areas/`, `config/` | Git, baked into the image | A merge to `main`, which Coolify deploys |
| `feedback/` and `trip/` (swipes, notes, route, itinerary, money) | The `/data` volume on the VPS | The site, as the traveler uses it |
| Map tiles and other caches | `/data/cache` | The site |

The image carries the repo's `feedback/` and `trip/` only as a seed. On the first boot the entrypoint copies them to `/data`; after that the volume is the only live copy and deploys never touch it.

Curators and the Ask boxes run on the laptop, not on the server. The hosted site has `ATR_ASK=off`, so place pages have no Ask box and the Today ask box answers with a short "ask from the laptop" message.

## Coolify setup (once)

1. New resource from the private GitHub repo, build pack **Dockerfile**, branch `main`, auto deploy on.
2. Port: `4400`. Health check path: `/healthz`.
3. Persistent storage: one volume mounted at `/data`.
4. Environment variables (type the passwords into Coolify's UI; they never go in the repo):
   - `ATR_OWNER_PASSWORD` (required): the owner's password, full access. The container refuses to start without it.
   - `ATR_OWNER_USER` (optional, default `eliton`): the owner's username.
   - `ATR_GUEST_PASSWORD` (optional): turns on a read-only guest account. Leave it unset and only the owner can sign in.
   - `ATR_GUEST_USER` (optional, default `guest`): the guest's username.

   Usernames ignore case and spaces. A guest sees everything the owner sees but every change is refused. Sign-ins last 400 days and renew on each visit; changing an account's password signs that account out everywhere.
5. Domain with HTTPS (Coolify's proxy issues the certificate).

## How an agent ships a change

1. Work on a branch, run `npm test`.
2. Open a pull request against `main` and merge it.
3. Coolify builds and deploys the merge. The old container keeps serving until the new one passes `/healthz`.

No direct pushes to `main`.

## Try the image locally

```bash
docker build -t atr-site .
read -rsp 'Owner password: ' ATR_OWNER_PASSWORD; echo; read -rsp 'Guest password (empty: no guest): ' ATR_GUEST_PASSWORD; echo
export ATR_OWNER_PASSWORD ATR_GUEST_PASSWORD
docker run --rm -p 4400:4400 -v atr-data:/data -e ATR_OWNER_PASSWORD -e ATR_GUEST_PASSWORD atr-site
```

## Not built yet

- Pulling `/data/feedback` and `/data/trip` back to the laptop before a curator run, so curators see what was swiped and noted on the road.
- Offline use (installable app, cached pages, queued writes).
- A nightly backup of `/data` off the VPS.
