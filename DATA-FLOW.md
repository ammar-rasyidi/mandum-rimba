# Data flow

How data moves through Mandum Rimba, from public sources to the map you see at
[mandumrimba.org](https://mandumrimba.org). For how to run it yourself, see
[SETUP.md](./SETUP.md).

```
 PUBLIC SOURCES                 PIPELINE (Modal, weekly)            STORAGE              SERVING                 BROWSER
 ────────────────               ─────────────────────────          ───────────          ─────────────          ─────────────
 Global Forest Watch  ┐                                       ┌─►  MongoDB  ───────────► NestJS REST API ──────► Next.js web app
 Maus mining (PANGAEA)│         node dist/jobs-cli.js <job>   │    (records,             (apps/api, Vercel)     (apps/web, Vercel)
 WDPA / KLHK PIPPIB   │   ┌───► 1. ingest jobs  ──────────────┤     regions,                                          │
 GBIF + IUCN          ├──►│     2. tiles  (build PMTiles) ─────┼─►  Cloudflare R2 ──────────────────────────────────►  MapLibre GL
 BNPB DIBI (DesInv.)  │   │     3. status                     │    (PMTiles vector       (public read URL)       loads vector tiles
 Trase, GADM, …       ┘   │                                   │     tiles + archives)
                          │                                   └─►  bundled GeoJSON/JSON ─────────────────────────►  shipped in the
 ESA WorldCover ─────────►│   (offline) wildlife-distribution build  (in apps/web/src/data + public/data)            web bundle
 (offline build)
```

## 1. Sources

Everything starts from **public, independently verifiable** datasets. Each is
documented per-dataset (license, coverage, update date) on the in-app
[methodology](https://mandumrimba.org/metodologi) and
[data-sources](https://mandumrimba.org/sumber-data) pages.

| Domain | Source |
| --- | --- |
| Deforestation alerts, tree-cover loss, concessions | Global Forest Watch (UMD / Wageningen) |
| Mining land footprint | Maus et al. 2022 (PANGAEA) |
| Protected areas & moratorium | Protected Planet (WDPA) + KLHK PIPPIB |
| Wildlife occurrences & status | GBIF + IUCN Red List + Permen LHK P.106/2018, KKP, CITES |
| Natural-habitat cover (wildlife layer) | ESA WorldCover 2021 |
| Disaster events | BNPB DIBI via UNDRR DesInventar |
| Supply-chain linkage | Trase |
| Boundaries / watersheds | GADM, HydroBASINS |
| Location search | OpenStreetMap / Nominatim |

## 2. Ingest pipeline (Modal, weekly)

The pipeline is the **same NestJS codebase** as the API, invoked as CLI jobs.
`modal_app.py` runs it on a weekly [Modal](https://modal.com) Cron
(`0 18 * * 0`, Sunday 18:00 UTC); the in-process NestJS cron stays disabled
(`CRON_ENABLED=false`) so scheduling is owned in exactly one place.

Each job (`node dist/jobs-cli.js <job>`) pulls from a source, normalises it, and
upserts into MongoDB. Run order (`modal_app.py` → `JOB_ORDER`):

1. **Ingest jobs** → MongoDB:
   `gfw-alerts`, `gfw-annual`, `bnpb-dibi`, `concessions`, `modi-esdm`,
   `mining`, `wdpa`, `habitat`, `trase`, `species`, `nusantara-atlas`.
   Sources without a stable machine endpoint are **skipped cleanly** when
   unconfigured, so the pipeline runs with whatever keys you have.
2. **`tiles`** → builds vector **PMTiles** from the ingested geometry and
   uploads them to **Cloudflare R2**.
3. **`status`** → records run health for the in-app status page.

Implementations live in `apps/api/src/ingest/*.service.ts`.

## 3. Storage

- **MongoDB**, normalised, queryable records (alerts, disasters, concessions,
  regions, companies, stories). Shared by the Vercel API and the Modal pipeline.
- **Cloudflare R2** (S3-compatible), the built **PMTiles** vector layers plus
  raw source archives. Only the pipeline writes; the browser reads from R2's
  public URL.

## 4. Serving

- **`apps/api`** (NestJS, on Vercel), a **read-only REST API** over MongoDB
  (`alerts`, `concessions`, `disasters`, `regions`, `companies`, `stories`,
  `export`). The exact same code runs the ingest/tiles jobs on Modal.
- **Cloudflare R2**, serves the PMTiles directly to the browser (no API hop).

## 5. The browser (web app)

`apps/web` (Next.js 14, App Router) assembles three data channels:

- **Vector tiles**, MapLibre GL loads PMTiles straight from R2
  (`NEXT_PUBLIC_TILES_BASE_URL`) for the heavy spatial layers.
- **REST API**, region pages, charts, and feature detail come from the API
  (`NEXT_PUBLIC_API_BASE_URL`).
- **Bundled data**, a few small, static datasets ship inside the web build
  (`apps/web/src/data` and `apps/web/public/data`): the **wildlife distribution**
  layer (`species-distribution.geojson`), the campaign / KTP "nearest species"
  index (`wildlife-points.json`), conservation areas, and species common names.

## The wildlife distribution layer (offline build)

The "Peta Sebaran Satwa" / Wildlife Distribution layer is produced by an
**offline build** (not the nightly pipeline) and shipped as a bundled GeoJSON,
because it has no live source we can stream. The build:

1. Pulls **GBIF** occurrence records for threatened + flagship/endemic species
   across all classes (per region, so under-surveyed areas like Papua are
   represented).
2. Resolves each species' **IUCN** category and keeps conservation-relevant
   species (threatened, plus endemics in the highly-endemic east).
3. Weights occurrence density by **ESA WorldCover** natural-habitat cover so
   areas follow real forest/savanna/wetland, not cities or observer bias.
4. Contours the result **per island** so species stay on their actual island,
   smooths the edges, and tags each area with the species recorded there.
5. Adds a few **documented-range markers** (e.g. rhino, where public occurrence
   coordinates are withheld for protection), clearly labelled as such.

Occurrence coordinates are validated against an Indonesia land mask and the
species' realm, and pre-1990 museum specimens are dropped, so the map reflects
present-day presence.

## Editorial guarantees baked into the flow

- **Every claim is clickable**, each layer carries its source, date, and a
  methodology link.
- **Never fabricate**, data we cannot obtain is marked unavailable and the real
  provider named; documented-range markers are labelled, never passed off as
  field observations.
- **Privacy**, the campaign / KTP tools run entirely in the browser; photos and
  location are never uploaded or stored.
