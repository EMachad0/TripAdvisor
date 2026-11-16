# E2E content root

`ATR_ROOT` for Playwright and the e2e seed (`scripts/convex-local.sh seed-data`): tests read this content, never the
real `places/`, `areas/`, `answers/` or `config/`, so a curator's commit cannot break them.

- `places/` and `answers/` link to `game/test/fixtures` (the game's test places and answer cards).
- `areas/` are the game fixture areas with coordinates added, plus one city area per route stop, so the route map,
  the overview and the area deck have data. `areas/<country>/media` link to the game fixture images.
- `config/trip.yaml` is a fixed copy of the trip shape (six legs, route seeds, a config-only stop with coordinates).

Every file is a fixture (`fixture: true`); the app loads them because Playwright sets `ATR_CONTENT_FIXTURES=1`.
