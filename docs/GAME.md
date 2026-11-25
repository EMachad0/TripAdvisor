# Game design

Approved by the traveler on 2026-11-09.

## Goal

Rank attractions per country so the traveler can see what's worth a day. The output is a ranked list, a balance view and a book-ahead list. **It never generates a day-by-day schedule.**

## The funnel (broad → narrow)

1. **Areas round.** Swipe region/city cards per country: **Must / Maybe / Skip**. This decides which cities get researched in depth (especially China, where only Shanghai is fixed, and Japan).
2. **Swipe round.** Swipe attraction cards for kept cities. Each card shows type, a short why, cost (R$ and local currency), and a 📅 badge if it must be booked ahead, with how far ahead.
3. **Duels.** This-or-that matchups between Musts and Maybes, mostly within the same country. Elo-style rating, so the traveler only makes quick pairwise calls.
4. **Board.** Ranked list per country with:
   - **Cutoff line** at the number of days in that country (one attraction per day). Moving days between countries moves the lines.
   - **Balance meter**: category mix of above-the-line picks (culture, food, nightlife, nature, odd local, views, shopping, shows, day trips…), with a nudge when one category dominates or one is missing.
   - **Budget check** against the R$/day budget for that country.
   - **Book-ahead list** sorted by deadline (timed tickets, reservations, passport-registered tickets, tours).
5. **Growing list.** Swipes, duel results and notes are logged to files. The curator reads them and adds recommendations that match the traveler's taste. New cards are marked "new".

## Notes on cards

Added 2026-11-10 at the traveler's request ("Skip vs maybe vs must does not help much"). Any card, swiped or not, can carry one note in the traveler's own words: in the place/area sheet (under the verdict bar), in the swipe deck (Note button or `N`), and in **My calls**, a tab listing every swiped card with its verdict and note editable inline. Board rows and duel sides show a one-line snippet. Notes autosave to `feedback/notes.jsonl` and the curator sees them in `./atr feedback`.

## Route map

Added 2026-11-12 at the traveler's request ("a map where I can see the route"). The **Route** tab (also linked from Home as "Route map") shows one map of the whole trip with every country leg in order (a chip row above the map gives each leg's dates and nights; tapping one zooms to it, and so does tapping near a country on the map).

- **On the map:** numbered pins for the stops in travel order joined by a solid line inside a country, dashed arcs for the flights between countries (with the boundary date), and dotted arrows to and from São Paulo leaving the bottom edge ("lands Sun 6 Dec", "~Tue 9 Feb · not booked"). Must cities not placed yet are dashed rings labelled "not placed", Maybe cities are small grey dots, and skipped or unswiped ones are hidden unless "Show skipped" is on. Nothing is joined that the traveler didn't put in order. Tapping a city opens a card with its verdict, its dates and nights when it is on the route, how many of its places are Must or Maybe, a link to its area page and Add/Remove.
- **The plan, next to the map (below it on a phone):** per country, the ordered stops with up/down/remove buttons and a nights stepper (or type the number), the dates each stop works out to, nights placed against the nights in the leg (flagged when over), and the country's Must and Maybe cities that are not placed yet, one tap to add. The map redraws as you edit.
- **Saving:** every change saves the whole list for that country to `feedback/route.jsonl` (latest line per country wins). The starting point is `route:` in `config/trip.yaml`; "Reset" goes back to it. The game never edits the config. Curators see the current route in `./atr feedback` and changed legs in `./atr feedback --new`.
- **Base map:** cached OpenStreetMap tiles stitched by the server (the same code as the area overview maps), with the route drawn on top in the browser. The browser loads no third-party script or tiles.
- It still is not a day-by-day schedule: it only orders cities and counts nights.

## Answer cards (questions about the trip)

Changed 2026-11-15: the site's Ask boxes are gone. The traveler asks Claude Code agents working in this repo on the laptop; each reusable answer is written to `answers/<asked>-<slug>.md` and published with `./atr answers publish` (skill: `.claude/skills/trip-answers/SKILL.md`).

- Place and area pages end with **Questions and answers**: one card per answer about that place or area (question, the short answer, the date; the full answer and sources fold out).
- **Places › Answers** (`#/answers`) lists every answer, newest first, with a country filter and a link to what each is about. Whole-trip and country answers live here. `#/answers/<id>` opens one card.
- **Today** shows the three newest answers as compact cards.
- **Book ahead** (top of Today, before and during the trip) lists what is still to book, by its book-by day: stays with no bed (status not Booked or On the day; a week before check-in, a month when a night falls on New Year's Eve or Lunar New Year), flights not bought (three weeks), and Must/Maybe cards that need a ticket (their `lead_days` before the first day in the city, or their `book_ahead.deadline`; a card not called yet shows only when it has a deadline). Rows due within a week show; the rest fold under "Later". A card's tick stores it in the `settings` doc `booked` (`places: [ids]`).
- Answers never edit place data; only the curator does. The 34 answers the old Ask boxes logged in `feedback/questions.jsonl` were migrated (`game/tools/migrate-questions.js`); that log stays as curator history and nothing on the site writes to it any more.

## Ending

When the traveler is happy with the ranking, Claude shows the final list and **asks before** writing it to the trip page's `places` collection (`title, city, kind See|Eat|Do|Shop|Stay, note, link, order, done=false`).
