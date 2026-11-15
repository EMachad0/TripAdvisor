# Status

## 2026-11-15: answer cards replace the Ask boxes
The traveler now asks Claude Code agents on the laptop; answers worth keeping become cards on the site.

- **Removed:** the Ask box on place and area pages, the floating Ask button, the Ask buttons in the deck and the sheet, the Today "Ask about the trip" box, the Questions stat, `POST /api/ask` and `/api/trip-ask`, `game/lib/ask.js` and `ATR_ASK`. `feedback/questions.jsonl` stays as curator history.
- **Answer cards:** `answers/*.md` in git, deployed like places. Place/area pages show "Questions and answers"; **Places › Answers** lists all of them with a country filter; Today shows the three newest. Times in a card get their UTC offset from the card's country (`data-tz`).
- **CLI:** `./atr answers` (list), `--check`, `--ids`, and `publish <file...> [--remove <file>] [--no-merge] [--dry-run]`.
- **Skill:** `.claude/skills/trip-answers/SKILL.md` tells agents when and how to write and publish a card.
- **Migrated:** 34 of the 36 logged questions (2 had no answer: the usage limit was hit).

## 2026-11-15: the trip page moved into the site
The traveler asked for the old trip page (a Claude artifact: Pre-trip, Itinerary, Calendar, Money, Bag) to live in the site, with a cleaner menu, and for the site to answer questions on the road ("when is my next flight", "what can only be done today", "where was that ramen shop").

- **Menu:** six sections instead of eight tabs: **Today · Trip · Places · Decide · Money · Prep**. A section with several pages shows them in a row under the bar: Trip = Itinerary, Calendar, Map (the old Route tab); Decide = Overview (the old Home), Areas, Swipe, Duels, Board, Holidays, My calls; Prep = To do, Bag. Old addresses still work (`#/home` opens the Decide overview).
- **Today** (`#/`): days to departure or "Day N of 74 · city"; where you are (the stay, address buttons, work night or vacation, the day's note); the next flight with a countdown; moves today; **Only today, or ending soon** (dated cards on that day that you can reach); **Next events you could go to**; Must cards still to do in the city; open tasks; and an **Ask about the trip** box. "Look at another day" (or `#/today/2027-01-30`) shows any day of the trip the same way.
- **Places** (`#/places`, `#/places/osaka`): search every card by name, city, kind, tag, text or your own note; filter by city, kind, and All / Must + Maybe / Not been / Been; tick a card once you have been; a pin opens it in Maps. It opens on the city you are in.
- **Itinerary, Calendar, Money, To do, Bag:** the old page's screens. New: stays link to their city's cards; the calendar colours by country, names the city, hatches stops that are not fixed and marks days with a dated card; a day opens with its plans, note and dated cards; country days in Money come from `config/trip.yaml`.
- **Reach:** an event counts when it is in a city you sleep in, or within 90 km of it (a day trip), on the days you are there. Skipped cards and dates longer than 14 days (a whole season) are left out.
- **Data:** `trip/*.json` (see [TRIP.md](TRIP.md)), written through `GET/POST /api/trip`. It was rebuilt from the traveler's screenshots of the old page and brought up to date with TRIP.md (the China order, the five flights bought on Nov 14, the 40 L bag). The old page's database could not be read from here, so three things were rewritten and say so in their text: the six "How to pay" notes, the two Uber plans (airport → Airbnb, Airbnb → Guarulhos), and the day notes.
- **Code:** `game/lib/trip.js` (shared maths), `game/lib/tripstore.js` (JSON store), `game/public/trip.js` and `trip.css` (views), `buildTripPrompt` in `game/lib/ask.js`. Trip questions are not logged to `feedback/questions.jsonl`.
- **Tests:** 236/236 (11 new in `game/test/trip.test.js`). The route config test no longer compares against a hard-coded route (it had been failing since the route changed on Nov 14).
- **Screenshots:** `node game/tools/shots.js --only today,today-osaka,today-chongqing,itinerary,calendar,calendar-day,find,find-ramen,money,todo,bag,edit-leg,plan` (real places, a temp copy of `trip/`).
- **Not done:** the site still runs only on this computer (`--host 0.0.0.0` lets a phone on the same Wi-Fi open it; nothing is hosted). No file attachments on legs (the old page stored tickets). The "Not been" filter and the Must list only know what was ticked by hand.

## 2026-11-14: Lunar New Year in the Holidays tab
The traveler asked for Chinese (Lunar) New Year to show up as a holiday ("it fits as a holiday"). Built by the coder subagent.

- **Game:** the Holidays tab has a third section, **🧧 What to do for Lunar New Year?**, fed by places tagged `lunar-new-year-option` (the three Hong Kong malls that only carry `lunar-new-year` stay out). It is a different kind of holiday from Christmas and New Year's Eve: the city is fixed and the options fall on different days, so they don't compete. There is no lock and no duel in this section. The header reads "Fri 5 Feb – Mon 8 Feb · Lunar New Year is Sat 6 Feb · you'll be in Hong Kong", then "These don't compete: each is on a different day, so you can do all 4", with a tally (Must / Maybe / Skip / not called yet). The cards come in day order with a red day badge (Fri 5 Feb fair, Sat 6 Feb parade, Sun 7 Feb fireworks, Mon 8 Feb raceday) and a "When" line from the page's `when.label`; each card has its own Skip / Maybe / Must, which is the same call as in the deck and My calls (written to `feedback/swipes.jsonl`). Several can be Must at once.
- **Dates:** a holiday can now be a list of full dates plus days before and after, not only a month-day. Lunar New Year's Day lives in one table, `LUNAR_NEW_YEAR` in `game/lib/board.js` (2027: Feb 6); the holiday covers the eve to day 3 (Feb 5–8). An option's day is the first day of its `when` dates inside that range, so the fair (Jan 31 – Feb 6) counts on the eve. No option is hidden or flagged for not being on Feb 6; a tagged page with no date in the range is still shown, last.
- **Elsewhere:** the Board's Holidays panel shows "N of 4 Must →" for Lunar New Year instead of a lock; the Home step still counts 2 locks (Christmas, NYE) and its text mentions Lunar New Year; the Holidays tab badge counts Lunar New Year until every option has a call; book-ahead deadlines for these options count back from the option's own day; `/api/local` ignores a lock for it. `/api/state` places gained `days` and `whenLabel`.
- **Two display bugs from `places/_friction.md`, both fixed in `platform/`:**
  - The weather card, the hours box and the area "Winter reality" note said "Dec–Jan" on every page. They now name the months the traveler is in that country, from `config/trip.yaml`: Hong Kong "Feb", Japan "Jan–Feb", Thailand, Singapore and Korea "Jan", China "Dec–Jan" (new `tripMonths`). The built site (`./atr build`) picks it up on the next build.
  - The map on `siam-paragon-skywalk` never drew because the crop offset was rounded up and ran one pixel past the stitched tiles; the error was swallowed. The offset is now floored (`tileWindow` in `platform/lib/staticmap.js`), the map for that page renders, and a skipped map now prints why.
- **Tests:** 225/225 (5 new: 3 game for the date table, range, day order, book-ahead and no lock; 2 platform for the map crop and the month labels; the server test also checks the four fixture options). 4 new fixture places under `game/test/fixtures/places/hong-kong/`.
- **Screenshots:** `node game/tools/shots.js --only holidays` (fixtures) and `--real --only holidays` (real pages), phone and desktop; also clicked through in a browser against the fixtures (two Musts and a Maybe at once, tally and Board panel update, no console errors).
- **Restart needed:** yes. The running game (`./atr game`, port 4400) was started before this change and must be restarted to serve Lunar New Year and the fixed labels and map. It was left running.
- **Not done:** the Lunar New Year cards show no note snippet (same as the other holiday cards); the hero text names Hong Kong, so a second many-day holiday in another city would need that sentence reworded; the "Cold" fact label on the cards reads oddly for 15–19 °C (it was already so for other mild places).

## 2026-11-12: route map
The traveler asked for "a map where I can see the route". Built by the coder subagent.

- **Game:** a new **Route** tab (and a "Route map" link on Home). One map of East and Southeast Asia: the five legs in order with dates and nights, numbered stops joined in travel order (solid inside a country, dashed arcs for flights between countries, dotted arrows in from and home to São Paulo off the bottom edge). Must cities not placed yet are dashed "not placed" rings, Maybe cities faint dots, skipped ones hidden unless "Show skipped". Tap a leg to zoom to it; tap a city for its verdict, dates and nights, Must/Maybe place counts, its area page and Add/Remove. Next to the map (below it on a phone) a plan per country: reorder, remove, add from the Must/Maybe list, nights stepper, the dates each stop works out to and nights placed vs available (flagged when over).
- **Format:** new append-only `feedback/route.jsonl` (`{v:1, ts, session?, country, stops:[{area, nights?, name?, lat?, lng?}]}`; the whole list per country, latest line wins). Schema in `platform/schema/feedback-route.schema.json`; see [FEEDBACK-FORMAT.md](FEEDBACK-FORMAT.md). Seed: optional `route:` per country in `config/trip.yaml` (china [shanghai], thailand [bangkok], korea [seoul], japan [tokyo, kyoto, osaka], hong-kong [Hong Kong with coordinates, no area file]). The config loader validates it; bad stops are dropped with a warning, never thrown, and a missing `route:` is fine.
- **Curator:** `./atr feedback` prints the current route per leg ("## Route", with nights placed and whether it comes from the config or the game); `--new` lists legs re-planned since the cursor.
- **Base map:** the server stitches cached OSM tiles with `platform/lib/staticmap.js` (one overview image plus one sharper image per country, about 200 tiles fetched once, then cached in `.cache/`); the browser draws the route as SVG on top and loads nothing from third parties. "© OpenStreetMap contributors" is on the map.
- **Phone tab bar:** with 8 tabs, "Holidays" and "My calls" were cut off at 390 px. Phones now show 7 tabs (My calls opens from Home, and Home stays lit while it is open); all labels fit at 360 px.
- **Tests:** 220/220 (11 new in `game/test/route.test.js`: projection and image placement, view fitting, pin spreading, label layout, leg dates, config validation, route persistence, `./atr feedback` output, `/api/route` GET and POST).
- **Screenshots:** `node game/tools/shots.js --only route,route-full,route-china,route-japan,route-pop` (real areas, a temp copy of the feedback; phone and desktop, light and dark; `route-china` adds four China stops with nights).
- **Not done:** no dragging to reorder (up/down buttons only), no pinch-zoom or pan on the map (tap a leg instead), and stops have no day-level dates beyond what nights add up to. Cities with no area file can't be added from the game (only the config can add them, like Hong Kong).

## 2026-11-10: notes on cards
The traveler asked for notes on cards, including ones already swiped. Built by the coder subagent.

- **Format:** new append-only `feedback/notes.jsonl` (`{v:1, ts, session?, round, id, text, country?}`; latest line per card wins; `""` clears). Schema in `platform/schema/feedback-notes.schema.json`; see [FEEDBACK-FORMAT.md](FEEDBACK-FORMAT.md).
- **Curator:** `./atr feedback` lists the current notes with card name and verdict; `--new` lists notes changed since the cursor; `--place <id>` shows the note; `./atr next` counts new notes as feedback to process.
- **Game:** `POST /api/note`; `note` on every place/area in `/api/state`. One shared note editor (autosaves on blur and after 1.2 s without typing, shows "Saved", errors show in a toast) in the sheet under the verdict bar, in the deck (Note button or `N`, as a panel over the bottom of the card; cards with a note show a "Note" chip), and in a new **My calls** tab (every swiped card, plus any card with a note; filter by round, verdict, country and "with notes"; change the call or note inline). Board rows and duel sides show a one-line snippet. Ask gets the traveler's note and current call, labelled as theirs.
- **Tests:** 176/176 pass (7 new: 4 platform, 3 game). No pre-existing failures this time; one round-7 assertion was updated for the new `counts.notes` field.
- **Design pass (after review):** the deck note panel takes the exact place of the card's text area (sized to the card body, same radius); the Note button is a quiet text action with a dot when the card has a note; in My calls an empty note is a small "+ Add a note" button that opens the editor and folds back if left empty, verdicts stay on the name line (thumbnails hide below 420 px), and places are grouped under small country subheaders.
- **Fixed a pre-existing layout bug:** on a 360×740 phone the row under Skip/Maybe/Must (Undo, Details, Ask, now Note) sat under the tab bar. Short phones now get a smaller deck, so the whole row is visible without scrolling.
- **Screenshots:** `node game/tools/shots.js` now seeds notes and adds `calls`, `deck-note`, `deck-noted` (panel closed on a card with a note), `sheet-note`, `sheet-note-edit` and `duels-note` scenes, plus `--device phone360`.
- **Restart needed:** the running game (`./atr game`, port 4400) must be restarted to serve `/api/note` and the new client.
- **Not done:** notes are not shown on the Holidays option cards or in the duel live ranking; the server still serves the old client until restarted.


## 2026-11-10: curator reviewed and improved (rounds 5–10)
A review of the curator platform against real use: one baseline headless run, three fresh curator subagents (stay cards, area pages, feedback + backfill), three autopilot runs and five independent reviews. The coder fixed what they exposed in six rounds. Details per round are in [DECISIONS.md](DECISIONS.md) ("Coder notes, round 5" to "round 10"); curator friction is in `places/_friction.md`.

### What changed
- **The curator knows what the traveler asked for.** [TASTE.md](TASTE.md) is now machine-readable in `config/taste.yaml` (interests 0–3, tag notes, must-do list, stay wishes, goal: discovery). `./atr taste` shows it with must-do status; `./atr gaps` uses it (interest-weighted balance, must-do coverage, share of `hidden` places, stays per city, area cards wanted).
- **The curator picks its own work.** `./atr next` turns gaps + taste + feedback + review findings into ranked one-line tasks. `./atr run --auto N` runs the top N headless, one session each.
- **Nobody grades their own page.** `./atr run` now sends every page it changed through three gates: `validate` (structure), `./atr links` (every URL opens) and `./atr review` (a fresh reviewer session re-opens the sources, fact-checks prices, hours, booking, dates and address, and looks at the screenshots; see [REVIEWER-GUIDE.md](REVIEWER-GUIDE.md)). Findings go to `reviews/<id>.yaml` and back to the curator once. Pages with a passing, current review show "Fact-checked <date>".
- **New content types.** Stay cards (category `stay`, a "The stay" panel with beds per night, dated rating, what makes it social); full **area pages** with a country overview map; dated events (`when`, with "31 Dec only", season and best-on wording, and a "Not on your route" notice when the dates miss the trip); `fame` (iconic / popular / hidden); `must_do` claims with "★ On your list"; a `faq` block for answering the traveler's questions from the game.
- **Feedback loop closed.** `./atr feedback --new` shows questions and verdicts since the last pass (cursor in `places/_feedback-seen.json`); the curator answers on the page and marks them seen.
- **Research helpers.** `./atr geo` (WGS84 candidates from OpenStreetMap/Wikidata), `./atr render` (reads JavaScript pages WebFetch can't, e.g. hostel prices after a date search), multi-file `media fetch` with visible retries, `estimate` and `approximate` flags.
- **Runner fixes from real runs.** It is judged only on files its own session wrote (other agents working in the repo no longer cause false errors, false violations or wrong attribution), and it reports the true cost (the CLI's cost is cumulative across resumed rounds).

### Evidence
- Baseline run before the changes: 1 area + 1 place, clean in 1 round, about 6 min, $1.47.
- Autopilot after the gates: "fix review findings on liziba-station" passed re-review in 2.7 min for $1.10. The "infinity staircase" must-do found that the viral Chongqing bookstore closed in 2024 and wrote up the open Dujiangyan branch; the reviewer then caught that the chain is closing branches and the hours rested on undated guides.
- Reviews so far: liziba-station (pass after fixes), dujiangyan-zhongshuge-bookstore, nine-hours-shinjuku-north, beijing (area). Each found facts no listed source supports; the capsule-hotel review found a rule the official site contradicts. About $0.60–0.70 and 1.5–3 min per page.
- A third autopilot run (fix the capsule hotel's review findings) confirmed the runner fixes: 274 validation errors in another curator's half-written files were not blamed on it, and the cost was right ($2.96). It still ended "not clean" because the fresh re-review found two new issues, which led to round 10: a re-review now gets the earlier findings plus a diff and only closes the loop.
- Tests: 169 pass (147 platform, 22 game). `./atr validate --all` is clean for every finished page; the only errors are in scaffolds another curator is still filling in.

### How to run
```bash
./atr next                       # what to do now (ranked one-line tasks)
./atr taste                      # what the traveler said + must-do status
./atr gaps                       # everything that is missing or weak
./atr run --auto 3               # headless: top 3 tasks through validate → links → review
./atr run "add 2 stay cards for Seoul"
./atr review --changed --dry-run # pages never reviewed or changed since (about $0.65 each when run)
./atr links --all
./atr feedback --new             # the traveler's new questions and verdicts from the game
./atr shot beijing               # an area page; ./atr shot areas for the overview map
```

### Known gaps
- **Coverage is still thin**: 18 attractions for 55 trip days, 4 stays, 2 of 12 wanted area cards, 3 of 16 must-do items covered (at the time of writing; another curator is adding holiday pages). The platform is ready for volume; the research is not done. `./atr run --auto N` is the way to do it, at roughly $2–4 and 5–15 minutes per task including review.
- **Most pages are not reviewed yet** (`./atr review --changed --dry-run` lists them). Three reviewed pages still have open findings in `reviews/`.
- **Hostel prices are hard to verify.** They only appear after a date search; `./atr render` and `beds[].url` help, but a reviewer may still fail to reproduce a promo price.
- **Some Chinese hosts time out from this machine** in `./atr links` (gov.cn, scol.com.cn) although a web fetch opens them. They show as warnings, not errors.
- **A place and an area with the same id share one review file** (the later review overwrites the earlier one).
- **The focused re-review (round 10) has only run against a fake `claude` in tests**, not for real yet.
- **Half-written pages show up in the built index** with broken images while a curator is still filling the scaffold.
- `./atr render` and `./atr geo` were each tried once for real; no curator has used them in a full run yet.
- Carried over: CJK/Thai text uses system fonts; map deep links untested on a real phone; `cheap_meal_brl` values are estimates; Commons rarely has night or venue photos.

## 2026-11-10: the game is built
Built by the coder subagent in `game/` (server + client, no build step, no new dependencies). It imports the platform API read-only and never touches `places/` or `areas/`.

### How to run
```bash
./atr game            # or: npm run game  → prints http://localhost:4400/ (falls back to a free port)
./atr game --open     # also opens the browser
./atr game --root game/test/fixtures --feedback /tmp/atr-fb   # play with the game's test data
npm test              # platform + game tests
node game/tools/shots.js [--real]   # screenshots of every mode → build/game-shots/ (fixtures) or build/game-shots/real/
```

### What exists
- **Home**: funnel progress per step, Must/Maybe/duel/question counts, "N new cards from the curator".
- **Areas round** and **Swipe round**: card stack using the platform's `renderAreaCard` / `renderPlaceCard`. Drag (mouse or touch) with Must/Maybe/Skip stamps, buttons, keyboard (← Skip, ↑ Maybe, → Must, Z undo, Space details), per-country filter, progress bar, "deck cleared" state. Tap a card for its full place page. Friendly empty state when there are no area cards. Places in cities of skipped areas go to the end of the deck. New curator cards come first, marked "New".
- **Duels**: two cards, VS, click/tap or ←/→ (↓ = can't decide). Elo (K 32; seeds Must 1550, Maybe 1450). Smart pairing: mostly same country (85%), uncertain items and close ratings first, no repeats or back-to-back items. Live top-6 for the country, "ranking confidence" meter.
- **Board**: ranked list per country, dashed cutoff line at its days (one pick per day). +/− days per country is a local what-if (stored in `feedback/game-state.json`, `config/trip.yaml` untouched); rows and the line animate. Balance meter (category mix, nudges for > 40% share or a missing interest), budget check per country with `countsAgainstBudget` (food not counted), book-ahead list sorted by deadline (first day in that country − lead days, or the holiday date for locked picks), holiday locks. No day-by-day schedule.
- **Holidays**: "Where for Christmas?" / "Where for New Year's Eve?" from places tagged `christmas` / `nye`: option cards with cost, booking level, cold (weather block), crowds, winter note, a warning when you're in another country that night, 🛸 badge for `drone-show` (also on swipe cards and the board), mini-duel among the options, lock a pick (confetti). Locked picks show on the Board and sit at the top of their country.
- **Place sheet**: the platform's `renderPlacePage` in a slide-up sheet, with Must/Maybe/Skip in the bar and an **Ask box** (+ floating Ask button) on every page. Ask runs `claude -p` (tools Read, Glob, Grep, WebSearch, WebFetch only; Edit/Write/Bash disallowed; `--effort medium`; 4 min timeout; max 2 at once), streams the answer, shows a TL;DR, and appends every Q&A (summary only) to `feedback/questions.jsonl`. Errors and timeouts show a friendly message and are logged as "(no answer: …)".
- **Live data**: every request re-reads places/areas, the client refreshes every 30 s and on focus, and toasts new cards.
- Light/dark (shares the `atr-theme` toggle with the place pages), phone layout with a bottom tab bar, reduced-motion respected.
- Tests: `game/test/game.test.js` (Elo, pairing, cutoff/balance/budget/book-ahead, holiday dates, feedback writing, state, Ask parsing/prompt, server API with a stubbed `claude`). Uses `game/test/fixtures` (17 fixture places, 3 areas, all `fixture: true`).
- Real Ask smoke test done on `yu-garden` (≈ 19 s, web search used, Q&A logged).

### Gaps
- Undo after a swipe brings the card back locally; the log is append-only, so the old verdict stays in the file until the card is swiped again.
- "Can't decide" in duels is not logged.
- Full Ask answers are not stored (only the summary in `questions.jsonl`, per the format).
- The holiday "crowds" fact is a keyword pull from `hours.winter` / `best_time` / `lead_time`; a curator field for it would be more reliable.
- No final "write to the trip page" step in the app (by design: Claude asks the traveler first).
- At the time of the game build, 3 platform tests were failing because of parallel platform work (new fixture `bund-rooftop-hostel` without a credits entry; runner tool list now includes Agent/ToolSearch). The game tests all pass.

## 2026-11-10: curator platform built
Built by a coder subagent. Example content was written by two separate curator subagents working only from [CURATOR-GUIDE.md](CURATOR-GUIDE.md). There were 4 rounds of friction fixes. Decisions are in [DECISIONS.md](DECISIONS.md).

### What exists
- **`./atr` CLI** (`platform/`, Node 24, ESM). Commands: `new`, `validate` (fix-it messages with YAML line numbers), `blocks`, `fx` (ECB rate to R$), `media search|preview|fetch|add|list|remove|prune` (Wikimedia Commons, free licenses only, credits captured, WebP 640/1280/2048), `build`, `preview`, `shot` (desktop/phone × light/dark, plus 2× phone top shots, section slices and single-block shots), `gaps`, `feedback`, `run` (headless `claude -p` curator loop: validate → fix), `qr`, `schema --export`.
- **Content format**: `places/<country>/<city>/<id>/place.yaml` + `media/`, and `areas/<country>/<id>.yaml`. Schema with fix-it errors, exported as JSON Schema to `platform/schema/` for the game.
- **Renderer**: 14 blocks (hero, quick facts, highlights, prose, gallery, quote, book-ahead timeline, cost breakdown, menu, map, tips, weather, pairs-well, sources). It also renders a swipe card, area card, index and areas page. Fonts are bundled, maps are static OSM images made at build time, and pages work in light/dark down to 360 px. All renderers are pure functions in `platform/lib/index.js`, so the game can reuse them.
- **Feedback format** for the game: [FEEDBACK-FORMAT.md](FEEDBACK-FORMAT.md) (append-only JSONL: swipes, duels, questions). The reader and taste summary are behind `./atr feedback`.
- **Docs**: [CURATOR-GUIDE.md](CURATOR-GUIDE.md) (the curator reads this first), [PLATFORM.md](PLATFORM.md) (developer notes and game API), `config/trip.yaml` (trip facts for gaps and budgets; `cheap_meal_brl` is a rough estimate by the coder).
- **Example places** (real research, medium confidence, made by curators):
  - `yu-garden`: Shanghai, culture. Booking recommended: real-name passport ticket, walk-in possible.
  - `shanghai-museum-ancient-americas`: Shanghai, culture, must book. Note: the show is about the Americas, not China; the People's Square building is ticket-only until Nov 2027.
  - `euljiro-nogari-alley`: Seoul, nightlife. No free night photo exists, so the hero photo caption says so.
  - `gwangjang-market`: Seoul, food. Covers the 2025–26 overcharging issue.

### How to run
```bash
npm install                 # once
npm test                    # 46+ tests (offline)
./atr validate --all
./atr build && ./atr preview          # http://localhost:<port>
./atr shot yu-garden                  # PNGs in build/shots/
./atr gaps
./atr run "add 5 nightlife places in Seoul" --max-rounds 3   # headless curator
```

### Known gaps
- CJK/Thai text uses system fonts (only Latin fonts are bundled). The Amap/Baidu/Naver deep links haven't been tested on a real phone.
- Commons often has no photo of bars or of places at night, so nightlife heroes may be area photos or the photo-free hero.
- Trip.com/Klook pages block automated fetches, so booking links found there are recorded as unverified in `confidence_note`.
- `cheap_meal_brl` per country in `config/trip.yaml` is an estimate.

## 2026-11-09
- Plan approved by the traveler: funnel game (areas → swipes → duels → board), in-app Ask via local `claude -p`, curator/coder split.
- T3 project "Asia Trip Ranker" created on this folder; docs written.

## Not started
- The real places research at scale (use `./atr run` or curator subagents).

## Questions for the traveler (answered 2026-11-10, see TASTE.md and config/taste.yaml)
1. Places already on the must-do list.
2. Interest scores 0–3: history/temples, museums, food/markets, bars, clubs/parties, nature/hikes, views/architecture, odd local experiences, shopping/flea markets, shows/sports, day trips.
3. Nightlife style: dive bars/hostel crawls, craft beer, cocktails, big clubs, live music, LGBTQ+.
4. OK with cold outdoor plans (Harbin, snow in Japan)?
5. China city leanings, or start with region cards?
6. Splurges worth going over the daily budget?
7. Anything to avoid / already seen?
