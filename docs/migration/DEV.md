# Developing the new stack

The new app lives in `apps/web` (SvelteKit 3 + Convex), next to the old site, which keeps building with `npm ci`.
Use `corepack pnpm` (the root `packageManager` pins pnpm 12.21.0); plain `pnpm` works in CI.

## One-time setup

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @atr/web exec playwright install chromium webkit
```

`npm ci` (old site) and `pnpm install` share the root `node_modules`; each one rebuilds it, so run `pnpm install`
again after an `npm ci`.

## Local Convex backend

The same pinned image as the VPS, bound to 127.0.0.1 (`deploy/convex-local/compose.yaml`).

```sh
scripts/convex-local.sh up        # start it; first run writes the admin key to apps/web/.env.convex-local (mode 600)
scripts/convex-local.sh init-env  # SITE_URL, TRUSTED_ORIGINS, BETTER_AUTH_SECRET and the test switches
scripts/convex-local.sh deploy    # push apps/web/src/convex (also regenerates src/convex/_generated)
scripts/convex-local.sh seed      # owner + guest; passwords generated into apps/web/.env.e2e.local (mode 600)
scripts/convex-local.sh seed-data # the e2e data set: feedback + trip tables and the content index (below)
scripts/convex-local.sh convex run ops:setWritesFrozen '{"value": true}'   # any convex CLI command
scripts/convex-local.sh down      # stop (data kept); `reset` also deletes the data volume
```

Nothing prints a key or a password. The seed sets `SEED_*` env vars from stdin and removes them right after.
The dashboard is optional: `docker compose -f deploy/convex-local/compose.yaml --env-file deploy/convex-local/.env --profile dashboard up -d dashboard`
(127.0.0.1:6791; sign in with the key from `apps/web/.env.convex-local`).

## Test slots (parallel e2e)

Every command above, and Playwright, honours `ATR_SLOT=<0..8>`. Slot 0 is the plain setup; slot `n` gets its own:

| | slot 0 | slot n (1 to 8) |
|---|---|---|
| compose project and data volume | `atr-convex-local`, `atr-convex-local_data` | `atr-convex-local-s<n>`, `atr-convex-local-s<n>_data` |
| Convex API / HTTP actions | 127.0.0.1:3210 / :3211 | 127.0.0.1:`3210+10n` / `3211+10n` |
| app under Playwright | http://localhost:4173 | http://localhost:`4173+n` |
| dashboard (optional) | 127.0.0.1:6791 | 127.0.0.1:`6791+n` |
| env files (mode 600, gitignored) | `deploy/convex-local/.env`, `apps/web/.env.{convex-local,e2e.local,tokens.local}` | the same names with `.s<n>` appended |
| build output | `apps/web/.svelte-kit`, `apps/web/build` | `.svelte-kit-s<n>`, `build-s<n>` |
| Playwright | `playwright/.auth`, `test-results`, `playwright-report` | `-s<n>` appended to each |

```sh
ATR_SLOT=3 corepack pnpm e2e                          # its own backend, seed, build and app; nothing shared
ATR_SLOT=3 scripts/convex-local.sh status             # ports, compose project and files of slot 3
ATR_SLOT=3 scripts/convex-local.sh convex run ops:getWritesFrozen '{}'
ATR_SLOT=3 scripts/convex-local.sh down               # or reset (deletes the slot's volume and admin key)
```

Pick a free slot per agent (one per worktree is the simple rule). Slots never share data. Two slots in the same
checkout also work (the build dirs are separate), with two caveats: slot `n > 0` deploys with `--codegen disable`
(only slot 0 rewrites `src/convex/_generated`), and its `vite build` points `node_modules/$app/tsconfig.json` at
`.svelte-kit-s<n>` until the next `svelte-kit sync` (which `pnpm typecheck` and `pnpm lint` run first). Each running
slot costs one Convex container (about 150 MB) plus one Node server. Inside every container the backend's own
origins stay `http://127.0.0.1:3210`/`:3211` (it fetches its JWKS from there); only the published host ports change,
so a URL the backend generates itself (storage URLs, unused by the app) carries the container port.

## E2E data set and content

- `scripts/convex-local.sh seed-data` loads `packages/migrate/fixtures/e2e` into the slot's backend: the feedback and
  trip tables through `@atr/migrate import` (each table replaced atomically, so a rerun resets them), then the content
  index of `packages/migrate/fixtures/e2e/content` through `POST /ops/content-index`. Playwright's backend runs it on
  every start, so every screen has non-empty data. Accounts are separate (`seed`).
- The content root `packages/migrate/fixtures/e2e/content` is what the app reads under Playwright (`ATR_ROOT`, with
  `ATR_CONTENT_FIXTURES=1` so `fixture: true` files load). Places and answers link to `platform/test/site-fixtures`; areas
  carry coordinates; `config/trip.yaml` is a frozen copy of the trip shape. Tests never read the real `places/`.
- The app publishes the content index at boot and whenever content files change (`src/lib/server/content.ts`,
  `content-publish.ts`), with `CONTENT_TOKEN` from `apps/web/.env.tokens.local` (its sha256 is set in Convex by
  `init-env`). Without a published index every id-checked write (swipe, note, duel, lock, route) throws `NoContent`.
  To republish by hand: `CONTENT_TOKEN=… node apps/web/scripts/content-index.ts --publish http://127.0.0.1:3211`.
- `EXPORT_TOKEN` in the same file opens `GET /ops/export` on the slot's backend (for `@write` specs).

## Run the app

```sh
cp apps/web/.env.example apps/web/.env.local          # PUBLIC_CONVEX_URL, PUBLIC_CONVEX_SITE_URL, PUBLIC_SITE_URL
TRUSTED_ORIGINS=http://localhost:5173 PUBLIC_SITE_URL=http://localhost:5173 scripts/convex-local.sh init-env
corepack pnpm --filter @atr/web dev                   # http://localhost:5173, sign in with apps/web/.env.e2e.local
```

`init-env` defaults `SITE_URL` to the Playwright origin (`http://localhost:4173`); run it with `PUBLIC_SITE_URL`
as above for the dev server, and again without it before `pnpm e2e`.

The dev server reads content from the repo (`places/`, `areas/`, `answers/`, `config/`). For the e2e content and
content sync, add to `apps/web/.env.local`: `ATR_ROOT=<abs path>/packages/migrate/fixtures/e2e/content`,
`ATR_CONTENT_FIXTURES=1` and `CONTENT_TOKEN` from `apps/web/.env.tokens.local`. `ATR_CONTENT_RECHECK_MS` (default
10000) sets how often the server looks for changed content files.

## Gates

```sh
corepack pnpm format:check   # Prettier (svelte + tailwind plugins)
corepack pnpm lint           # svelte-kit sync, then ESLint (typescript-eslint strict, svelte, @shadcn/lint, Convex)
corepack pnpm typecheck      # svelte-check for apps/web, tsc for packages/*
corepack pnpm test:ws        # vitest: units (node) and Convex functions (convex-test, edge runtime)
corepack pnpm e2e            # Playwright: starts the backend (deploy + seed) and the built app on :4173
corepack pnpm verify         # all of the above, plus node --test for game/
npm ci && npm test           # the old site (platform + game tests), unchanged
```

Playwright projects: `desktop` (Chrome), `pixel` (Pixel 7), `iphone` (iPhone 15, WebKit); `setup` signs in owner
and guest once and saves `apps/web/playwright/.auth/{owner,guest}.json` (gitignored). One spec waits 70 s for the
60 s test JWT to expire (spike S9).

## Where things are

- Schema: `apps/web/src/convex/schema.ts` and `tables/*.ts` (frozen). Access wrappers: `src/convex/lib/access.ts`
  (`memberQuery`/`readQuery`, `ownerMutation`, `writesFrozen`, `appliedOps`). Env: `src/convex/lib/env.ts` only.
- Auth: `src/convex/auth.ts` (Better Auth), `src/hooks.server.ts` (JWT refresh, redirect), `src/routes/login`,
  `src/routes/logout`, `src/routes/api/auth/[...all]` (proxy + per-IP limiter).
- Shell: `src/routes/(app)/+layout.*`, `src/lib/components/shell/` (AppShell, TimeTz, TzText, refresh.svelte.ts).
  Design tokens: `src/routes/layout.css`.
- Frozen layer for the screen slices: content model `src/lib/content/{types,derive,app-data.svelte}.ts`, server
  content `src/lib/server/{content,content-publish,maps}.ts` (platform types in `platform.d.ts`), the write path
  `src/lib/sync/write.ts`, shared components `src/lib/components/shared/{PlaceSheet,PlaceRow,AnswerCard}.svelte`,
  `GET /healthz`. Ownership per slice: `docs/migration/ownership.json`, checked by `node scripts/check-ownership.ts`
  (tests: `node --test scripts/ownership.test.ts`).
- shadcn components: `src/lib/components/ui/` (variants in `*.variants.ts`, so type-aware lint can read them).
- Agent skill for shadcn-svelte: `.claude/skills/shadcn-svelte/` (installed with `pnpm dlx skills add huntabyte/shadcn-svelte`, lock in `skills-lock.json`).
