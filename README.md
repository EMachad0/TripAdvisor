# Asia Trip Ranker

A trip-planner site and a curator platform for a solo, budget-minded trip through China, Korea, Japan, Hong Kong and Thailand (Dec 2026 – Feb 2027). The site (`apps/web`, SvelteKit with a self-hosted Convex backend) has Today, Trip, Places, Decide, Money and Prep; its Decide part is a game that ranks attractions (sights, food, bars, parties, odd local experiences).

The game produces a **ranking**, not a schedule. The ranking is the input for deciding, together with Claude, how to split days between places.

## Docs

| File | What it covers |
|---|---|
| [docs/TRIP.md](docs/TRIP.md) | Trip facts: dates, budgets, traveler profile, the trip page |
| [docs/GAME.md](docs/GAME.md) | Game design: funnel, swipes, duels, board, balance, book-ahead, answer cards |
| [docs/ROLES.md](docs/ROLES.md) | Who does what: curator vs coder, the data boundary, feedback loop |
| [docs/CURATOR-PLATFORM.md](docs/CURATOR-PLATFORM.md) | Spec for the platform that makes the curator's job easy and fully AFK |
| [docs/STATUS.md](docs/STATUS.md) | Where things stand, open questions, next steps |
| [docs/CURATOR-GUIDE.md](docs/CURATOR-GUIDE.md) | What a curator reads first: format, blocks, `./atr` commands, quality bar |
| [docs/PLATFORM.md](docs/PLATFORM.md) | Platform developer notes and the read-only API for the game |
| [docs/FEEDBACK-FORMAT.md](docs/FEEDBACK-FORMAT.md) | JSONL feedback files the game writes (swipes, duels, notes, route; questions is history) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisions made while building the platform |
| [docs/TASTE.md](docs/TASTE.md) | What the traveler said they want; the machine-readable copy is `config/taste.yaml` |
| [docs/DESIGN.md](docs/DESIGN.md) | The four target screens (Fold inner and cover, MacBook, monitor), breakpoints and the visual language |
| [docs/REVIEWER-GUIDE.md](docs/REVIEWER-GUIDE.md) | Brief for the independent reviewer that fact-checks curator pages (`./atr review`) |
| [docs/DEPLOY.md](docs/DEPLOY.md) | The hosted site: where it runs, what lives where, how a change ships |
| [docs/migration/DEV.md](docs/migration/DEV.md) | Working on the app: install, local Convex, dev server, tests, e2e |

Quick start: `corepack pnpm install && ./atr --help`. The site runs at https://trip.187.53.115.237.sslip.io; to run it locally see [docs/migration/DEV.md](docs/migration/DEV.md). The trip's live data is in Convex (`./atr trip pull` copies it to `.cache/trip-live/`; `trip/*.json` is a snapshot from the cutover); see [docs/TRIP.md](docs/TRIP.md).

Questions about the trip are answered by Claude Code agents in this repo and published as answer cards: `answers/*.md`, checked with `./atr answers --check`, shipped with `./atr answers publish <file>` (see `.claude/skills/trip-answers/SKILL.md`).
| [docs/CURATOR-GUIDE.md](docs/CURATOR-GUIDE.md) | **Curators read this first**: workflow, format, blocks, quality bar |
| [docs/PLATFORM.md](docs/PLATFORM.md) | Developer notes: architecture, adding blocks, API for the game |
| [docs/FEEDBACK-FORMAT.md](docs/FEEDBACK-FORMAT.md) | JSONL feedback files the game appends to |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Layout and format decisions |

## Platform quick start

```bash
corepack pnpm install
./atr --help                 # every command has --help
./atr validate --fixtures    # validate the test fixtures
./atr shot yu-garden --fixtures
corepack pnpm test           # every workspace package's tests (platform, packages, apps/web)
```

## Ground rules (short version)

- At most **one attraction per day**: days in a place cap how many top picks fit there.
- **No day-by-day schedule** is generated.
- The **curator** (a research subagent) owns the places data. The **coder** (a separate subagent) owns the app and treats the data as read-only input.
- Final picks go to the trip page's `places` collection **only after the traveler approves**.
