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
scripts/convex-local.sh convex run ops:setWritesFrozen '{"value": true}'   # any convex CLI command
scripts/convex-local.sh down      # stop (data kept); `reset` also deletes the data volume
```

Nothing prints a key or a password. The seed sets `SEED_*` env vars from stdin and removes them right after.
The dashboard is optional: `docker compose -f deploy/convex-local/compose.yaml --env-file deploy/convex-local/.env --profile dashboard up -d dashboard`
(127.0.0.1:6791; sign in with the key from `apps/web/.env.convex-local`).

## Run the app

```sh
cp apps/web/.env.example apps/web/.env.local          # PUBLIC_CONVEX_URL, PUBLIC_CONVEX_SITE_URL, PUBLIC_SITE_URL
TRUSTED_ORIGINS=http://localhost:5173 PUBLIC_SITE_URL=http://localhost:5173 scripts/convex-local.sh init-env
corepack pnpm --filter @atr/web dev                   # http://localhost:5173, sign in with apps/web/.env.e2e.local
```

`init-env` defaults `SITE_URL` to the Playwright origin (`http://localhost:4173`); run it with `PUBLIC_SITE_URL`
as above for the dev server, and again without it before `pnpm e2e`.

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
- Shell: `src/routes/(app)/+layout.*`, `src/lib/components/shell/`. Design tokens: `src/routes/layout.css`.
- shadcn components: `src/lib/components/ui/` (variants in `*.variants.ts`, so type-aware lint can read them).
- Agent skill for shadcn-svelte: `.claude/skills/shadcn-svelte/` (installed with `pnpm dlx skills add huntabyte/shadcn-svelte`, lock in `skills-lock.json`).
