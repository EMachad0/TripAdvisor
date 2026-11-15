# Feedback format (v1)

The game **appends** events to JSONL files in `feedback/`. The curator only reads them (`./atr feedback`). Nobody edits or rewrites past lines.

- One JSON object per line, UTF-8, `\n` line endings. Append only.
- Every event has `v: 1` and `ts` (ISO 8601 UTC, e.g. `2026-11-20T14:03:00Z`).
- `session` is an opaque id per play session (e.g. `s-2026-11-20-a`). It's optional for duels and questions.
- Ids are place or area ids (`id` in `place.yaml` / area file name).
- Readers skip invalid lines with a warning (`file:line reason`) and never crash. Lines with an unknown `v` are skipped.
- JSON Schemas: `platform/schema/feedback-{swipes,duels,questions,notes,route}.schema.json`.
- Reader: `readFeedback(dir, { since })` and `tasteSummary(fb, { places, areas, cfg })` in `platform/lib/feedback/index.js` (also exported from `platform/lib/index.js`).

## `feedback/swipes.jsonl`

| field | type | required | notes |
|---|---|---|---|
| `v` | `1` | yes | |
| `ts` | string | yes | ISO 8601 |
| `session` | string | yes | |
| `round` | `area` \| `place` | yes | areas round or attraction swipe round |
| `id` | string | yes | area id or place id |
| `verdict` | `must` \| `maybe` \| `skip` | yes | |
| `country` | country id | no | `china`, `korea`, `japan`, `hong-kong`, `thailand` |
| `ms` | integer | no | time spent on the card |

When the same `(round, id)` is swiped twice, the **latest** verdict counts.

```json
{"v":1,"ts":"2026-11-20T14:05:30Z","session":"s1","round":"place","id":"yu-garden","verdict":"must","country":"china"}
```

## `feedback/duels.jsonl`

| field | type | required | notes |
|---|---|---|---|
| `v`, `ts` | | yes | |
| `session` | string | no | |
| `winner` | place id | yes | |
| `loser` | place id | yes | |
| `country` | country id | no | |
| `elo` | `{winner, loser}` numbers | no | the game's ratings **before** this duel (snapshot) |

```json
{"v":1,"ts":"2026-11-21T10:00:00Z","session":"s2","winner":"nanxiang-mantou-dian","loser":"yu-garden","country":"china"}
```

## `feedback/questions.jsonl`

History only since 2026-11-15: the site's Ask boxes were removed and nothing writes this file any more. Its answers were migrated to answer cards (`answers/*.md`, see `.claude/skills/trip-answers/SKILL.md`). The readers below still accept it, so curators keep the history in `./atr feedback`.

| field | type | required | notes |
|---|---|---|---|
| `v`, `ts` | | yes | |
| `session` | string | no | |
| `id` | place or area id | yes | the page the Ask box was on |
| `question` | string ≤ 2000 | yes | what the traveler asked |
| `answer_summary` | string ≤ 2000 | no | a short summary of the answer (not the full text) |

```json
{"v":1,"ts":"2026-11-21T11:00:00Z","id":"yu-garden","question":"Do I need to book with my passport?","answer_summary":"Walk-in usually fine in winter."}
```

## `feedback/notes.jsonl`

The traveler's own note on a card: the reason behind a verdict ("must, but only if I go in Jan", "skip: too cold"). Added 2026-11-10 (additive, still `v: 1`).

| field | type | required | notes |
|---|---|---|---|
| `v`, `ts` | | yes | |
| `session` | string | no | |
| `round` | `area` \| `place` | yes | which card: an area card or a place card |
| `id` | string | yes | area id or place id |
| `text` | string ≤ 2000 | yes | the whole note. `""` clears it |
| `country` | country id | no | |

One editable note per card. Every save appends the full text, and the **latest** line per `(round, id)` wins (the same rule as swipes); the older lines are the history. A note can exist on a card that hasn't been swiped yet. The game skips a save when the text did not change.

```json
{"v":1,"ts":"2026-11-21T10:05:00Z","session":"s2","round":"area","id":"harbin","text":"Must, but only if I go in January.","country":"china"}
```

Readers: `latestNotes(fb.notes)` (Map `round:id` → event; cleared notes dropped unless `{ keepCleared: true }`) and `currentNotes(fb, { places, areas })` (with card name and latest verdict). `./atr feedback` shows the current notes; `--new` shows notes changed since the cursor (a cleared note shows as "note removed"); `--place <id>` shows the note and its edit count.

## `feedback/route.jsonl`

The traveler's route inside one country leg, from the game's **Route** tab: the cities in travel order and the nights at each. Added 2026-11-12 (additive, still `v: 1`). Schema: `platform/schema/feedback-route.schema.json`.

| field | type | required | notes |
|---|---|---|---|
| `v`, `ts` | | yes | |
| `session` | string | no | |
| `country` | country id | yes | the leg |
| `stops` | list (≤ 30) | yes | the **whole** ordered list for that country, every save; `[]` = no stops |
| `stops[].area` | string (slug) | yes | the area id (`areas/<country>/<id>.yaml`), or the config's id for a stop with no area file |
| `stops[].nights` | integer 1–90 | no | left out while the traveler hasn't set it |
| `stops[].name`, `stops[].lat`, `stops[].lng` | string, numbers | no | only for a stop with no area file (copied from the config, e.g. Hong Kong) |

The **latest** line per `country` wins; older lines are the history. A country with no line uses the seed in `config/trip.yaml` (`countries[].route`, same stop shape; a stop may also be written as just its area id). The game skips a save when the list did not change, and an area id must be one of that country's area files or config stops.

```json
{"v":1,"ts":"2026-11-21T10:05:00Z","session":"s2","country":"china","stops":[{"area":"shanghai","nights":6},{"area":"beijing","nights":5},{"area":"huangshan"}]}
```

Readers: `latestRoutes(events)` (Map country → latest event) and `currentRoute({ cfg, areas, events })` (per leg, in trip order: stops with names and coordinates, nights placed vs available, `source: game | config | none`) in `platform/lib/route.js`. `./atr feedback` prints the current route ("## Route"); `--new` lists the legs re-planned since the cursor ("## Route changed").

## `feedback/game-state.json` (not an event log)

Small local state the game rewrites: `firstRun` and `firstSeen` (when each place/area id was first listed; ids first seen after `firstRun` are shown as "New" until swiped; areas use an `area:` prefix), `days` (the Board's what-if days per country; `config/trip.yaml` is never edited) and `locks` (`{christmas, nye}` → place id). Curators may read `locks` as a strong taste signal.

## The curator's "seen" cursor (not part of this format)

`places/_feedback-seen.json` holds `{ "ts": "<ISO timestamp>", "marked": "<when>" }`: the newest event the curator has processed. It lives under `places/` because that is the curator's territory. `./atr feedback --mark-seen [--upto <ts>]` writes it, and `./atr feedback --new` and `./atr next` read it (an event is new when its `ts` is later than the cursor; without the file everything is new). **The game never reads or writes it**, and it is not an event log.

## What the taste summary computes

- **Category and tag affinity**: average signal per category/tag (must +2, maybe +0.5, skip −1; duel wins +0.5, losses −0.25).
- **Top and bottom places**: swipe score plus an Elo computed from the duels (K = 32, start 1500).
- **Budget sensitivity**: average cost as a share of the country's daily budget, must vs skip.
- **Question themes**: booking, cost, timing, food, access, weather, safety, nightlife. Also recent questions and frequent words.
- **Notes**: the current note per card, with card name and verdict, newest first.
- **Missing ids**: ids referenced in feedback that no longer exist.

## Versioning

Additive optional fields keep `v: 1`. Renaming or removing fields, or changing meaning, bumps to `v: 2`. Readers must then handle both versions or skip the unknown one with a warning.
