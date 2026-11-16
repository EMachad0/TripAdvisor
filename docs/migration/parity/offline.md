# Parity: slice L, offline

The old site has no offline mode (plan section 11): `game/public/game.js` `api()` posts with `fetch` and a failed
write is lost after a toast and a local rollback; a cold load with the server unreachable shows "The trip site isn't
answering" (`load().catch`, line 2001); the focus refresh fails silently (`load({ silent: true })`, line 1989). So
most rows below are new behaviour; the "old" column says what the old site did in the same situation.

New: `apps/web/src/service-worker/` (`index.ts`, `strategy.ts`), `apps/web/src/lib/sync/` (`write.ts` internals,
`outbox.ts`, `db.ts`, `mirror.ts`, `auth.ts`, `state.ts`, `status.ts`, `runtime.svelte.ts`, `SyncBadge.svelte`).

Checked by `src/lib/sync/{write,outbox,mirror,status}.test.ts` and `src/service-worker/strategy.test.ts` (units, 37
tests), and `e2e/offline.spec.ts` on desktop, pixel and iphone. The badge was checked at 390x844 in light and dark
with playwright-cli (offline pill and details, paused pill).

## Opening the app with no network

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Cold load with the server unreachable: "The trip site isn't answering" and Retry | The service worker answers every page opened online before from its saved copy (HTML, `__data.json`, build files); a page never opened says "You are offline", lists the saved pages and offers "Try again" | Differs on purpose: the itinerary, addresses and booking refs open offline (e2e: cold offline load of `/trip/itinerary`). |
| [x] | Live data (old `/api/state`, `/api/trip`) gone offline | The last results of every Convex query (`trip.all`, `feedback.state`, `route.current`, …) are mirrored to IndexedDB and answer while the client has no live result | The content payload comes with the saved page and `__data.json`, not the mirror. |
| [x] | Focus or visibility refresh fails silently | `refreshAll()` offline is answered by the saved `__data.json`; a miss makes SvelteKit load the page itself, which the saved copy or the offline page answers | |
| [x] | No offline indicator | Pill under the header, right: "Offline" (or "Offline · N" with N unsynced); its details say "Offline · last synced 14:05 UTC−3" with the device's offset | New. Shown after the socket has been down 2.5 s, or at once when the browser reports offline. |
| [x] | Pages never cached | Network first everywhere (pages, data, media, maps, content pages); after 5 s without an answer a saved copy answers if there is one | New. Sign-in, sign-out, `/api/*`, `/healthz`, `/ops/*` and `/_app/version.json` are never cached. |
| [x] | Deploys: the page reloads on a new version | Unchanged (`refresh.svelte.ts`); the worker precaches each build, keeps the 3 newest builds so an older saved page still finds its scripts, and checks for an update after navigations (at most once a minute) | |
| [x] | Sign out | `POST /logout` also deletes the saved pages, runtime responses and the query mirror | New. The outbox is kept for the owner; a guest session never replays it. |
| [x] | Guest offline | Reads the saved pages like the owner; write controls stay disabled; the badge details have no actions | |

## Writes

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Guest write: refused with the read-only message | `write()` refuses at once with "Guests can look but not change anything.", nothing is sent or queued | Unchanged from task 7. |
| [x] | Write while the server is unreachable: toast "Couldn't save: …" and the change is rolled back (lost) | Stored in the IndexedDB outbox before it is sent, kept across reloads, sent in order once connected, removed only when its mutation resolves | Differs on purpose (spike S25). Screens with optimistic updates (swipes, notes) show the change at once, even after an offline start (`mirroredStore`); pessimistic ones (To do, Bag, trip forms) stay busy until it lands, as before. |
| [x] | A replayed request could land twice | Each write carries a UUID `clientOpId`; `ownerMutation` records it in `appliedOps` and answers `{ replayed: true }` to a repeat | e2e: replaying a landed `clientOpId` adds no row. |
| [x] | Server refuses the input (old 400): toast with the reason, rollback | Same for a live write (the screen's own toast); a refused replay is dropped with "A change saved offline was refused: …" | |
| [x] | Writes paused (cutover, rollback): not in the old site | `Frozen` keeps the entry; pill "Paused · N", details "Writes paused, N waiting" with "Copy pending changes" (JSON on the clipboard and in a dialog to select) and "Retry"; retries stop until a reconnect or "Retry" | New. e2e: entry kept across a reload, copied, then lands once after unfreezing. |
| [x] | Slow writes: no indicator | "N unsynced" pill once a write has waited 1.5 s | New. |
| [x] | Closing the tab with a write in flight loses it silently | `beforeunload` asks first while the outbox is not empty | New. |
| [x] | Route save with `keepalive` on page hide (old line 1464) | Every write is durable in the outbox, so a hidden or closed page resends it on the next visit | The route editor itself is slice C. |
| [x] | Offline start, then the network returns | The runtime hands the auth library's own token fetcher back to the client when the socket comes back without auth (the library gives up after about 8 s offline), then replays | New. e2e S25 stays offline 12 s after the reload; the first replay meets `Unauthenticated` (kept), the re-authentication follows, and all four writes land once. |

## Plan exit tests (section 11)

| | Plan test | Spec | Note |
|---|---|---|---|
| [x] | Offline: tick a task, add a note, change days; reload; online; each row once in `/ops/export` | `S25: three swipes and a task tick made offline survive a reload and land exactly once` | Uses three swipes (event rows, so "exactly once" is countable) and a task tick. Notes and days are not used: the deck note panel is a second write path to the same `write()`, and the days board (slice F) was not built when this spec was written. |
| [x] | Cold offline load of `/trip/itinerary` after one online visit renders the cached legs | `a cold offline load of the itinerary after one online visit shows the saved legs` | Also checks the offline page for a page never opened. |
| [x] | Queue writes, freeze, reconnect: kept, "Writes paused" visible, "Copy pending changes" returns them; unfreeze: land once | `a Frozen refusal keeps the entry …` | One write, frozen while online; the reload in the middle shows the entry survives. |

## Known limits

- WebKit's offline switch in Playwright blocks new connections only, so the S25 spec loads the deck after going
  offline (the real case: opening the app with no network).
- After a reload offline, the first replay can meet `Unauthenticated`; the entries stay and are retried every 5 s
  while the socket is up.
- Writes issued at once are ordered by the Convex client queue. If writes are unfrozen between two mutations of
  one replay, a later entry could land before an earlier frozen one. Accepted: unfreezing is a manual ops step.
