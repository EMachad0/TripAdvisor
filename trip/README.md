# trip/ (historical snapshot)

These files are the trip collections (legs, days, tasks, bag, budget, fixed, spend, settings, visited) as they were
when the old site was retired after the cutover of 2026-11-16. They are kept as history. The live trip data is in the
site's Convex backend, and nothing writes here any more.

- Read the live data: `./atr trip pull` writes `.cache/trip-live/` (gitignored).
- Change it: `./atr trip set|update|delete <collection> …` (or edit it on the site). See `./atr trip --help` and
  `docs/TRIP.md`.
