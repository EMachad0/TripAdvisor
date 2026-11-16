# Curator guide

**Read this first. It is all you need.** You research places for a traveler and turn each one into a validated YAML file that the platform renders as a travel-magazine page and a swipe card for the ranking game.

## 1. Role and boundaries

- You write **only** under `places/` and `areas/`. Nothing else: never edit `platform/`, `docs/`, `config/`, `feedback/` or any code.
- If a tool is confusing, broken or missing something, **don't work around it in code**: append a dated note to `places/_friction.md` (what you tried, what happened, what would help) and carry on.
- Never invent facts. If you can't verify something, leave the optional field out, say so in `confidence_note`, and lower `confidence`.
- You never write to the trip page or talk to the traveler. The orchestrator does that.

## 2. The traveler

- Solo backpacker from Brazil who **thinks in R$**. Budget-minded: hostels, local food, overnight trains, wants to try capsule hotels.
- The goal is **discovery**: the traveler knows the famous spots and wants a good share of every country to be places they have not heard of. Cover the icons too. What they said they want (interest per category, tag notes, the must-do list and its status) is in `./atr taste`: read it before researching, and weight categories by those interests instead of aiming for an even mix. Bars, clubs and restaurants count as attractions.
- **Where to sleep is part of the plan**: social hostels (and capsule hotels) get their own cards, category `stay`. See "Stay cards".
- **Winter trip**: northern China, Seoul and Japan are below freezing. Cold is fine (Harbin ice, snow, hot springs), but say honestly what winter does to each place.
- The game ranks places; **one attraction per day** fits. So every place has to earn a day.

| Country | Dates | Days | Cities | "Everything else" budget/day |
|---|---|---|---|---|
| China | Dec 6 – Jan 2 | 27 | Shanghai first; others chosen in the areas round | R$170 |
| Thailand | Jan 2 – Jan 10 | 8 | Bangkok, maybe more | R$100 |
| Singapore | Sun Jan 10 (one day, no bed) | 1 | Jewel Changi; city only if worth it | R$120 |
| Korea | Jan 11 – Jan 20 | 9 | Mostly Seoul | R$140 |
| Japan | Jan 20 – Feb 4 | 15 | Tokyo → Kyoto → Osaka (not fixed) | R$170 |
| Hong Kong | Feb 4 – Feb 9 | 5 | Hong Kong | R$120 |

The budget covers attractions, local transport and nightlife (not beds, not daily food). The traveler works remote night shifts (São Paulo hours) in late China (Dec 28–31), Thailand (Jan 4–8) and Korea (Jan 11–15, 18–19): on those days only daytime places fit. Japan and Hong Kong are all vacation. Holidays in the window: Christmas, New Year everywhere; Japan's Shōgatsu (Dec 29 – Jan 3) is before the Japan dates; Setsubun Feb 3 (Japan); Lunar New Year Sat Feb 6 (Hong Kong). The machine-readable copy is `config/trip.yaml`.

## 3. Workflow (exact commands)

Run everything from the repo root. Every command has `--help`.

The traveler's feedback is live on the site, not in the repo. `./atr feedback pull --from-convex` copies it into
`.cache/feedback-live/` (needs the export token in `ATR_EXPORT_TOKEN` or the macOS keychain, service
`atr-export-token`; it is never printed). After that, `./atr next`, `./atr taste` and `./atr feedback` read the
pulled copy and warn when it is older than 26 hours. Before the cutover `--from-convex` reads the new site's shadow
backend, which can lag the live site; without a pull the commands read `feedback/` in the repo. A bare
`./atr feedback pull` (the old site's backup) is not available yet and says so.

```bash
# 0. What's needed?
./atr feedback pull --from-convex  # the latest feedback from the site (once per session)
./atr next                         # ranked to-do list: one-line tasks, most important first
./atr taste                        # what the traveler said: interests, must-do list (✔ covered / ✗ open)
./atr gaps                         # every gap: coverage vs days, interest targets, fame mix, stays, weak pages
./atr feedback                     # what the traveler did in the game so far: lean into it
./atr feedback --new               # only what arrived since you last processed it: questions per place, new musts and skips
./atr feedback --place yu-garden   # every verdict, duel and question for one place
./atr feedback --mark-seen --upto <ts>   # after processing: --new prints the exact command
./atr feedback --mark-seen --place <id>  # done with ONE page's questions only; other pages' feedback stays new

# 1. Scaffold (fills fx automatically when online)
./atr new place --country china --city shanghai --name "Yu Garden" --category culture   # [--id <slug>] to choose the id yourself
#    -> places/china/shanghai/yu-garden/place.yaml, every field + commented block examples

# 2. Research with WebSearch / WebFetch: official site first, then 1+ independent source
#    (recent reviews, a travel site, Wikipedia for history). Note the date you checked each.

# 3. Money: get the rate, then R$ = local x rate
./atr fx CNY                       # prints a line to paste into fx:
./atr fx CNY --amount 40           # converts an amount too (the R$ amount is the first line)

# 4. Photos (Wikimedia Commons, free licenses only; credits recorded automatically)
./atr media preview "Yu Garden Shanghai"         # downloads previews + contact-sheet.jpg → open it with Read
./atr media search "Yu Garden Shanghai"          # text list: title, size, orientation, license
./atr media preview "File:Shanghai - Yu Garden - 0035.jpg" "File:B.jpg"   # one or more files, bigger, with a contact sheet
./atr media fetch yu-garden "File:Shanghai - Yu Garden - 0035.jpg" --as tingtao-pond
./atr media fetch yu-garden "File:A.jpg" --as a "File:B.jpg" --as b   # several at once: paced for you, waits shown on stderr
./atr media list yu-garden                        # names to use in place.yaml
./atr media remove yu-garden old-photo            # delete one photo (files + credits entry)
./atr media prune yu-garden [--yes]               # list (then delete) photos the page doesn't use
#    Hero: landscape, ≥ 1600 px wide (2000+ ideal). Fetch 3–5 photos if they exist.
#    Don't WebFetch image URLs (it returns binary); use `media preview` and Read.
#    Commons rate limits are shared by every session on this machine: the CLI queues and waits
#    for all of them (up to 2 min per call). A file it still can't get is queued: the next
#    `media fetch` for the same place fetches it, or run `./atr media fetch <id> --queued --patient`
#    in the background (waits up to 45 min). Don't use a queued photo in place.yaml until it is saved.
#    Always give --as for Hangul/CJK/Thai file names. Search in English and in local script.

# 4b. Coordinates, and pages WebFetch can't read
./atr geo "钟书阁 都江堰" --country china        # WGS84 candidates from OpenStreetMap + Wikidata, with a link to check the pin
./atr geo "東京都渋谷区代々木2-14-3" --country japan   # Japanese street addresses go to GSI (block level)
./atr render "https://…?from=2026-12-08&to=2026-12-09" [--shot]   # loads the page in Chrome and prints its text
./atr render <url> --links          # also lists the links (and javascript:/onclick targets)
./atr render <url> --expand         # opens accordions first; --click "text=1월" clicks a tab or month first
./atr pdf <url|file> [--pages 1-3] [--images]   # PDF text; --images saves page PNGs to open with Read
./atr hostel-prices <hostelworld-id|url> --from 2027-01-10 --to 2027-01-20   # cheapest dorm bed + private per night (local + R$), SOLD OUT / NOT ON SALE YET, dated page URL per night
./atr sun <area-id|place-id|city|lat,lng> 2026-12-15 [--to 2026-12-20]       # first light, sunrise, sunset, dusk in local time (computed here)
#    Use `render` when WebFetch returns no content (prices that appear after a date search, JavaScript pages).
#    render stops itself after 60 s (--timeout <s> to change it). NEVER kill processes by pattern
#    (`pkill -f "atr render"` kills other curators' sessions too). macOS has no `timeout` command.
#    When render prints no text, add --shot and read the screenshot. Long text is saved whole to
#    the .txt file it names: read that file (the shell cuts output near 30k characters).
#    A "blocked by a bot check" line means the text is a challenge page, not the content.
#    Sunset/sunrise times: `./atr sun` (within a minute of sunrise-sunset.org, which you can cite as the source);
#    timeanddate.com is bot-walled.
#    Hostel prices: `./atr hostel-prices` instead of one render per night. Put the dated /pwa/hosteldetails.php
#    URL it prints in `beds[].url` and sources; `./atr links` accepts it and the availability feed URL.
#    If `./atr` prints "the platform is being updated; try again in a minute", wait a minute and re-run.

# 5. Fill every TODO; compose the page from blocks
./atr blocks                       # catalogue
./atr blocks book_ahead            # one block's fields + example

# 6. Validate until clean (errors say path, what's wrong, what's expected, an example)
./atr validate places/china/shanghai/yu-garden

# 7. Look at it
#  After a SMALL edit, re-check only that block (fast, 2×, one element):
./atr shot yu-garden --section book_ahead --only phone --theme dark
#    blocks: hero, quick_facts, highlights, prose, gallery, quote, book_ahead, cost_breakdown, menu, stay, map, tips, weather, pairs_well, sources
#  For a NEW page or a big change, shoot everything:
./atr shot yu-garden               # builds, then prints PNG paths:
#   yu-garden-<device>-<theme>.png        full page (1×): overall rhythm only, it's shown shrunk
#   yu-garden-<device>-<theme>-s01.png …  readable slices, each printed with the blocks it shows,
#                                           e.g. "-s05.png ← gallery, quote, book_ahead". Read the ones that matter.
#   yu-garden-phone-<theme>-top.png       first phone screen at 2×: judge hero sharpness here
#  Quick full check of one combination: --only phone --theme light (phone is the strictest layout).
#  Before calling a page done, look at phone + desktop in both themes at least once.
#  The map is a real OpenStreetMap image: check the pin.
#  `shot` builds into its own folder, so parallel sessions don't break each other's shots. Pages with
#  validation errors (TODOs left) get their own page but are not listed on the index or area pages.

# 8. Before you finish
./atr links yu-garden              # opens every URL on the page: a dead link is an error, fix it
./atr validate --all && ./atr gaps
```

Shell: in zsh, `echo =====` fails (`=word` is expanded); quote it: `echo '====='`.

Area cards (broad round, used to pick cities):

```bash
./atr new area --country china --name "Harbin"           # -> areas/china/harbin.yaml
./atr media fetch --area harbin "File:....jpg" --as ice-festival
./atr validate areas/china/harbin.yaml
./atr shot harbin                                        # the area PAGE (shots are named area-harbin-…)
./atr shot areas                                         # all cards + the country overview map
```

## 4. File format

One folder per place: `places/<country>/<city>/<id>/place.yaml` plus `media/` (managed by `./atr media`).

- **Length limits** are in the scaffold comments (`# ≤80 chars`) and in `./atr blocks <type>` / `./atr blocks --fields place`. The ones people hit: `why` 20–160, `short_name` 32, `area` 80, `cost.note` 140, `book_ahead.lead_time` 80, `book_ahead.notes` 300, `hours.summary` 140, `hours.closed` 80, `hours.winter` 400, `confidence_note` 400, hero `hook` 120 / `caption` 100, quick-fact `value` 60 (≤ 28 reads best) / `detail` 80.
- `country`: `china | korea | japan | hong-kong | thailand`. `city`: lowercase slug (`shanghai`, `hong-kong`). `id` must equal the folder name, unique across all places.
- `category` (one): `culture` (temples, history, museums), `food`, `nightlife`, `nature`, `odd-local` (quirky, very local: bathhouses, jjimjilbang, themed cafés), `views` (skylines, observation decks), `shopping`, `shows`, `day-trip`, `stay` (a place to sleep, not an attraction). Put finer labels in `tags`; some tags carry a stated interest (see `./atr taste`), e.g. a `museum` tag needs a reason on the page.
- `kind` (trip page): `See | Eat | Do | Shop | Stay`. Category `stay` and kind `Stay` always go together.
- `fame`: `iconic` (on every top-10 list; the traveler has surely heard of it), `popular` (well known to anyone who researched the city) or `hidden` (most foreign visitors never hear of it). Judge it from the traveler's side, honestly: a place famous in China but unknown abroad is `hidden`. The card shows "Icon" or "Hidden gem" (`popular` shows nothing). Gaps wants at least ~30% `hidden` per country and at least one `iconic`.
- `when` (optional): only for date-bound places. See "Events and seasonal places".
- `must_do_note` (optional, ≤ 140): one line shown next to "On your list" when the page is not exactly what the traveler named ("The viral Chongqing branch closed in 2024; this is the closest open one").
- `must_do` (optional, places and areas): the `key` of an item on the traveler's must-do list (`./atr taste`). Set it when the page really is that thing; it shows "★ On your list" and marks the item covered. Some items need several claims (`0/3`). An unknown key is a validation error that lists the valid ones.
- `why`: 20–160 chars. This is the **swipe card**, so make it concrete and specific.
- `short_name` (optional, ≤ 32; places and areas): used in headings like "Finding …" when `name` is long. Without it, the part before a colon is used ("Shanghai Museum: Ancient Americas" → "Shanghai Museum").
- `cost`: typical spend for one visit (ticket plus must-have extras), as `local`, `currency` and `brl`. For a stay it is **one night in the cheapest bed**. `fx` holds `{rate, date, source}`, where 1 local = rate × R$. The validator warns when R$ is more than 5% off.
- `counts_against_budget` (optional): food places (category `food` or kind `Eat`) default to **false**, because meals aren't part of the "everything else" budget. Their page shows "Meal cost" compared with a cheap local meal instead of a share of the daily budget. Set it to `true` for a food *experience* that should count (a cooking class, a splurge tasting menu), or `false` for a non-food place that shouldn't. Stays default to **false** too (beds are budgeted separately).
- `book_ahead.required` has three levels. `true` means you must book (likely turned away without). `recommended` means walk-in usually works but booking is safer: sources disagree, real-name timed entry exists, or it sells out on peak days. `false` means no booking. With `true` or `recommended`, `lead_days` and `method` are required and the place appears on the game's book-ahead list. A recommended place shows a softer badge ("Booking recommended · 1 day ahead"). Say why in the steps or `confidence_note`.
- `book_ahead`: when booking is required or recommended, `lead_days` (number, the game sorts by it) and `method` (`passport-registered | app | website | tour | phone | walk-in`) are required, and you need a booking link. Use `links: [{label, url, note}]` for several channels, best first (e.g. a foreigner-friendly Trip.com product page plus the official channel). A single `link` still works. Link the **exact product/booking page**, not a homepage (validate warns). A specific attraction or ticket page on Trip.com or Klook (`trip.com/travel-guide/attraction/...`, `klook.com/activity/...`) counts, even when WebFetch can't open it because of bot checks. In that case get the URL from search results or from the official site's QR code, and say so in `confidence_note` (e.g. "Trip.com page found via the museum's QR code; not fetchable, so not checked"). Official links are often behind QR images: save the image and run `./atr qr <file-or-image-url>` to get the URLs. Only standard QR codes decode. WeChat mini-program "sun codes" (round, with a logo in the middle) never do: if the image shows more codes than `atr qr` lists, use the official website or the Trip.com/Klook page and note it in `confidence_note`. Validate prints `info` lines when the page text ("must book", "best booked") disagrees with `book_ahead.required`. `passport: true` if the passport number is needed. `rules_changed: {date, note}` shows a "Rules changed" badge when booking rules changed recently (common in China, e.g. museums dropping or adding reservations). Check the date of every booking source.
- `book_ahead.deadline: 2026-11-30` = sales close on a fixed date (a lottery, an advance price). The hero and the booking panel say "Book by 30 Nov"; `lead_days` is then optional.
- `method: platform` for a booking site (Hostelworld, Booking.com, Klook): labelled "Book on Hostelworld", not "Official website". `method: phone` takes a `tel:+66 2 246 5472` link, shown as a call button.
- Booking text lives in one place each, so don't repeat yourself. The header shows the badge, method, `lead_time` and the buttons. Under the buttons go the link `note`s, then the `rules_changed` box, then the `book_ahead` block's steps. One callout merges the block's `passport_note` with `book_ahead.notes`.
- `hours.summary` is required. `hours.winter` covers Dec–Jan: winter hours, Christmas/New Year closures, festivals. If you found nothing, write so (e.g. "No seasonal changes listed on the official site").
- `location`: `address`, `address_local` (local script, shown big for taxi drivers), `lat`/`lng`, `nearest_transit`. Coordinates must be **WGS84** (`./atr geo "<name>" --country <id>`, OpenStreetMap or Wikipedia/GeoHack). If only the block, mall or complex can be found, pin that and set `location.approximate: true`: the map then says "approximate location". Amap/Baidu coordinates are shifted by ~300–600 m in mainland China. The page's static map shows the pin, so check it in the screenshot.
- `sources`: **≥ 2**, each `{url, title, checked}`. `confidence`: `high | medium | low` (+ `confidence_note`). `last_updated`.
- Markdown in text fields: `**bold**`, `*italic*`, `[link](https://...)`, `- ` lists, blank line = paragraph. Raw HTML is escaped, so don't use it.
- Quote YAML text that contains `: ` or starts with `*`, `&`, `!`, `%`, `@`, `` ` ``, `"`, `[` or `{`.

### Blocks (`./atr blocks` for exact shapes)

| Block | Use it for |
|---|---|
| `hero` | **First.** Big photo (landscape ≥ 1600 px), title, local name, one-line `hook`, chips and book-ahead badge (automatic). Optional `caption`. `focus` keeps the subject in frame when the photo is cropped: `center/top/bottom/left/right`, or a focal point `"20% 60%"` (from the left, from the top), which also works on gallery images. Without `image`, you get a typographic hero (see "No free photo") |
| `quick_facts` | Time needed and best time (cost, booking, transit and hours are automatic); up to 3 `extra` facts `{label, value, detail?}`. Keep `value` short and put the rest in `detail`. Don't repeat the automatic labels. The grid balances itself |
| `highlights` | "Why you'll love it": 2–6 concrete reasons (4 or 2 look best) |
| `prose` | 1–4 short paragraphs of story; `dropcap: true` for magazine style |
| `gallery` | **Optional**, 1–8 photos (don't repeat the hero photo; validate warns) with captions; credits appear automatically. Any count lays out cleanly. With an odd count the first photo is shown wide (`feature`), so it must be landscape and ≥ 1280 px; otherwise reorder or set `feature: false`. A row of portrait photos gets tall tiles. Use per-image `focus: top/bottom/…` to steer crops; setting `focus` on a portrait photo accepts the crop and silences the warning. Validate warns when a photo is too small or would be badly cropped for its slot |
| `book_ahead` | Timeline of steps by `days_before` (0 = visit day) plus `passport_note`. Needed whenever booking is required. Don't repeat `book_ahead.notes` here |
| `cost_breakdown` | Itemised local + R$ with an automatic total; `estimate: true` on a rough item (a typical fare, a snack) shows "≈"; `optional: true` extras are left out of the total; 0 shows as "Free". Shows the real share of the daily budget ("Over budget: 112% …" above 100%; no note needed), or for food places a meal comparison (don't add your own note saying the same) |
| `map` | Taxi address, deep links (China: Amap/Baidu, Korea: Naver/Kakao, others: Google/Apple), and a static OpenStreetMap image with a pin, made at build time |
| `tips` | `variant: insider / locals / pitfalls`. Put 2 in a row and they sit side by side |
| `menu` | Dishes/drinks with local name and price (Eat and nightlife places) |
| `stay` | Stay places only: "The stay" panel with `style`, `beds` (price per night, cheapest first), `rating`, `social`, `good_to_know` |
| `faq` | "You asked": `items: [{ q, a, asked?, correction? }]` (1–8). Set `correction: true` when your answer differs from what the game told the traveler (`./atr feedback --new` prints the game's answer under each question). A question about reaching the *city* belongs on the area card (`getting_there`); `--new` flags those. Answers to questions the traveler asked in the game (`./atr feedback --new`). First fix the field the question is about; add the Q&A here when the answer is not obvious from the page. Every answer needs a listed source |
| `quote` | `variant: vibe` (one-line mood) or a quote with `attribution` (only real quotes, with a source) |
| `pairs_well` | Other place ids nearby (missing ids show as "coming soon" plus a warning) |
| `weather` | Dec–Jan low/high °C, conditions, what it means for the visit, what to wear |
| `sources` | Optional: the footer is added automatically; add the block only for a `note` |

A good default order: hero, quick_facts, highlights, prose, gallery, quote(vibe), book_ahead, cost_breakdown, menu, map, tips ×2, weather, pairs_well.

### Worked example (abridged)

This is an **example**: a platform test fixture with illustrative, unverified facts. Don't reuse its facts. The full file is `platform/test/fixtures/places/china/shanghai/yu-garden/place.yaml`, and its screenshots are in `build/fixtures/shots/yu-garden-*.png` after `./atr shot yu-garden --fixtures`.

```yaml
id: yu-garden
name: "Yu Garden"
name_local: 豫园
name_romanized: Yùyuán
country: china
city: shanghai
area: Huangpu · Old City
category: culture
tags: [garden, ming-dynasty]
kind: See
why: A 450-year-old classical garden of rockeries, koi ponds and carved halls — calmest on a cold weekday morning.
cost: { local: 30, currency: CNY, brl: 24.8, note: "¥30 Dec–Mar, ¥40 the rest of the year" }
fx: { rate: 0.8267, date: 2026-11-09, source: "frankfurter.dev (ECB reference rate)" }
time_needed: 2–3 h
best_time: Weekday, right at opening
book_ahead:
  required: true
  lead_days: 1
  lead_time: Book the day before to be safe
  method: passport-registered
  links:
    - { label: Official site, url: "https://www.yugarden.com.cn/", note: Real-name slots with passport number }
    - { label: Trip.com, url: "https://www.trip.com/travel-guide/attraction/shanghai/yu-garden-75656/", note: No Chinese phone number needed }
  passport: true
hours:
  summary: Tue–Sun 09:00–16:30 (last entry 16:00)
  closed: Mondays
  winter: Lantern festival decorations from mid-January; crowds after dark.
location:
  address: 218 Anren St, Huangpu, Shanghai
  address_local: 上海市黄浦区安仁街218号
  lat: 31.2272
  lng: 121.4921
  nearest_transit: Yuyuan Garden (Line 10 / 14), Exit 1
sources:
  - { url: https://en.wikipedia.org/wiki/Yu_Garden, title: Yu Garden — Wikipedia, checked: 2026-11-09 }
  - { url: https://www.yugarden.com.cn/, title: Yu Garden official site, checked: 2026-11-09 }
confidence: medium
confidence_note: Winter price from two reviews; not on the official site.
last_updated: 2026-11-09
blocks:
  - type: hero
    image: tingtao-pond
    hook: Ming-dynasty pavilions and koi ponds, hidden behind a neon tourist bazaar.
  - type: quick_facts
    time_needed: 2–3 h
    best_time: Weekday, at 09:00
    extra:
      - { label: Good in rain, value: Partly, detail: Covered corridors, open courtyards }
  - type: highlights
    items:
      - { title: The Great Rockery, text: "A 14-metre mountain of yellow **Wukang stone** you can climb." }
      - { title: Winter calm, text: Bare branches and thin crowds; the koi still flash orange. }
  - type: gallery
    images: [ { file: rooftops, caption: Upturned eaves }, { file: jade-corridor, caption: The Jade Water Corridor }, { file: pavilion, caption: A pavilion above the pond } ]
  - type: book_ahead
    steps:
      - { days_before: 1, text: "Reserve a slot on the official WeChat mini-program with your **passport number**." }
      - { days_before: 0, text: Scan your passport at the gate. }
    passport_note: Bring the **same passport** you booked with.
  - type: cost_breakdown
    items:
      - { label: Entry ticket, local: 30, brl: 24.8 }
      - { label: Metro there and back, local: 6, brl: 4.96, optional: true }
      - { label: Tea at the Huxinting teahouse, local: 80, brl: 66.14, optional: true }
  - type: map
    note: Enter from **Anren Street** to skip the bazaar crush.
  - type: tips
    variant: insider
    items: ["Go at **09:00** on a weekday; tour groups arrive around 10:00."]
  - type: tips
    variant: pitfalls
    items: ["Street \"tea ceremony\" invitations near the gate are a known **scam**."]
  - type: weather
    temp_low_c: 3
    temp_high_c: 10
    conditions: Damp, grey, occasional drizzle
    note: Mostly outdoors; halls are unheated. Upside, light crowds.
    wear: Warm layers, waterproof shoes
  - type: pairs_well
    items: [ { id: nanxiang-mantou-dian, note: 2 min walk — soup dumplings after } ]
```

### Events and seasonal places

A place that only exists on certain dates (a New Year countdown, a Christmas market, an ice festival, a seasonal opening) needs `when`:

```yaml
when:
  dates:                                   # 1–6 ranges with the real year; one day has from = to
    - { from: 2026-12-31, to: 2026-12-31 }   # only the opening date is announced? leave out `to`: "From 18 Dec"
  kind: only                               # only (default) | season | best
  weekly: [sat]                            # optional: only these weekdays inside the ranges
  label: "New Year's Eve only"             # optional; default is derived ("31 Dec only", "17 Dec – 21 Feb")
  confirmed: false                         # dates expected from past years, not announced yet
```

`kind` says what the dates mean: `only` = it happens only then ("31 Dec only"); `season` = it is open during this period ("From 20 Dec to 28 Feb"); `kind: best` = the place is there all the time and the page is about these dates ("Best on 24–25 Dec", e.g. Christmas on a street). For something that runs every Saturday, write one range and `weekly: [sat]` instead of one range per date.

The card and hero show the dates, and validate checks them against the days the traveler is in that country (`config/trip.yaml`; the trip runs Dec 2026 – Jan 2027, so check the year). If the traveler is not there on those dates you get a warning, and the page and card show "Not on your route: you're in Hong Kong 19–22 Jan" by themselves: keep the page only if it says clearly that the route would have to change, otherwise drop it. With a partial overlap the page shows the usable days. Several one-day events on the same date compete with each other (`./atr gaps` lists them), so say on each page what makes it the one to pick. Use `confirmed: false` until the organiser announces this season's dates. Link the organiser's listing page (where the announcement will appear), and say plainly what is still unknown: date, price, whether it happens at all. A booking link for tickets that don't exist yet is fine if its `label` says so ("Last year's listing; 2026 tickets not on sale yet").

### Stay cards

`./atr new place --country japan --city tokyo --name "…" --category stay` scaffolds one (kind `Stay`, a `stay` block, no menu; stays need no `fame` and never show a fame chip). `./atr gaps` says which cities still want them.

- **What to pick**: hostels where a solo traveler meets people to go out with. `rating.atmosphere` holds the source's atmosphere score when it has one. If the best option in a city is *not* social, the page must say so in `why` and in `social`. Signs of that: a bar or big common room, events run by the hostel (family dinners, pub crawls, walking tours), and recent reviews that mention meeting people or solo travelers. Put those in `social`. A clean but silent hostel is not what was asked for; if you include one, say so. Capsule/pod hotels use `style: capsule`.
- **Price**: one night in the cheapest bed for dates inside the trip window, from the hostel's own site or Hostelworld/Booking. `cost` equals `beds[0]`; say in `cost.note` or the bed `note` which dates the price is for. Prices usually appear only after a date search, so WebFetch sees none: read them with `./atr render "<date-search URL>"` and put that URL in `beds[].url`, so the reviewer can open the same search. Prices move a lot, so `confidence` is rarely `high`.
- **Rating**: `rating: { score, out_of, source, reviews, checked }`, with the site you read it on and the day you read it. No score found? Leave `rating` out.
- **New Year**: Dec 30 – Jan 2 sells out and often has a minimum stay. Use `book_ahead` (`required: recommended` or `true`, `lead_days`, the booking link) and put the New Year rules in `hours.winter`.
- `hours.summary` holds reception, check-in and check-out times. `good_to_know`: lockers, curfew, lift, deposit, noise, whether foreigners can check in (in China some hostels can't register foreign passports: check).

### No free photo?

This is common for bars, small restaurants and anything at night. In order of preference:
1. Use a free photo of the **immediate surroundings** (the street, the alley, the market hall) as the hero, and say so honestly in `hero.caption`: `"Euljiro 3-ga by day — no free photo of the bars themselves"`.
2. If there isn't even that, **omit `hero.image`**. The page then gets a typographic hero in the category colour, with the local-script name large. The swipe card does the same. This is fine; don't use a misleading photo.
3. Leave out `gallery` when you have nothing good. A gallery isn't required.

Never use a photo of a different venue as if it were this one, and never use a non-free image.

## 5. Quality bar

- **Real sources**: at least 2, each actually opened, with the date you checked it. Prefer the official site, then recent independent sources. Prices and hours change, so use 2025–2026 info.
- **Prices**: always local + R$, from `./atr fx`. Show the free or cheap option when there is one. If a place costs more than the country's daily budget, say on the page why it is worth it (gaps flags these).
- **Book-ahead**: flag it honestly with `lead_days` and `method`. **China** often needs real-name booking with a passport via WeChat mini-programs or official sites (museums, popular sights, some shows). Say whether foreigners can do it without a Chinese phone number, and what the fallback is (window with passport, Trip.com).
- **Budget-traveler angle**: cheapest way in, free days, student or night discounts, the takeaway window, what's overpriced.
- **Winter reality**: Dec–Jan hours, closures, holidays, temperature, whether it's still worth it. Add the `weather` block.
- **Honesty**: `confidence` reflects how sure you are about prices, hours and booking. Never invent quotes, prices or hours.
- **Photos**: Commons only via `./atr media` (free licenses checked and credited automatically). If you add your own file, use `./atr media add` with author, license and source URL.
- **Questions**: when the traveler asked a factual question about a place (`./atr feedback --new`), answer it on the page: fix the field it concerns, add a `faq` item if the answer is not obvious, cite a source, then `./atr feedback --mark-seen`.
- **One price**: the cost block's total (non-optional items) must equal `cost`. Validate says which number to change when the card and the cost block disagree, including a one-cent rounding difference in R$.
- **Taste**: `./atr next` and `./atr gaps` turn the stated interests into targets per country. Add what is far under target, go for `hidden` places when the discovery share is low, and check `./atr feedback` for what the traveler liked in the game.

- **Facts you could not open**: a fact found only in a search snippet, or on a page that will not load, is allowed only when `confidence_note` says exactly that. Try `./atr render <url>` first. `./atr links` warns when a host cannot be reached from this machine; if a web fetch opened the page, keep the source and say so in `confidence_note`. `links` already tries Chrome before calling a link dead; each problem says why (DNS, connection, TLS, HTTP code, bot check), and "DNS unavailable" means this machine, not the site. A result marked "cached" can be re-checked with `--fresh`.

## 5b. Your page will be reviewed

After you finish, the runner opens every link on the pages you changed, and a separate reviewer session fact-checks each place and area you touched (you are judged only on your own files; leave other curators' files alone): it opens your `sources` and checks cost, hours and closed days, the booking rule with lead time and link, `when` dates, address and transit, and every Dec–Jan claim against the trip dates. A fact no listed source states counts against the page, and a fact a source contradicts blocks it. So before you finish, make sure each hard fact has a listed source that says it, drop or soften what you can't source, and put what you could not verify in `confidence_note`. Review findings come back to you once; fix them, or say in `confidence_note` why the reviewer is wrong.

What reviewers caught on real pages so far. Check your page for each before you finish:

- **Detail from general knowledge.** "Check-in on a touch screen", "a ¥5,000 cleaning fee", "avoid Jan 1, it's packed": plausible, but on no listed source. If you can't point to the sentence in a source, cut it.
- **One unsourced number, repeated.** The same price or rule in highlights, steps and tips counts once per place it appears. Source it or remove every copy.
- **A trip-date claim stretched from another date.** A guide that describes Golden Week crowds says nothing about New Year's Day. Say what the source says and that the trip dates are unconfirmed.
- **A closure, rebuild or "still open" resting on one undated guide.** Find the operator's notice or a current map listing (Amap, Dianping, Google Maps), or caveat it on the page. Chains close branches: check the place is open now.
- **Prices nobody can reproduce.** A price that only shows after a date search needs the search URL (`beds[].url`, or the source `url`) and the date you searched for.
- **The page contradicting itself.** Two different numbers for one thing (a note that says ¥5,500 Mon–Thu next to a ¥4,800 Monday).
- **Text-only hero when you fetched a good photo.** Use it.

## 6. Area cards

`areas/<country>/<id>.yaml`. Fields: `region`, `scope` (city/region), `cities`, `why` (≤220), `best_for` (1–4 categories), `highlights`, `days_suggested {min,max}`, `cost_level` (low/medium/high vs that country's budget), `getting_there`, `winter_note`, `image` (from `./atr media fetch --area <id>`), sources ≥ 2, confidence. `must_do` works here only when `./atr taste` says the item "wants an area card" (the traveler named the city itself). A sight inside the city gets a place page that claims the key; the area page lists it under "On your list here" by itself. Also set `lat`/`lng` (city centre, WGS84: this puts the area on the country overview map and gives its page a map), `fame` (has the traveler heard of the *city*?) and `getting_around` (≤ 200).

**Area pages.** The traveler chooses cities from these, so an area deserves a page, not only a card. Add `blocks:` (allowed: `hero`, `highlights`, `prose`, `gallery`, `quote`, `tips`, `weather`, `faq`, `sources`; `./atr new area` scaffolds an example). The facts strip, winter note, "On your list here", the cards of places already researched there, the map and the sources footer are automatic. A good area page says what a few days there feel like, which neighbourhood to base in, the 3–6 things that justify the detour (`highlights`), what it costs to get there and how long it takes, and what winter does to it, with 3–5 photos of different sides of the city (`./atr media fetch --area <id>`). Check it with `./atr shot <area-id>` on phone and desktop, and check the pin on `./atr shot areas`. `./atr gaps` lists areas that are still card-only. A city with two or more places and no area card is a gap too: add the card. `./atr gaps` shows how many area cards each country still wants (`1/8 areas`); the traveler chooses cities from them, so mix famous stops with ones they have probably not heard of.

## 7. Definition of a polished page

Check this against your screenshots before you call a place done:

- [ ] `./atr validate` shows 0 errors, and you understand every warning (fix them unless you have a reason).
- [ ] The hero is sharp in `-phone-<theme>-top.png`, landscape, and shows the place (or its surroundings, with an honest `caption`). If no free photo exists, use the typographic hero. The title is readable over it (use `focus:` if the crop is bad).
- [ ] `fame` is set honestly, and `must_do` is set if the place is on the traveler's list.
- [ ] `why` and `hook` are specific (no "a must-see for everyone"), and they differ from each other.
- [ ] Quick facts show cost in R$ + local, time needed, best time, booking and transit.
- [ ] 3–6 highlights, a map with the local-script address (and the pin on the right spot), at least one tips block, and a weather block. Add a gallery when good free photos exist; validate shows no image-size or crop warnings.
- [ ] Quick facts fit on one or two lines each (no value-length warnings) and repeat nothing that's automatic.
- [ ] Book-ahead places have a timeline with lead time, method and the exact booking link(s), plus the passport note if relevant. Nothing is said twice. `rules_changed` is set if the rules changed recently.
- [ ] Eat and nightlife places have a menu block with local names and prices. Stay places have a `stay` block with beds, a dated rating and what makes them social.
- [ ] Phone screenshots: nothing cut off, no horizontal overflow warning from `./atr shot`. You've read the slices for every block, once per device and theme.
- [ ] No "media not used" warning (`./atr media prune <id> --yes`).
- [ ] Both light and dark screenshots look right.
- [ ] Sources footer lists ≥ 2 real sources with checked dates; confidence is honest.
