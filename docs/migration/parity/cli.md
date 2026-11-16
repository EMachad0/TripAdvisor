# Parity: slice I, the platform CLI as a client of the new site

Old behaviour: `platform/cli/atr.js`, `platform/lib/{feedback/pull,publish,site}.js` before slice I, hand edits of
`trip/*.json` (docs/TRIP.md), and `game/server.js` `/healthz`. New: the same files plus `platform/lib/trip-cli.js`.
There is no screen in this slice, so there is nothing to look at on a phone; every row is checked by
`node --test platform/test/{pull,trip-cli}.test.js` and `game/test/answers.test.js`, or by the run against slot 5
quoted at the end.

| | Old action | New equivalent | Note |
|---|---|---|---|
| [x] | `./atr feedback pull --url <site>`: GET `/ops/export`, check each file's sha256 and count, temp dir, then rename over `.cache/feedback-live/` | `./atr feedback pull --from-convex [--url <site>]` | Different on purpose: the source is now named. A bare `pull` means `--from-backup`, the default until the cutover, which is not built and refuses with a message saying to use `--from-convex`. Before, a bare `pull` read whatever `ATR_EXPORT_URL` pointed at. |
| [x] | `./atr trip pull` into `.cache/trip-live/` | `./atr trip pull --from-convex` | Same rules as feedback. |
| [x] | URL from `--url`, else `ATR_EXPORT_URL`, else an error | `--url`, else `ATR_EXPORT_URL`, else `site.js` `SITES.new.exportUrl` (`https://cvx.<site>`) | Different on purpose: Convex runs only behind the new app, so its export URL is the natural default. |
| [x] | Token from `ATR_EXPORT_TOKEN` or the keychain (`security find-generic-password -s atr-export-token -w`); never an argument, never printed | Unchanged | Tests check that the token is in no output and not in the manifest. |
| [x] | Every file's sha256 and count checked before anything is written | Unchanged, plus: a `--from-convex` pull also refuses a bundle that lacks one of the kind's files (6 feedback, 9 trip) | Different on purpose: a truncated bundle could otherwise pass the checks and leave the curator with an incomplete copy. |
| [x] | Refuses to replace a target with a newer, edited or stray file, or a dir no pull wrote, and names the file | Unchanged | |
| [x] | Read-only commands (`feedback`, `taste`, `next`, `run --auto`) read the pulled copy; `--dir` and `ATR_FEEDBACK_DIR` win; `./atr game` keeps `<root>/feedback` | Unchanged | |
| [x] | Stale-pull warning after 26 h: "run ./atr feedback pull" | Same warning, now "run ./atr feedback pull --from-convex" | The bare command would refuse before the cutover. |
| [x] | Hand edits of `trip/*.json` (docs/TRIP.md:76-81) | `./atr trip set <col> [id] --data <json>`, `update <col> <id> --data <json>`, `delete <col> <id>`, through `trip:adminWrite` | Uses `scripts/convex-prod.sh run` (or `scripts/convex-local.sh convex run` with `--local`, slot from `ATR_SLOT`). The command never holds the admin key. |
| [x] | Old `writeDoc` rules: unknown collection, bad id, `data must be an object`, `<op> needs an id`, set creates or replaces, update merges and `null` clears, delete of a missing id is a no-op, the 64 KB body cap | Checked locally with the same id rule and limits (a test keeps them equal to `convex/lib/logic/trip.ts`), then by the backend | Different on purpose: `id` inside `--data` is refused with a hint (the old server dropped it quietly), and unknown field names are refused using `@atr/shared` `TRIP_FIELDS` when `packages/` is in the checkout. The backend redacts its error text, so the CLI gives the reasons itself. |
| [x] | (none: a file edit could not be frozen) | Refuses while writes are frozen: it asks `ops:getWritesFrozen` first and never passes `force` | Overriding the freeze stays a by-hand owner step in the runbook. |
| [x] | (none: a file edit needed no confirmation) | Writing to prod asks `[y/N]` on a terminal; without a terminal it needs `--yes`; `--dry-run` prints the exact command and sends nothing | Org rule: production writes are confirmed. |
| [x] | `./atr answers publish`: merge, follow the Coolify deploy over SSH, then `/healthz` 200 | Old site: unchanged. New site: waits until `/healthz` reports `sha` equal to the merge commit (for the whole deploy timeout), and only then prints "the card is live" | The old `/healthz` answers `{"ok":true}` with no sha, so 200 is still enough there. On the new site a stale sha is printed as "still reports <old>, not <new>". |
| [x] | Coolify deploy followed with app `zoom1ixd7gj2y4snw6oculrb` | Old site: unchanged. New site: `coolifyApp: null` until task 8 creates `trip-web`; the publish then skips SSH and relies on the `/healthz` sha | The `/healthz` sha is the stronger proof anyway. |
| [x] | Card links `/#/answers/<id>` and `/<kind>/<id>#answer-<id>` | Old site: unchanged. New site: `/places/answers/<id>`; the page link is the same | Picked by the switch. |
| [x] | One site in `site.js` | `SITES.old` and `SITES.new`, `ACTIVE_SITE = 'old'`; `ATR_SITE=old\|new` overrides it for one command | The cutover PR flips `ACTIVE_SITE` and `DEFAULT_SOURCE` (pull.js). |

## Rows not ticked

None. Not part of this slice, and still open:
- `--from-backup` (task 2 in the plan) is not built. Until it is, `--from-convex` is the only pull.
- Task 2's `gh pr merge --auto` plus polling for `MERGED` is not in `publish.js`. It still runs `gh pr merge --merge`; the plan notes that an immediate merge fails once branch protection is on.
- `scripts/convex-prod.sh` (task 8) does not exist yet, so a prod `./atr trip` write stops with "not in this checkout yet".

## Extra exit (slot 5, a copy of the real data)

Slot 5 was seeded with `@atr/migrate import --src <copy of feedback/ and trip/> --target local`, and the CLI ran in
a scratch `ATR_ROOT` that links `places/ areas/ config/ answers/ reviews/`:
- `./atr feedback pull --from-convex --url http://127.0.0.1:3261` exited 0 with 6 files (duels 23, game-state 263,
  notes 660, questions 36, route 0, swipes 268). `./atr trip pull --from-convex` exited 0 with 9 files.
- `./atr taste` and `./atr taste --dir <source>/feedback`: `diff` empty (107 lines), and also empty for
  `taste --json` and `next`. `feedback` differs only in its "feedback dir:" header line.
- Every pulled file is byte-identical to its source file (`cmp`); `route.jsonl` exists only in the pull, empty.
- `./atr trip set spend --local` created a document, `delete` removed it, a freeze made `delete` refuse before
  `adminWrite` ran, and an unknown field was refused locally.
