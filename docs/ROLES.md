# Roles and boundaries

The agent that writes code must **not** be the one that picks places. Subagents run at **medium effort**.

| Role | Owns | Never touches |
|---|---|---|
| **Orchestrator** (main thread) | Talking with the traveler, splitting days between places, final write to the trip page (after asking) | Writing places data or app code itself |
| **Curator / researcher** (subagent) | Everything under the places data dir: places, areas, place pages ("views"), media, sources | App/platform code |
| **Coder** (subagent) | The game app and the curator platform (schemas, renderer, CLI, server) | Place content. Treats places data as read-only input |
| **Reviewer** (headless session, `./atr review`) | `reviews/<id>.yaml`: an independent fact-check of a place page against its sources, the screenshots and the traveler's taste | Everything else. It never edits a place; the curator fixes what it finds |

**Coder: never leave a platform file half-written.** Curators run `./atr` against the same checkout at any moment. Change source files with the Edit tool, or write a temp file and rename it over the original; never rewrite one with sed, a shell redirect or a script that truncates first.

## Data the curator maintains (per place)

Minimum: name, city, country, type/category, short why, cost estimate (local + R$), book-ahead info (needed? how far ahead? how: passport, app, site), sources (URLs, checked date).

Plus a rich, pretty **place page** (see [CURATOR-PLATFORM.md](CURATOR-PLATFORM.md)) to get the traveler interested.

## Feedback loop

```
traveler plays (swipes, duels, questions)
        │  logged to files by the app
        ▼
curator reads feedback ──► adds / refines places & pages
        │  validated by the platform
        ▼
app shows new cards (marked "new")
```

The app writes only feedback files. The curator writes only places data. Neither edits the other's files.

What the traveler **said** they want lives in `config/taste.yaml` (owned by the orchestrator, from [TASTE.md](TASTE.md)). What they **do** in the game lives in `feedback/`. The curator reads both (`./atr taste`, `./atr feedback`) and writes neither.

## Who checks the curator

The curator never grades its own page. `./atr run` sends each new or changed page through three gates: `validate` (structure), `links` (every URL opens) and `review` (a fresh reviewer session re-opens the sources and checks the facts). Review findings go back to the curator to fix.
