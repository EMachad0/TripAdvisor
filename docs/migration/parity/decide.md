# Parity: slice F, the Decide overview, Duels, the Board and Holiday picks

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

## Overview (`/decide`, was `#/game`, also `#/home`)

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

## Duels (`/decide/duels`, was `#/duels`)

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

## Board (`/decide/board`, was `#/board`)

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

## Holidays (`/decide/holidays`, was `#/holidays`)

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

## Cross-cutting

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Background refresh skipped while a duel is animating | `holdRefresh()` during the pick pause, a lock and a mini-duel pause | |
| [x] | A refused write shows "Couldn't save …: reason" and the optimistic change rolls back | `reportRefusal`; Convex drops the optimistic patch | Guest and frozen keep write.ts's words. |
| [x] | Reduced motion: no animations, no confetti | `reducedMotion` (MediaQuery) | |
| [x] | Clock times show their UTC offset | Notes and facts through TzText / NoteSnip | The Decide screens show dates, not clock times, except inside free text. |
