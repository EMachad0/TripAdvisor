# Asia Trip Ranker

A local web game that helps rank attractions (sights, food, bars, parties, odd local experiences) for a solo, budget-minded trip through China, Korea, Japan, Hong Kong and Thailand (Dec 2026 – Jan 2027).

The game produces a **ranking**, not a schedule. The ranking is the input for deciding, together with Claude, how to split days between places.

## Docs

| File | What it covers |
|---|---|
| [docs/TRIP.md](docs/TRIP.md) | Trip facts: dates, budgets, traveler profile, the trip page |
| [docs/GAME.md](docs/GAME.md) | Game design: funnel, swipes, duels, board, balance, book-ahead, Q&A |
| [docs/ROLES.md](docs/ROLES.md) | Who does what: curator vs coder, the data boundary, feedback loop |
| [docs/CURATOR-PLATFORM.md](docs/CURATOR-PLATFORM.md) | Spec for the platform that makes the curator's job easy and fully AFK |
| [docs/STATUS.md](docs/STATUS.md) | Where things stand, open questions, next steps |
| [docs/CURATOR-GUIDE.md](docs/CURATOR-GUIDE.md) | What a curator reads first: format, blocks, `./atr` commands, quality bar |
| [docs/PLATFORM.md](docs/PLATFORM.md) | Platform developer notes and the read-only API for the game |
| [docs/FEEDBACK-FORMAT.md](docs/FEEDBACK-FORMAT.md) | JSONL feedback files the game writes (swipes, duels, questions) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisions made while building the platform |
| [docs/TASTE.md](docs/TASTE.md) | What the traveler said they want; the machine-readable copy is `config/taste.yaml` |
| [docs/REVIEWER-GUIDE.md](docs/REVIEWER-GUIDE.md) | Brief for the independent reviewer that fact-checks curator pages (`./atr review`) |

Quick start: `npm install && ./atr --help`. Open the trip site: `./atr game` (Today, Trip, Places, Decide, Money, Prep). The trip's own data is in `trip/*.json`; see [docs/TRIP.md](docs/TRIP.md).
| [docs/CURATOR-GUIDE.md](docs/CURATOR-GUIDE.md) | **Curators read this first**: workflow, format, blocks, quality bar |
| [docs/PLATFORM.md](docs/PLATFORM.md) | Developer notes: architecture, adding blocks, API for the game |
| [docs/FEEDBACK-FORMAT.md](docs/FEEDBACK-FORMAT.md) | JSONL feedback files the game appends to |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Layout and format decisions |

## Platform quick start

```bash
npm install
./atr --help                 # every command has --help
./atr validate --fixtures    # validate the test fixtures
./atr shot yu-garden --fixtures
npm test
```

## Ground rules (short version)

- At most **one attraction per day**: days in a place cap how many top picks fit there.
- **No day-by-day schedule** is generated.
- The **curator** (a research subagent) owns the places data. The **coder** (a separate subagent) owns the app and treats the data as read-only input.
- Final picks go to the trip page's `places` collection **only after the traveler approves**.
