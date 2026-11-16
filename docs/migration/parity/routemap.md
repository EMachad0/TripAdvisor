# Parity: slice C, the route map and route editor

Old behaviour: `game/public/game.js` (the `route` block: `viewRoute`, `routeLegs`, `legChips`, `legCard`, `stopRow`,
`onRouteClick` / `onRouteChange` / `onRouteInput`, `setNights`, `moveStop`, `removeStop`, `addStop`, `resetLeg`,
`routeEdited`, `saveLeg`, `flushRouteSaves`, `initMap`, `drawBase`, `zoomTo`, `drawOverlay`, `labelSvgFor`,
`onMapClick`, `selectCity`, `refreshPop`, and the Escape rule in the keyboard handler), `game/public/game.css`
(`.g-route*`, `.g-map*`, `.rt-*`, `.g-pop*`, `.g-leg*`, `.g-stop*`, `.g-nstep*`, `.g-addc*`) and `game/server.js`
(`routeModel`, `GET /api/route`, `POST /api/route`, `GET /route-map/:key.webp`).

New: `apps/web/src/routes/(app)/trip/map/+page.svelte`, `apps/web/src/lib/features/routemap/` (`RouteView`, `RouteMap`,
`CityPopup`, `LegCard`, and the pure `model.ts`, `view.ts`, `overlay.ts`, `edits.ts`, `frames.ts`, with the write
wrapper `editor.svelte.ts`), `apps/web/src/routes/route-map/[key].webp/+server.ts`.

Checked by `e2e/routemap.spec.ts` (desktop, pixel, iphone), `features/routemap/routemap.test.ts` (unit), and by
looking at the screen with playwright-cli at 390x844 in light and dark mode and at 1280x800.

## Page and header (`/trip/map`, was `#/route`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Trip sub-tabs Itinerary / Calendar / Map, Map current | Same three links above the page, Map with `aria-current` | The shared `TripHeader` (slice B) has no Map link; this page draws its own copy of that nav. See the report. |
| [x] | Eyebrow "6 Dec → 9 Feb · 6 legs", or "The trip" with no legs; h1 "Route" | Same | |
| [x] | Summary "**N** stops in order · **M** must cities not placed" (singular forms), live while editing | Same, recomputed from the local edits at once | |
| [x] | "Edit route" (ghost, pen icon) / "Done editing" (filled), `aria-pressed`; toggling saves waiting edits | Same (shadcn Button outline / default) | |
| [x] | Loading dots before the first `/api/route` answer | Nothing to wait for: the route model renders from the layout data (config seeds) and switches to live `route.current` | Differs on purpose: no spinner, the seeds are a correct first paint. |
| [x] | "The route map isn't ready" when `/api/route` or the map maths failed | Empty state "No legs yet" when the trip has no legs | The old error came from a server without the Route endpoint, which cannot happen now. |

## Leg chips

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | "Whole trip" chip plus one chip per leg: "n flag Name", "from – to · Nn", `aria-pressed` on the shown one | Same, in a "Zoom the map" nav | |
| [x] | Tapping a chip closes the city card and zooms the map | Same | |
| [x] | The chosen chip scrolls to the middle of the chip row | Same | |
| [x] | Desktop (≥ 981 px): zooming to a leg scrolls the plan to that leg's card | Same from 1024 px (Tailwind `lg`) | Breakpoint moves from 981 to 1024 px, the app's desktop breakpoint. |

## Map

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Base: cached OSM images in an SVG whose viewBox is world pixels; the overview image, plus the leg's sharper image when zoomed in; images fade in | Same (`<image data-frame>` per frame, opacity transition) | |
| [x] | "Drawing the map…" pill until the overview image loads; a failed image leaves the striped background (`is-bare`) | Same (`data-map-wait`, `data-bare`) | |
| [x] | Dark mode: the map image inverted and toned down; darker line casing | Same filter and casing under both dark selectors | |
| [x] | Height: clamp(420px, viewport − chrome, 780px) on desktop, clamp(340px, min(112vw, 64svh), 640px) under 981 px; phone bleeds to 6 px from the edges | Same clamps; phone bleeds the same | Desktop clamp uses `100svh − 300px` for the chrome. |
| [x] | Fit: whole trip (stops plus Must / Maybe cities, 7 % padding, 10 % extra at the bottom) or one leg (16 % padding, its skipped cities too when shown); a resize refits | `viewRect` / `targetView` in `view.ts`; resize via `bind:clientWidth/Height` | Unit tested. |
| [x] | Zoom animation: 520 ms viewBox lerp, labels hidden until it ends; instant with reduced motion | Same (`lerpView`, `data-animating`) | |
| [x] | Asking for the view already shown refits it (e.g. after "Show skipped") | Same (a zoom counter) | |
| [x] | Edits do not refit the view | Same | |
| [x] | "Whole trip" back button on a zoomed map | Same (`data-map-back`) | |
| [x] | "© OpenStreetMap contributors" credit | Same | |
| [x] | Overlay in screen pixels: overland lines, dashed flight arcs with arrowheads, long-haul stubs that fade, pick the emptiest side and carry "✈︎ From São Paulo / lands …" and "✈︎ Home to São Paulo / ~… · not booked" labels (only the leg's own on a zoomed map) | `computeOverlay` in `overlay.ts`, drawn by `RouteMap.svelte` | Pure port, unit tested. Gradients use the `stroke` attribute instead of an inline style. |
| [x] | Pins: numbered stops on top (radius by zoom and phone width), dashed Must, small Maybe, faint Skip / not swiped; close pins nudged apart (`relaxPins`) | Same | |
| [x] | Labels: stops with nights, Must "not placed", Maybe; clustered stops share one label ("Osaka · Kyoto") that zooms to its leg on the whole-trip map; leg badges on wide maps only; hop dates; leaders when moved away | Same (`layoutLabels`, merge pass) | Text widths from canvas metrics, re-measured once the web fonts load. |
| [x] | Accessible name "Map of the route: China (…), then …" | Same | |
| [x] | Tap a pin: select the city (halo, card) | Same | e2e taps pins on the phones. |
| [x] | Enter / Space on a focused pin selects it | Same | |
| [x] | Tap a label: leg badge or shared label zooms, a city label selects | Same | |
| [x] | Tap the empty map: closes an open card; else zooms to the nearest leg's country within 90 px (60 px zoomed in) unless already shown | Same (`countryAt`) | |
| [x] | Legend: Overland, Flight between countries, Must not placed yet, Maybe, "Show skipped" checkbox (redraws, includes not-swiped cities) | Same | |
| [x] | Fine print about the long-haul flights and what the lines mean | Same | |
| [x] | Config warnings under the map | Same | |

## City card (popup)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Eyebrow "flag Stop i of n in Leg" / "Must · not placed yet" / "Maybe · not placed" / "Skipped · not placed" / "Not swiped yet" | Same (`cityCard` in `model.ts`) | |
| [x] | Name with a verdict pill | Same | |
| [x] | Dates "Sun 6 Dec → Thu 10 Dec · 4 nights", "From … · nights not set", "Dates open: …", or the leg's dates for a city not placed | Same | Unit tested. |
| [x] | "**m** must · **n** maybe of N places here", or "No places researched here yet" | Same | |
| [x] | "Area page →" opens the area sheet; "No area page yet" for config-only stops | Same, through the shared PlaceSheet (`kind: 'area'`) | |
| [x] | Edit mode: "Remove from route" for a stop, "Add to Leg route" for a city not placed | Same | |
| [x] | Close button, Escape (not while typing, not while the sheet is open), tap on the empty map | Same | |
| [x] | Sits at the bottom of the map, or at the top when the pin is in the lower half; full width on a phone | Same | |
| [x] | Closes itself when its city leaves the model | Same | |

## Plan (leg cards)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Edit hint "Editing: changes save as you make them. Reset puts a country back to the agreed plan." | Same | |
| [x] | Leg title (number, flag, name, weekday dates, nights) zooms the map; the shown leg's card is highlighted | Same | |
| [x] | Reset (edit mode, leg changed by the game and different from its seed) | Same (`canReset`) | |
| [x] | Nights meter: over (with how many more, red ring), ok (✓, green), empty, under (n of N · left) | Same | |
| [x] | Nights bar: a segment per stop with nights in two alternating shades, a hatched rest | SVG bar with the same segments and a hatch pattern | SVG instead of flex widths, so no inline style. |
| [x] | Stops: trip-wide number, name, dates or "dates open until …", Maybe / Skip verdict, "no coordinates, not on the map" warning, nights | Same | |
| [x] | Tapping a stop's name selects the city, zooms to its leg if needed and scrolls the map into view | Same | |
| [x] | "No stops yet. Add the first city below." | Same | |
| [x] | Read only: "N Must cities not placed: …" | Same | |
| [x] | Edit: Must and Maybe cities not placed as add chips (dashed for Must) | Same | |
| [x] | Edit with nothing to add: "Every Must and Maybe city here is placed. Others are in the Areas round." / "No other cities for this country yet." | Same, linking `/decide/areas` | |
| [x] | Edit controls per stop: move earlier / later (disabled at the ends), remove, nights − / input / + with the unit | Same; 44 px targets on coarse pointers | |

## Editing and saving

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Each edit redraws the leg, the map and the summary at once | Same (local edits laid over the live route) | |
| [x] | The whole stops list of a country is saved 600 ms after its last edit; a newer edit restarts the pause | Same (`RouteEdits`), through `write('route.save')` | Unit tested with fake timers. |
| [x] | Waiting saves flush on "Done editing", on leaving the tab and on `pagehide` | Same (also when the page component is destroyed) | |
| [x] | Nights: typing a whole number 1–90 saves at once; leaving the field clears below 1 or empty, caps at 90, rounds | Same | |
| [x] | Move keeps focus on the moved row's button (the other direction at an end); remove focuses the next remove button or the first add chip; add focuses the new stop's nights | Same | |
| [x] | Remove toasts "Name is off the route" | Same (Sonner) | |
| [x] | Reset drops the waiting edit and toasts "Leg: back to the plan"; failure toasts "Couldn't reset: …" | Same, through `write('route.reset')` | |
| [x] | A failed save toasts "Couldn't save the Leg route: …" | Same; the leg then shows the server's route again | The old page kept showing the unsaved list until the next load. |
| [x] | A refresh while a save waits keeps the local edit | Same (edits live outside the loaded data) | |
| [x] | No write when the list is unchanged | Same (server rule in `route.save`) | |
| — | Writes while frozen | Toasts the frozen message; the write stays in the outbox (slice L) and the leg keeps showing it | New behaviour, no old equivalent. |

## Guest (read only)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Sees the map, chips, cards and plan | Same | |
| [x] | Edit route showed for the guest and every save failed with 403 "Guests can look but not change anything." | "Edit route" is disabled, with that message as its title; no edit controls, no Add / Remove in the city card | Differs on purpose (the brief: write controls disabled or hidden). |

## Map images (`GET /route-map/:key.webp`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | `overview` and one image per leg, keys `[a-z0-9-]+`, `?v=` only busts the cache | Same | |
| [x] | Rendered by `staticMap` from cached tiles, served with `max-age=86400` | `routeMap` in `src/lib/server/maps.ts` (slice H), same cache keys and header | |
| [x] | Unknown key or failed render: JSON 404 | Same (`fileResponse`) | |
| [x] | Signed out: sent to the login page | Same (hooks) | |
| [x] | Frames from the live route model | Frames from the content and config seeds, no Convex call | Same images: a saved stop is always an area or a seed stop, so the cities behind each frame never change with the route (unit tested). The plan's "reads route.current with the user's token" is not needed. |
