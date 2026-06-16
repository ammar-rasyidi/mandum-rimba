# Mandum Rimba

**Indonesia Deforestation & Environmental Accountability Observatory** — a
map-first public-interest web app visualizing deforestation, palm oil & mining
expansion, and linked disasters (floods, landslides) across Indonesia, built
entirely on verifiable satellite and public data.

> Evidence over accusation. The app never states "the government lied" — it
> overlays official data vs. satellite reality and lets the gap speak. Every
> layer has a source, a date, and a methodology link.

## Architecture

```
Next.js (Vercel) ──HTTPS──► NestJS API + cron workers (Railway/Render/VPS)
   │ static PMTiles                 │                        │
   ▼                                ▼                        ▼
Cloudflare R2 ◄── tile build ── MongoDB Atlas (2dsphere)  External sources
(PMTiles, raw archives,                                   (GFW, BNPB, Kepo
 imagery, status JSON)                                     Hutan, WDPA, …)
```

- `apps/web` — Next.js 14 App Router, MapLibre GL + PMTiles, next-intl (ID/EN), Recharts.
- `apps/api` — NestJS 10: daily staggered ingest crons (01:00–06:00 WIB),
  tippecanoe tile builds, and the public REST API under `/v1`.
- `packages/shared` — shared TypeScript domain types.
- `scripts/gee` — manual Earth Engine before/after imagery exports per story.

## Quick start

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # fill MONGODB_URI, GFW_API_KEY, R2_*
cp apps/web/.env.example apps/web/.env.local

pnpm seed:regions          # GADM → Aceh province + kabupaten (-- --all for everything)
pnpm dev                   # web :3000, api :4000
```

Trigger any job manually (instead of waiting for its cron):

```bash
curl -X POST -H "x-api-key: $ADMIN_API_KEY" localhost:4000/v1/admin/jobs/gfw-alerts/run
curl -X POST -H "x-api-key: $ADMIN_API_KEY" localhost:4000/v1/admin/jobs/tiles/run
```

Job names: `gfw-alerts`, `gfw-annual`, `bnpb-dibi`, `concessions`, `modi-esdm`,
`wdpa`, `trase`, `nusantara-atlas`, `tiles`, `status`.

## Source configuration

One `GFW_API_KEY` (free, data-api.globalforestwatch.org) powers **all** the
geometric sources — alerts, annual loss, concessions, protected areas, and the
moratorium. The concession layers are the Greenpeace-lineage data (the
original Kepo Hutan downloads no longer exist; GFW hosts the maintained
copies). Dataset versions are pinned in code for reproducibility:

| Job | GFW dataset (pinned) | IDN rows (verified 2026-06) |
|---|---|---|
| gfw-alerts | wur_radd_alerts, umd_glad_landsat_alerts, umd_glad_sentinel2_alerts (latest) | streaming |
| gfw-annual | umd_tree_cover_loss (latest) | per region/year |
| concessions | gfw_oil_palm v2025, gfw_wood_fiber v2025, gfw_logging v202106 | 1,855 / 295 / 259 |
| wdpa | wdpa_protected_areas v202512, idn_forest_moratorium v20200923 | 688 / 42,028 |

`bnpb-dibi` ingests event-level floods/landslides from the **UNDRR DesInventar
mirror of DIBI** (desinventar.net `DI_export_idn.zip`, no key needed) — DIBI
itself is a Superset UI without a machine endpoint. Events carry kabupaten
names but no coordinates; geom is the centroid of the matching seeded
kabupaten, so events outside seeded provinces stay ungeocodied until you seed
them (then re-trigger the job).

GFW's mining layer (`gfw_mining_concessions`) has **zero** Indonesia rows —
mining comes later via MODI/Minerba (Phase 4).

Sources **without** stable machine endpoints stay env-configured and skip
cleanly when empty:

| Env var | Job | Note |
|---|---|---|
| `TRASE_CSV_URL` | trase | download from trase.earth/open-data (CC BY 4.0), host the CSV, point here |
| `MODI_CSV_URL` | modi-esdm | CSV export of the MODI IUP registry |

## Deployment

- **web → Vercel** (hobby). Set `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_TILES_BASE_URL`.
- **api → Railway/Render/Fly/VPS** using `apps/api/Dockerfile` (builds
  tippecanoe into the image — Vercel serverless cannot run the cron/tile jobs).
- **MongoDB Atlas**: whitelist the API host's static egress IP (Railway static
  IP add-on or VPS IP). Decide this on day 1 — do not fall back to
  `0.0.0.0/0` unless credentials are strong and TLS is enforced.
- **Cloudflare R2**: one bucket (`forest-watch`) with a public custom domain
  for `tiles/*` and `status/*`; raw archives stay private.

## Editorial principles (non-negotiable)

1. Evidence over accusation — we gather and show the data as it is, and never
   draw conclusions or make claims on the user's behalf.
2. Every claim is clickable — ≤ 2 clicks to the source dataset.
3. Reproducible — open pipeline, public methodology + changelog (`/metodologi`, `/status`).
4. Legal safety (UU ITE) — companies referenced only via already-published
   datasets (Trase, Kepo Hutan, MODI), always with citation.
5. Bilingual — Indonesian first, English second.

License: MIT (code). Data belongs to its respective sources — see the
methodology page for per-dataset licenses.
