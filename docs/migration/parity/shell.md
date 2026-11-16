# Parity: the shell (integrator)

Old code: `game/public/game.js` (`SECTIONS`, `renderTabs`, `counts`, `route`, the `#/home` alias) and `game/server.js`
(the page chrome and its inline icon). New code: `apps/web/src/lib/components/shell/{AppShell,SubNav}.svelte`,
`tabs.ts`, `hash-links.ts`, `routes/(app)/+layout.svelte` and the section layouts `routes/(app)/{trip,places,decide,
prep}/+layout.svelte`. Specs: `apps/web/e2e/shell.spec.ts`; unit tests `tabs.test.ts`, `hash-links.test.ts`.

| | Old | New | Notes |
|---|---|---|---|
| [x] | Six sections in the bar, each with its icon; a bottom bar on a phone | `AppShell`: the six tabs with lucide icons on the phone's bottom bar, text tabs from `md` up | Icons are lucide equivalents of the old inline SVGs. |
| [x] | A tab opens its section's first page (`#/itinerary` for Trip, `#/todo` for Prep) | Trip links to `/trip/itinerary`, and `/trip` redirects there; `/prep` shows To do | `shell.spec.ts` "every tab opens". |
| [x] | Section badges: Decide = areas left + places left + holidays open; Prep = open tasks; 99+ cap | Same counts, from `DecideData.counts` and `openTasks(trip.all)` in `(app)/+layout.svelte` | Checked on a phone with the real data. |
| [x] | Sub-tabs under the bar when a section has more than one page, current one scrolled into view | `SubNav` from each section layout: Trip (Itinerary, Calendar, Map), Places (Places, Answers), Decide (7 pages), Prep (To do, Bag) | `shell.spec.ts` checks every sub-tab row. |
| [x] | Page badges: Areas left, Swipe left, Holidays open, To do open | Same, in `DecideNav` and `PrepNav` | |
| [x] | Old hash routes `#/x[/arg]` and `#/home` | `hashTarget()` maps them on first load (`#/today/<d>`, `#/calendar/<d>`, `#/places/<a+b>`, `#/answers/<id>` keep their argument) | Unit tests; `shell.spec.ts` follows `/#/calendar` and `/#/home`. |
| [x] | Guest badge, sign out, theme toggle | Unchanged from task 7 | |
| [x] | Favicon (inline SVG "A" on the old chrome) | The same inline SVG in `app.html`, so no `/favicon.ico` 404 in the console | The place and area pages (byte-for-byte ports with no icon link) made the browser ask for `/favicon.ico`, a 404 in the console; `routes/favicon.ico` now serves the same icon, public like the old chrome's. |
| [x] | Times with their offset everywhere (`watchTimes` wrote "14:00 UTC+8") | `TzText` now writes the space before the label; slice B's `TzLine` forwards to it | |

## Fixes the integrator made in slice files

- Weekday dates (F holidays, C route card): `toLocaleDateString('en-GB', {weekday, day, month})` gives "Fri, 25 Dec"
  with a comma on some ICU builds (Linux WebKit) and "Fri 25 Dec" elsewhere. Both formatters now join the date parts,
  so every engine shows "Fri 25 Dec" as the old site did on the traveller's phone. Unit tests force a comma literal.
- The Prep pages' heading: the screen-reader prefix lost its space ("Prep:To do"); it now reads "Prep: To do".
- `/embed/place.{css,js}` (H) moved from `static/` to a server route: signed in and `Cache-Control: no-cache`, as the
  old `/game/*`.

- The per-page sub-navs moved into section layouts: `DecideNav` (F) renders once from `decide/+layout.svelte`, so
  Areas, Swipe and My calls (E) now show it too; the Trip links left `TripHeader` (B) and `RouteView` (C) for
  `trip/+layout.svelte`, which adds the Map link to Itinerary and Calendar. `DecideNav`, `PrepNav` and `PlacesNav`
  render the shared `SubNav`.
- Typed `resolve()` for `/decide/duels`, `/decide/board` (E), `/today/[[date]]` and `/places/[cities]` (B).
- Holiday cards (F): the shade and title over the photo used `ink`/`surface`, which swap in dark mode (dark text on a
  light shade). They now use the new theme-fixed `scrim` / `on-scrim` tokens, like the old `.g-hc__media::after`.
- Place cards (E): the top chips, the flag chips and the city chip were three separately positioned groups that
  overlapped when they wrapped on a narrow card (the duel pair at 390 px). They are one column now, and a card
  narrower than 16rem drops the flag chips and shows the booking chip as 📅 only (its title keeps the text).
- Auth (task 7): Better Auth's limiter no longer counts `/convex/jwks` and `/convex/token` (behind the proxy every
  page load shared one bucket and got 429s, which sent signed-in users to `/login`), and a JWT refresh that fails for
  any reason but 401 now answers 503 instead of showing the sign-in form.
