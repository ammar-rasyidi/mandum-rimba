# Mandum Rimba API — NestJS + cron workers + tippecanoe (Railway/Render/Fly)
# tippecanoe must be IN this image: the tiles job shells out to it.

# --- build tippecanoe ---
FROM debian:bookworm-slim AS tippecanoe
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential git libsqlite3-dev zlib1g-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch 2.70.0 https://github.com/felt/tippecanoe.git /src \
    && make -C /src -j"$(nproc)" \
    && make -C /src install

# --- build the app ---
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile=false
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @forest-watch/shared build \
    && pnpm --filter @forest-watch/api build \
    && pnpm --filter @forest-watch/api --prod deploy /app

# --- runtime ---
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      libsqlite3-0 zlib1g ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*
COPY --from=tippecanoe /usr/local/bin/tippecanoe* /usr/local/bin/
WORKDIR /app
COPY --from=build /app .
COPY --from=build /repo/apps/api/dist ./dist
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/main.js"]
