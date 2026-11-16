# Parity: the new app against the old site

Merged from the per-slice files in `docs/migration/parity/` (each slice keeps its own file; this one is regenerated from
them by the integrator). Ticked = the new app does the same, checked by a spec, a unit test or a phone screenshot; the
notes say where it differs on purpose.

460 rows ticked, 3 open.

## Open rows

| Area | Row (old) | New | Why it is open |
|---|---|---|---|
| F · Overview, Duels, Board, Holidays | (brief) Drag and drop of picks into days, days per city | Not built | The old board has neither: days are per country and there is no drag. Parity kept with the old site. |
| Task 8 · Deploy, backup, restore | (none) | `restore-test.yml` Convex leg as `ci_restore` | Code fixed by the integrator: the user is now `ci_restore` (Better Auth allows `[a-zA-Z0-9_.]`), in `admin.ts`, `restore-convex.sh`, `restore-test.yml` and the plan; `convex run admin:seedCiUser` with `ATR_CI_DEPLOYMENT=1` on a local backend returns `"created"`. Still unticked: the workflow has not run (no `gh` from here). |
| Task 8 · Deploy, backup, restore | (none) | `restore-test.yml` step 3's `pnpm e2e --grep @smoke` as `ci_restore` | Not wired: the Playwright `e2e-backend` web server re-deploys, re-seeds and replaces the restored data. Needs a Playwright mode that reuses an existing backend. |

## Shell (integrator)

Source: [`parity/shell.md`](parity/shell.md).

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

### Fixes the integrator made in slice files

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

## A · Today

Source: [`parity/today.md`](parity/today.md).

Old code: `game/public/trip.js` (`viewToday`, `dayStatusHtml`, `kindLabel`, `elsewhere`, `answerRow`, `countdown`,
the `today-reset` action, the clocks and `TZ` table), `game/public/game.js` (route `#/`, `#/today/<d>`, re-render on
new answers) and `game/public/trip.css` (`.t-today`, `.t-qa`). New code: `apps/web/src/lib/features/today/**`, routes
`/` (`(app)/+page.svelte`) and `/today/[[date]]`. Spec: `apps/web/e2e/today.spec.ts` (desktop, iphone, pixel). Unit
tests: `apps/web/src/lib/features/today/model.test.ts`.

Ticked = the new screen does the same, checked by the spec, a unit test or a phone screenshot (390x844, light and
dark, playwright-cli). Notes say where the behaviour differs on purpose.

### Which day is "today"

|     | Old view / action                                                          | New                                                                                                                                                                                                          | Note                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] | Today is the device's local date (`localKey()`), "now" its local stamp     | During the trip: the date and clock where the current leg is (`tripClock`: `offsetOn` the device date, re-read on the guessed day); before/after the trip and with no dated legs: the device date, as before | On purpose (plan §8, "local timezone of the current leg"): a phone still on São Paulo time in Harbin showed the wrong day. `@tz` spec runs São Paulo, Shanghai and Tokyo device zones and gets the same day |
| [x] | `#/today/2027-01-30` opens that day (a link to keep)                       | `/today/2027-01-30`                                                                                                                                                                                          | Old `/#/today/<d>` links are redirected to `/today/<d>`                                                                                                                                                     |
| [x] | A picked day uses 09:00 that day as "now" (`nowStamp`)                     | `pinnedClock`: `<day>T09:00` at that day's offset                                                                                                                                                            |                                                                                                                                                                                                             |
| [x] | A picked day equal to the real today shows the real today                  | same                                                                                                                                                                                                         |                                                                                                                                                                                                             |
| [x] | A malformed `#/today/<x>` is ignored                                       | `/today/<x>` with a non-date or impossible date (2027-02-30) shows the real today                                                                                                                            |                                                                                                                                                                                                             |
| [x] | The page re-renders when the clock passes midnight only on the next render | Clock ticks every 30 s: clocks row, countdown and the day roll over by themselves                                                                                                                            | Improvement                                                                                                                                                                                                 |

### Header

|     | Old view / action                                                                                                | New                                                                                                                            | Note                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [x] | Eyebrow "Sun 15 Nov 2026", plus " · not today" for a picked day                                                  | same                                                                                                                           |                                                                                                                                            |
| [x] | Title before: "N days to departure"                                                                              | same                                                                                                                           |                                                                                                                                            |
| [x] | Title "You leave today" when `toDeparture === 0`                                                                 | not shown                                                                                                                      | Dead branch in the old code too: on the first trip day the phase is already `during`, so the title is "Day 1 of N". Unit test documents it |
| [x] | Title during: "Day N of M · _stay name_"                                                                         | same                                                                                                                           |                                                                                                                                            |
| [x] | Title after: "Back home"; no legs: "No trip dates yet"                                                           | same                                                                                                                           |                                                                                                                                            |
| [x] | Lede before: "The trip runs Fri 4 Dec → Fri 15 Jan, 43 days."                                                    | same                                                                                                                           |                                                                                                                                            |
| [x] | Lede during a stay: "Country. N more nights here, until …" / "You leave today." / "Just for today." + " Next: …" | same                                                                                                                           |                                                                                                                                            |
| [x] | Lede between stays: "Between stays today."                                                                       | same                                                                                                                           |                                                                                                                                            |
| [x] | Date box "Look at another day" / "Looking at", changing it re-renders that day                                   | same; it navigates to `/today/<d>` (a link)                                                                                    | Old date box did not change the URL; the new one does, so Back works                                                                       |
| [x] | "Back to today" button on a picked day                                                                           | same (link to `/`)                                                                                                             |                                                                                                                                            |
| [x] | Empty state with no trip at all                                                                                  | "No trip dates yet / Add a flight or a stay in the Itinerary to fill this page." (`Empty`) when there are no legs and no tasks | Old page showed only the title and an empty Next flight card                                                                               |

### Clocks

|     | Old view / action                                                                  | New                    | Note |
| --- | ---------------------------------------------------------------------------------- | ---------------------- | ---- |
| [x] | Before the trip: São Paulo and China; during: the country you are in and São Paulo | same                   |      |
| [x] | Each clock: name, weekday, HH:MM, UTC offset label                                 | same, through `TimeTz` |      |
| [x] | Unknown zone shows "–"                                                             | same                   |      |

### Main column

|     | Old view / action                                                                                                                                                     | New                                                             | Note                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| [x] | "Where you are": day status (work / vacation / day off / Brazilian holiday / note) and the stay card with "You are here"                                              | same (B's `DayStatus`, `LegCard now`)                           |                                                        |
| [x] | No stay but a day row: the day status under "Today" or the picked day's date                                                                                          | same                                                            |                                                        |
| [x] | Work day: night shift hours at the local offset and 09:00–18:00 UTC−3 in São Paulo                                                                                    | same (`DayStatus`)                                              |                                                        |
| [x] | "Today: moves" / "That day: moves": the day's transfers and notes, not the next flight                                                                                | same                                                            |                                                        |
| [x] | Transfer card "See the plan · N steps" opens the plan sheet; Edit from there                                                                                          | same (`TransferPlan` in `TripSheet`); Edit hidden for the guest |                                                        |
| [x] | "Next flight" with the countdown chip: "in N days", "tomorrow", "in H h MM min" (real instant via the airport offset), else "today"; a picked day always says "today" | same                                                            |                                                        |
| [x] | "No flight ahead / Every flight in the itinerary has left."                                                                                                           | same                                                            |                                                        |
| [x] | Leg cards: status chips, booking ref + Copy, address block (Google / Apple Maps, Uber, Copy address), links, offsets beside every time                                | same (B's `LegCard`)                                            |                                                        |
| [x] | ⋯ Edit on a leg opens the leg form                                                                                                                                    | same (B's `TripForm`); hidden for the guest                     | Old showed it to the guest and the server answered 403 |
| [x] | "To do · N open of M": first 5 open tasks with the done box, "In progress" / "Suggested" chips, note, ⋯ edit                                                          | same (G's `CheckRow`, B's `TripForm`)                           |                                                        |
| [x] | Ticking a task: open → done (doing → done)                                                                                                                            | same, through `write('trip.write')`                             |                                                        |
| [x] | "N more to do" link when over 5; "Everything is ticked." when none open; block hidden with no tasks                                                                   | same, link to `/prep/todo`                                      |                                                        |

### Side column

|     | Old view / action                                                                                                                                                          | New                                                                    | Note                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [x] | During the trip: "Only today, or ending soon" with "Only today" / "Last day" / "Until 24 Dec · N more days" and " · in Osaka, a day trip"                                  | same                                                                   |                                                                                                                                                                                                                                                  |
| [x] | Empty: "Nothing with a date falls on today / Mon 21 Dec in China."                                                                                                         | same                                                                   |                                                                                                                                                                                                                                                  |
| [x] | "Next events you could go to": date (range), "in N days", "a day trip from …", "stop not fixed"; no tick on these rows                                                     | same                                                                   |                                                                                                                                                                                                                                                  |
| [x] | Footnote and "Calendar →" link                                                                                                                                             | same, link to `/trip/calendar`                                         |                                                                                                                                                                                                                                                  |
| [x] | "Still to do in <stay>": up to 6 unticked Musts (city shown when the stay has several cities)                                                                              | same                                                                   |                                                                                                                                                                                                                                                  |
| [x] | Empty: "Every Must here is ticked." / "No Must cards in this city."                                                                                                        | same                                                                   |                                                                                                                                                                                                                                                  |
| [x] | "All N cards in <stay> · M more Must" link to the city filter                                                                                                              | same, link to `/places/<a+b>`                                          |                                                                                                                                                                                                                                                  |
| [x] | Place row: tick "Been there", thumb, name, city · category · area, when line, note, verdict pill, Maps link; click opens the place sheet                                   | same (D's `PlaceRow`, E's `PlaceSheet`)                                |                                                                                                                                                                                                                                                  |
| [x] | "Been there" tick writes `visited` set/delete                                                                                                                              | same (`setVisited` → `write('trip.write')`)                            | Guest: tick disabled. Old: enabled, server refused                                                                                                                                                                                               |
| [x] | "Latest answers · N answers": 3 newest, question links to the answer, tldr as plain text with offsets after its times, "23 Nov 2026 · Whole trip / Country / <place link>" | same                                                                   | Compact `AnswerRow` kept instead of the shared `AnswerCard` (that is the full Answers-page card); the about name is a button that opens the place/area sheet, where the old one was an `<a href="/place/<id>">` intercepted by `bindAnswerLinks` |
| [x] | "All answers, by country" link                                                                                                                                             | same, link to `/places/answers`                                        |                                                                                                                                                                                                                                                  |
| [x] | Re-render when new answers arrive (`game.js` refresh)                                                                                                                      | shell `useContentRefresh` reruns the content load; Today reads it live |                                                                                                                                                                                                                                                  |

### Guest (read only)

|     | Old view / action | New                                                                                             | Note                                        |
| --- | ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| [x] | Sees every block  | same                                                                                            |                                             |
| [x] | Edit controls     | ⋯ on legs and tasks hidden; task boxes and "been there" ticks disabled; place sheet still opens | Old showed them and the server answered 403 |

### Layout

|     | Old view / action                                               | New                                                                                                                                      | Note |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| [x] | Two columns on wide screens (main, side), one column on a phone | same (`lg:grid-cols-2`)                                                                                                                  |      |
| [x] | Phone width, light and dark                                     | checked at 390x844 in both themes; fixed a missing space before "·" in the title and divider lines curving around the rounded place rows |      |

Nothing is left unticked.

## B · Itinerary, Calendar, trip forms

Source: [`parity/trip.md`](parity/trip.md).

Old code: `game/public/trip.js` (`viewItinerary`, `viewCalendar`, `openDay`, `openDetail`, `legCard`, `SCHEMA`, `openEdit`,
`submitEdit`, the click handler) and `game/public/trip.css`. New code: `apps/web/src/lib/features/trip/**`, routes
`/trip/itinerary` and `/trip/calendar/[[date]]`. Specs: `apps/web/e2e/itinerary.spec.ts`, `apps/web/e2e/calendar.spec.ts`
(desktop, iphone, pixel). Unit tests: `apps/web/src/lib/features/trip/trip.test.ts`.

Ticked = the new screen does the same, checked by a spec, a unit test or a phone screenshot (390x844, light and dark,
playwright-cli). Notes say where the behaviour differs on purpose.

### Itinerary

| | Old view / action | New | Note |
|---|---|---|---|
| [x] | Header: eyebrow "first → last · N days", h1, lede with "X of N flights booked, M stays still to book" | same | |
| [x] | "Add stop" button opens the stop form | same | Hidden for the guest (old: shown, the server answered 403) |
| [x] | Empty state "No stops yet / Add a flight or a stay to start the timeline." | same (`Empty`) | |
| [x] | Jump chips: flag + country + first date of each country's first stay; click scrolls smoothly | same | Buttons instead of `<a href="#/itinerary">` |
| [x] | Legs in date order (`legsSorted`), date column (day, "Mon · Wd") only on the first leg of a day, "No date" | same | |
| [x] | Red "Today" line before the first leg after today, only once the trip has started | same | |
| [x] | Layover row between connecting flights (same airport, under 48 h) | same | |
| [x] | During the trip the page opens scrolled to the stay you are in, else the Today line | same | |
| [x] | Flight card: carrier · flight · cabin, status chip, boarding pass (codes, times with both airport offsets, duration, plane, date), `+N` days, booking ref + Copy, "Arrives …", note, "Open booking ↗" | same | |
| [x] | Transfer card: mode · date, title, "Leave by" time with offset, route, mode · duration, "See the plan · N steps", booking link | same | |
| [x] | Stay card: flag country · Stay · hosted by, "You are here", status, voucher (Check-in/Arrive, nights or "no bed", Checkout/Leave, "after"/"by" times with offset), address block, ref, note, link, "N cards here · M Must" link to Places | same | The link goes to `/places/<cities>` (slice D) |
| [x] | Note card: date · time with offset, title, address, note, link | same | |
| [x] | Status chips Booked / To book / Not fixed / On the day / Book later; planned Uber/taxi/metro transfer shows On the day | same | |
| [x] | Not-fixed leg drawn dashed; the stay you are in outlined | same | |
| [x] | Address block: Google Maps, Apple Maps, Uber here, Copy address | same | |
| [x] | Copy (ref, address): "Copied X" toast, or the text itself when the clipboard is blocked | same | |
| [x] | Links in notes shortened and opened in a new tab (`linkify`) | same | |
| [x] | Every clock time carries its UTC offset, free text included (notes, plans, check-in hours); flight notes get none | same | Done by the trip screens' `TzLine` (see "Shared-file problems") |
| [x] | Edit (⋯) on each card opens the stop form | same | Hidden for the guest |
| [x] | Transfer plan sheet: eyebrow, title, Leave by + route, numbered steps with times (a `!` step in red), "Good to know", Pickup / Drop-off with Copy, "Route & traffic", "Open in Uber", Edit, Close | same | Edit hidden for the guest |

### Calendar

| | Old view / action | New | Note |
|---|---|---|---|
| [x] | Header "Where you sleep each night / Calendar" with the lede | same | |
| [x] | Empty state "Nothing dated yet" | same (`Empty`) | |
| [x] | Legend: one swatch per country (or stay) in trip order, Stop not fixed, Flight, Work, Vacation, Holiday in Brazil, Note or dated card | same | |
| [x] | Work / vacation strip (`periods`): icon, kind, dates, "N weekdays" | same | |
| [x] | One month grid per month from the first to the last trip month, Sunday first | same | Two columns from 768 px |
| [x] | Day cell: colour of the country you sleep in (k1–k7), hatched when the stop is not fixed, faint outside the trip, red outline today, red number on holidays, work / vacation / holiday icons, plane, transfer dot, note-or-dated-card ring, stay name on the first night, on Sundays and on the 1st | same | |
| [x] | Day cell aria-label: day, stay, work/vacation, holiday, flight, "N dated cards" | same | |
| [x] | Tap a day opens the day sheet | same | The URL becomes `/trip/calendar/<date>`; Back closes the sheet |
| [x] | `#/calendar/<date>` opens that day | `/trip/calendar/<date>` | A bad date shows the plain calendar, as before. The hash redirect itself is the shell's |
| [x] | Day sheet: "Wd D Mon YYYY", "Day N of M · stay" or "Outside the trip", work / vacation / day off / holiday / note, the day's legs (no edit button), "Nothing planned" when there is neither a leg nor a day note, dated cards with "This day only / Last day / Until …" and "in City, a day trip / far from here" | same | |
| [x] | Work day: "Night shift 20:00–05:00 UTC+8 here, starting this evening. That is 09:00–18:00 UTC−3 in São Paulo." | same | |
| [x] | "Edit day" / "Add a note" opens the day form | same | Hidden for the guest. After saving, the day sheet comes back with the new values (old: the sheet closed) |
| [x] | "Open as Today" | link to `/today/<date>` | Slice A owns that route |
| [x] | A dated card opens the place sheet | same (shared `PlaceSheet`) | Checked in code only: no spec covers it (the e2e data set has no dated card on a stay day) |
| [x] | "See the plan" in the day sheet opens the transfer plan; Close | same | Closing the plan returns to the day sheet |
| [x] | Close, Escape and the backdrop close a sheet | same | Dialog from 768 px, bottom Drawer below |

### Trip forms

| | Old view / action | New | Note |
|---|---|---|---|
| [x] | Stop form: every field with the old labels and order; fields shown by kind (flight / stay / transfer / note) | same | |
| [x] | New stop starts as a planned stay; date and time split into two inputs; `cities` shown as "a, b" | same | |
| [x] | Day form (`days`): Work or vacation, Holiday in Brazil, Events and notes; title is the day | same | |
| [x] | Fixed cost form (`fixed`): Cost, Amount (R$), Status, Notes | same | Schema and form are in `features/trip`; slice G opens them from Money |
| [x] | Settings form (`settings`, id `main`): cap, how money works; no Delete | same | As above |
| [x] | Tasks, bag, budget and spend forms | same schema | Built because the form is generic; slice G decides whether to use it. Spend opens with today, food, and the current country and currency |
| [x] | "Give it a name first." / "Enter the amount first." when the main field is empty | same | |
| [x] | Flight with no title gets "FROM → TO"; IATA codes upper-cased; cities split; order max+1; `done` mirrors status; `amountBRL` | same | Shaping now runs in the mutation (`normalizeTripFields`), the title default in the form |
| [x] | Delete asks twice ("Tap Delete again to remove it.") | same | |
| [x] | Cancel closes without writing; Enter submits | same | |
| [x] | "Added" / "Saved" / "Deleted" toasts; a refused write shows the server's message | same | Through `#lib/sync/write.ts` |
| [x] | New document focuses the first field | same | |
| [x] | Visited ("been there") set / delete with `at` = today | `setVisited(id, next)` in `features/trip/actions.ts` | The tick itself lives in `PlaceRow` (slices A and D); the calendar's dated cards have no tick, as before |
| [x] | Writes are pessimistic | same | The sheet now stays open until the server answers and stays open on a refusal, so nothing typed is lost (old: closed first). An edit sends only the changed fields (plan section 11); an edit with no change sends nothing |

### Guest (read-only)

| | Old | New | Note |
|---|---|---|---|
| [x] | Sees every leg, day and sheet | same | |
| [x] | Write controls | hidden: Add stop, ⋯ Edit, plan sheet Edit, Edit day / Add a note | Old showed them and the server refused; `write()` refuses a guest anyway |

### Not ticked

None of the rows above is open. Outside this slice, and not done here:

- The `/trip` tab still shows the placeholder; the old Trip tab opened on the Itinerary. `(app)/trip/+page.svelte` is not in
  this slice's brief (ownership.json lists it for B; the brief does not).
- The shell has no Trip sub-navigation (Itinerary / Calendar / Map). The trip pages carry their own Itinerary / Calendar
  links; Map (slice C) is not linked because `/trip/map` does not exist yet to type `resolve()`.
- `@readonly` `toHaveScreenshot` baselines were not added (the phone screenshots were checked by eye).

## C · Route map

Source: [`parity/routemap.md`](parity/routemap.md).

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

### Page and header (`/trip/map`, was `#/route`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Trip sub-tabs Itinerary / Calendar / Map, Map current | Same three links above the page, Map with `aria-current` | The shared `TripHeader` (slice B) has no Map link; this page draws its own copy of that nav. See the report. |
| [x] | Eyebrow "6 Dec → 9 Feb · 6 legs", or "The trip" with no legs; h1 "Route" | Same | |
| [x] | Summary "**N** stops in order · **M** must cities not placed" (singular forms), live while editing | Same, recomputed from the local edits at once | |
| [x] | "Edit route" (ghost, pen icon) / "Done editing" (filled), `aria-pressed`; toggling saves waiting edits | Same (shadcn Button outline / default) | |
| [x] | Loading dots before the first `/api/route` answer | Nothing to wait for: the route model renders from the layout data (config seeds) and switches to live `route.current` | Differs on purpose: no spinner, the seeds are a correct first paint. |
| [x] | "The route map isn't ready" when `/api/route` or the map maths failed | Empty state "No legs yet" when the trip has no legs | The old error came from a server without the Route endpoint, which cannot happen now. |

### Leg chips

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | "Whole trip" chip plus one chip per leg: "n flag Name", "from – to · Nn", `aria-pressed` on the shown one | Same, in a "Zoom the map" nav | |
| [x] | Tapping a chip closes the city card and zooms the map | Same | |
| [x] | The chosen chip scrolls to the middle of the chip row | Same | |
| [x] | Desktop (≥ 981 px): zooming to a leg scrolls the plan to that leg's card | Same from 1024 px (Tailwind `lg`) | Breakpoint moves from 981 to 1024 px, the app's desktop breakpoint. |

### Map

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

### City card (popup)

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

### Plan (leg cards)

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

### Editing and saving

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

### Guest (read only)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Sees the map, chips, cards and plan | Same | |
| [x] | Edit route showed for the guest and every save failed with 403 "Guests can look but not change anything." | "Edit route" is disabled, with that message as its title; no edit controls, no Add / Remove in the city card | Differs on purpose (the brief: write controls disabled or hidden). |

### Map images (`GET /route-map/:key.webp`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | `overview` and one image per leg, keys `[a-z0-9-]+`, `?v=` only busts the cache | Same | |
| [x] | Rendered by `staticMap` from cached tiles, served with `max-age=86400` | `routeMap` in `src/lib/server/maps.ts` (slice H), same cache keys and header | |
| [x] | Unknown key or failed render: JSON 404 | Same (`fileResponse`) | |
| [x] | Signed out: sent to the login page | Same (hooks) | |
| [x] | Frames from the live route model | Frames from the content and config seeds, no Convex call | Same images: a saved stop is always an area or a seed stop, so the cities behind each frame never change with the route (unit tested). The plan's "reads route.current with the user's token" is not needed. |

## D · Places, Answers

Source: [`parity/places.md`](parity/places.md).

Old behaviour: `game/public/trip.js` (`viewPlaces`, `cityIndex`, `placeRow`, the `been` and `place` click actions,
`T.places`), `game/public/game.js` (`viewAnswers`, `bindAnswerLinks`, `S.answersFilter`, the Places sub-tabs),
`platform/lib/render/answers.js` (`renderAnswerCard`), `game/server.js` (`answerCard` with the country's `data-tz`),
`game/lib/trip.js` (`searchPlaces`), `docs/GAME.md` (Answer cards).
New: `apps/web/src/routes/(app)/places/**`, `src/lib/features/places/**`,
`src/lib/components/shared/{PlaceRow,AnswerCard}.svelte`.

Checked by `src/lib/features/places/model.test.ts` (17 unit tests) and `e2e/places.spec.ts` (8 tests) and
`e2e/answers.spec.ts` (7 tests) on desktop, pixel and iphone. Screens checked at 390x844 in light and dark with
playwright-cli.

### Decision: how answer cards render

**The card's frame renders from structured data, and only the two Markdown texts stay platform HTML, inside a scoped
wrapper.** The question, the dates, the About line, the fold label, the sources and the target state come from the
structured `Answer` (`question`, `asked`, `updated`, `about`, `sources`). The tldr and the body are the platform's own
`mdInline` / `md` output (`tldrHtml`, `bodyHtml`), with every text already escaped, shown with `{@html}` inside
`.answer-md` / `.answer-body`. Scoped CSS there replaces the old `.rich` and `.qa__*` rules with theme tokens.

Why this gives parity with less risk than either pure option:

- The Markdown rules (links, emphasis, lists, code, what gets escaped) stay the platform's, so they cannot drift.
  The place and area pages render the same answers through the same `md` (slice H). A second Markdown renderer in
  Svelte would need its own escaping tests and could disagree with the pages. The fixture
  `<script>alert(1)</script>` shows as text in the e2e spec.
- Keeping the whole card as platform HTML would bring back what plan section 8 removes: `{@html}` plus patching. The
  About link must open the sheet instead of leaving the app, `#answer-<id>` must open the fold, and the target must be
  marked. Clock times also need their offset label. With a structured frame these are ordinary Svelte props and
  handlers.
- Offsets in the Markdown text are added by `tzMarkup`, which uses the same `tzSpots` and works on text between tags
  only, never inside a tag or an attribute (unit tested). The old site did this with `watchTimes` over `data-tz`.

### Places (`#/places`, `#/places/<a+b>` → `/places`, `/places/[cities]`)

|     | Old view or action                                                                                                                 | New equivalent                                                                  | Note                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] | Sub-tabs Places / Answers under the Places section                                                                                 | `PlacesNav` in `(app)/places/+layout.svelte`                                    | Links, `aria-current` on the open page.                                                                                                       |
| [x] | Eyebrow "N cards · M cities on the route", title, lede                                                                             | `PageHead`                                                                      | Same text.                                                                                                                                    |
| [x] | Search box (type search, placeholder "ramen, Osaka, drone show, onsen…", label "Search the cards")                                 | `InputGroup` with the search icon                                               | Same placeholder and label.                                                                                                                   |
| [x] | Search answers 120 ms after the last key; words, accents and case ignored, matches name, city, area, category label, tags and text | Same debounce; shared `searchPlaces`                                            | Unit tested.                                                                                                                                  |
| [x] | City select: Everywhere, "On the route" (stay cities in order, with card counts), "Elsewhere" (country order, then card count)     | `NativeSelect` with the two option groups                                       | Same `cityIndex` (unit tested).                                                                                                               |
| [x] | A `/places/<a+b>` link picks those cities once and adds a "A + B" option; unknown cities are dropped, none known means Everywhere  | Same (`citiesFromArg`)                                                          | The select can change the city afterwards, as before. Also applied in the server render.                                                      |
| [x] | First visit starts in the cities of today's stay (when they have cards)                                                            | Same, once the legs have loaded                                                 | e2e with a fixed clock.                                                                                                                       |
| [x] | Kind select: Any kind, then the categories some card uses, in config order                                                         | `NativeSelect`                                                                  |                                                                                                                                               |
| [x] | Which cards: All / Must + Maybe / Not been / Been (`aria-pressed` segment)                                                         | `ToggleGroup` (single, radios)                                                  | "Not been" is the picks not ticked yet, as before (shared `searchPlaces`).                                                                    |
| [x] | Filters kept for the whole visit (`T.places`), not across reloads                                                                  | Module state in `filters.svelte.ts`                                             | Same.                                                                                                                                         |
| [x] | Result count "N cards" and "for “q”"                                                                                               | Same                                                                            |                                                                                                                                               |
| [x] | Results grouped by city in City-select order, header "flag City" and "n/m been"                                                    | Same                                                                            |                                                                                                                                               |
| [x] | Order inside a city: Must, Maybe, not called, Skip, then rating, then name                                                         | Same (`searchPlaces`)                                                           |                                                                                                                                               |
| [x] | Empty result "No card matches" with "Try “Everywhere”, any kind, or All." or "Try another word."                                   | `Empty`                                                                         | Same strings.                                                                                                                                 |
| [x] | Row: "Been there" / "Not been yet: name" tick                                                                                      | `PlaceRow` tick (`role=checkbox`, `aria-checked`)                               |                                                                                                                                               |
| [x] | Tick writes `visited` set `{at: today}` / delete and refreshes the list                                                            | `setVisited` through `write('trip.write')`; the live `trip.all` query refreshes | Pessimistic, as before; a refusal toasts through `write.ts`. A second tap while saving is ignored.                                            |
| [x] | Row: thumb (photo, else the category icon on its colour)                                                                           | Same                                                                            | A broken photo falls back to the icon (new).                                                                                                  |
| [x] | Row: name, struck through once been                                                                                                | Same                                                                            |                                                                                                                                               |
| [x] | Row: "city · category · area" (no city inside a city group)                                                                        | Same                                                                            |                                                                                                                                               |
| [x] | Row: soft when line (`whenLabel`), or the caller's when line                                                                       | Same (`when` snippet)                                                           |                                                                                                                                               |
| [x] | Row: the traveler's note                                                                                                           | Same, clamped to two lines                                                      | Clock times in it get the country's offset (the old `data-tz` on the row).                                                                    |
| [x] | Row: verdict pill (must / maybe / skip); Skip rows dimmed                                                                          | Same                                                                            |                                                                                                                                               |
| [x] | Row: Maps link (pin coordinates, else a search by name and city), new tab                                                          | Same                                                                            |                                                                                                                                               |
| [x] | Tapping a row opens the place sheet                                                                                                | Shared `PlaceSheet` (slice E)                                                   | Escape, Back and Close close it.                                                                                                              |
| [x] | "New" tag for a card added since the last look                                                                                     | `PlaceRow` "· New" after the meta                                               | Not on the old Places rows (only on board rows). Added on purpose because the slice brief lists it; it uses the live `isNew` from `app-data`. |
| [x] | Guest: sees every card and filter; pressing the tick was refused with "Guests can look but not change anything."                   | Tick shown but disabled, with a guest tooltip                                   | Differs on purpose: the write is never sent. The guest can still open the sheet.                                                              |
| [x] | Content refresh (new cards, changed answers) re-renders the open list                                                              | Reactive `app.content`                                                          | The refresh toast lives in the shell.                                                                                                         |

### Answers (`#/answers`, `#/answers/<id>` → `/places/answers`, `/places/answers/[id]`)

|     | Old view or action                                                                                                                                | New equivalent                                                       | Note                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [x] | Empty state 💬 "No answers yet", text, "Back to the places →"                                                                                     | `Empty` with the same text and button                                |                                                                                                                                |
| [x] | Eyebrow "Places · N answers", title "Answers", lede                                                                                               | `PageHead`                                                           | Same text.                                                                                                                     |
| [x] | Country chips: All, the trip's countries in order (flag and name), any other country, Whole trip; each with its count, only when used             | `ToggleGroup` (single) in a sideways scroller                        | Same order (unit tested).                                                                                                      |
| [x] | A chip that no longer has answers falls back to All; the chip is kept while moving between pages                                                  | Same (`answersFilter` module state)                                  |                                                                                                                                |
| [x] | Cards newest first                                                                                                                                | Same (content order)                                                 |                                                                                                                                |
| [x] | Card: Q mark and question (escaped)                                                                                                               | `AnswerCard`                                                         |                                                                                                                                |
| [x] | Card meta: "Asked 20 Nov 2026 · Updated … · About …"                                                                                              | Same                                                                 | Calendar dates, so no offset.                                                                                                  |
| [x] | About: the whole trip / a country (bold) / a link to the place or area page                                                                       | Same                                                                 |                                                                                                                                |
| [x] | About link opens the place or area sheet on `#answer-<id>` instead of leaving the app; plain link with Cmd/Ctrl/Shift or when the card is unknown | Same                                                                 | e2e checks the iframe `src` ends with `#answer-<id>`.                                                                          |
| [x] | tldr on its tinted panel (platform `mdInline`)                                                                                                    | Same HTML in `.answer-md`                                            |                                                                                                                                |
| [x] | Fold "Full answer and sources" / "Full answer and source" / "Source" / "Sources (n)"; body (platform `md`) and sources with host                  | `<details>` with the same labels                                     | Sources open in a new tab; non-http links become `#` (platform `safeUrl`).                                                     |
| [x] | Every clock time in the tldr and body carries the UTC offset of the answer's country (`data-tz` + `watchTimes`); no country, no label             | `tzMarkup`                                                           | "11:00–21:30 UTC+8", nothing for a whole-trip answer.                                                                          |
| [x] | `#/answers/<id>` opens that card's fold, marks it (`is-target`) and scrolls to it, honouring reduced motion                                       | `/places/answers/<id>` does the same; `#answer-<id>` on the list too | The mark is a ring around the card.                                                                                            |
| [x] | A card hidden by the chip switches the chip to All first                                                                                          | Same                                                                 | e2e.                                                                                                                           |
| [x] | Read only for everyone; the guest sees the same page                                                                                              | Same                                                                 |                                                                                                                                |
| [x] | Old hash links `#/answers/<id>` and `#/places/<a+b>` keep working | `hashTarget()` in `src/lib/components/shell/hash-links.ts`, called from `(app)/+layout.svelte` on first load (integrator) | Unit tests for every old page and argument; `shell.spec.ts` follows `/#/calendar` and `/#/home`. |

### Keyboard and gestures

The old Places and Answers pages had no shortcuts or gestures of their own. Everything is a native button, link,
select or radio group, so Tab, Enter and Space work. Escape closes the place sheet (slice E).

## E · Deck, My calls, sheet, cards, note editor

Source: [`parity/deck.md`](parity/deck.md).

Old behaviour: `game/public/game.js` (`viewDeck`, `deckCard`, `bindTopCard`, `swipeTop`, `advanceDeck`, `undo`,
`openPlace`, `openArea`, `closeSheet`, the notes block, `viewCalls`, `callRow`, `setCall`, the keyboard handler and
`refresh`), `game/public/game.css` and the card HTML from `platform/lib/render/index.js` (`renderPlaceCard`,
`renderAreaCard`, `flagChips`). New: `apps/web/src/lib/features/{deck,cards}/`, `components/shared/PlaceSheet.svelte`,
`routes/(app)/decide/{areas,swipe,calls}`.

Checked by `e2e/deck.spec.ts` and `e2e/calls.spec.ts` (desktop, pixel, iphone), the unit tests in
`features/deck/deck.test.ts` and `features/cards/model.test.ts`, and by looking at each screen with playwright-cli at
390x844 in light and dark mode.

### Decks: Areas round (`/decide/areas`, was `#/areas`) and Swipe round (`/decide/swipe`, was `#/swipe`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Header: "Step 1 · regions & cities" / "Step 2 · attractions", title, `done / total` with a meter | Same, with the shadcn Progress | |
| [x] | Country filter chips: All plus each country with cards left, counts, trip order | ToggleGroup with the same chips and counts; a filtered country with nothing left keeps its chip | |
| [x] | Deck order: new first, then (places) kept-area cities, others, skipped-area cities last; trip order, city, name | `areaDeck` / `placeDeck` in `deck.ts` | Unit tested. |
| [x] | Three stacked cards, depth offset and dimming | Same three cards, Tailwind depth classes | |
| [x] | Place card: photo or local name in large type, category, New, booking badge (rec variant), 🛸 Drone show, flag chips, city · area, name, local name, why (clamped), price (/ night for a bed), local price, time needed, kind | `PlaceCard.svelte` from `ContentPlace.card` | Built from structured data, no card HTML. Clock times in the why get their UTC offset (TzText). |
| [x] | Area card: photo, flag chips, name + local name, flag + region, best-for chips, why, highlights, suggested days, cost, winter note; highlights and winter hidden in the phone deck | `AreaCard.svelte` | Same rule for what the phone deck hides. |
| [x] | "Note" chip on a card with a note | Same chip in the meta row (places) or the chip list (areas) | |
| [x] | Drag the top card: lean stamps (Must / Skip / Maybe) past a 30 px dead zone, opacity by distance | Same, `leanOf` / `leanAmount` | |
| [x] | Release: past 110 px, or a flick over 0.6 px/ms past 40 px, swipes sideways; 110 px up is Maybe; else spring back | `releaseVerdict`, same numbers | Unit tested; e2e drags with the mouse on all three projects (pointer events, as before). |
| [x] | A tap (under 6 px of movement) opens the sheet | Same | |
| [x] | Fly-out animation (28° rotate, 420 ms), skipped with reduced motion | Same transforms, Web Animations API | The next card moves up while the old one flies, instead of after 300 ms. |
| [x] | Buttons Skip / Maybe / Must with key hints in the labels | Same (`aria-label` "Must (→)" etc.) | |
| [x] | Keys: ← Skip, → Must, ↑ Maybe, with the button press flash | Same | |
| [x] | Z or Backspace: undo; Space or Enter: open; N: note panel; Escape: close the note panel; Escape: close the sheet | Same | Keys are ignored in inputs and with Ctrl/Cmd/Alt, as before. |
| [x] | 300 ms lock between swipes | Same | |
| [x] | Haptics: 8 ms on Skip, 14 ms on Must and Maybe | Same (`navigator.vibrate`) | |
| [x] | `ms` (time on screen) sent with each swipe | Same | |
| [x] | Optimistic swipe; on failure "Couldn’t save: <reason>" and the card comes back | Same, Convex optimistic update rolls back | Guest and frozen refusals keep write.ts's wording. |
| [x] | Undo is local only: the card comes back unswiped and stays so until swiped again (survives background refreshes, not a reload); toast "Card is back. Swipe it again to change your call." | Same (`undone` set and `undoStack` in `cards/calls.svelte.ts`) | e2e checks that a reload shows the swipe again. |
| [x] | Undo button disabled when there is nothing to undo in this round | Same | |
| [x] | Details button, "N left" | Same | |
| [x] | Note panel over the card's text (below the photo on a phone, beside it on desktop): "Your note on <name>", Done, editor with the round's placeholder; never starts a drag | `DeckNotePanel.svelte` | Placed by fixed fractions of the card instead of measuring the text box. |
| [x] | Note button: active state, "Add a note (N)" / "Edit your note (N)", aria-expanded | Same | |
| [x] | Hint "Drag the card, or use ← Skip · ↑ Maybe · → Must" | Same text from md up | Different on purpose: hidden on a phone, which has no arrow keys. |
| [x] | Deck cleared: 🎉, "Deck cleared!" or "<Country> cleared!", Must / Maybe counts (areas: must-go count), next step button, "Show all countries" | Same | Next step links to `/decide/duels` and `/decide/board` (slice F routes). |
| [x] | No cards at all: 🗺️ "No area cards yet" / 🧭 "No places yet" with the old text and link | shadcn Empty with the same text and link | Not covered by e2e (the data set always has cards). |
| [x] | New curator cards land in the deck without a reload, toast "✨ N new cards from the curator" | Shell refresh (`refresh.svelte.ts`); the deck re-derives from content | Shell feature, not this slice. |
| [x] | (none: the client ignored the role) | Guest: calls, drag-to-swipe and the note button disabled, a read-only line; cards still open | Different on purpose: guest read only, as the plan asks. |

### The place / area sheet (`PlaceSheet`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Bottom sheet, 94svh, full page in an iframe (`/place/<id>?embed=1`, `/area/<id>?embed=1`, `#answer-<id>`) | shadcn Sheet from the bottom (top 3rem to the bottom edge), same iframe URL | |
| [x] | Bar: Close (Esc), name, Skip / Maybe / Must | Same (`VerdictSeg`) | |
| [x] | Note editor under the bar | Same (`NoteEditor`, variant sheet) | Guest: the note as text. |
| [x] | Place call: toast "<Verdict>: <name>"; optimistic, no rollback | Optimistic with rollback | Different on purpose (plan section 8). |
| [x] | Area call: toast, pushes an undo entry, closes the sheet | Same | |
| [x] | Close: button, backdrop, Escape (not while typing a note), `{atr:'close'}` from the page; notes flushed on close | Same | |
| [x] | `{atr:'open', id}` from the page opens that place | Same, in the same sheet | |
| [x] | Theme toggle reaches the iframe (`{atr:'theme'}`) | Same, from a watch on `<html data-theme>` | |
| [x] | Background refresh paused while the sheet is open | `holdRefresh()` | |
| [x] | Focus moves to Close on open and back on close | Focus trap of the Sheet | |
| [x] | (none) | Back on the phone closes the sheet (shallow history entry) | New, per plan section 8. |

### My calls (`/decide/calls`, was `#/calls`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Header "Your verdicts and the reasons", "My calls", "<n> calls · <m> notes", lede | Same | |
| [x] | Every swiped or noted card; areas first, then places; trip order, verdict, name | `callItems` | Unit tested. |
| [x] | Groups Areas / Places with counts; country sub-heads (areas only with 2+ countries) | Same | |
| [x] | Filters: All / Areas / Places; Must / Maybe / Skip (second tap clears); With notes; countries (2+); counts | ToggleGroups, same rules (`toggleCallsFilter`) | Filters are kept while moving between screens, as before. |
| [x] | Nothing matches: message ("No notes yet…" for an empty notes filter) and "Show everything" | Same | |
| [x] | Row: thumb (photo, flag or category icon), name, meta, opens the sheet | Same | |
| [x] | Row call: optimistic with rollback, toast "<Verdict>: <name>" | Same | |
| [x] | Note: editor when there is one, else "+ Add a note"; the new editor folds back if left empty | Same | |
| [x] | No calls yet: ✍️ text and "Start swiping" (to Areas while areas are left, else Swipe) | shadcn Empty, same text and link | Not covered by e2e (the data set has calls). |
| [x] | (none) | Guest: calls disabled, notes as text, no "Add a note" | Different on purpose. |

### The note editor (`NoteEditor`, everywhere)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Autosave 1200 ms after typing stops, and on blur | Same | |
| [x] | Saves for one card run in order; a save equal to the current note sends nothing | `saveNote` chain per card; the server also answers `unchanged` | |
| [x] | "Saving…", "Saved" (fades after 1.8 s), "Not saved"; toast "Couldn’t save your note: <reason>" | Same | |
| [x] | Escape or Ctrl/Cmd+Enter finishes editing (closes the deck panel) | Same | |
| [x] | Grows with the text up to a max height; tinted when there is a note; 2000 characters max | Same (`field-sizing-content`) | |
| [x] | On a phone, scrolls into view above the keyboard on focus | Same | |
| [x] | Other editors of the same card follow a save unless being typed in | Same, through the live `feedback.state` | |
| [x] | Unsaved text is saved when the editor goes away (sheet closed, filter changed, panel closed) | Same | |
| [x] | Refresh paused while a note is focused or saving | `holdRefresh()` | |

### Rows not ticked

None. Two rows have no end-to-end test because the e2e data set never reaches that state: the empty decks and the
empty My calls page. Their text and links were compared with the old code by hand.

### Shared pieces other slices use

`features/cards` (index.ts): `PlaceCard`, `AreaCard`, `CardFlags`, `VerdictSeg`, `NoteEditor`, `NoteSnip`, `VERDICTS`,
`setCall`, `verdictsOf`, `undoLast`, `canUndo`, `saveNote`, `haptic`, `langOf`. `PlaceSheet` keeps its frozen props;
`SheetTarget` is also in `components/shared/PlaceSheet.types.ts` so type-aware lint in `.ts` files can see it.

## F · Overview, Duels, Board, Holidays

Source: [`parity/decide.md`](parity/decide.md).

Old behaviour: `game/public/game.js` (`counts`, `viewHome`, `duelPool`, `nextPair`, `viewDuels`, `duelSide`,
`liveRanking`, `pickDuel`, `skipDuel`, `flipList`, `board`, `viewBoard`, `countryBlock`, `cutLine`, `boardRow`,
`mixBar`, `balancePanel`, `holidayLocksPanel`, `bookPanel`, `bindBoard`, `changeDays`, `viewHolidays`,
`holidaySection`, `holidaySectionMany`, `manyTally`, `holidayCard`, `holidayDuel`, `nextHolidayPair`,
`bindHolidays`, `rerenderHoliday`, `setLock`, `confetti`, the keyboard handler and `refresh`), `game/public/game.css`,
and `game/lib/{elo,pairing,board}.js`. New: `apps/web/src/lib/features/decide/`,
`routes/(app)/decide/{+page.svelte,duels,board,holidays}`. The maths are the `@atr/shared` ports (`elo`, `pairing`,
`board`) and run in the browser, as before.

Checked by `e2e/duels.spec.ts` (overview and duels), `e2e/board.spec.ts` and `e2e/holidays.spec.ts` on desktop,
pixel and iphone (59 passed on slot 4), the unit tests in `features/decide/model.test.ts` (16, including a run of the
old `game/lib/pairing.js` against the new `nextPair` with the same random numbers, 120 pairs), and by looking at
each screen with playwright-cli at 390x844 in light and dark mode, and at 1280x800.

### Overview (`/decide`, was `#/game`, also `#/home`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Eyebrow "Decide · N countries · N days", title "Rank the trip, one swipe at a time." | Same | |
| [x] | Trip range and the flags and names of the countries | Same | |
| [x] | "✨ N new cards from the curator" pill to the swipe round | Same, live `isNew` flags | |
| [x] | Must / Maybe / Duels counters | Same | |
| [x] | My calls link: swiped count and note count | Same | |
| [x] | Route map link: stops in order, Must cities not placed | Same, from live `route.current` summary; links to `/trip/map` | Hidden until `route.current` answers (old: hidden without `route`). |
| [x] | Five steps (Areas, Swipe, Duels, Board, Holidays) with number, text, meter, "done / total unit", extra, CTA; empty steps greyed; festive Holidays step | Same texts and rules (`steps`, `stepLine`), shadcn Progress | Unit tested. |
| [x] | Footer line, "Test data." on fixtures | Same | |
| [x] | Guest | Same page (links only, no writes) | |
| [x] | Decide sub-tabs with badges (areas left, places left, holidays open) | `DecideNav` on the overview, duels, board and holidays pages | The shell has no Decide sub-nav; E's pages (areas, swipe, calls) do not show it. See the report. |

### Duels (`/decide/duels`, was `#/duels`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Pool = Must + Maybe places; empty state "Duels need contenders … You have N." with "Go swipe →" | Same (shadcn Empty) | |
| [x] | Header "Step 3 · this or that", confidence % and duel count with a meter | Same | |
| [x] | Filters: "Mostly same country" plus each country with 2+ picks; a filter with fewer than 2 falls back to mix | ToggleGroup, `duelFilters` / `effectiveFilter` | |
| [x] | Pairing: `pickPair` (same-country bias 0.85, uncertainty, closeness, repeats, recent), country forced by a filter | `nextPair` on `@atr/shared/pairing` | Unit test runs the old JS with the same RNG: identical pairs. |
| [x] | Question: "<flag> Which is more worth a day in <country>?" or "Which would you rather do?" | Same | |
| [x] | Two sides: the place card plus the note snippet, Details button, "← Pick" / "Pick →" hint | `DuelSide` with E's `PlaceCard` and `NoteSnip` | On a phone Details is an ⓘ icon at the top right (the narrow card has no room for the label). |
| [x] | Pick (tap a side, ←/A/1 left, →/D/2 right): winner grows with "+N", loser fades "−N", haptic 12 ms, live ranking re-sorts with FLIP, next pair after 620 ms, input ignored meanwhile | Same; `animate:flip` on the ranking; refresh held during the pause | Optimistic (`decide.duel` with an optimistic `feedback.state` patch). |
| [x] | Can't decide (↓/S or the link): logs nothing, the pair counts as met locally | Same (`duelState.skipped`) | |
| [x] | Live ranking: the country's six best by rating, "Full board →" | Same | |
| [x] | Keys ignored in inputs, with modifiers, and while the sheet is open | Same | |
| [x] | Details opens the place sheet | Shared `PlaceSheet` | |
| [x] | Filter and current pair survive moving between pages (old global `S`) | Module state in `state.svelte.ts` | Reset by a reload, as before. |
| [x] | Guest | Pairs and ranking visible, pick buttons disabled, keys do nothing; Can't decide stays (it writes nothing) | Old site had no guest. |

### Board (`/decide/board`, was `#/board`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Header "Step 4 · the ranking", "N / M days", "+/−N vs trip plan" and Reset when off the plan | Same | |
| [x] | Lede sentence | Same | |
| [x] | Per country: flag, name, dates, days stepper (− disabled at 0, max 90), "plan N" when changed | `CountryBlock` + `DaysStepper` (ButtonGroup) | |
| [x] | Budget: spend of cap, meter, ok / tight / over sentence, R$/day, food picks not counted; tooltip | Same (`budgetLine`) | |
| [x] | Category mix bar and "Heavy on X" nudge or "N picks above the line" | `MixBar` (SVG, no inline style) | |
| [x] | Ranked list (`rankCountry`: locked first, rating, Must before Maybe, name) with the dashed cut line at the days, "N open days: swipe more or ask the curator" | `rankLines` on `buildBoard` | Unit tested. |
| [x] | Row: rank, thumb or category icon, name, city · category · New, note snippet, lock / drone / booking tags, call pill, price with "meal" for food; below the line faded; tap opens the sheet | `BoardRow` | Tags sit under the name at every width. |
| [x] | Changing days: rows and the cut line slide (FLIP), the count slides in, side panels and total update at once, saved after a 350 ms pause | Same; `animate:flip`; `queueDays` / `flushDays`; pending changes are also sent on leaving the page | Optimistic. |
| [x] | Reset: back to the plan's days | `decide.resetDays`, optimistic | |
| [x] | Balance panel: bar, legend with %, up to 4 nudges, "✓ Nicely balanced." from 5 picks | Same | |
| [x] | Holidays panel: lock chip opening the sheet or "Pick →"; Lunar New Year "N of M Must →" | Same | Shows only server-confirmed locks (see Holidays). |
| [x] | Book ahead: deadline order, Must book / Recommended, days ahead, holiday emoji, first booking link | Same | |
| [x] | Narrow screens: side panels above the countries | `order-first` below `lg` | |
| [x] | Guest | Board visible; steppers and Reset disabled | |
| [ ] | (brief) Drag and drop of picks into days, days per city | Not built | The old board has neither: days are per country and there is no drag. Parity kept with the old site. |

### Holidays (`/decide/holidays`, was `#/holidays`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Festive hero with falling snow, "Step 5 · the big nights", copy | Same; snow is SMIL in an SVG, hidden with reduced motion | |
| [x] | Pick-one section (Christmas, New Year's Eve): title, date, where you'll be, option count, "⚔️ Duel them" with 2+ options | Same (`oneSection`, `oneWhenLine`) | |
| [x] | Locked banner: "Locked in for X", name, flag city · price, Unlock | Same | |
| [x] | Options: locked first, then rating; card with photo or local name, badges (👑 Top pick, 🛸 Drone show, 🔒 Locked), title, facts (cost, booking, cold, crowds, winter), heads-up when you're elsewhere that night, Details, "🔒 Lock it" / "✓ Locked" | `HolidayCard`; options re-sort with FLIP | Free-text facts carry the UTC offset (TzText). |
| [x] | Lock: confetti from the button and "🎄 Locked: <name>" toast once saved; Unlock | Same | **Not optimistic**, as the old `setLock` (it redrew only after the POST). The button spins until the server answers. `ops.ts` holds the explicit list (`NOT_OPTIMISTIC = ['decide.setLock']`). |
| [x] | Mini duel: two options, pick shows ±N, next pair after 550 ms, "Done duelling" | `HolidayDuel`; pairs via `pickPair` with no country bias | Picks are optimistic duels. |
| [x] | Empty option list: "No X options yet. The curator tags places with <tag> …" | Same | |
| [x] | Pick-many (Lunar New Year): day range, holiday date, where; "don't compete" sentence (apart or spread), tally, cards in day order with a day badge, When fact, own Must / Maybe / Skip | Same (`manySection`, `manyTally`, `VerdictSeg`, `setCall` with the toast) | |
| [x] | Holidays badge on the sub-tab (open holidays) | `holidayOpenCount` | |
| [x] | Guest | All visible; Lock, Unlock, Duel them, mini-duel picks and calls disabled | |

### Cross-cutting

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Background refresh skipped while a duel is animating | `holdRefresh()` during the pick pause, a lock and a mini-duel pause | |
| [x] | A refused write shows "Couldn't save …: reason" and the optimistic change rolls back | `reportRefusal`; Convex drops the optimistic patch | Guest and frozen keep write.ts's words. |
| [x] | Reduced motion: no animations, no confetti | `reducedMotion` (MediaQuery) | |
| [x] | Clock times show their UTC offset | Notes and facts through TzText / NoteSnip | The Decide screens show dates, not clock times, except inside free text. |

## G · Money, To do, Bag

Source: [`parity/money-prep.md`](parity/money-prep.md).

Old behaviour: `game/public/trip.js` (`viewMoney`, `verdictHtml`, `currentBudget`, `viewTodo`, `viewBag`, `taskRow`,
`openTasks`, `SCHEMA`, `openEdit`, `submitEdit`, the click handler), `game/public/trip.css`, `game/lib/trip.js`
(`moneyTotals`, `priceCheck`, `dailyOf`, `RATES`), the Prep sub-tabs and badge in `game/public/game.js`.
New: `apps/web/src/routes/(app)/money/**`, `(app)/prep/**`, `src/lib/features/money/**`, `src/lib/features/prep/**`.

Checked by `src/lib/features/money/{model,links}.test.ts`, `src/lib/features/money/record/schema.test.ts`,
`src/lib/features/prep/model.test.ts` (units), and `e2e/money.spec.ts`, `e2e/todo.spec.ts`, `e2e/bag.spec.ts` on
desktop, pixel and iphone. Screens checked at 390x844 in light and dark with playwright-cli.

### Money (`#/money` → `/money`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Eyebrow "R$ X planned · cap R$ Y", title, lede | `PageHead` | Same text. |
| [x] | "Log expense" button in the head | Same | Hidden for the guest. |
| [x] | Empty state "No budget yet / Set a cap and the daily budgets to start." when no budget, no fixed cost and no cap | `Empty` | Adds a "Set the cap" button for the owner (the old page had no way in from the empty state except the head button). |
| [x] | Summary card: plan total, "planned of your R$ cap", "R$ N to spare" / "R$ N over" chip, ⋯ edits settings | Summary `Card` | |
| [x] | Stack bar fixed / ground scaled to max(cap, plan), legend with Flights and fixed, Days on the ground, Spare, Logged so far | `Bar` (SVG widths, no inline style) | |
| [x] | Booking check: country (budget rows), what (bed/food/other), price, currency (RATES), live verdict with conversion, ok / warn (≤125 %) / over wording and colours | `PriceCheck` + `checkVerdict` | Same strings (unit tests). |
| [x] | Booking check default: where you are today, else the next stay abroad, else the first row; changing country sets its currency | Same (`currentBudget`, `checkDefaults`) | |
| [x] | Booking check choice kept while moving between pages (`T.chk`) | Module state in `PriceCheck` | Kept per tab, not across reloads, as before. |
| [x] | "Per day, by country" heading with ground total and days | Same | |
| [x] | Country card: flag and name, ⋯ edit, "R$ X / day · N days · R$ planned", bed/food/other split bar and legend | `BudgetCard` | Days come from the trip config, as before. |
| [x] | Spent so far line and mini bar, red when over | Same | |
| [x] | "How to pay in X" `<details>` with linkified text | `Collapsible` + `RichText` | Clock times in the text get the country's UTC offset (new: the old page had no `data-tz` here). |
| [x] | "How money works on this trip" tips block, linkified | Same | No offset on its times: the tips cover every country, so none is guessed (as before). |
| [x] | "Flights and fixed costs" with total, rows with Paid / To pay / Estimate chip, title, note, amount, ⋯ | Same | |
| [x] | Empty "No fixed costs / Add flights, insurance or the eSIM here." and "Add cost" button | Same | Button hidden for the guest. |
| [x] | "Spending log" heading with Bed / Food / Other totals | Same | |
| [x] | Empty "Nothing logged yet / Tap Log expense…" | Same | |
| [x] | Log grouped by date (newest first, then latest written), day header "Sun 6 Dec" with the day's R$ total, "No date" group | `spendGroups` | |
| [x] | Expense row: category chip (k3/k4/k5), note or category or "Expense", country, R$ amount, local amount and currency when not BRL, ⋯ | Same | |
| [x] | R$ conversion of an expense from the hard-coded RATES | `trip.write` mutation (`amountBRL` in `normalizeTripFields`) | Same rates and rounding, computed on the server instead of the browser. |

### Add / edit sheet (all six collections)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Forms for tasks, bag, budget, fixed, spend, settings with the old fields, labels and select options | `RecordDialog` + `recordSchema` | |
| [x] | Title "Add …" / "Edit …" | Same | |
| [x] | New expense starts today, as Food, in the current country with its currency | `initialValues` | |
| [x] | Task form shows the effective status (done from the old `done` flag) | Same | |
| [x] | Bag category suggestions from existing categories (datalist) | Same (native `datalist` on `Input`) | The plan named a Combobox; the native list is kept because it is what phones handle best and it allows a new category. |
| [x] | Number fields: empty is 0; strings trimmed | `submitData` | |
| [x] | "Give it a name first." / "Enter the amount first." when the main field is empty | Same toasts | |
| [x] | First field focused on Add | `onOpenAutoFocus` | |
| [x] | Save closes the sheet and toasts "Added" / "Saved"; a failure toasts the error | Same | Pessimistic, as before. An edit sends only the fields that changed (plan section 11); an edit that changed nothing closes without a write or toast. |
| [x] | Delete asks for a second tap ("Tap Delete again to remove it."), toasts "Deleted"; settings has no Delete | Same | |
| [x] | Cancel, Escape and a backdrop click close without writing | Dialog | |
| [x] | Form shaping: task `done` mirrors status, bag qty defaults to 1, new bag item unpacked, new doc gets order max+1 | `trip.write` mutation | Moved to the server by the backend layer. |
| [x] | Background refresh held while the sheet is open (`tripSheetOpen()`) | `holdRefresh()` | |

### To do (`#/todo` → `/prep/todo`, and `/prep`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Eyebrow "N open · M done" (or "To do"), title, lede naming the departure day before the trip | Same | |
| [x] | "Add task" button | Same | Hidden for the guest. |
| [x] | Empty "No tasks yet / Add the first thing you need to do." | Same | |
| [x] | Progress bar "M of N done" | `Progress` | Bar uses the theme primary colour (the old one was green); ui components are not restyled. |
| [x] | Open tasks in order, "Everything is ticked." when none, then a "Done · N" group | Same | |
| [x] | Row: tick box ("Mark done: …" / "Mark not done: …"), title, In progress and Suggested chips, linkified note, ⋯ | `CheckRow` | An in-progress task shows a half-ticked box (the old half-filled box). |
| [x] | Tap the box: done ↔ to do, an in-progress task becomes done | `toggleTaskFields` | Pessimistic, as before; the box is disabled while its write runs. |
| [x] | Prep tab badge and To do sub-tab badge with the open count | Sub-tab badge in `PrepNav` | The section tab badge in the bottom bar belongs to the shell (not this slice); see below. |
| [x] | Prep tab opens To do | `/prep` shows To do | Also reachable as `/prep/todo`. |

### Bag (`#/bag` → `/prep/bag`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Eyebrow "P of N packed" (or "Bag"), title, lede | Same | |
| [x] | "Add item" button | Same | Hidden for the guest. |
| [x] | "Untick all" shown when something is packed; arm, then "Confirm: untick all" / "Cancel" | `AlertDialog` ("Untick all N packed items?", Cancel, "Confirm: untick all") | Different on purpose: a dialog instead of buttons that change in place. One `trip.bagUntickAll` write instead of one POST per item. Toast "All items unticked". |
| [x] | Empty "Bag is empty / Add the first thing to pack." | Same | |
| [x] | Progress bar "P of N packed" | `Progress` | |
| [x] | Groups by category in first-seen order ("Other" when none), header with packed/total | Same | |
| [x] | Row: tick box ("Packed: …"), item, "×N" when qty ≠ 1, note, ⋯ | `CheckRow` | |

### Guest (read only)

| | Old behaviour | New | Note |
|---|---|---|---|
| [x] | Sees every view | Same | |
| [x] | Write controls present, every write refused with 403 and a toast | Add, edit, delete and untick-all controls hidden; tick boxes shown disabled | Different on purpose (task brief): nothing a guest can tap tries a write. The booking check still works (it writes nothing). |

### Not matched, or owned elsewhere

- Clock times in task, bag and fixed-cost notes and in the money tips get no UTC offset, exactly as on the old page:
  their zone is unknown (before departure the traveler is in Brazil, later anywhere), and `TzText` does not guess.
- The Prep badge on the section tab (old `secBadge.prep`) is not shown: the bottom bar is `AppShell.svelte`, a
  shared file. `openTasks(trip)` in `src/lib/features/prep/model.ts` gives the count when the shell adds it.
- Offline reads and queued writes (the old site had none) are slice L's.

## H · Content pages, embed glue, media, maps

Source: [`parity/content-pages.md`](parity/content-pages.md).

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

## I · CLI and export client

Source: [`parity/cli.md`](parity/cli.md).

Old behaviour: `platform/cli/atr.js`, `platform/lib/{feedback/pull,publish,site}.js` before slice I, hand edits of
`trip/*.json` (docs/TRIP.md), and `game/server.js` `/healthz`. New: the same files plus `platform/lib/trip-cli.js`.
There is no screen in this slice, so there is nothing to look at on a phone; every row is checked by
`node --test platform/test/{pull,trip-cli}.test.js` and `game/test/answers.test.js`, or by the run against slot 5
quoted at the end.

| | Old action | New equivalent | Note |
|---|---|---|---|
| [x] | `./atr feedback pull --url <site>`: GET `/ops/export`, check each file's sha256 and count, temp dir, then rename over `.cache/feedback-live/` | `./atr feedback pull --from-convex [--url <site>]` | Different on purpose: the source is now named. A bare `pull` means `--from-backup`, the default until the cutover, which is not built and refuses with a message saying to use `--from-convex`. Before, a bare `pull` read whatever `ATR_EXPORT_URL` pointed at. |
| [x] | `./atr trip pull` into `.cache/trip-live/` | `./atr trip pull --from-convex` | Same rules as feedback. |
| [x] | URL from `--url`, else `ATR_EXPORT_URL`, else an error | `--url`, else `ATR_EXPORT_URL`, else `site.js` `SITES.new.exportUrl` (`https://cvx.<site>`) | Different on purpose: Convex runs only behind the new app, so its export URL is the natural default. |
| [x] | Token from `ATR_EXPORT_TOKEN` or the keychain (`security find-generic-password -s atr-export-token -w`); never an argument, never printed | Unchanged | Tests check that the token is in no output and not in the manifest. |
| [x] | Every file's sha256 and count checked before anything is written | Unchanged, plus: a `--from-convex` pull also refuses a bundle that lacks one of the kind's files (6 feedback, 9 trip) | Different on purpose: a truncated bundle could otherwise pass the checks and leave the curator with an incomplete copy. |
| [x] | Refuses to replace a target with a newer, edited or stray file, or a dir no pull wrote, and names the file | Unchanged | |
| [x] | Read-only commands (`feedback`, `taste`, `next`, `run --auto`) read the pulled copy; `--dir` and `ATR_FEEDBACK_DIR` win; `./atr game` keeps `<root>/feedback` | Unchanged | |
| [x] | Stale-pull warning after 26 h: "run ./atr feedback pull" | Same warning, now "run ./atr feedback pull --from-convex" | The bare command would refuse before the cutover. |
| [x] | Hand edits of `trip/*.json` (docs/TRIP.md:76-81) | `./atr trip set <col> [id] --data <json>`, `update <col> <id> --data <json>`, `delete <col> <id>`, through `trip:adminWrite` | Uses `scripts/convex-prod.sh run` (or `scripts/convex-local.sh convex run` with `--local`, slot from `ATR_SLOT`). The command never holds the admin key. |
| [x] | Old `writeDoc` rules: unknown collection, bad id, `data must be an object`, `<op> needs an id`, set creates or replaces, update merges and `null` clears, delete of a missing id is a no-op, the 64 KB body cap | Checked locally with the same id rule and limits (a test keeps them equal to `convex/lib/logic/trip.ts`), then by the backend | Different on purpose: `id` inside `--data` is refused with a hint (the old server dropped it quietly), and unknown field names are refused using `@atr/shared` `TRIP_FIELDS` when `packages/` is in the checkout. The backend redacts its error text, so the CLI gives the reasons itself. |
| [x] | (none: a file edit could not be frozen) | Refuses while writes are frozen: it asks `ops:getWritesFrozen` first and never passes `force` | Overriding the freeze stays a by-hand owner step in the runbook. |
| [x] | (none: a file edit needed no confirmation) | Writing to prod asks `[y/N]` on a terminal; without a terminal it needs `--yes`; `--dry-run` prints the exact command and sends nothing | Org rule: production writes are confirmed. |
| [x] | `./atr answers publish`: merge, follow the Coolify deploy over SSH, then `/healthz` 200 | Old site: unchanged. New site: waits until `/healthz` reports `sha` equal to the merge commit (for the whole deploy timeout), and only then prints "the card is live" | The old `/healthz` answers `{"ok":true}` with no sha, so 200 is still enough there. On the new site a stale sha is printed as "still reports <old>, not <new>". |
| [x] | Coolify deploy followed with app `zoom1ixd7gj2y4snw6oculrb` | Old site: unchanged. New site: `coolifyApp: null` until task 8 creates `trip-web`; the publish then skips SSH and relies on the `/healthz` sha | The `/healthz` sha is the stronger proof anyway. |
| [x] | Card links `/#/answers/<id>` and `/<kind>/<id>#answer-<id>` | Old site: unchanged. New site: `/places/answers/<id>`; the page link is the same | Picked by the switch. |
| [x] | One site in `site.js` | `SITES.old` and `SITES.new`, `ACTIVE_SITE = 'old'`; `ATR_SITE=old\|new` overrides it for one command | The cutover PR flips `ACTIVE_SITE` and `DEFAULT_SOURCE` (pull.js). |

### Rows not ticked

None. Not part of this slice, and still open:
- `--from-backup` (task 2 in the plan) is not built. Until it is, `--from-convex` is the only pull.
- Task 2's `gh pr merge --auto` plus polling for `MERGED` is not in `publish.js`. It still runs `gh pr merge --merge`; the plan notes that an immediate merge fails once branch protection is on.
- `scripts/convex-prod.sh` (task 8) does not exist yet, so a prod `./atr trip` write stops with "not in this checkout yet".

### Extra exit (slot 5, a copy of the real data)

Slot 5 was seeded with `@atr/migrate import --src <copy of feedback/ and trip/> --target local`, and the CLI ran in
a scratch `ATR_ROOT` that links `places/ areas/ config/ answers/ reviews/`:
- `./atr feedback pull --from-convex --url http://127.0.0.1:3261` exited 0 with 6 files (duels 23, game-state 263,
  notes 660, questions 36, route 0, swipes 268). `./atr trip pull --from-convex` exited 0 with 9 files.
- `./atr taste` and `./atr taste --dir <source>/feedback`: `diff` empty (107 lines), and also empty for
  `taste --json` and `next`. `feedback` differs only in its "feedback dir:" header line.
- Every pulled file is byte-identical to its source file (`cmp`); `route.jsonl` exists only in the pull, empty.
- `./atr trip set spend --local` created a document, `delete` removed it, a freeze made `delete` refuse before
  `adminWrite` ran, and an unknown field was refused locally.

## L · Offline

Source: [`parity/offline.md`](parity/offline.md).

The old site has no offline mode (plan section 11): `game/public/game.js` `api()` posts with `fetch` and a failed
write is lost after a toast and a local rollback; a cold load with the server unreachable shows "The trip site isn't
answering" (`load().catch`, line 2001); the focus refresh fails silently (`load({ silent: true })`, line 1989). So
most rows below are new behaviour; the "old" column says what the old site did in the same situation.

New: `apps/web/src/service-worker/` (`index.ts`, `strategy.ts`), `apps/web/src/lib/sync/` (`write.ts` internals,
`outbox.ts`, `db.ts`, `mirror.ts`, `auth.ts`, `state.ts`, `status.ts`, `runtime.svelte.ts`, `SyncBadge.svelte`).

Checked by `src/lib/sync/{write,outbox,mirror,status}.test.ts` and `src/service-worker/strategy.test.ts` (units, 37
tests), and `e2e/offline.spec.ts` on desktop, pixel and iphone. The badge was checked at 390x844 in light and dark
with playwright-cli (offline pill and details, paused pill).

### Opening the app with no network

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Cold load with the server unreachable: "The trip site isn't answering" and Retry | The service worker answers every page opened online before from its saved copy (HTML, `__data.json`, build files); a page never opened says "You are offline", lists the saved pages and offers "Try again" | Differs on purpose: the itinerary, addresses and booking refs open offline (e2e: cold offline load of `/trip/itinerary`). |
| [x] | Live data (old `/api/state`, `/api/trip`) gone offline | The last results of every Convex query (`trip.all`, `feedback.state`, `route.current`, …) are mirrored to IndexedDB and answer while the client has no live result | The content payload comes with the saved page and `__data.json`, not the mirror. |
| [x] | Focus or visibility refresh fails silently | `refreshAll()` offline is answered by the saved `__data.json`; a miss makes SvelteKit load the page itself, which the saved copy or the offline page answers | |
| [x] | No offline indicator | Pill under the header, right: "Offline" (or "Offline · N" with N unsynced); its details say "Offline · last synced 14:05 UTC−3" with the device's offset | New. Shown after the socket has been down 2.5 s, or at once when the browser reports offline. |
| [x] | Pages never cached | Network first everywhere (pages, data, media, maps, content pages); after 5 s without an answer a saved copy answers if there is one | New. Sign-in, sign-out, `/api/*`, `/healthz`, `/ops/*` and `/_app/version.json` are never cached. |
| [x] | Deploys: the page reloads on a new version | Unchanged (`refresh.svelte.ts`); the worker precaches each build, keeps the 3 newest builds so an older saved page still finds its scripts, and checks for an update after navigations (at most once a minute) | |
| [x] | Sign out | `POST /logout` also deletes the saved pages, runtime responses and the query mirror | New. The outbox is kept for the owner; a guest session never replays it. |
| [x] | Guest offline | Reads the saved pages like the owner; write controls stay disabled; the badge details have no actions | |

### Writes

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Guest write: refused with the read-only message | `write()` refuses at once with "Guests can look but not change anything.", nothing is sent or queued | Unchanged from task 7. |
| [x] | Write while the server is unreachable: toast "Couldn't save: …" and the change is rolled back (lost) | Stored in the IndexedDB outbox before it is sent, kept across reloads, sent in order once connected, removed only when its mutation resolves | Differs on purpose (spike S25). Screens with optimistic updates (swipes, notes) show the change at once, even after an offline start (`mirroredStore`); pessimistic ones (To do, Bag, trip forms) stay busy until it lands, as before. |
| [x] | A replayed request could land twice | Each write carries a UUID `clientOpId`; `ownerMutation` records it in `appliedOps` and answers `{ replayed: true }` to a repeat | e2e: replaying a landed `clientOpId` adds no row. |
| [x] | Server refuses the input (old 400): toast with the reason, rollback | Same for a live write (the screen's own toast); a refused replay is dropped with "A change saved offline was refused: …" | |
| [x] | Writes paused (cutover, rollback): not in the old site | `Frozen` keeps the entry; pill "Paused · N", details "Writes paused, N waiting" with "Copy pending changes" (JSON on the clipboard and in a dialog to select) and "Retry"; retries stop until a reconnect or "Retry" | New. e2e: entry kept across a reload, copied, then lands once after unfreezing. |
| [x] | Slow writes: no indicator | "N unsynced" pill once a write has waited 1.5 s | New. |
| [x] | Closing the tab with a write in flight loses it silently | `beforeunload` asks first while the outbox is not empty | New. |
| [x] | Route save with `keepalive` on page hide (old line 1464) | Every write is durable in the outbox, so a hidden or closed page resends it on the next visit | The route editor itself is slice C. |
| [x] | Offline start, then the network returns | The runtime hands the auth library's own token fetcher back to the client when the socket comes back without auth (the library gives up after about 8 s offline), then replays | New. e2e S25 stays offline 12 s after the reload; the first replay meets `Unauthenticated` (kept), the re-authentication follows, and all four writes land once. |

### Plan exit tests (section 11)

| | Plan test | Spec | Note |
|---|---|---|---|
| [x] | Offline: tick a task, add a note, change days; reload; online; each row once in `/ops/export` | `S25: three swipes and a task tick made offline survive a reload and land exactly once` | Uses three swipes (event rows, so "exactly once" is countable) and a task tick. Notes and days are not used: the deck note panel is a second write path to the same `write()`, and the days board (slice F) was not built when this spec was written. |
| [x] | Cold offline load of `/trip/itinerary` after one online visit renders the cached legs | `a cold offline load of the itinerary after one online visit shows the saved legs` | Also checks the offline page for a page never opened. |
| [x] | Queue writes, freeze, reconnect: kept, "Writes paused" visible, "Copy pending changes" returns them; unfreeze: land once | `a Frozen refusal keeps the entry …` | One write, frozen while online; the reload in the middle shows the entry survives. |

### Known limits

- WebKit's offline switch in Playwright blocks new connections only, so the S25 spec loads the deck after going
  offline (the real case: opening the app with no network).
- After a reload offline, the first replay can meet `Unauthenticated`; the entries stay and are retried every 5 s
  while the socket is up.
- Writes issued at once are ordered by the Convex client queue. If writes are unfrozen between two mutations of
  one replay, a later entry could land before an earlier frozen one. Accepted: unfreezing is a manual ops step.

## Task 8 · Deploy, backup, restore

Source: [`parity/deploy.md`](parity/deploy.md).

Old behaviour: the root `Dockerfile` and `deploy/entrypoint.sh` (the old image), `docs/DEPLOY.md` (Coolify setup,
deploys, `/healthz`), the plan's manual snapshot (section 13). New: `apps/web/Dockerfile`,
`apps/web/Dockerfile.dockerignore`, `deploy/coolify/**`, `deploy/backup/**`, `scripts/convex-prod.sh`,
`scripts/backup-status.ts`, `.github/workflows/{restore-test,backup-freshness}.yml`, `docs/migration/cutover.md`,
`docs/migration/runbook-restore.md`. There is no screen in this slice, so there is nothing to look at on a phone.
Every row is checked by `node --test 'deploy/backup/test/*.test.ts'` (25 tests) or by the local runs on slot 6 on
2026-11-15 (22:36 to 23:05 UTC) quoted in the slice report.

| | Old | New | Note |
|---|---|---|---|
| [x] | Image: `node:24-bookworm-slim`, `npm ci --omit=dev`, whole repo copied | `apps/web/Dockerfile`: corepack pnpm 12.21.0, `pnpm fetch` + offline frozen install of `@atr/web...`, `vite build`, `pnpm deploy --prod --legacy`, runtime `node:24-slim` | Different on purpose: corepack on `node:24-slim` instead of `ghcr.io/pnpm/pnpm:12` (one pin, the root `packageManager`); `--legacy` because the workspace does not set `injectWorkspacePackages` (changing it would touch the lockfile). |
| [x] | Content (`places/ areas/ answers/ config/`) baked in at `/app` | Baked in at `/app/content`, `ATR_ROOT=/app/content` | |
| [x] | sharp works (glibc) | sharp checked in the build (a webp encode) and in the running image: `GET /map/dongmyo-flea-market.webp` 200, `image/webp`, `max-age=86400`, `file` says Web/P 1200x720 | Spike S16 PASS. |
| [x] | `HEALTHCHECK` with node `fetch` on `/healthz` (no curl) | Same, port from `PORT` (3000); container reported `healthy` | |
| [x] | Runs as root with `/data` volume, entrypoint chowns it | Runs as `node`; `web-cache:/data/cache` volume, `/app/content/.cache` links to it | Different on purpose: non-root; the platform's map and tile cache survives redeploys. |
| [x] | `/healthz` → `{"ok":true}` | `{"ok":true,"sha":"<GIT_SHA>"}`; `?deep=1` adds the Convex check | `GIT_SHA` build arg (Coolify: `$SOURCE_COMMIT`). |
| [x] | Sign-in with JavaScript off (form POST → 303 + cookie) | Same against the image: owner and guest POST `/login` → 303, Better Auth session cookie, `/trip` 200 | Checked before and after the S15 restore. |
| [x] | `.dockerignore` (root) for the old image | `apps/web/Dockerfile.dockerignore`, an allow-list | Different on purpose: BuildKit reads `<Dockerfile>.dockerignore`; an `apps/web/.dockerignore` would be ignored with the repo root as context. |
| [x] | (none) Convex service | `deploy/coolify/convex.compose.yaml`: backend + dashboard at the same commit sha as `deploy/convex-local`, dashboard on `127.0.0.1:6791` only, `mem_limit`, json-file log rotation | Tested: same sha, loopback port, no `SERVICE_URL_DASHBOARD`, rotation and limits on every service; `docker compose config` valid. |
| [x] | Env documented in DEPLOY.md | `deploy/coolify/env/*.template`, names only | A test fails on any value. |
| [x] | (none) production Convex commands | `scripts/convex-prod.sh`: mode-600 gitignored key file, https only, prints the host, asks to type it before every write, refuses `env get`, `env list --include-values` and values as arguments | `ATR_PROD_CONFIRM=<host>` answers one prompt for a scripted step; it must equal the host. |
| [x] | Manual snapshot: `ssh tar … \| age` on the laptop | `deploy/backup/backup.sh` (systemd timer 16:17 UTC): old `/data` staged, mid-line retry, parse check, manifest; Convex export + v1 bundle; env encrypted to the owner only; status object; rclone remote or local directory | The bucket is not chosen: `BACKUP_DEST` takes an absolute directory today. Ran against slot 6 to a local directory. |
| [x] | (none) | `deploy/backup/restore-convex.sh` on a fresh backend: env set, deploy, `import --replace-all`, accounts, verify | Spike S15 PASS: 0 differences (migrate verify), 32 tables / 99 documents equal, owner and guest present, owner signs in and gets a JWT. |
| [x] | (none) | `deploy/backup/restore-check.sh`: old object → manifest → old server on the restored files → sign-in → `/api/trip` counts | Ran on the local `old/` object: 14 files, 9 collections. |
| [ ] | (none) | `restore-test.yml` Convex leg as `ci_restore` | Code fixed by the integrator: the user is now `ci_restore` (Better Auth allows `[a-zA-Z0-9_.]`), in `admin.ts`, `restore-convex.sh`, `restore-test.yml` and the plan; `convex run admin:seedCiUser` with `ATR_CI_DEPLOYMENT=1` on a local backend returns `"created"`. Still unticked: the workflow has not run (no `gh` from here). |
| [ ] | (none) | `restore-test.yml` step 3's `pnpm e2e --grep @smoke` as `ci_restore` | Not wired: the Playwright `e2e-backend` web server re-deploys, re-seeds and replaces the restored data. Needs a Playwright mode that reuses an existing backend. |
| [x] | (none) | `backup-freshness.yml` + `scripts/backup-status.ts` | Both skip until `vars.BACKUP_REMOTE` is set; `backup-status.ts` exit 0 on the local store. |

### Rows not ticked

Two, both above, both blocked outside this slice's paths.
