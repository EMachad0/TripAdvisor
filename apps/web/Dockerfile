# syntax=docker/dockerfile:1.7
# trip-web: the SvelteKit adapter-node app (plan section 12, spike S16). Build from the REPO ROOT:
#
#   docker build -f apps/web/Dockerfile --build-arg GIT_SHA="$(git rev-parse HEAD)" -t trip-web .
#
# The context is filtered by apps/web/Dockerfile.dockerignore (BuildKit reads <Dockerfile>.dockerignore before the
# root .dockerignore, which belongs to the old image and drops apps/ and packages/).
#
# Memory: the heaviest step is `vite build` (about 1 GB resident, capped below by NODE_OPTIONS); the whole build
# fits a 1 CPU / 4 GB VPS beside the running services. Runtime: about 120 MB resident at idle.

ARG NODE_IMAGE=node:24-slim

# ---------------------------------------------------------------- build
FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
	COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	CI=1
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /repo
# pnpm comes from the root package.json "packageManager" pin (pnpm@12.21.0), through corepack.
COPY package.json ./
RUN corepack enable && corepack install

# 1. Download every package the lockfile names. This layer only changes with the lockfile.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=atr-pnpm-store,target=/pnpm/store \
	pnpm config set store-dir /pnpm/store --location project && \
	pnpm fetch

# 2. Link only what @atr/web and its workspace dependencies need, offline (every workspace manifest is copied so the
#    frozen lockfile still matches the whole workspace).
COPY tooling/package.json tooling/tsconfig.base.json tooling/
COPY platform/package.json platform/
COPY packages/shared/package.json packages/shared/
COPY packages/migrate/package.json packages/migrate/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=atr-pnpm-store,target=/pnpm/store \
	pnpm install --offline --frozen-lockfile --filter '@atr/web...' --config.ignore-scripts=false

# 3. Build. NODE_OPTIONS caps the V8 heap so a small VPS never swaps; vite build peaks well under it.
COPY platform platform
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG GIT_SHA=
ENV GIT_SHA=${GIT_SHA} \
	NODE_OPTIONS=--max-old-space-size=1536
# Kit validates src/env.ts while it analyses routes, so the build needs syntactically valid origins. They are read
# at runtime ($app/env, not static), so these placeholders never reach the image; the grep proves it.
RUN PUBLIC_CONVEX_URL=http://env-at-runtime.invalid \
	PUBLIC_CONVEX_SITE_URL=http://env-at-runtime.invalid \
	PUBLIC_SITE_URL=http://env-at-runtime.invalid \
	pnpm --filter @atr/web build && \
	test -f apps/web/build/index.js && \
	! grep -rq 'env-at-runtime.invalid' apps/web/build

# 4. A self-contained production tree: build/ (package.json "files") plus prod node_modules, with @atr/platform
#    copied in (it is ssr.external). --legacy: the workspace does not set injectWorkspacePackages.
RUN --mount=type=cache,id=atr-pnpm-store,target=/pnpm/store \
	pnpm --filter @atr/web --prod deploy --legacy /prod/web && \
	test -f /prod/web/build/index.js && \
	cd /prod/web && node --input-type=module -e \
	"import sharp from 'sharp'; await sharp({create:{width:2,height:2,channels:3,background:'#000'}}).webp().toBuffer(); await import('@atr/platform/maps'); console.log('sharp and platform ok')"

# ---------------------------------------------------------------- runtime
FROM ${NODE_IMAGE} AS runtime
ARG GIT_SHA=
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000 \
	ATR_ROOT=/app/content \
	ATR_CACHE_DIR=/data/cache \
	GIT_SHA=${GIT_SHA}
WORKDIR /app/web
COPY --from=build --chown=node:node /prod/web /app/web
# The curator content is baked in (git is the source of truth; a content change is a redeploy).
COPY --chown=node:node places /app/content/places
COPY --chown=node:node areas /app/content/areas
COPY --chown=node:node answers /app/content/answers
COPY --chown=node:node config /app/content/config
# The platform keeps its map tiles and images under <ATR_ROOT>/.cache; point that at the web-cache volume so the
# cache survives redeploys (Coolify volume web-cache:/data/cache). The image itself stays read-only content.
RUN mkdir -p /data/cache && chown node:node /data/cache && \
	ln -s /data/cache /app/content/.cache
VOLUME /data/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "build"]
