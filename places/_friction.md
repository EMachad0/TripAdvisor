# Curator friction log

## 2026-11-09 — first batch (shanghai-museum-ancient-americas, euljiro-nogari-alley, gwangjang-market)

1. **The `./atr new` hint uses the place name as written.** For "Shanghai Museum: Ancient Americas" it suggested `./atr media search "Shanghai Museum: Ancient Americas Shanghai"`, which is a useless query because of the colon and the doubled city. *Would help:* strip punctuation and drop the city when it's already in the name.
2. **Field length limits aren't in the guide or the scaffold comments.** I found out about `book_ahead.lead_time` ≤ 80, `confidence_note` ≤ 200 and `hours.closed` ≤ 80 only when validation failed. *Would help:* print the max length in the scaffold comments (as `why: 20–160 chars` already does) and in CURATOR-GUIDE §4.
3. **Commons search has no rate-limit handling.** Several `./atr media search` calls in a row returned raw `HTTP 429` errors with the full API URL. *Would help:* automatic retry with backoff, or a friendly "rate-limited, wait N s" message.
4. **The guide's photo check doesn't work.** It says "Unsure what a photo shows? Read the preview URL with WebFetch", but WebFetch returns binary garbage for images. I worked around it by downloading previews with curl into the scratchpad and opening them with Read. *Would help:* `./atr media preview <File:...>`, which saves a local JPG or a contact sheet of the search results to open with Read.
5. **There's no free photo of the actual subject for some places.** Commons has nothing for Euljiro Nogari Alley, Manseon Hof or Eulji OB Bear, and nothing at all at night. That breaks the "hero shows the actual place" checklist item for a nightlife page, so the hero is the daytime Euljiro LED/tool street, captioned honestly. *Would help:* guidance on what to do when no free photo exists (allowed fallbacks, or a "no photo of the venue" flag the game can show), and maybe Flickr CC-BY search in `./atr media search`.
6. **Gallery layout punishes low-resolution or portrait images in slot 1.** The first gallery image is shown full-width, so a 640 px portrait photo (Olmec Head 4) came out huge, blurry and badly cropped. The validator didn't warn. *Would help:* a warning when the first gallery image is < 1280 px or portrait, or a `layout`/`span` option.
7. **The 4-image gallery leaves an orphan tile on phone.** The guide says 3 or 5 look best, but the validator doesn't mention it. A warning for even counts > 2 would catch it before the screenshot does.
8. **The map embed is always a placeholder in screenshots.** It shows a striped "OPENSTREETMAP" box with coordinates and no tiles, so I can't check the pin visually. If tiles are blocked on purpose in `shot`, say so in the guide. Otherwise, wait for tiles before capturing.
9. **The quick-facts `extra` can duplicate an automatic fact.** I added an extra "Booking" label on a no-booking place and got two "BOOKING" cells (the automatic "Not needed" plus mine). *Would help:* a validator warning when an `extra.label` matches an automatic fact label (Cost, Booking, Getting there, Time needed, Best time).
10. **Cost for food places counts against the "everything else" budget.** For Eat places the cost bar shows "26% of your R$140/day budget", but the guide says the budget excludes daily food. I added a note explaining this, but the bar contradicts it. *Would help:* skip or relabel the budget-share bar when `kind: Eat` or `category: food`.
11. **The book-ahead panel repeats itself.** The automatic method text ("Passport real-name booking — Real-name booking with your passport number (common in China…)") appears alongside `book_ahead.notes` and `passport_note`, so the panel shows three similar callouts. *Would help:* document which field renders where, or drop the generic method sentence when `notes` is set.
12. **`book_ahead.link` must be a single URL, but foreigners often need a reseller.** For the Shanghai Museum the practical channel for foreigners is Trip.com. The official channel is a WeChat mini-program with no web booking URL, so the "Book" button points to the Trip.com homepage. *Would help:* an optional `link_foreigners` field, or a list of `{label, url}` channels.
13. **Some planned sights no longer fit "must be booked".** The Shanghai Museum dropped general reservations from Sept 1, 2025, and Museum East is walk-in. I picked the ticketed People's Square exhibition (Jul 2026 – Nov 2027) instead. It might be useful if `./atr gaps` or the guide flagged well-known China sights whose booking rules changed recently.

## 2026-11-09 — second batch (new yu-garden; polish of shanghai-museum-ancient-americas, euljiro-nogari-alley, gwangjang-market)

1. **`./atr gaps` ignores `book_ahead.links`.** Both pages that use the new `links` list (yu-garden, shanghai-museum-ancient-americas) are flagged "book-ahead required but no link", but validate accepts them and the page renders the buttons. *Would help:* make gaps read `links` as well as `link`.
2. **"A Chinese-culture sight in Shanghai that must be booked" is hard to find honestly.** Shanghai's policy is reservation-free: Shanghai Museum East (Sept 2024) and People's Square (Sept 2025) dropped reservations, and the CPC First Congress memorial's official site says no reservation is needed. For Yu Garden, 2025–2026 sources disagree. Some say real-name timed entry (gochinatravel, Nov 2026; a 2025 Q&A); others say no advance booking and windows sell on the day (yugarden.org, Oct 2026). I used Yu Garden with `required: true`, `lead_days: 1`, the window fallback in the steps and a `confidence_note` about the conflict. *Would help:* a `book_ahead.recommended` level (between required and not), so "real-name, safer to book" isn't forced into a yes/no.
3. **No way to remove a photo.** `./atr media` has search/preview/fetch/add/list but no `remove`. Replacing a gallery photo left unused WebP files and credit entries. I deleted them by hand from `media/` and `credits.yaml`, which is error-prone. *Would help:* `./atr media remove <place> <name>`, plus a validate warning for unused media.
4. **`focus:` doesn't silence the portrait-in-landscape-tile warning.** The warning suggests `focus: top|center|bottom`, but adding `focus: center` to the Calakmul stela left it in place. I fixed it by pairing it with a second portrait photo instead. *Would help:* accept `focus` as an acknowledgement, or reword the hint ("use two portraits in the row, or reorder").
5. **Official booking links hide behind images and QR codes.** The Shanghai Museum's "Book a Visit" link redirects to an image-only notice (shmres-zwc.shanghaimuseum.net) with WeChat and Trip.com QR codes. Its older English reservation URL returns 404. I decoded the Trip.com QR with a throwaway jsQR script in the scratchpad to get the exact page. *Would help:* `./atr qr <image-or-url>` to decode booking QR codes, or a note in the guide.
6. **Trip.com product pages are hard to verify.** WebFetch on trip.com redirects to a bot-check page, and getyourguide/intotravelchina return 403, so ticket product pages can't be opened to check. I used the attraction ticket pages (`/travel-guide/attraction/...`), which the museum's own QR points to. *Would help:* the guide could say whether an attraction ticket page counts as an "exact booking page".
7. **The hero photo can appear again in the gallery without a warning.** I had the hero image as the last gallery photo and only noticed it in the screenshot. *Would help:* a validate warning when a gallery file equals `hero.image`.
8. **Full-page phone screenshots are too tall to read** (390×10,800 shown at 72 px wide). I cropped sections with a sharp script in the scratchpad to check the booking panel and map. *Would help:* `./atr shot <id> --section book_ahead|map|…` or automatic per-block crops.

## 2026-11-10 — third batch (follow-up after platform update)

1. **`./atr qr` decodes only standard QR codes.** On the Shanghai Museum notice it found the Trip.com URL but silently skipped the WeChat mini-program code (a round "sun code"), with no "1 code not decoded" note. *Would help:* report undecoded code-like regions, or say that WeChat sun codes can't be decoded.
2. **There are a lot of slices.** 4 places produce 132 `-sNN` slices (32–34 each), so "read every slice" costs a lot for a small edit. I read the slices covering what changed (hero/quick facts, booking, gallery) rather than all of them. *Would help:* `./atr shot <id> --block book_ahead` or a list mapping slices to blocks, so you can re-check only what changed.
3. **The `confidence_note` limit (200) is tight now that the guide asks for more in it** (the booking-level reason plus "Trip.com page not fetchable, not checked"). For both China pages I had to squeeze out wording. *Would help:* raise it to ~300, or add a separate `book_ahead.source_note`.
4. **`media prune` worked well.** It found the unused `east-gate` photo in gwangjang-market and removed it cleanly; nothing to fix there. I'd still like validate to warn about unused media during the normal loop, not only when prune is run.
5. **The why/prose lead still says "best booked the day before" for a `recommended` place.** That's my choice and it's consistent, but nothing checks that the text matches the booking level (e.g. "must book" wording on a `recommended` place). Low priority.

## 2026-11-10 — fourth batch (area chongqing, place liziba-station)

1. **`hero.focus` only offers left/right/top/bottom/center.** On phone, `focus: left` brings the Liziba train into frame, but it then sits right under the title. *Would help:* a percentage focal point (e.g. `focus: "20% 60%"`), or a hint in `shot` when the title covers the busiest part of the image.
2. **`./atr fx CNY --amount N | head -2` showed only the rate line.** The converted amount wasn't in the first two lines, so I worked out the R$ values by hand from the rate. Low priority. *Would help:* put the converted amount on the first line.
3. **The official Chongqing government page (english.cq.gov.cn) wouldn't fetch,** so the platform hours and the 2026 station rebuild dates come from travel guides that disagree with each other. Not a tool issue, but the guide could suggest fallbacks for gov.cn pages that block fetches.

## 2026-11-10 — holiday batch (chongqing-drone-light-show, jiefangbei-nye-countdown, harbin-christmas-on-central-street, harbin-ice-and-snow-world, shanghai-nye-bund-and-clubs, shanghai-christmas-markets, hong-kong-nye-fireworks)

1. **`./atr new` turns apostrophes into ugly ids.** "Jiefangbei New Year's Eve Countdown" became `jiefangbei-new-year-s-eve-countdown`. I renamed the folders by hand (mv + edit `id`). *Would help:* drop apostrophes before slugging, or an `--id` flag.
2. **`media preview` with a Chinese-only query writes to `.cache/previews/image/`.** The slug for "哈尔滨冰雪大世界" came out empty, so the folder was the generic `image`, and the "open contact-sheet.jpg" path printed didn't match. *Would help:* a fallback slug (e.g. a hash or pinyin), and always print the contact-sheet path.
3. **Commons rate limits hit hard during fetch, not just search.** A run of 4 `media fetch` calls (with 5 s gaps) got two HTTP 429s, and one command hung past the 5-minute tool timeout. *Would help:* `media fetch` taking several files at once with built-in pacing, or a clear "retrying in N s" log line so a hang is visible.
4. **The area chip truncates silently on phone.** A long `area` ("Nan'an · Nanbin Road and Changjiahui, facing Chaotianmen") is cut off mid-word in the hero chip at 390 px, with no overflow warning from `shot` and no validate hint. I shortened all areas to about 25 characters. *Would help:* a validate warning above ~28 characters, or wrap the chip.
5. **No field for an event's date or occasion.** Holiday cards (NYE, Christmas) depend on a specific night. I used `tags` (`christmas`, `nye`) as the brief asked, and put dates in `hours.winter` and `best_time`. *Would help:* an optional `event: {date, status: confirmed|expected|unannounced}` field so the game can show "not announced yet" consistently.
6. **No good way to show a free place with costs that are only rough.** Metro fares and snacks are estimates; I marked them "(rough)" in labels. *Would help:* an `estimate: true` flag on cost items that renders "≈".
7. **Booking links for not-yet-published events.** The 2026 NYE party tickets don't exist yet, so I linked the regular INS all-pass listing plus the SmartShanghai events listing (a list page, not a product page), and validate didn't object. Fine for now, but the guide could say what to do for future events.
8. **SmartShanghai event pages, RA and SCMP can't be fetched** (bot check / 403). The guide's "can't open, say so in confidence_note" rule covers booking links, but not facts that only those pages hold (2025 NYE party prices). I quoted them from search listings and said so in `confidence_note`.
9. **Long titles push the hero chips off-screen.** With a ~65-character `name`, the category/area chips slid under the caption pill on phone (Shanghai Christmas) and up into the "All places" bar on desktop (Hong Kong). Neither validate nor `shot` warned. I shortened the names to ≤ 35 characters. *Would help:* a validate hint when `name` is over ~40 characters, or a hero layout that grows instead of overlapping.

## 2026-11-10 — infinity-staircase (dujiangyan-zhongshuge-bookstore)

1. **No geocoding helper.** The mall (成都融创茂) isn't on OpenStreetMap and Nominatim finds nothing. I queried Overpass by hand with curl and pinned a nearby mapped building in the same complex (Sunac Snow World). *Would help:* `./atr geo "<name>"` that searches OSM/Wikidata and prints WGS84 candidates, plus a way to mark a pin as `approximate: true` so the map can say so.
2. **`./atr links` times out on cbgc.scol.com.cn** (ETIMEDOUT), though a web fetch read it fine. It's likely a mainland-China site that's slow or geo-limited from here. I kept the source. *Would help:* a per-domain longer timeout, or a "known slow from abroad" note instead of a warning.
3. **A must-do item's subject no longer exists.** The viral Chongqing Zhongshuge closed in Sep 2024, so I claimed `infinity-staircase` with the closest open sibling (Dujiangyan). There's no field to record "the original is closed, this is the substitute" besides prose. *Would help:* an optional `must_do_note` shown next to "★ On your list".

## 2026-11-10 — area pages (chongqing, beijing)

1. **The region chip is cut off on phone with no warning.** `region` allows 80 characters, but in the area hero at 390 px anything over about 28 runs off the right edge ("CHONGQING MUNICIPALITY · SOUTHWEST CHINA, WH…"). Neither validate nor `shot` said so. I shortened both regions. *Would help:* a validate warning above ~28 characters, or let the chip wrap.
2. **`areas/<country>/media/credits.yaml` is shared by every area in the country.** While I worked, a `meridian-gate-snow` photo appeared there that no area file uses (another session, probably). I can't tell which area it belongs to, so I left it. *Would help:* an `area:` key on each credits entry, and `media prune --area <id>`.
3. **`./atr links` times out on english.beijing.gov.cn** (ETIMEDOUT, also with `--fresh`), though a web fetch read the page. Same pattern as the earlier cbgc.scol.com.cn note. I kept the source and said so in `confidence_note`.
4. **`media search` returns nothing for some plain English queries** ("Mutianyu winter", "Kuixinglou Chongqing") with no "0 results" line, so it looks like a failure. The Chinese name (慕田峪长城) worked. *Would help:* print "0 results" and suggest the local-script name.
5. **An area can't say "this must-do lives here but isn't claimed by the area".** Beijing shows "great wall of china: not researched yet" automatically, which is right, but the guide doesn't say whether a city card should claim a must-do for a sight inside it. I left `great-wall` for a place page.

## 2026-11-10 — stay cards (desti-youth-hostel-jing-an, nine-hours-shinjuku-north)

1. **Bed prices for trip dates can't be read with WebFetch.** Hostelworld and the Nine Hours official site only show prices after a date search done in JavaScript, so WebFetch returns pages with no price (Hostelworld's list page even showed a "from €0.54" glitch). I read the prices by loading the pages in headless Chrome from my scratchpad and from the JSON those pages request; nothing in the repo was changed. *Would help:* `./atr stay-price <hostelworld-url|id> --date 2026-12-08` (or a documented way to render a page), and a `price_checked` date per bed.
2. **The reviewer can't reproduce stay prices from the source URL.** The listed source is the property page; the price only appears after picking dates. *Would help:* a `price_url` per bed, or guide wording on how to cite a date search.
3. **No way to show a review split.** Both Shanghai candidates have 2026 reviews that disagree on "social". I wrote the caveat into `social` and prose. *Would help:* optional `social_score` (e.g. Hostelworld atmosphere) in the stay block.
4. **`./atr media search "Xikang Road Shanghai"` returned Tianjin's Xikang Road station and unrelated "Ferry Road" files.** No free photo of either venue exists; Desti has a typographic hero, Nine Hours uses the station 2 minutes away plus a captioned photo of the chain's Narita pods.
5. **The stay scaffold has no `weather` or `book_ahead` block uncommented,** though the guide's checklist asks for weather on every page and New Year booking steps on stays. Low priority.
6. **Aggregators contradict the official site.** Roomer says Nine Hours Shinjuku-North closed and was renamed; the official site sells January 2027 nights. Noted in `confidence_note`.

## 2026-11-10 — feedback questions, fame and `when` backfill

1. **`when` only says "only on these dates".** Two cards are tied to a date by their angle, not by the place: Christmas on Harbin's Central Street (the street is there all winter) and the Shanghai Museum show (open for the whole trip, ends Nov 2027). I set `when` on both and said so in `hours.winter` / the label, but the chip title still reads "Only on these dates". *Would help:* a `when.kind` (`event | season | best-on`) so the game can word it honestly.
2. **Weekly events need one range per date.** The Chongqing drone show runs every Saturday plus holidays; I listed each Saturday in the China window by hand (3 ranges plus Dec 31 – Jan 2). *Would help:* `when.weekly: sat` inside a range.
3. **A "how do I get to this city" question has no home.** The traveler asked how to reach Harbin from Shanghai on a place page. There is no Harbin area card yet, so the answer went into a `faq` block on the place; it belongs on the area page (`getting_there`). *Would help:* `./atr feedback --new` saying "city-level question: answer on the area card", or letting a place faq item point to the area.
4. **The game's own answer can be wrong and there is no way to flag it.** It told the traveler the NYE drone show is "confirmed"; no source confirms a 2026 programme. I corrected it on the page only. *Would help:* a way to mark a game answer as superseded when the page answer differs.
5. **Stays and `fame`.** The guide says stays need no `fame`, the task asked for it on every place. I set `popular` on the Shanghai hostel so it doesn't get a "Hidden gem" chip. *Would help:* the guide saying what fame means for a stay, or validate rejecting it there.
6. **SmartShanghai event pages still can't be fetched** (bot check), and its two 2026 Christkindlmarkt listings disagree (Nov 25–Dec 27 vs Nov 18–Dec 28, search snippets only). I used the narrower range with `confirmed: false`.

## 2026-11-10 — Christmas options near Chongqing, Chongqing stays

1. **The cost block's budget line caps at 100%.** Yangshuo's total is R$298 against R$170/day (175%), but the page says "100% of your R$ 170/day China budget". The hero quick fact shows the right share on other pages. *Would help:* print the real percentage.
2. **Holiday options aren't comparable on cost unless the curator makes them so.** Each Christmas card has to include the trip onward (here: to Chongqing by Dec 26) or the cheapest-looking card is the most expensive overall. I put the onward train in `cost` on all five. *Would help:* an optional `onward: {to, local, brl, arrives}` field the holiday screen can show next to the cost.
3. **A rejected holiday option stays in the list.** The traveler ruled Harbin out for Christmas; the only way to drop it from "Where for Christmas?" is to remove its `christmas` tag. I left the page untouched. *Would help:* a traveler-side "not an option" verdict in the game, or a config list of excluded cities per holiday.

## 2026-11-10 — review round, call-night stay, Shanghai → Chongqing

1. **Pinyin with macrons renders broken in the hero.** The italic serif font has no glyphs for ā ē ī ū: the macron floats after the letter ("Xi¯Jie¯", "Chéngdu¯"). Acute, grave and caron marks are fine. I switched `name_romanized` to plain pinyin on five pages. Harbin's Central Street page still shows it ("Dàjie¯"); I was told to change only its tag. *Would help:* a font with full pinyin coverage for that line, or a validate hint.
2. **`name_local` + `name_romanized` share one line and wrap mid-phrase** when both are long (Xi'an, Chengdu, Dali had three names joined by dots). No warning. I shortened both to one name each. *Would help:* a validate hint above about 12 CJK characters or 25 pinyin characters, or put the pinyin on its own line.
3. **The "When" fact prints the date twice** when `when.label` contains the dates ("Christmas, 24–25 Dec" with "24–25 Dec" under it). *Would help:* drop the sub-line when the label already includes it.
4. **Category chip label has weak contrast in dark mode** (dark text on the purple, red, green and brown pills; white in light mode).
5. **Phone footer has no side padding**: the last line runs edge to edge on every page.
6. **Cost block mixes number formats**: small estimated rows print "R$ 2,48" while the others print whole numbers.
7. **Reviewers flag the cost-block "100%" cap as a page contradiction** (Yangshuo, Dali) and want the onward train out of `cost`. The first is the platform bug already logged; the second is the traveler's own convention. I answered both in `confidence_note`, which costs about 100 of its 400 characters. *Would help:* a `review_notes` field outside the page, or telling the reviewer about known platform bugs and the holiday-cost convention.
8. **`./atr render` prints no links**, so a search-results page (Booking.com, Trip.com) gives hotel names but not their URLs; I found the property URL with a web search. *Would help:* `--links` to list hrefs.
9. **Hotel sites block both WebFetch and render** (Expedia, Hotels.com, Travelocity, Traveloka, Qantas: 403/429 bot pages; Trip.com hotel pages with dates redirect to sign-in). Booking.com and tiket.com rendered. A stay card for a hotel ends up resting on two listings.
10. **`./atr review` takes one model flag per run and reviews pages one after another**; two runs at once both build into `build/`. I ran two in parallel to save time and saw no failure, but it is not documented as safe.

## 2026-11-10 — Seoul: Gyeongbokgung, Namsan, Sparex jjimjilbang

1. **A long single word breaks mid-word in the phone hero.** "Gyeongbokgung Palace" rendered as "Gyeongbokgun / g Palace". I renamed the card "Gyeongbok Palace" with `name_romanized: Gyeongbokgung`. *Would help:* shrink the title font when one word is wider than the column, or a validate hint.
2. **`./atr links` times out on www.seoultravelpass.com** (ETIMEDOUT, twice) although `./atr render` loaded the same URL with HTTP 200 minutes earlier. Kept the source and said so in `confidence_note`.
3. **Official fares that load by script have no fetchable text.** namsancablecar.com/usage.html fills its fare table from `public/locales/en.json`; WebFetch and a plain page read show no numbers. I read the JSON with curl. *Would help:* `./atr render` waiting for script-filled tables, or a `--wait` flag.
4. **One screenshot per card (parallel-run rule) means hero swaps go unchecked.** I changed the Namsan hero from `night-skyline` (dark, branches in front) to `view-north` after the single shot.

## 2026-11-10 — korea winter cards (hwacheon-sancheoneo-ice-festival, seoul-plaza-ice-rink, elysian-gangchon-ski-day)
- `./atr links` reports official sites as dead on TLS grounds although `./atr render` (Chrome) opens them: https://www.narafestival.com (ERR_SSL_DH_KEY_TOO_SMALL) and https://www.elysian.co.kr (UNABLE_TO_VERIFY_LEAF_SIGNATURE, incomplete cert chain). Worked around by listing the http:// URLs, which answer 200. Would help: treat a TLS failure as "blocked/info" when the http variant or a browser load succeeds.
- WebFetch sees only the page title on narafestival.com and fails on elysian.co.kr (cert). Both need `./atr render`; elysian.co.kr is a single-page app and needs `--wait 4`.
- `./atr render https://seoulskate.kr/` fails with "page.evaluate: Execution context was destroyed, most likely because of a navigation" (also with --wait 6); curl gets no response. Could not read the rink's official site, so it is named on the card but not linked.
- `when` needs a `to` date even when only the opening date is announced (Seoul Plaza rink: 18 Dec 2026, end unknown). I wrote an estimated end with confirmed: false and a label saying so. An open-ended range would be more honest.
- `./atr geo` found nothing for the festival ground or Hwacheon bus terminal; Wikidata answered 429 on every call.

## 2026-11-10 — Harbin: harbin-xingsu-hostel, area harbin
- Hostelworld date searches: `./atr render "…/hostels/p/320426/…?from=…&to=…"` shows no prices (the date params are ignored on that URL form). The `/pwa/hosteldetails.php/<Name>/<City>/<id>?from=…&to=…&guests=1` form renders prices (in R$, from locale). For other dates I read Hostelworld's public availability JSON with curl. *Would help:* `./atr render` docs naming the working Hostelworld URL form, or an `atr price hostelworld <id> <date>` helper.
- Trip.com hotel pages with checkIn/checkOut redirect to sign-in under `./atr render`; Ctrip mobile ignores dates and hides prices behind "登录看低价". Only Hostelworld gave a dated stay price.
- `./atr render` on bjnews.com.cn fails with "Execution context was destroyed … navigation". Used a China Daily report of the same event instead.
- `./atr geo "中央大街站"` returns streets in other cities, not Harbin's metro station; Wikidata answered 429. Pinned the street with `approximate: true`.

## 2026-11-10 — Chengdu curator (panda base, Heming, Flipflop, area)
- `./atr links` times out (ETIMEDOUT) on every www.panda.org.cn page, but `./atr render` opens the same URLs fine. A fallback in `links` that tries a real browser before reporting a timeout would save a confidence_note line on every Chinese official site.
- `./atr geo` hit Wikidata HTTP 429 after a few lookups; OpenStreetMap results were enough.

## 2026-11-10 — Xi'an: area xian, terracotta-army, sajinqiao-food-crawl, desti-youth-park-hostel-xian
- `./atr render` on a Booking.com hotel page prints prices and reviews but not the house-rules section (lazy-loaded), so check-in rules and foreign-guest policy had to come from Hostelworld and Trip.com.
- `./atr links` reports uk.trip.com hotel pages as blocked although WebFetch read the same page (it states the foreign-guest policy). A note in the guide that a WebFetch read is enough would help.
- `./atr geo "背包十年青年旅舍 西安"` returned a Shanghai branch first; searching for the building name (金钟大厦 西安) found the right pin. Wikidata answered 429.

## 2026-11-10 — Beijing: mutianyu-great-wall, forbidden-city-jingshan, niujie-muslim-food-street, beijing-xingshe-youth-hostel
- `./atr links` times out (ETIMEDOUT) on www.visitbeijing.com.cn and english.beijing.gov.cn, but `./atr render` opens both with HTTP 200. Same pattern as panda.org.cn: a browser fallback in `links` would save a confidence_note line per card.
- `./atr render` gets a bot wall on timeanddate.com ("Just a moment…") and on trip.com attraction pages (HTTP 432 "whaleguard block"), so sunset times and the Trip.com Mutianyu page could not be read. *Would help:* an `atr sun <city> <date>` helper for winter dusk times.
- `./atr geo "新街口南大街139号"` returns 0 results; pinned the street with `approximate: true`.
- The one-shot-per-card rule meant I couldn't check a `focus:` on the Mutianyu hero, which crops to mostly sky on the phone top screen. I left it as it was.

## 2026-11-10 — Shanghai: area shanghai, bund-and-lujiazui-skyline, da-hu-chun-shengjian, ins-land
- `./atr media fetch ins-land "File:INS Hush Shanghai.png"` failed twice on Commons HTTP 429 (gave up after "attempt 6 of 5"), after a run of searches and previews. Dropped the INS gallery. *Would help:* a `--wait-until-ok` mode, or a shared per-host cooldown across concurrent curators.
- `./atr links` times out on english.shanghai.gov.cn and touch.piao.qunar.com, though WebFetch opens both.
- `./atr render` hits a bot wall on timeanddate.com; I used the sunrise-sunset.org JSON API for December sunsets. Seconding the `atr sun` idea.
- `./atr geo` gets Wikidata HTTP 429 and finds no metro stations or ferry piers by Chinese name (南京东路站, 金陵东路轮渡站).

## 2026-11-10 — areas huangshan, yangshuo, dali
- `./atr media fetch` hit Commons HTTP 429 on most files even one at a time (6 retries each), probably because several curators share the quota. Some fetches only succeeded on a later retry loop. *Would help:* a shared queue or a longer backoff across processes.
- Trip.com train route pages (`/trains/china/route/...`) show fares only in USD whatever the locale. Ctrip's `trains.ctrip.com/trainbooking/<from>-<to>/` gives CNY, but its slug doesn't know `dali` (shows 0 trains); the `webapp/train/list?dStation=大理&aStation=…` form works. *Would help:* a note in the guide, or an `atr trains <from> <to>` helper that prints a parsed timetable.
- `./atr links` reports every trip.com URL as "blocked", including flight searches read fine with `./atr render`.

## 2026-11-10 — traveler feedback on the game (China route thread)
- **No way to write a note on a card.** The traveler wants to leave free text on a city or attraction card ("only for the Wall", "if it snows", "too far"). The game stores only swipes, duels, locks and Ask questions. *Would help:* a note box on every card, saved to `feedback/notes.jsonl` with the card id, and shown by `./atr feedback`.
- **Must / Maybe / Skip is too coarse for the areas round.** With ten city cards the traveler says the three buttons "do not help much": they do not say how many days, or why. *Would help:* per city, a 0–5 interest score or a "nights I'd give it" stepper, plus the note box; or ranking the cities by drag instead of swiping.

## 2026-11-11 — Huangshan: huangshan-summit-hike, hongcun-village, huangshan-kunlun-youth-hostel
- `./atr render` on any Trip.com **hotel** page (detail or dated search) now redirects to the Trip.com sign-in page, so summit-hotel dorm prices could not be read. Booking.com redirected a summit hotel to the area search for Dec 10. *Would help:* a note in the guide on which hotel sites still render without login.
- `./atr new place` filled `fx` with 0.8323 / 2026-11-10 while the brief fixed 0.8267 / 2026-11-09. Easy to miss: an `--fx-rate` option or a warning when the cached rate differs from what other cards in the city use would help.
- Official huangshan.gov.cn pages return HTTP 412 ("Environment Checking") to `./atr render`; I used reposts on Guangming/Sohu/The Paper instead.

## 2026-11-11 — Zhangjiajie: tianmen-mountain (update), zhangjiajie-grand-canyon-glass-bridge, qixing-mountain-sky-ladder, zhangjiajie-jijiehao-hostel
- `./atr links` times out on m.voc.com.cn and hunantoday.cn and gets HTTP 403 on chinadiscovery.com, but `./atr render` opens all of them. Same pattern as earlier notes: a browser fallback in `links` would help.
- `./atr render` hits verification walls on you.ctrip.com, trip.com things-to-do pages and verify.trip.com; Klook answers 403. The Grand Canyon's official shop (fx.zjjdaxiagu.com) refuses the connection, so no December glass-bridge price could be read anywhere.
- Hostelworld's `/pwa/s?...&id=4823` city search for Zhangjiajie returns "0 properties"; the SEO page `/hostels/asia/china/zhangjiajie/` lists 16. An `atr hostels <city> <date>` helper would avoid guessing city ids.
- The faq `asked` field wants a date, but the scaffold/guide wording ("Answers to questions the traveler asked") made me first put the traveler's words there. A one-line note in `./atr blocks faq` would help.
- One-shot-per-card rule: the glass-bridge hero crop on phone showed mostly sky; I swapped hero/gallery and set `focus` but could not re-shoot to check.
- 12306 worked with a cookie from /otn/leftTicket/init plus `queryTicketPrice` for fares; an `atr trains` helper wrapping this would save time.

## 2026-11-11 — Chongqing: cici-park-chongqing, esmi-night-club-jiangbei, chongqing-liuhe-youth-hostel, hongyadong-qiansimen-night-walk, yangtze-river-cableway-night
- `./atr render` gets HTTP 403 with no text on ra.co (Resident Advisor) and klook.com activity pages. RA is the main listing site for China's underground clubs, so door age and free-night rules could only come from search snippets. *Would help:* a way to read RA event JSON, or a note in the guide on which aggregator mirrors it (Techno Airlines worked).
- `./atr render --json` returns text only, no links; to find event and venue pages I had to pull hrefs with curl. *Would help:* a `--links` flag.
- `./atr render` failed on a cq.gov.cn notice ("Execution context was destroyed … navigation"), probably a redirect.
- `./atr geo` finds no WGS84 point for cableway stations or street-number addresses (长江索道北站, 中山一路97号, 鲤鱼池42号); Wikidata 429 on every query.

## 2026-11-11 — Japan agent A (Shibuya, Suga Shrine, WOMB, Daikoku PA, Mikado)
- Commons rate-limiting was heavy: `./atr media fetch` for 2 Daikoku photos ran out of its 5 retries twice (HTTP 429), with several curators sharing the quota. *Would help:* a shared queue/backoff across curator sessions, or a longer retry budget.
- SHIBUYA SKY FAQ answers and WOMB FAQ answers are collapsed accordions: `./atr render` prints only the questions. WOMB's answers were readable from the Next.js payload via curl; Shibuya Sky's weren't. *Would help:* `render --expand` that clicks `aria-expanded=false` buttons.
- ra.co, klook.com and tabi-mag.jp return 403 to `./atr render`; GetYourGuide renders fine (append `?currency=JPY` for yen prices).
- `./atr geo` finds no result for 大黒パーキングエリア / "Daikoku PA" (used Wikipedia coordinates).

## 2026-11-11 — Japan agent B (Osaka/Kyoto/Ado/ghost town)
- Commons downloads hit HTTP 429 repeatedly even with 15 s gaps between `media fetch` calls (other curators share the quota); a 3-file fetch ran >5 min and failed on the third. A shared queue or a longer default backoff would help.
- Kani Doraku's store pages are Vue templates; menu only readable via `./atr render` on /area/shop/menu/?shop_id=1&category=N (found by probing ids).
- Tomogashima Kisen's timetable and fares are images; read via `./atr render --shot`. RA (ra.co) returns 403 to both WebFetch and render.

- 2026-11-11 (Shanghai hostel / benbang / Beijing duck curator): `./atr media fetch` hit Wikimedia HTTP 429 on four tries over ~10 min (lanxin-jinxian-road, one Nanjing Road photo). Other threads fetching at the same time probably share the limit. A shared queue or cache across parallel curators would help. Lanxin went out with a typographic hero.

## 2026-11-11 — Japan stays (agent C: mad-cat-hostel-osaka, hostel-chillax-namba, nui-hostel-kuramae, wise-owl-hostels-shibuya, nine-hours-shinjuku-north faq)
- Nine Hours official prices still can't be read: `/en/plan/select/shinjuku-north` renders only today's date picker (no query params for dates found), and Rakuten's dated plan list (`hotelinfo/plan/199052?f_nen1=…`) renders every plan with the price cell empty. Only Booking.com's flexible-dates list gave dated prices, so the Booking.com-vs-official markup stays unknown. *Would help:* a documented dated-price URL for the 9h site, or `atr render --click`.
- A Hostelworld pwa URL for a delisted id (Hostel Bedgasm 272463) silently redirects to the Tokyo city search; the new listing is 341011. Worth a note in `atr render` output when the final URL differs from the requested property.
- `./atr media fetch` hit Commons 429 ("attempt 6 of 5") five times in a row on one file for nui-hostel-kuramae while other curators were fetching.
- `./atr feedback --new` lists questions for several places (huangshan, jiefangbei, harbin…), so `--mark-seen --upto` can't be run for one place's question only. *Would help:* `--mark-seen --place <id>`.

## 2026-11-12 — Thailand areas (bangkok, ayutthaya, kanchanaburi)
- `./atr media fetch --area ayutthaya "File:Three Chedi(s) of Wat Phra Si Sanphet.jpg"` copied the Commons author field verbatim (a 600-char licence note in English and Thai) into `areas/thailand/media/credits.yaml`, and `./atr validate` then fails every area in the country with `credits.yaml [n].author too long (max 300)`. I shortened it by hand to the photographer's name. *Would help:* fetch truncating/cleaning the author to the name (or warning at fetch time), and validate reporting credits errors only against the area that uses the photo.
- (same day, review round) An area page lists every place folder in its city, including other curators' unfilled scaffolds, so the Bangkok area page showed "TODO" cards with broken images and the reviewer flagged it against the area. *Would help:* the area page skipping places that still contain TODO placeholders (or fail validation).

## 2026-11-12 — Korea curator (orchestrating `./atr run` batches)
- A curator session ran `pkill -f "atr render"` to clear a stuck render. Every `claude -p` curator process has the full guide (which contains "atr render") in its command line, so the pattern killed two other parallel Korea runs (exit 143 at the same second, 10 min of work lost) and possibly other threads' runs. *Would help:* the guide/runner telling curators never to kill by pattern, and `atr render` having its own timeout so nobody needs to kill it.

## 2026-11-12 — Thailand orchestrator (runs 03-41-00, 03-48-01)
- When the curator's `claude -p` hits the account usage limit (`api_error: usage_limit_reached`, exit 1), `./atr run` prints **"✔ clean after 1 round(s) · nothing"** even though the session wrote nothing and its scaffolds were left full of TODOs (03-41-00 left 5 untouched place scaffolds; 03-48-01 never created its 3 areas + 1 place). The 03-41-05 run instead retried twice with "$0.000, 1 turns". *Would help:* treat `is_error`/usage-limit results as a failed run (no retries until reset), and say "usage limit, resets at …" in the summary.
- A pattern kill from another thread (`pkill -f "atr render"`, logged above by the Korea thread) killed three Thailand runs at once; their scaffolds stayed in places/ as TODO stubs and showed as broken cards on the Bangkok area page. I parked the untouched scaffolds outside the repo until they can be re-run.

## 2026-11-12 — Korea curator (Seoul views/nature batch)

- **PDF sources can't be read.** The Seoul Hiking Tourism Center puts its rental prices and trail guides in PDFs (seoulhiking.or.kr/theme/basic/img/guide-eng.pdf, 31 MB). This machine has no `pdftotext`/`pdftoppm` and no pypdf, and the Read tool's PDF mode needs poppler, so I couldn't open them. An `./atr pdf <url>` text extractor (or poppler in the toolchain) would help.
- **timeanddate.com is behind Cloudflare** for `./atr render` ("Just a moment…"). sunrise-sunset.org renders fine; maybe mention it in the guide as the sunset source.
- **`./atr links` reports seoulstart.com as blocked (HTTP 429)** even though `./atr render` opened it a minute earlier. I noted it in confidence_note as the hint says.
- **`./atr geo` got Wikidata HTTP 429** once (OSM results still came back; no harm done).
- Shell gotcha: `echo =====` fails in zsh (`=` expansion). Worth a line in the guide for anyone separating outputs.

## 2026-11-12 — Korea curator (Seoul food: mangwon-market, tongin-market-coin-lunchbox, jongno-3ga-pojangmacha)
- To keep `./atr render` from hanging I wrapped it in `timeout 90`, but macOS has no `timeout`/`gtimeout`, so all 10 background renders failed silently (32-byte "command not found" files). *Would help:* a `--timeout <s>` flag on `atr render` (it also removes any reason to kill renders by pattern).
- magazine.hankyung.com and siksinhot.com return Cloudflare / HTTP 429 to `atr render`, and seoulsearching.net returns a 403 bot check. The 2023 Hankyung price range for the Jongno tents could only be cited from a search snippet.
- `atr links` reports trvlogue.com as blocked (HTTP 429) even though `atr render` opened it minutes earlier.

## 2026-11-12 — Korea curator (Seoul stays: time-travelers-relax-hongdae, lazy-cube-hongdae, original-backpackers-dongdaemun)
- Several Seoul hostels (Original Backpackers, Zzzip) have **no January 2027 beds on sale on Hostelworld yet** (empty availability for every Dec–Feb date sampled), and Trip.com (sign-in wall), Booking.com (bot challenge, HTTP 202), Expedia and Hostelz (Cloudflare) all block `atr render`. So the guide's "mid-January price from a dated search" can't be met for those: I used the latest on-sale date and labelled it. *Would help:* guidance on what to do when the trip dates aren't bookable yet (e.g. `beds[].date` plus a "not on sale yet" flag the card can show).
- `atr links` reports the Hostelworld reviews JSON (`prod.apigee.hostelworld.com/.../reviews/`) as blocked (403), although plain curl opens it. It is the only way to read more than 3 reviews, so every stay page now carries a "blocked" info line.

## 2026-11-12 — Korea curator (Lion Super Club, Hongdae pub crawl, KBL basketball)
- **`atr render` can't change months or click tabs.** The KBL schedule (kbl.or.kr/match/schedule) always opens on the current month and ignores URL params. To read January 2027 I had to call the site's own JSON feed (`api.kbl.or.kr/match/list?fromDate=…&toDate=…`, which needs `Channel: WEB` and `TeamCode: KBL` headers) with curl. A reviewer can't reproduce that from the cited URL. It would help if `atr render` took a click or select step (e.g. `--click "text=1월"`), or if a page source could record a "how to reach this view" note.
- **Blocked hosts:** ra.co and klook.com return 403 even through `atr render`. djmag.com/top100clubs renders fine but fails `atr links` (403), so it shows up as "blocked".
- **Kakao Map** search pages render fine and are a good way to check whether a club still exists (Octagon has no Gangnam listing). But the rendered text has no place IDs, so I could only cite the search URL, not the place page.

## 2026-11-12 — Korea curator (Changdeokgung / Bongeunsa / Dongmyo)

- `./atr render "https://ticket.uforus.co.kr/web/main?shopEncode=&productGroupCode=02000001&lang=en" --wait 4` (the official Changdeokgung Secret Garden ticket site) never returned. It ran past the 120 s shell timeout and was killed at the 10-minute background limit. render seems to have no overall timeout of its own. **Would help:** a hard `--timeout` (default ~60 s) that prints whatever text it has plus "page never settled", instead of hanging.
- Program detail pages on templestay.com are only reachable through `javascript:fncReserve('<id>')` buttons, so neither `render` nor WebFetch gives the URLs. I had to curl the HTML and grep the ids. **Would help:** a `./atr render --links` option that also lists hrefs and the targets of onclick/javascript: links.

## 2026-11-12 · Korea day trips (DMZ, Suwon, Nami)

- `./atr render "https://koreafirsthand.com/dmz-tour-comparison/"` ran past the 2-minute tool timeout and then failed with "page.evaluate: Execution context was destroyed, most likely because of a navigation". The page redirects or reloads after load. It would help if render waited for navigation to settle, or retried once, and had its own `--timeout` flag.
- macOS has no `timeout` command, so I couldn't cap a slow `atr render` from the shell. A built-in timeout on render would fix this.
- `./atr media preview "File:남이섬 (4).JPG"` saved to `.cache/previews/4/`, because the slug drops the Hangul. Hangul file names give meaningless or colliding preview folder names.
- The Paju DMZ official notice text exists only in a rendered layout, and WebFetch returned just the title. `atr render --shot` worked: the screenshot showed the body text. Worth a line in the guide: when render text is empty, read the `--shot` screenshot.

## 2026-11-12 · Japan curator (Persona 5 Tokyo locations)
- The game wikis that map Persona 5 to real places (megatenwiki.com, megamitensei.fandom.com) can't be read: `atr render` gets the Cloudflare "Just a moment…" page from megatenwiki, an empty page from Fandom, and Fandom's `api.php` returns non-JSON to curl. I used the Japanese strategy wiki kamigame.jp (it renders fine) as the game-wiki source, but it lists the in-game areas, not their real-world models. **Would help:** a note in the guide on which game/anime wikis are reachable, or a cached-page fallback in render.
- `./atr media preview "File:A.jpg" "File:B.jpg"` silently previews nothing: only one File: argument is accepted, and there's no error. Previewing a shortlist means one call per file (each 10–60 s with Commons pacing). **Would help:** let preview take several files and build one contact sheet, like `fetch` does.
- `atr media preview "<query>"` sometimes ran past the 2-minute shell timeout (Commons pacing), with no `--limit` to keep it short.
- The P5 franchise has no tag with a stated interest. I used the free-form tag `persona` next to `anime`; nothing in `./atr taste` weights it.

## 2026-11-12 · Japan/Nagasaki curator (Gunkanjima batch)
- `./atr render` inside the default sandbox often failed with `net::ERR_CONNECTION_REFUSED` or "Execution context was destroyed" (ekitan.com every time). The same URLs loaded with the sandbox off. A note in `render --help` on retrying, or a `--retries` flag, would help.
- PDFs can't be read: `render` doesn't extract PDF text, and `Read` needs `pdftoppm`, which isn't installed. That blocked the Hachimantai drive map and Peach's fare sheets. An `./atr pdf <url>` text extractor would help.
- Operator landing-rate data was only in a bar chart with no printed numbers. I read it from a `render --shot` crop (sips), which is approximate.
- macOS has no `timeout`; `timeout 110 ./atr render …` fails with exit 127 and no output.

## 2026-11-12 · Japan curator (Tokyo ramen batch)
- `./atr geo` found nothing for full Japanese street addresses (`東京都渋谷区代々木2-14-3`, `東京都豊島区池袋2-60-7`), and the name `鬼金棒` matched a road in Kagawa. Searching by shop name sometimes worked (`風雲児`, `カラシビ味噌らー麺 鬼金棒`), but Hulu-lu never did. That left one approximate pin. **Would help:** a Japanese address geocoder (GSI's `msearch.gsi.go.jp/address-search` handles 番地-level addresses), or a `--near <station>` filter.
- `./atr render` prints text only, with no links, so I couldn't follow a news list to the notice it links to (Kyushu Jangara's reopening post) or open a Tabelog review in full. **Would help:** `--links` to print the anchor hrefs.
- Tabelog's Japanese pages (`tabelog.com/tokyo/...`) render empty, and the English pages sometimes return ERR_CONNECTION_REFUSED after a few calls in a row. Waiting a minute fixed it.
- With many curators fetching at once, `media fetch` for 4 files ran past 10 minutes. A shared queue or a visible "waiting N s for Commons" line in the output file would help.

## 2026-11-12 — China food/bathhouse curator (huashi-wanza-mian, pei-jie-hotpot-hongyadong, xian-biangbiang-roujiamo-luomashi, huxi-laolongtang-scallion-noodles, yang-space-bathhouse-lujiazui)
- **Commons HTTP 429 for 10+ minutes.** `./atr media fetch` with 2–3 files exhausted its 6 retries on the 2nd file each time; one photo per call with a 60 s gap was the only thing that worked. *Would help:* a queue mode that keeps going (longer backoff, resume) instead of failing after 6 tries.
- **sina.cn articles never render**: `atr render` lands on the sina.cn home feed (redirect) or "Execution context was destroyed". Many 2026 Chinese shop write-ups are only there. Same "context destroyed" error on chinatour.bswen.com and us.trip.com on the first try; `--wait 6–8` fixed bswen.
- `atr render` truncates long pages around 24–30k characters even with `--max-chars 120000`; FAQ sections at the end of guides were lost.
- `atr links` reports english.shanghai.gov.cn and thatsmags.com as timeouts and scmp.com as 403, although `atr render` opened all three today.
- No `timeout` on macOS: I wrapped renders in `perl -e 'alarm 100; exec @ARGV' ./atr render …`, which works. Worth a line in the guide until render gets its own `--timeout`.

## 2026-11-12 — Japan curator (Tokyo gaming: akihabara-retro-game-crawl, shibuya-parco-game-floor, square-enix-cafe-shop-shinjuku, 8bit-cafe-shinjuku)
- **Parallel `atr render` calls fail.** Five renders started at once in the background all returned `net::ERR_CONNECTION_REFUSED` (plain curl to the same hosts worked); run one at a time they succeed. *Would help:* render queues itself or says "another render is running" instead of a misleading network error. (Wrapped each call in `perl -e 'alarm 90; exec @ARGV'` since macOS has no `timeout`.)
- **Cloudflare blocks** `atr render` on tabelog.com and suruga-ya.jp, so Suruga-ya's Akihabara retro-game stores couldn't be sourced and were left out.
- **Dead official domains get squatted.** 8bitcafe.net (the bar's old site, still cited by guides) is now a casino spam page; the new 8bitcafe.tokyo renders no text (ASCII-art JS page). Google Maps via `atr render` was the only current proof the bar is open. A guide line on "Google Maps search URL is an acceptable open-now source" would help reviewers.
- `atr geo` found nothing for Super Potato, HEY, Shibuya PARCO or Paselabo Tower (Japanese or English names); coordinates came from the `@lat,lng` in a rendered Google Maps search URL.

## 2026-11-12 — Thailand curator (south areas + stays: krabi-railay, koh-phangan-koh-tao, the-yard-hostel-bangkok, mad-monkey-chiang-mai)
- **Area scaffold offers `short_name`, validator rejects it.** `./atr new area` writes `# short_name: TODO  # optional short form…`; filling it in gives `unknown field short_name` on areas. Either allow it on areas or drop the line from the area scaffold.
- **Hostelworld city search URL picks the wrong city.** `/pwa/s?q=Bangkok…&id=2` rendered Johannesburg hostels; the static list page `/st/hostels/asia/thailand/bangkok/` worked. A hostel page sometimes renders empty on the first try; `--wait 10` fixed it.
- **madmonkeyhostels.com redirects** `/chiang-mai` to a blog post and `/chiang-mai/bar` to the Siem Reap bar page, so the official Chiang Mai page couldn't be cited.
- Commons 429s again: `media preview` for two queries ran past 5 minutes; a 4-file `media fetch` gave up on the 4th file.

## 2026-11-12 — Thailand curator (day trips: maeklong-railway-amphawa, ayutthaya-temples-by-bike, erawan-falls; areas khao-yai, koh-samet)
- **`atr shot` raced another curator's build**: `page.goto: net::ERR_FILE_NOT_FOUND …/build/places/<id>/index.html` on the first try; the same command succeeded on retry. A per-run build dir (or a lock) would avoid this.
- **Commons 429s again**: a background `media fetch --area khao-yai` gave up on 1 of 3 files after 6 retries; a plain retry a few minutes later was needed.
- **`atr render` "Execution context was destroyed"** on en.wikivoyage.org/wiki/Ayutthaya on the first call; second call worked.
- The SRT Maeklong-line timetable is only a PDF image (thaitrainguide.com), so current train times rest on a travel blog. A PDF/image text extractor would help.

## 2026-11-12 — Thailand curator (Bangkok temples and views: grand-palace-wat-phra-kaew, wat-pho-and-wat-arun, wat-paknam-glass-stupa, golden-mount-wat-saket, mahanakhon-skywalk)
- **Commons 429s, worse with parallel curators**: 3 of 13 photo fetches failed even after the CLI's 5 retries; a background loop with 90 s pauses was needed. A shared, cross-process rate limiter (or a queue) in `atr media` would help when several curators run at once.
- **royalgrandpalace.th refuses connections** from this machine (`atr render`: ERR_CONNECTION_REFUSED), so the Grand Palace's official price/hours page couldn't be cited; three 2026 guides were used instead.
- `atr links` reports trvlogue.com as HTTP 429 although `atr render` opened it fine.

## 2026-11-12 — Thailand curator, resumed (Bangkok temples and views)
- **`atr links` reports every host as "the domain does not exist (DNS)"**, Wikipedia included, both in the sandbox and outside it, while `curl` and `atr render` open the same URLs (all 14 sources on my 5 pages returned 200, or 403/429 bot blocks for yourthaiguide.com and trvlogue.com). `nslookup` times out on this machine, so the checker probably resolves names itself (e.g. `dns.resolve`) instead of through the system resolver (`dns.lookup`). *Would help:* fall back to `dns.lookup`/a plain HTTP request before calling a link dead, and say "DNS unavailable" instead of "domain does not exist" when every host fails.

## 2026-11-12 — Thailand review-fix batch (stays, markets)
- `./atr links` reports `https://en.wikipedia.org/wiki/Bangkok` as dead ("the domain does not exist (DNS)") on six pages, repeatedly, while `curl` from the same machine returns HTTP 200 and other en.wikipedia.org links on the same pages pass. Looks like a cached or per-URL DNS failure in the link checker. Would help: retry DNS failures once, or show when a result came from cache.
- `book_ahead.method` has no value for a booking platform (Hostelworld/Booking). `website` renders as "Official website", which a reviewer flagged on a hostel whose only link is Hostelworld. Would help: a `platform` method (or derive the label from the first link's host).
- `./atr links` gets HTTP 403 from madmonkeyhostels.com and lubd.com, but `./atr render` opens both pages fine. Would help: links could fall back to the render browser for 403s before calling a source "blocked".

## 2026-11-12 · book_ahead links can't be phone numbers (Thailand curator)
- Tried: `book_ahead.method: phone` with a link `url: "tel:+6622465472"` (Saxophone Pub, Bangkok: phone-only bookings).
- Happened: validate rejects it ("not a full URL"). For phone-only venues there is no booking page, so I linked the guide page that states the number and put the number in the label.
- Would help: accept `tel:` URLs (rendered as a call button) when `method: phone`.

## 2026-11-12 — Fenghuang / Wulong cards
- `./atr media fetch`: Wikimedia Commons answered HTTP 429 on most downloads for over an hour (built-in retries ran out); earlier tries also failed with ENOTFOUND / UND_ERR_CONNECT_TIMEOUT. Shipped fenghuang-hemu-house and wulong-karst-day-trip with no photos.
- `./atr media preview` hung on rate limits instead of failing; had to stop it.
- `./atr links`: 12306 `queryG` URLs and Qunar time out from this machine (they need a session cookie, or block). Trip.com is reported "blocked".
- Ctrip train route pages for Fenghuang listed 0 trains; Ctrip sight pages show a bot check. Used 12306 directly (cookie from the init page before each query).

## 2026-11-12 — Thailand batch resume (photo re-fetch)
- `./atr links bang-krachao-bike-day` reports https://en.wikipedia.org/wiki/Bangkok as "dead — the domain does not exist (DNS)" twice in a row, while `curl -sI` on the same URL from the same shell returns HTTP 200. Looks like the link checker's resolver, not the page. Would help: retry DNS failures once, or report them as "unreachable" (warning) instead of "dead".
- `./atr media fetch` with several files in one call: Commons 429s ran out the built-in retries ("attempt 6 of 5") on most files. One file per call with ~20 s between calls worked better.

## 2026-11-12 · Commons HTTP 429 for 30+ minutes (Thailand curator)
- Tried: `./atr media fetch` for 3 photos (rajadamnern "Audience at Muay Thai match…", Khao San "Khaosan Road at night 1", "Rambutri Lukas Bergstrom"), spaced several minutes apart with the built-in backoff.
- Happened: every attempt ends "rate-limiting us (HTTP 429)", including "attempt 6 of 5" (the counter overruns its own max). Probably several curators share this IP.
- Would help: a shared, queued downloader across sessions (or a `media fetch --queue` that finishes later), and a fixed retry counter.
- Workaround: dropped those gallery photos; pages validate with the photos already on disk.

## 2026-11-13 — Japan ramen fix round: Commons 429 on every image download
- Tried: `./atr media fetch fuunji-tsukemen-shinjuku "File:…" --as …` (3 files in one call), then one file at a time with 90 s pauses between attempts.
- What happened: every download ended in "Wikimedia Commons is rate-limiting us (HTTP 429)" after the CLI's 6 retries, for well over 20 minutes. Searches and previews worked; only full downloads failed. Several curators share this machine/IP, so the pacing in one process doesn't help.
- What would help: a shared, cross-process queue/backoff for Commons downloads (lock file under .cache), or a `--from-preview` option to use the already-downloaded 960 px preview for gallery images.

## 2026-11-12 — Korea areas curator (chuncheon-hwacheon, gangneung, jeju)
- `./atr new area` scaffold includes a commented `# short_name:` line, but the area schema rejects `short_name` ("unknown field"). Either allow it on areas or drop it from the area scaffold.
- Wikimedia Commons rate-limited (HTTP 429) for several minutes while another curator was fetching; `media fetch` gave up after 6 attempts on every file of a 4-file batch. A shared, cross-process backoff (or a longer final wait) would help when several curators run at once.

## 2026-11-12 — Thailand curator, resumed (day trips + south areas)
- **upload.wikimedia.org hard-blocked this machine for 20+ minutes**: every original-file download returned `HTTP 429, retry-after: 600`, and a 10-minute pause with no requests from me did not clear it (other curators were probably fetching at the same time). `atr media fetch` retries 6× at 30 s, which is shorter than the server's `retry-after` and so only extends the block. *Would help:* honour `Retry-After`, download a ≤2560 px thumbnail (`/thumb/…/2560px-…`) instead of the original, and a shared cross-process queue. Five area photos (khao-yai elephant-herd, koh-samet sai-kaew-night, koh-phangan-koh-tao haad-rin-aerial + mango-bay) could not be fetched; the pages now use photos that were already downloaded.

## 2026-11-12 — Japan Persona 3 / Atlus batch
- **Collab events whose content is "details later"**: Fuji-Q × Persona 30th (4 Dec – 31 Jan) has official dates, but the attraction, food and goods are not announced yet. `when.confirmed` only covers *dates*; there is no field for "dates confirmed, content TBA". I put it in `confidence_note` and the prose. A `when.content_tbd: true` (shown as a chip) would help the reviewer and the traveler.
- **Franchise tags**: `persona` is free-form; the traveler's interest lives on `gaming`/`anime`. Fine, but `./atr taste` can't tell that a Persona card serves the "gaming" interest unless `gaming` is also tagged, so I tagged both.
- **Commons 429 again** (same as other curators today): `media fetch` failed on most files for 20+ min; the Fuji-Q card uses a typographic hero for that reason.

## 2026-11-12 — Japan gaming batch (Osaka/Kyoto)
- `./atr media fetch nintendo-museum-uji "File:Nintendo Museum Entrance.jpg"` failed with HTTP 429 on four separate tries over ~25 min (each retrying 6×), while a smaller file from the same search downloaded fine. Probably shared rate-limit with other curators running in parallel. Used the other photo as hero. Would help: a shared cross-session queue/cooldown for Commons, or a "fetch later" list the CLI retries on its own.
- No way to mark a place as "booking window closes on a fixed date" (Nintendo Museum: Feb 2027 lottery closes 30 Nov 2026). `lead_days` alone can't express "book before date X"; I put the date in `lead_time` and the steps.

## 2026-11-12 — Kyoto/Osaka ramen batch
- `./atr shot <id>` failed once with `ENOENT … build/places/shibuya-parco-game-floor/index.html` while another curator was building at the same time; a retry 20 s later worked. A per-run build dir (or a lock) would stop parallel curators breaking each other's shots.
- Commons kept returning HTTP 429 for one file (`File:Tennichi honten2.JPG`) across several retries over ~10 min, even though another fetch in the same call worked. With several curators sharing one IP, the backoff budget (5 attempts) runs out fast; a longer queue-and-wait mode (`--patient`) would help.
- (review fixes, same day) **No PDF/timetable reader.** Lomprayah's official timetable is only a heyzine flipbook/PDF of images; `atr render` shows nothing and pdftotext/pdftoppm aren't installed. I read it by rendering pages to PNG with a throwaway macOS PDFKit script in the scratchpad. *Would help:* `atr pdf <url> [--pages]` that saves page images to open with Read. Also: thaitrainguide.com returns HTTP 406 to curl but opens in `atr render`.

## 2026-11-13 — dead-link pass, Osaka ramen
- `./atr links` reported "connection refused" for unchi-co.com, hotpepper.jp, ramenmogi.com and gourmet-travel-life.com, but `curl` and `./atr render` from the same machine got HTTP 200 on all four at the same moment. I replaced them anyway, as the rule says. It would help if `links` said *why* (DNS, TCP, proxy) or retried through the same browser path that `render` uses, so working sources aren't thrown away.

## 2026-11-12 — Japan curator (persona-30th-ex-ueno, nintendo-museum-uji)
- **No way to express a booking *deadline*.** The Persona 30th exhibition's ¥2,700 advance price ends on a fixed date (20 Jan 2027 23:59), and the Nintendo Museum's February lottery closes on 30 Nov. `book_ahead.lead_days` only says "N days before the visit", so the hero shows "Book 1 day ahead", which the reviewer flagged as misleading. I put the deadline in `lead_time` and the steps. *Would help:* a `book_ahead.deadline` date the card and hero show as "Buy by 20 Jan".
- **No franchise tag with a stated interest.** Persona cards use the free-form tag `persona` next to `anime`/`gaming`; taste.yaml has no `persona` entry, so the game can't weight these cards by the traveler's Persona interest. *Would help:* the orchestrator adding a `persona` tag to taste.yaml (curators can't edit config).

## 2026-11-12 — Korea curator (Jeonju + Gyeongju area cards)

- **Commons 429s for long stretches.** `./atr media fetch` exhausted its 5 retries on two different Jeonju files several minutes apart, while other fetches in between succeeded. With several curators sharing the limit, the per-call backoff isn't enough. What would help: a shared queue/lock across sessions, or a `--wait` mode that keeps retrying for longer. Jeonju shipped with 3 photos (hero + 2) instead of 4.
- **`./atr shot` collided with another session's build**: `ENOTEMPTY, Directory not empty: build/areas`. Retrying worked. A per-session build dir or a lock would avoid this.
- **`./atr shot areas` slice labels**: several slices are labelled `country_map` but show area cards, so finding one country's overview map means opening slices at random. A `--country korea` filter or a slice named per country would help.
- **`./atr render` output gets cut at ~12k chars** by default (the hint about `--max-chars` is printed at the end, so it's easy to miss on long Wikivoyage pages).

## 2026-11-12 — Japan sushi batch
- `./atr media fetch` with 4 files sat 10+ min with no progress output when piped through `tail` (another curator was fetching at the same time). It would help to see per-file progress written to stderr or a log, so a session can tell "rate-limited, retrying in N s" apart from "hung".
- `./atr render` on tabelog.com works for /en/ pages, but Japanese pages and repeated calls return a Cloudflare "Just a moment…" page or ERR_CONNECTION_REFUSED after a handful of requests. It would help to show a clear "blocked by bot check" message instead of printing the challenge page as content.

## 2026-11-12 — cost_breakdown budget bar caps at 100% (Thailand fix pass)
- Tried: erawan-falls costs R$112.13 against the R$100/day Thailand budget. The hero chip says "112% of daily budget", but the cost block's bar says "100% of your R$ 100/day Thailand budget" (`Math.min(100, …)` in platform/lib/render/blocks.js cost_breakdown). A reviewer flagged the two numbers as a contradiction.
- Workaround: added a cost_breakdown `note` stating the real 112%.
- Would help: show the real percentage in the text and cap only the bar's fill width (maybe colour it as over budget).

## 2026-11-12 — Commons 429s block a whole Korea BBQ batch (Korea curator)
- Tried: `./atr media preview "Korean barbecue"` ran over 2 minutes and saved one thumbnail. Two `./atr media fetch` calls later (3 files, then 2) used up all 6 retries on HTTP 429 for each file after the first. Other curators share the same Commons quota.
- Workaround: kept the one hero I got (mapo-galmaegisal-alley), left out the gallery, and gave hongojib-solo-bbq and majang-meat-market-bbq typographic heroes. Commons has no free photos of either place anyway.
- Would help: a shared queue/cooldown across curator sessions, or a `media fetch --later` that queues files and retries them in the background.
- Also: `./atr render` of siksinhot.com gets a captcha (HTTP 429), so Siksin can't be used as an opened source.

## 2026-11-13 · Thailand fix pass (express boat, Talat Noi, Wat Samphran, Rajadamnern)
- `./atr media fetch` hit Commons HTTP 429 on all 6 retries for a single file (Talat Noi street art, Wat Samphran-3), while `./atr media search` still worked a minute earlier. Result: Wat Samphran ships with a typographic hero and Talat Noi without its street-art photo. Would help: a queue (`./atr media fetch --later`) that downloads when the limit clears, so pages don't lose photos that exist and are free.
- The cost_breakdown budget bar caps at 100% while the hero cost tile shows the real share (198%, 244%). Two reviewers flagged it as the page contradicting itself. As a workaround I wrote the real % in the prose. Would help: the bar showing the real share or an "over budget" label.

## 2026-11-12 — Thailand fix pass
- Same `atr links` DNS false positive as above: thaiholidayguide.com, chiangraitimes.com and kingpowermahanakhon.co.th are reported "domain does not exist (DNS)" on grand-palace-wat-phra-kaew, wat-pho-and-wat-arun and mahanakhon-skywalk, while `curl` from the same shell returns HTTP 200 a minute later. Hostelworld/Booking links on the stay pages pass. I kept the sources. *Would help:* retry with the system resolver before calling a link dead.
- Area hero `focus` can't lift a subject that sits low in a landscape photo above the title on phone (pai: canyon ledge stays under the hook whatever the y value), because the image already fits the height. *Would help:* a hero option to anchor the text higher, or a note in `./atr blocks hero` that y-focus has no effect on phone for wide photos.
- Commons answered HTTP 429 to `./atr media fetch` for 3 Gangneung photos on four tries over ~2.5 h (20:00–22:20Z) while Japan/Thailand curators were also fetching. `areas/korea/gangneung` went out with its one downloaded photo; the intended files are `File:Gyeongpo Beach 20220502 018.jpg` (gyeongpo-pines), `File:Anmok Beach 20220430 011.jpg` (anmok-coffee-cup) and `File:Daegwallyeong sheep farm2.jpg` (daegwallyeong-sheep-farm). Also: `./atr run`'s 60-min round timeout killed a 3-area session mid-fetch, leaving images referenced but never downloaded (validate caught it).

## 2026-11-12 — Korea stay date pass (Jan 10–20)
- Re-pricing 6 hostels × 10 nights with `./atr render` means 60 Chrome loads; I read Hostelworld's availability JSON feed with curl instead (one call per night) and rendered only a few dated pages to confirm. `atr links` reports that feed as 403/blocked, so it can't back a source by itself. **Would help:** an `atr hostel-prices <hostelworld-id> --from --to` command that prints the cheapest bed per night (and the free-cancellation deadline) and gives a link the checker accepts.
- `./atr render` on a dated Hostelworld URL with no beds prints "There is no availability…" for some properties (Jin's Paradise) but not others (Original Backpackers, where only the absence of prices shows it). A clear "sold out / not on sale" line in render output would avoid guessing.

## 2026-11-12 — Korea date pass (curator)
- **`./atr` broke for a few minutes in the middle of the run.** Every command failed with `SyntaxError: The requested module '../lib/validate.js' does not provide an export named 'validateAll'` (platform/cli/atr.js:9). It looks like a platform edit was half-applied while curators were working. I used curl for research until it recovered. Would help: platform changes that land atomically, or a clear "CLI is updating" message.
- **Ticket Tailor event ids**: `atr render` prints the listing text but not the link URLs, so I couldn't map dates to event ids (needed for the exact booking link) without curl and HTML parsing. Would help: an `atr render --links` option.
- **No transit-fare tool**: the Seoul-area distance fares (Line 1 to Suwon) aren't printed on any page I could open, so I had to calculate the fare from the rule. Would help: a fare lookup, or guidance on how to cite a calculated fare.

---
**Coder round 11 (2026-11-12) covered the log up to this line** (entries appended while it ran, on the evening of 12 Nov, may not have been seen; the transit-fare lookup is still open). What was fixed, and what was left open, is in `docs/DECISIONS.md` ("Coder notes, round 11A" and "round 11B"). New friction goes below.

## 2026-11-12 — photo re-fetch pass after round 11A (curator)
- The new shared Commons queue worked: about 40 files fetched one call at a time, with one short 429 (retry-after 10 s) absorbed by the cooldown and nothing left on `media queue`.
- **Author trimming leaves non-names twice.** `File:Hat Rin from above.jpg` gave the author `https://www.flickr.com/photos/zhaffsky` (a bare URL shown as "Photo: https://…"), and `File:Tenka-ippin main shop in Sakyo-ku…` gave `Tennichi honten.JPG : HmanJp derivative work: User:Clusternote`. I set them by hand in credits.yaml to `zhaffsky (Flickr)` and `HmanJp; derivative work by Clusternote`. *Would help:* turning a Flickr profile URL into its account name and parsing the "X derivative work: User:Y" pattern, or a warning when the trimmed author is a URL or contains a file name.
- `./atr gaps` wants 2 stay cards for every city with a place, including day-trip towns (Korea: paju for the DMZ, suwon, chuncheon, hwacheon). Nobody sleeps there on this route; the area cards say to day-trip from Seoul. *Would help:* skip the stay gap for cities whose places are all category `day-trip`, or a city-level `day_trip_from: seoul` flag.
- `./atr run` reports "✔ clean · nothing" with exit 0 when the claude session failed on `usage_limit_reached` after doing research (71 turns, $2.84, no files written). *Would help:* treat an `is_error` result (api_error usage_limit_reached / connection_failed) as not clean, and stop `--auto` queues on it.
- `./atr run`'s default 60-min round timeout killed a 3-area-page session (exit 143) mid-media-fetch with no summary cost recorded.

- 2026-11-13 (formula-hmong-cart-racing): `book_ahead.required` has no "unknown" state. `false` always renders the hero pill "No booking needed", which the reviewer flagged as stating free/no-booking entry as fact for an event whose entry rules are unannounced. Workaround: `recommended` + last year's announcement link labelled as such + "Unknown" in lead_time/notes. An `unknown` level (pill: "Entry rules unknown") would fit TBA events better.

## 2026-11-13 — Japan fancy ramen + mid-tier omakase pass (curator)
- **Michelin restaurant pages no longer show the award in text.** `./atr render` of guide.michelin.com/…/restaurant/<slug> prints name, address, price band and "Good for", but the distinction (Bib/stars) and inspector text sit behind a login wall and an icon. Workaround: the filtered list pages (`/en/jp/<region>/<city>/restaurants/bib-gourmand/<cuisine>`) do render, so I cited those. *Would help:* a note in the guide, or an `atr michelin <city> <cuisine>` helper that prints the current selection with distinctions.
- **Tabelog Japanese pages are Cloudflare-blocked** for `atr render` (English `/en/` pages work), and the English menu tab is often empty, so ramen prices had to come from dated review snippets.
- **Tabelog booking widget**: party-size options only appear with `--json` (plain text output drops the bare numbers), which made "does it take 1 guest?" hard to confirm.

## 2026-11-13 — Singapore (Jewel Changi) pages
- **`cost.currency: SGD` is rejected by `./atr validate`** ("expected one of: CNY | KRW | JPY | HKD | THB | USD | BRL"), although Singapore is on the route, `./atr new place --country singapore` scaffolds `currency: SGD` and `./atr fx SGD` works. Every Singapore page therefore carries one validation error I can't fix without faking the currency. I kept `SGD` (prices are really in SGD). *Would help:* add SGD to the currency enum (and to any currency formatting in the renderer).
- Author trimming kept a whole sentence for `File:Rain Vortex Night Jewel Changi Feb23 R16 06856.jpg` ("This Photo was taken by Timothy A. Gonsalves . Feel free to use my photos…"); fixed by hand in credits.yaml to `Timothy A. Gonsalves`.

## 2026-11-13 · Hong Kong curator (malls): weather and hours labels say "Dec–Jan" on a February leg
- Tried: weather block and hours.winter on Hong Kong pages (trip leg Feb 4–9, 2027).
- What happened: the rendered weather card says "Typical Dec–Jan low / high" and the hours box prefixes hours.winter with "Dec–Jan:", although the numbers and notes are for February. The reviewer flagged it as confusing.
- What would help: label these by the traveler's months for that country (from config/trip.yaml), e.g. "Typical Feb low / high".

- 2026-11-13 (Bangkok malls curator): `./atr shot siam-paragon-skywalk` never renders the static map (striped "OPEN MAP" placeholder, no file in .cache/maps for 13.74678,100.53495) across 4 tries, while iconsiam and terminal-21-asok built in the same runs get their maps. No warning is printed. Would help: shot/build printing why the map was skipped (tile fetch error?) and a way to retry it.

- 2026-11-14 (Nara curator): `./atr pdf "https://www.pref.nara.lg.jp/documents/6506/20260526105513.pdf"` printed only "✖ fetch failed" (no reason), while a plain `curl -A Mozilla` got the PDF (HTTP 200, application/pdf) and `./atr pdf <local file>` then read it fine. Would help: atr pdf saying why the fetch failed (TLS? UA?) and retrying with a browser UA / via Chrome like `links` does.
- 2026-11-14 (Nara curator): the hours box labels `hours.winter` "Dec–Jan:" on a Japan page whose winter notes are for Jan 20 – Feb 4 (same issue as the Hong Kong note above).

## 2026-11-14 — hero font: precomposed ē (U+0113) renders with a detached macron
- Tried: `name_romanized: Shànghǎi Cífú Lièchē` on shanghai-maglev. The bytes are precomposed (U+0113), not a combining mark.
- Happened: the reviewer saw the final "ē" render as "e" plus a separate bar in the hero italic, phone and desktop. Other pinyin tone marks looked fine.
- Did: dropped the optional `name_romanized` from the page instead of shipping a broken glyph.
- Would help: a hero italic font (or fallback) that covers Latin Extended-A, or a validate warning for characters the hero font lacks.

## 2026-11-14 — SCMaglev and Railway Park (Nagoya) curator
- **Reviewer can't see requests relayed by the planner.** The traveler asked for "bullet train stuff" in chat with the orchestrator; the reviewer grepped `./atr taste` and `feedback/`, found nothing, and flagged the page's museum justification as unsourced. Workaround: said in the prose and `confidence_note` that the request came via the planner. *Would help:* a place in config/taste.yaml (or a `requested_by_planner: <date, words>` field) for asks that arrive outside the game.
- `./atr render --expand` did not open the accordions on global.jr-central.co.jp/en/tickets/type/ (only the menu printed); the sub-pages (`/type/stopovers.html`) rendered fine. Also `--click "text=ALL"` timed out on akilocker.biz, so JR Nagoya locker prices stayed unknown.
- Weather/hours labels: the hours box again prefixes `hours.winter` with "Jan–Feb:" correctly here, so the earlier "Dec–Jan" label issue looks fixed for Japan.

## 2026-11-15 — Chongqing luxury night (westin-chongqing-liberation-square)
- Trip.com hotel pages still redirect to sign-in and marriott.com answers 403, but **Google Hotels renders dated prices** (Trip.com, official site, Booking.com, Expedia, all as nightly totals with taxes) with `./atr render "https://www.google.com/travel/search?q=<hotel>&hl=en&gl=us&ts=<token>"`. The `ts` token is a small base64 protobuf holding check-in/check-out and currency; I built it with a scratch script. *Would help:* an `atr hotel-prices "<name>" --from --to` helper that builds the token and prints the "All options" block.
- Booking.com hotel pages render prices fine one at a time, but 30+ dated renders queue behind the 3-slot render limit shared with other curators (about 40 min here).
