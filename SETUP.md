# Setup guide

How to run Mandum Rimba locally and, optionally, deploy it. For how the data
actually moves through the system, see [DATA-FLOW.md](./DATA-FLOW.md).

## Prerequisites

- **Node.js >= 20**
- **pnpm 9** (`corepack enable` then `corepack prepare pnpm@9.15.0 --activate`,
  or `npm i -g pnpm@9`)
- **MongoDB**, local (`mongodb://localhost:27017`) or any hosted MongoDB. The web
  app runs with whatever data you have, so this is the only thing you really need.
- *(Optional)* an **S3-compatible object store**, only if you want to build and
  serve your own PMTiles vector tiles.
- *(Optional)* a **job scheduler** (cron, a CI schedule, a serverless cron),
  only if you want to run the ingest pipeline on a cadence.

## 1. Install

```bash
git clone https://github.com/ammar-rasyidi/mandum-rimba.git
cd mandum-rimba
pnpm install
```

This is a [pnpm](https://pnpm.io) + [Turborepo](https://turbo.build) monorepo:

| Package | What it is |
| --- | --- |
| `apps/web` | Next.js 14 (App Router), MapLibre GL, `next-intl` (ID / EN), Recharts |
| `apps/api` | the read-only REST API **and** the ingest/tiles CLI jobs |
| `packages/shared` | Shared TypeScript domain types |

## 2. Environment

Each app ships an `.env.example`. Copy them and fill what you have, anything left
blank is skipped cleanly.

```bash
cp apps/api/.env.example apps/api/.env          # API + ingest
cp apps/web/.env.example apps/web/.env.local    # web (NEXT_PUBLIC_* only)
```

Minimum to boot locally:

- **`apps/api/.env`** -> `MONGODB_URI` (e.g. `mongodb://localhost:27017/forestwatch`).
- **`apps/web/.env.local`** -> `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`.
  `NEXT_PUBLIC_TILES_BASE_URL` only matters once you have PMTiles in an object store.

Source API keys, object-store credentials, and optional dataset URLs are only
needed when you run the matching ingest job; see the comments in each
`.env.example`.

## 3. Run (development)

```bash
pnpm dev          # web -> http://localhost:3000   ·   api -> http://localhost:4000
```

Useful per-package commands:

```bash
pnpm --filter @mandumrimba/web dev          # web only
pnpm --filter @mandumrimba/api dev          # api only
pnpm typecheck                              # all packages
pnpm lint                                   # all packages
pnpm build                                  # production build (turbo)
```

The map renders immediately; layers backed by data you haven't ingested simply
show "no data" rather than erroring.

## 4. Loading data (optional)

The ingest jobs are the API code run as CLI tasks. After `pnpm build`:

```bash
# from apps/api, after building:
node dist/jobs-cli.js <job>     # e.g. species, wdpa, gfw-alerts, tiles, status
```

Seed administrative regions (needed for region pages / charts):

```bash
pnpm seed:regions
```

Available jobs: `gfw-alerts`, `gfw-annual`, `bnpb-dibi`, `concessions`,
`modi-esdm`, `mining`, `wdpa`, `habitat`, `trase`, `species`, `nusantara-atlas`,
then `tiles` and `status`.

## 5. Production (optional)

There's no required platform; deploy the pieces wherever you like:

- **Web & API** -> build with `pnpm build` and host on any Node-capable platform.
  Set the API's `MONGODB_URI` and the web's `NEXT_PUBLIC_*` vars. Keep
  `CRON_ENABLED=false` on the serving instances.
- **Scheduled ingest + tiles** -> the jobs above are plain CLI tasks
  (`node dist/jobs-cli.js <job>`). Run them on any periodic scheduler at whatever
  cadence you want; that's the only place scheduling should live.
- **Tiles** -> point `NEXT_PUBLIC_TILES_BASE_URL` at your object store's public URL.

## Troubleshooting

- **Map is blank / "no data"**, expected without ingested data or a tiles URL;
  the app degrades gracefully.
- **API can't connect**, check `MONGODB_URI` and that the database is reachable.
- **An ingest job no-ops**, its source key/URL is unset in `.env`; that's
  intentional. Fill the relevant var to enable it.
