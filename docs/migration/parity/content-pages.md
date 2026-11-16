# Parity: slice H, content pages, embed glue, media and maps

Old behaviour: `game/server.js` (`placePage`, `areaPage`, `gameChrome`, `sendFile`, the `/media`, `/area-media`, `/map`,
`/area-map`, `/assets`, `/game/place.*` routes), `game/public/place.{css,js}`, `watchTimes` in `game/public/trip.js`
and `tzSpots`/`tzLabel` in `game/lib/trip.js`, `platform/lib/staticmap.js`.
New: `apps/web/src/routes/{place,area,embed,media,area-media,map,area-map,assets}/**`, `src/lib/server/maps.ts`,
`apps/web/embed/place.{css,js}` (served by `routes/embed/[file]`; moved out of `static/` by the integrator).

Checked by `src/routes/place/pages.test.ts` (the new HTML byte for byte against the old server's `placePage` /
`areaPage`, run in-process: every e2e place and area, embedded and not, plus a sample of the real repo content),
`src/routes/map/maps.test.ts`, `src/routes/media/serve.test.ts`, and `e2e/place-pages.spec.ts` and
`e2e/media-maps.spec.ts` on desktop, pixel and iphone.

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | `GET /place/:id`: platform place page, `Cache-Control: no-store`, `text/html` | `routes/place/[id]/+server.ts` | Same HTML (parity test). |
| [x] | `GET /area/:id`: area page with taste "On your list here", trip window, area photos | `routes/area/[id]/+server.ts` | Same HTML except the back link (below). |
| [x] | `?embed=1`: `<html data-embed="1">`, links to other places keep `?embed=1`, top bar hidden | Same | |
| [x] | Back link label "All places/areas" becomes "Back to the game"; place back link `/` | Same | |
| [x] | Area back link `/#/areas` | `/decide/areas` | Different on purpose: the area deck has its own URL in the new app. Inside the sheet the link only closes the sheet, as before. |
| [x] | "Questions and answers" section above the footer, cards marked `data-tz` with their country offset, no "About" line | Same | |
| [x] | Unknown id: 404 page "This place/area doesn't exist (any more). Back to the game" | Same HTML, 404, no-store | |
| [x] | Map block: page waits up to 6 s for the static map, else renders without it | `embeddedMap` in `maps.ts`, `MAP_TIMEOUT_MS = 6000` | The render keeps going and fills the cache, as before. |
| [x] | Area page map: zoom 7 for a region, else 10, when the area has coordinates | Same | |
| [x] | `GET /map/:id.webp`: any place with a location, map block zoom or 16, `max-age=86400`; 404 JSON when none | `routes/map/[id].webp` | |
| [x] | `GET /area-map/:id.webp`, `max-age=86400` | `routes/area-map/[id].webp` | |
| [x] | Map cache: OSM tiles stitched with sharp, 2x density, tile and map cache by coordinates, identifying User-Agent, 3 tries on 429/5xx, `ATR_OFFLINE=1` never fetches | `renderStaticMap` in `maps.ts` | Different on purpose: the cache is `ATR_CACHE_DIR` (the image's volume), else `<content root>/.cache` as before. Same file layout and keys, so an old cache can be copied in. Concurrent requests for one map share one render, and a map is written to a temporary file and renamed. |
| [x] | `GET /media/:placeId/:file.webp` from the place's `media/`, `max-age=600` | `routes/media/[id]/[file]` | Path traversal and non-`.webp` names get the JSON 404. |
| [x] | `GET /area-media/:country/:file.webp` from `areas/<country>/media/`, `max-age=600` | `routes/area-media/[country]/[file]` | |
| [x] | Missing file: `{"error":"not found"}`, 404, no-store | Same | |
| [x] | `GET /assets/*`: atr.css and fonts written by `copyAssets`, `max-age=3600` | `routes/assets/[...path]` | Written once per process into `<map cache>/game-assets`. |
| [x] | `/assets/*` open to signed-out visitors (the old login page used atr.css) | Public: `/assets/` added to `PUBLIC_PREFIXES` in `src/lib/server/auth-guard.ts` (integrator) | Unit test in `auth-guard.test.ts`. |
| [x] | `/game/place.css`, `/game/place.js` | `/embed/place.css`, `/embed/place.js` | Moved on purpose (plan section 5). Served by the route `routes/embed/[file]` from `apps/web/embed/`. |
| [x] | place.js: times on answer cards get their offset ("11:00–21:30 UTC+8"), also in cards opened later | Same (`watchTimes`, `tzSpots`, `tzLabel` inlined, no build step) | |
| [x] | place.js: `#answer-<id>` opens that card's details and marks it `is-target` | Same, on the page and in the sheet | |
| [x] | place.js: `{atr:'theme', theme}` from the same origin sets or clears `data-theme` | Same | Sending it on the app's theme toggle is PlaceSheet's job (slice E). |
| [x] | place.js in the sheet: Escape and the brand link post `{atr:'close'}` to the parent; not on a page opened on its own | Same | |
| [x] | Theme toggle on the page, remembered in `localStorage['atr-theme']` (shared with the app) | Same (platform HTML) | |
| [x] | Guest: reads every page, photo and map | Same | Nothing on these pages writes. |
| [x] | Signed out: pages, photos and maps redirect to the login page | 303 to `/login?redirectTo=<path>` | Different on purpose: the new login sends the visitor back afterwards. |
| [x] | `/place/:id/` with a trailing slash served the page | SvelteKit redirects to `/place/:id` (308) | Same page after the redirect. |
| [x] | `/game/place.{css,js}` sent `Cache-Control: no-cache` | `/embed/place.{css,js}` send `Cache-Control: no-cache` | Integrator: the files moved from `static/embed` to a server route (`src/routes/embed/embed.test.ts`). The service worker now keeps them in its runtime cache (network first) instead of the precache. |
| [x] | `/game/*` needed sign-in | `/embed/*` needs sign-in | Integrator: served by a route, so the auth hook runs first; a signed-out request redirects to `/login`. |
