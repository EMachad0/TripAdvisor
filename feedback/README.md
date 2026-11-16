# feedback/ (historical snapshot)

These files are what the old site (retired after the cutover of 2026-11-16) wrote: swipes, duels, notes, questions and
`game-state.json`. They are kept as history. The live feedback is in the site's Convex backend, and nothing writes
here any more.

To read the live logs, pull them: `./atr feedback pull` writes `.cache/feedback-live/` (gitignored), and the
read-only commands (`./atr feedback`, `./atr taste`, `./atr next`, `./atr run --auto`) then use that copy. The format
is `docs/FEEDBACK-FORMAT.md`.
