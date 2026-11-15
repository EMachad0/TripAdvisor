# Curator platform: developer notes

Node 24, ESM, minimal deps (`yaml`, `sharp`, `playwright-core`, `@fontsource/*`). No build step.

## Layout

```
atr                      CLI wrapper (./atr …; or npm run atr -- …)
config/trip.yaml         trip facts for gaps/budgets (orchestrator-owned); `gaps:` thresholds, `areas_wanted` per country
config/taste.yaml        stated taste: goal, interests, tags, stay, must_do (orchestrator-owned)
platform/
  cli/atr.js             command table: new, validate, blocks, fx, media, build, preview, game, shot (places and areas), gaps, taste, next, feedback (--new, --place, --mark-seen), run, links, review (places and areas), geo, render, qr, schema
  cli/ui.js              colors + fix-it issue formatting
  lib/index.js           PUBLIC API for the game (read-only)
  lib/paths.js           repo root, data roots, fixture mode (--fixtures | ATR_FIXTURES=1 | ATR_DATA_ROOT=<dir>)
  lib/schema/dsl.js      tiny schema DSL: validation with fix-it messages, JSON Schema export, docs, examples
  lib/schema/enums.js    countries, categories, kinds, booking methods…
  lib/schema/blocks.js   block library: shape + summary + example per block (single source of truth)
  lib/schema/specs.js    place, area, credits specs
  lib/validate.js        schema + cross-checks (money, book-ahead, images, dates, coordinates, TODOs, ids)
  lib/load.js            loadPlaces/loadAreas/resolvePlace (real mode skips fixture: true)
  lib/render/            pure renderers: index.js (page, card, area card, index pages), blocks.js, util.js, escape.js (Markdown subset), icons.js, assets/atr.css
  lib/render/layout.js   balanced grid maths (gallery slots, quick-facts spans) shared by renderer + validator
  lib/booking.js         bookingLevel / bookingLinks / bookBadgeText / bookAheadList (single source for link+links, required|recommended|false)
  lib/qr.js              QR decoding (jsqr + sharp; tiles the image to find several codes)
  lib/staticmap.js       build-time OSM static map (tiles cached in .cache/tiles, maps in .cache/maps)
  lib/media/index.js     Commons search/fetch/preview (contact sheet), retry+backoff+throttle, license filter, sharp → WebP 640/1280/2048, credits.yaml
  lib/fx.js              frankfurter.dev (ECB) → fallback open.er-api.com; cache .cache/fx.json
  lib/build.js           static site → build/ (fixtures → build/fixtures/)
  lib/shot.js            playwright-core + installed Chrome; desktop 1440 / phone 390; light/dark
  lib/kinds.js           isStay / isAttraction / countsAgainstBudget / focusPos
  lib/taste.js           tasteSpec, readTaste/loadTaste, mustDoStatus, interest targets, `atr taste` text
  lib/render/area.js     renderAreaPage (pure), areaPlaces, areaMustDo
  lib/overview.js        country overview map: numberedAreas, overviewLayout (pure), countryOverviewMap
  lib/attribution.js     did a Bash command WRITE to a path or id? (commandWrites, commandWritesFile)
  lib/geo.js             `atr geo`: Nominatim + Wikidata candidates, cached in .cache/geo.json
  lib/pageview.js        `atr render`: a page's visible text (and a screenshot) from the installed Chrome
  lib/when.js            dated events: eventDates, whenLabel, tripOverlap, sameDayGroups, looksDated
  lib/links.js           link checker: collectLinks, checkUrl, linkReport, 24 h cache in .cache/links.json
  lib/review.js          independent review: reviewer args, answer parsing, reviews/<id>.yaml, loadReviews, reviewStatus
  lib/gaps.js            gap report (taste-aware; GAP_DEFAULTS thresholds)
  lib/next.js            `atr next`: gaps + taste → ranked one-line tasks
  lib/feedback/index.js  JSONL reader + taste summary
  lib/runner.js          headless curator loop (claude -p → validate → post-validate steps → resume with errors), runAuto, change attribution
  lib/scaffold.js        place/area templates
  schema/*.json          exported JSON Schemas (./atr schema --export)
  test/                  node --test suites + fixtures/ (fixture: true; never in the real build)
```

## Why a custom schema DSL (not zod/ajv)

One spec drives four things: validation, **fix-it messages** (path, problem, expectation, example value, "did you mean" for keys/enums/block types), `./atr blocks` docs/scaffold, and JSON Schema export. Validation issues carry `pathArr`, so file validation can attach **YAML line numbers**.

## Adding a block

1. `lib/schema/blocks.js`: add `BLOCKS.my_block = { summary, spec: t.object({...}), example: { type: 'my_block', ... } }`. Give each field `desc` and `example`.
2. `lib/render/blocks.js`: add `export function my_block(b, ctx)` that returns HTML, and register it in `RENDERERS`. Escape all content with `esc()`, `mdInline()` or `md()`. Wrap it with `section(inner, { width: 'col' | 'mid' })` or a full-width `<section class="block wrap">`.
3. Styles go in `lib/render/assets/atr.css`. Use tokens (`--surface`, `--ink-2`, `--accent`, …). Check light, dark and ≤ 560px.
4. Optional: add cross-checks in `validatePlace`.
5. `./atr schema --export`, `npm test` (the "every block example renders" test picks it up automatically), then `./atr shot yu-garden --fixtures`.

## Public API (`platform/lib/index.js`)

```js
import { loadPlaces, loadAreas, renderPlaceCard, renderPlacePage, renderAreaCard, styles, copyAssets,
         validatePlace, validateAll, readFeedback, tasteSummary, loadTripConfig, CATEGORIES } from './platform/lib/index.js';

const places = loadPlaces();                 // [{...place.yaml, _meta: {file, dir, mediaDir, credits}}], fixtures excluded
const areas = loadAreas();
copyAssets('public/assets');                 // atr.css + fonts
renderPlaceCard(p, { mediaUrl: (name, w) => `/media/${p.id}/${name}-${w}.webp`, href: `/place/${p.id}`, isNew: true });
renderPlacePage(p, { assetBase: '/assets/', mediaUrl, homeUrl: '/', places: Object.fromEntries(places.map((x) => [x.id, x])),
                     placeUrl: (o) => `/place/${o.id}`, placeMediaUrl: (o, n, w) => `/media/${o.id}/${n}-${w}.webp`,
                     budgetPerDay: 170, fragment: false, inlineCss: false });
renderAreaCard(a, { mediaUrl: (n, w) => `/areas/${a.country}/media/${n}-${w}.webp` });
const fb = readFeedback('feedback');         // {swipes, duels, questions, warnings}
```

Also exported for the game (2026-11-10): `fmtBRL`, `fmtLocal`, `titleCase`, `countryName`, `catLabel`, `shortName`, `themeBoot`, `themeToggle`, `LANG` (from `render/util.js`) and `staticMap` (from `staticmap.js`).

## The game (`game/`)

`./atr game` (or `npm run game`) runs `game/server.js`: a plain `node:http` server. `game/lib/{elo,pairing,board}.js` are pure and served to the browser as ES modules (also tested in Node); `game/lib/store.js` appends feedback (validated against `FEEDBACK_SPECS`) and keeps `feedback/game-state.json`. Client: `game/public/` (vanilla JS + `game.css` on top of `atr.css`). Place and area pages are `renderPlacePage` / `renderAreaPage` output plus their answer cards (`renderAnswersSection`) and a little glue (`place.css`, `place.js`).

Answer cards: `answers/<asked>-<slug>.md` (YAML front matter + Markdown body). `platform/lib/answers.js` loads and validates them (`checkAnswers`, `siteAnswers`; the folder follows `dataRoots().answers`, so fixtures and `ATR_DATA_ROOT` work), `platform/lib/render/answers.js` renders a card, `GET /api/answers` serves them to the Answers page and Today, and `platform/lib/publish.js` is `./atr answers publish`. Screenshots: `node game/tools/shots.js`.

- Booking: always go through `bookingLevel(place)` ('required' | 'recommended' | 'none') and `bookingLinks(place)` (handles `links` and legacy `link`); never read `book_ahead.required`/`link` directly. `bookAheadList(places)` gives the game's book-ahead list (required first, then by lead_days).
- Pass `staticMap: { url, width, height }` to show a map image (`staticMap(lat, lng, { zoom })` from `lib/staticmap.js` makes one; the build does it per place). Pass `cheapMealBrl` (from `config/trip.yaml` `cheap_meal_brl`) for food pages. Helpers: `countsAgainstBudget(place)` (use it for the board's budget check: food places default to false), `bookingLinks(book_ahead)` (normalises `link`/`links`), `gallerySlots`, `factSpans`.
- Places without a photo: `renderPlaceCard` renders a typographic card (category gradient + local-script name), so the game needs no special case.
- Renderers are pure (data in, HTML string out). Cards use the `.atr-card` / `.area-card` classes from `atr.css`, and `data-cat` sets the category accent color.
- Theme: `prefers-color-scheme` plus a `data-theme` attribute on `<html>` (toggle stored in `localStorage['atr-theme']`, wrapped in try/catch).
- Place media files: `<place>/media/<name>-<width>.webp`. Widths are listed in `credits.yaml`.
- Load options: `{ fixtures: true }` for the test data, `{ root }` for another data root.

## Taste, gaps and next

```js
import { loadTaste, mustDoStatus, isStay, isAttraction, gapReport, nextTasks, FAME_CHIP, flagChips } from './platform/lib/index.js';

const taste = loadTaste();                    // config/taste.yaml, or null (missing or malformed: see `./atr taste`)
mustDoStatus(taste, places, areas);           // [{ key, said, hint, country, city, want, have, covered, claims: [{id, type}] }]
places.filter(isAttraction);                  // stays (category stay / kind Stay) are not attractions
nextTasks({ count: 5, country: 'china' });    // { tasks: [{ rank, kind, country?, task, why }], total }
```

- **Taste file.** `readTaste()` returns `{ file, exists, taste, issues }`. Fixture mode and `ATR_DATA_ROOT` use `<root>/config/taste.yaml` when it exists (the fixtures have one); `ATR_TASTE_FILE` or `opts.tasteFile` point anywhere. `validateAll()` adds a `kind: 'taste'` result only when the file has issues.
- **New place fields.** `fame` (`iconic | popular | hidden`, optional) and `must_do` (a key of the taste file; also on areas). `flagChips(item)` renders the "On your list" / "Hidden gem" / "Icon" chips (`.chip--flag`); cards, heroes and area cards include them already.
- **Stays.** Category `stay` ⇔ kind `Stay`. `cost` is one night in the cheapest bed, `countsAgainstBudget()` is false by default, cards get `.atr-card--stay` and "/ night". `bookAheadList()` items carry `stay` and `category`. The `stay` block renders the "The stay" panel.
- **Gaps.** `gapReport()` returns `{ items, stats, mustDo, thresholds, hasTaste }`. `stats[country].places` counts attractions only (same as `attractions`); `stays`, `fame`, `areas`, `areasWanted` are new. Item kinds added: `must-do`, `stay`, `taste`, `discovery`. Thresholds: `GAP_DEFAULTS` in `lib/gaps.js`, overridden by `gaps:` in `config/trip.yaml` (`balance_min_places`, `under_target_ratio`, `over_target_ratio`, `hidden_share_min`, `areas_wanted_default`). Without a taste file the old flat balance rules apply.
- **Next.** Order: pages with validation errors, then open must-dos (route order) with one areas task after every second one, empty fixed cities, stay cards, category deficits, other page repairs, new feedback. "New" feedback means events dated after the newest `last_updated` of any place or area.
- **Focus.** `hero.focus` and gallery `focus` accept the keywords or `"x% y%"`; `focusPos()` maps both to `object-position`.

## Quality gates and dated events (round 6)

```js
import { eventDates, whenLabel, tripOverlap, sameDayGroups, loadReviews, reviewStatus, renderPlacePage } from './platform/lib/index.js';

eventDates(place);                 // [{ from, to }] ISO strings, sorted; [] when the place is not date-bound
whenLabel(place);                  // "31 Dec only" | "17 Dec – 21 Feb" | when.label | null
tripOverlap(place, cfg);           // 'always' (no `when`) | 'full' | 'partial' | 'none'
sameDayGroups(places);             // [{ date, ids, places }]: one-day events on the same date (pick one)
const reviews = loadReviews();     // Map id → reviews/<id>.yaml
reviewStatus(place, reviews);      // { state: 'none' | 'pass' | 'fix' | 'stale', reviewed, issues }
renderPlacePage(place, { review: reviewStatus(place, reviews) });   // 'pass' shows "Fact-checked 10 Nov 2026" in the footer
```

- **`when`** is optional on places and areas. `flagChips()` adds the calendar chip, so cards, heroes and area cards show it; quick facts get a "When" cell. A dated place in a country without trip dates counts as `'full'`.
- **Links.** `./atr links [<id>…|--all] [--fresh] [--json]`. Statuses: `ok`, `dead` (error, exit 1), `moved` and `timeout` (warning), `blocked` (info). Hosts in `BOT_WALLED` are never fetched. One request per host at a time, four hosts at once, 15 s timeout, a generic browser User-Agent. `ATR_OFFLINE=1` skips the check. `gapReport()` reads `.cache/links.json` only.
- **Duplicates.** `findDuplicates(places)` backs a `validate --all` warning on both files: same `name_local`, or within 80 m with at least half of the shorter name's words shared. A stay and an attraction never match; a dated event only matches another event with overlapping dates.
- **Reviews.** `reviews/` is a top-level data dir (fixture mode: `platform/test/fixtures/reviews/`), written only by `./atr review`. A review is `stale` when the sha256 of `place.yaml` differs from its `content_hash`; stale findings are not shown as open. The reviewer session gets `docs/REVIEWER-GUIDE.md`, the tools `Read, Glob, Grep, Bash, WebSearch, WebFetch, Agent, ToolSearch`, deny rules for every edit tool and for `./atr new|media|run|review|schema`, and `--json-schema`, so the answer arrives as `structured_output`. If that is missing the runner looks for a fenced block or bare JSON in the text, and asks once more when the answer does not validate.
- **must_do `type`.** `place` (default), `area` or `stay`. With an explicit type only that kind of page covers the item; without one any claim does, as before.

## Area pages, overview map and the feedback cursor (round 7)

```js
import { renderAreaPage, renderAreaCard, renderAreasPage, renderCountryMap, countryOverviewMap, mustDoStatus,
         newFeedback, placeFeedback, readSeen } from './platform/lib/index.js';

renderAreaPage(area, {                       // pure, like renderPlacePage
  assetBase: '/assets/', homeUrl: '/areas', mediaUrl: (n, w) => `/areas/${area.country}/media/${n}-${w}.webp`,
  places,                                    // every loaded place; the page picks the ones whose city is in area.cities
  placeUrl: (p) => `/place/${p.id}`, placeMediaUrl: (p, n, w) => `/media/${p.id}/${n}-${w}.webp`,
  mustDo: mustDoStatus(taste, places, areas), staticMap: { url, width, height }, number: 2, fragment: false,
});
renderAreaCard(area, { href: `/area/${area.id}`, number: 2 });     // both optional; without href the card is unchanged
const m = await countryOverviewMap(areasOfOneCountry);            // { file, width, height, zoom, pins: [{ id, name, n, x, y }] } | null
renderAreasPage(areas, { areaUrl: (a) => `areas/${a.id}/`, countryMaps: { china: { url, width, height, pins: m.pins } } });
newFeedback(readFeedback(dir), { places, areas });                // events after the cursor, grouped for action
```

- **Area files** may carry `blocks` (`AREA_BLOCK_TYPES`: hero, highlights, prose, gallery, quote, tips, weather, faq, sources), `lat`, `lng`, `fame`, `getting_around`, `confidence_note`. Place-only blocks are a validation error with a fix-it message. The area hero block needs no `hook`; its photo defaults to `image`.
- **Build.** `build/areas/<id>/index.html` for every area, `build/areas/<country>/overview.webp` when 2+ areas of that country have coordinates. Area media stay in `build/areas/<country>/media/`. `buildSite()` also returns `areaPages`.
- **Page order.** hero, facts strip, lede (`why`), the curator's blocks, winter panel (only without a `weather` block), "On your list here", "Researched so far" (attractions, then stays), map, sources. Each part has `data-block` (`hero`, `facts`, `winter`, `must_do`, `places`, `map`, `sources`, plus the block types) for `./atr shot <area-id> --section …`.
- **Overview map.** `overviewLayout()` picks the largest zoom (2–9) at which every pin fits with padding, and returns pin positions in % of the image, so pins are HTML overlays. Areas are numbered north to south; cards on the areas page follow the numbers. One 1200×720 image per country, about 20 tiles, cached like place maps; with `ATR_OFFLINE=1` and no cached tiles the map is left out.
- **Shots.** `./atr shot <id>` takes a place id first, then an area id; `--area` forces the area when both exist. Area shots are named `area-<id>-…`.
- **Feedback cursor.** `places/_feedback-seen.json` (`readSeen`, `markSeen`, `seenFile`). `newFeedback()` returns `{ since, latest, counts, questions, musts, skips, areaMusts, signals }`; the latest verdict per card counts. `nextTasks()` uses the cursor (pass `seen` to override it in tests).
- **`faq` block** on places and areas. **Cost check.** `validatePlace` warns when the cost block's non-optional total differs from `cost.local`, or when the R$ total would be displayed differently from `cost.brl`.

## Round 8: what real runs changed

- **A run is judged on its own files.** `runCurator` validates everything but counts (and sends back) only errors in the pages its session touched. Errors elsewhere go to `summary.other_errors` and one log line. Without any tool events in the stream (tests with a bare fake), every file counts.
- **Attribution.** A page is the session's when a `Write`/`Edit` call names one of its files, or a Bash command writes to it: a mutating `./atr` command with the id (`new`, `media fetch|add|remove|prune`; `--name` is slugged), a redirect, `mv`/`cp`/`rm`/`sed -i`/`tee`…, or an inline script (`python - <<EOF`, `node -e`) that names it. Reading (`cat`, `head`, `grep`, `./atr validate|shot|links`) is not touching. The same test decides violations. Review files the runner wrote in this run are never violations.
- **Cost.** `total_cost_usd` of a resumed session is cumulative. `sessionCost(result, prevTotal)` returns the cost of one call (from `model_usage_since_last_result`, else the difference). `rounds[].cost` is per round, `rounds[].cost_session_total` the raw value, `summary.cost` the true sum.
- **Not clean.** `summary.why_not_clean` and `pages[].problems` say why in plain words; `pages[].validation` is `ok` or `N error(s)`. After review feedback the session gets the fix round plus one spare, so a fix that breaks validation still ends in a re-review.
- **Area reviews.** `./atr review <area-id>` (`--area` when a place shares the id); `reviews/<id>.yaml` has `type: place | area` (missing = place). `reviewStatus()` works on areas; the runner gate reviews changed areas; `gaps`/`next` treat area findings like place findings.
- **New fields.** `must_do_note` (places, areas), `location.approximate` / area `approximate`, `cost_breakdown.items[].estimate`, `stay.beds[].url`, `stay.rating.atmosphere`, credit `area`.
- **Media.** `slugify` drops apostrophes; `folderSlug` gives CJK-only queries a hashed preview folder; `fetchCommonsMany` fetches several files paced; `media list|prune --area <id>` work on the photos recorded for that area (`area` in `credits.yaml`) and leave untagged ones alone.
- **Links.** A timeout is retried once with twice the time (15 s, then 30 s).
- **Hero.** The scrim is the background of `.hero__content`, so it always covers the whole text block; chips wrap; the hero grows with its content.

## Round 9: route notes, `when.kind`, `when.weekly`

- **`trip` option.** `renderPlacePage`, `renderPlaceCard`, `renderAreaPage`, `renderAreaCard`, `renderAreasPage` and `flagChips(item, tag, { trip })` take `trip`: the trip config (`{ countries: [{ id, from, to }] }`) or the `{ from, to }` window of the item's country. `renderIndexPage` uses its `countries` option. With it, a dated page whose dates miss the route shows a "Not on your route" chip and "Not on your route: you're in Hong Kong 19–22 Jan" in the When quick fact; a partial overlap shows the usable days in the quick fact. Without it nothing is shown. The build passes `config/trip.yaml`.
- **`routeNote(item, trip)`** returns `{ state: 'none' | 'partial', chip, text }` or null.
- **`when.kind`**: `only` (default), `season`, `best`. `whenLabel`, `whenTitle` and the chip class (`chip--when-<kind>`) follow it. `singleDay` and `sameDayGroups` only count `only`. For `best`, an off-route date is an info line and no gap, and the chip reads "Best dates not on your route".
- **`when.weekly`**: weekdays inside the ranges. `eventDays(item)` gives the real days (consecutive ones merged); `eventDates(item)` still returns the ranges as written. `tripOverlapInfo` uses the real days.
- **`faq.items[].correction`**, `cityLevel(question, place, areas)` and the `city_level` field on `newFeedback().questions[].items[]`.
- **Stays** never render a fame chip. **`gapReport`** adds `area-missing` (a city with 2+ places and no area covering it); `nextTasks` turns those into area tasks after the must-do items.

## Round 10: what a run did, and re-reviews

- **`summary.content`** is now only what the session itself created or changed (the same attribution as `pages`). The rest of the content diff is in `summary.also_changed_in_repo` with a note; the CLI prints it as one dim line and keeps it out of the headline and the `--auto` table.
- **Re-review.** `reviewPlace` keeps a copy of the file it reviewed in `.cache/reviewed/<id>-<content_hash>.yaml` (next to the data root). When a page has an earlier review of the same type and that copy exists, the reviewer gets `rereviewPrompt`: the earlier blockers and shoulds, numbered, and `lineDiff` of the YAML since then. It answers with `earlier: [{ n, status: 'resolved' | 'open', evidence }]` (required by `REREVIEW_JSON_SCHEMA`) plus `issues`. An earlier finding it calls open, or leaves out of `earlier`, stays open even if it is not repeated in `issues`. The review file gains `resolved: [{ field, problem, evidence? }]` and `rereview_of`. No copy, or `./atr review <id> --full`, gives a full review.

## Screenshots

Real shots go to `build/shots/`, fixture shots to `build/fixtures/shots/` (ids can clash). Tall full-page shots are also sliced into `<id>-<device>-<theme>-sNN.png` (phone 1100 px, desktop 1500 px, 60 px overlap; `--no-sections` to skip). The CLI prints which blocks each slice shows (from the `data-block` bounding boxes collected during the capture; `sliceMap()` in `lib/shot.js`). `--only` is an alias of `--device`. `--section <type>` takes an element screenshot at 2× of the first block with `data-block="<type>"` (the renderer tags every block root). `atr shot` writes full-page shots at 1× (Chrome can't capture more than 16384 device px tall) and `<id>-phone-<theme>-top.png`, the first phone screen at 2×. Before capturing it scrolls through the page (lazy images), sets `loading=eager` and freezes the hero height (a full-page resize would otherwise re-layout `vh` units).

## Issue levels

Validation issues are `error` (exit 1), `warning`, or `info`. Info lines are hints, e.g. page text vs booking level; they're hidden with `--quiet` and not counted.

## Offline / tests

`ATR_OFFLINE=1` makes static maps use only cached tiles (no network). The CLI tests set it.

## Headless runner

`./atr run "<task>"` runs:
`claude -p <task prompt> --output-format stream-json --verbose --permission-mode dontAsk --allowedTools Read,Write,Edit,Bash,WebSearch,WebFetch,Glob,Grep,Agent,ToolSearch --disallowedTools Edit(./platform/**),Write(./platform/**),… --append-system-prompt <rules + CURATOR-GUIDE.md> --effort medium`.

- **Permissions.** With `dontAsk`, a tool that needs permission runs only if it is on the allow-list; anything else is denied without a prompt. `Agent` (subagents, e.g. the web-fetch helper) and `ToolSearch` need no permission and ran before they were listed; they are on the list now so it matches what sessions use. The deny rules cover `platform/ docs/ config/ feedback/ game/` and the root files, win over the allow-list, and apply to subagents. `Bash` can still write anywhere, which is what the attribution below catches.
- **Loop.** After each round it runs `validateAll()`. Errors in places/areas are sent back to the same session (`--resume <id>`), up to `--max-rounds`. Errors in `config/taste.yaml` are not: the curator can't fix them.
- **Post-validate seam.** `POST_VALIDATE_STEPS` (or `opts.postValidate`) is a list of `async ({ task, dir, round, fixtures, content }) => ({ name, ok, report })`. Steps run only when validate is clean. A step that returns `ok: false` gets its `report` sent back to the session like validation errors, and the run isn't clean until every step passes. The list is empty today; link checks and a review pass go here.
- **Logs.** `runs/<timestamp>/`: prompts, commands, the raw stream-json, stderr, validation per round, `final-report.md` and `summary.json` with `content` (place and area ids created, changed, deleted), `violations`, `changed_elsewhere`, `cost` and `minutes`.
- **Attribution.** A violation is a file outside `places/` and `areas/` that the session itself wrote: a `Write`/`Edit`/`NotebookEdit` call on that path in the stream (subagent events included), or a changed file whose path appears in a `Bash` command. Every other file that changed during the run goes to `changed_elsewhere`, since another process probably did it.
- **Gates.** After a clean validate and any custom post-validate steps: (1) `links` on the pages the session created or changed; dead links go back to the session. (2) one reviewer session per changed place; if a verdict is `fix`, the blockers and shoulds go back to the curator session once (`--review-rounds`, on top of `--max-rounds`), then only those places are reviewed again. A run is clean when validate, links and the final reviews all pass. `--no-links` and `--no-review` skip a gate; fixture mode skips both. "Changed by the session" means the id appears in one of its Write/Edit paths or Bash commands, because another curator may be working at the same time. `summary.json` has `pages` (per page: change, links, review verdict, open issues) and `cost`, `cost_curator`, `cost_review`.
- **Auto.** `./atr run --auto [N]` takes the top task of `./atr next`, runs it in its own session and `runs/` folder, recomputes the list and repeats N times. A task is never tried twice in one invocation. `--dry-run` prints the tasks and commands.
