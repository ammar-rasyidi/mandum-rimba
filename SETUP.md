# Setup guide

How to run Mandum Rimba locally and, optionally, deploy it. For how the data
actually moves through the system, see [DATA-FLOW.md](./DATA-FLOW.md).

## Prerequisites

- **Node.js ≥ 20**
- **pnpm 9** (`corepack enable` then `corepack prepare pnpm@9.15.0 --activate`,
  or `npm i -g pnpm@9`)
- **MongoDB** — local (`mongodb://localhost:27017`) or a free MongoDB Atlas
  cluster. Optional: the web app runs with whatever data you have.
- *(Optional)* **Cloudflare R2** bucket — only needed to build/serve your own
  PMTiles vector tiles.
- *(Optional)* **Modal** account — only needed to run the scheduled pipeline.

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
| `apps/api` | NestJS — read-only REST API **and** the ingest/tiles CLI jobs |
| `packages/shared` | Shared TypeScript domain types |

## 2. Environment

Each app ships an `.env.example`. Copy them and fill what you have — anything
left blank is skipped cleanly.

```bash
cp apps/api/.env.example apps/api/.env          # API + ingest
cp apps/web/.env.example apps/web/.env.local    # web (NEXT_PUBLIC_* only)
```

Minimum to boot locally:

- **`apps/api/.env`** → `MONGODB_URI` (e.g. `mongodb://localhost:27017/forestwatch`).
- **`apps/web/.env.local`** → `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`.
  `NEXT_PUBLIC_TILES_BASE_URL` only matters once you have PMTiles on R2.

Source API keys (`GFW_API_KEY`, the R2 `R2_*` keys, optional CSV URLs) are only
needed when you run the matching ingest job; see the comments in each
`.env.example`.

## 3. Run (development)

```bash
pnpm dev          # web → http://localhost:3000   ·   api → http://localhost:4000
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

The ingest jobs are the NestJS code run as CLI tasks. After `pnpm build`:

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

## 5. The scheduled pipeline (optional, Modal)

Production ingest + tile builds run weekly on [Modal](https://modal.com) via
`modal_app.py`. To run it yourself:

```bash
cp .env.modal.example .env.modal            # fill in the real values
modal secret create mandumrimba-env ...     # create the "mandumrimba-env" secret
modal run modal_app.py::run_job --job all   # ingest + tiles + status, one-off
modal deploy modal_app.py                    # install the weekly Cron
```

`CRON_ENABLED` stays `false` everywhere — scheduling is owned only by Modal Cron.

## 6. Deploying

A typical deployment mirrors production:

- **Web** → Vercel project from `apps/web`, with the `NEXT_PUBLIC_*` env vars.
- **API** → Vercel project from `apps/api` (read-only serving; `CRON_ENABLED=false`).
- **Pipeline** → Modal (`modal_app.py`), with the `mandumrimba-env` secret.
- **MongoDB** → MongoDB Atlas. **Tiles** → Cloudflare R2 with a public URL set as
  `NEXT_PUBLIC_TILES_BASE_URL`.

## Troubleshooting

- **Map is blank / "no data"** — expected without ingested data or a tiles URL;
  the app degrades gracefully.
- **API can't connect** — check `MONGODB_URI` and that MongoDB is reachable.
- **An ingest job no-ops** — its source key/URL is unset in `.env`; that's
  intentional. Fill the relevant var to enable it.
