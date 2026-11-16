# Parity: Trip › Itinerary, Calendar and the trip forms (slice B)

Old code: `game/public/trip.js` (`viewItinerary`, `viewCalendar`, `openDay`, `openDetail`, `legCard`, `SCHEMA`, `openEdit`,
`submitEdit`, the click handler) and `game/public/trip.css`. New code: `apps/web/src/lib/features/trip/**`, routes
`/trip/itinerary` and `/trip/calendar/[[date]]`. Specs: `apps/web/e2e/itinerary.spec.ts`, `apps/web/e2e/calendar.spec.ts`
(desktop, iphone, pixel). Unit tests: `apps/web/src/lib/features/trip/trip.test.ts`.

Ticked = the new screen does the same, checked by a spec, a unit test or a phone screenshot (390x844, light and dark,
playwright-cli). Notes say where the behaviour differs on purpose.

## Itinerary

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

## Calendar

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

## Trip forms

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

## Guest (read-only)

| | Old | New | Note |
|---|---|---|---|
| [x] | Sees every leg, day and sheet | same | |
| [x] | Write controls | hidden: Add stop, ⋯ Edit, plan sheet Edit, Edit day / Add a note | Old showed them and the server refused; `write()` refuses a guest anyway |

## Not ticked

None of the rows above is open. Outside this slice, and not done here:

- The `/trip` tab still shows the placeholder; the old Trip tab opened on the Itinerary. `(app)/trip/+page.svelte` is not in
  this slice's brief (ownership.json lists it for B; the brief does not).
- The shell has no Trip sub-navigation (Itinerary / Calendar / Map). The trip pages carry their own Itinerary / Calendar
  links; Map (slice C) is not linked because `/trip/map` does not exist yet to type `resolve()`.
- `@readonly` `toHaveScreenshot` baselines were not added (the phone screenshots were checked by eye).
