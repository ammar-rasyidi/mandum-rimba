# Mandum Rimba

**An independent, non-profit observatory for Indonesia's forests, land, and
protected wildlife.** A map-first public-interest web app that distills credible
satellite and public data, deforestation, palm oil & mining expansion, linked
disasters, and the wildlife losing its home, into one open map anyone can check.

🌳 Live at **[mandumrimba.org](https://mandumrimba.org)** · bilingual (Indonesia / English)

> **Evidence over accusation.** We gather and show the data as it is, and never
> draw conclusions on anyone's behalf. We overlay official data against
> satellite reality and let the gap speak. Every layer has a source, a date,
> and a methodology link.

## What's on the map

- **Deforestation alerts**, near-real-time forest-clearing points from satellite
  radar and optical sensors (10–30 m).
- **Annual tree-cover loss**, per-year loss aggregated by region, behind the
  region-page charts.
- **Concessions**, oil palm, pulpwood, and logging concession boundaries.
- **Mining footprint**, satellite-mapped mined land for all minerals,
  peer-reviewed (physical footprint, not permit boundaries).
- **Protected areas & forest moratorium**, national parks, nature reserves,
  wildlife sanctuaries, and moratorium polygons.
- **Wildlife distribution**, threatened & endemic species across all classes,
  drawn from occurrence records and weighted by natural-habitat cover, then
  contoured per island so species stay where they actually live, each area
  tagged with the species recorded there and its IUCN status. Spans Sundaland,
  Wallacea (anoa, maleo, Komodo), Papua (tree-kangaroo, echidna), and the sea &
  rivers (turtles, dugong, Irrawaddy dolphin).
- **Disasters**, event-level floods and landslides.

### "Yang Tinggal di Dekatmu" (Who lives near you)

A small campaign tool that takes a city, finds the nearest recorded protected
animal and the nearest protected area, and renders a shareable card, so a
distant statistic becomes a neighbour. **Photos and location stay in the browser
and are never uploaded or stored.**

## Data & sources

Every dataset is public and independently verifiable; the in-app
[methodology](https://mandumrimba.org/metodologi) and
[data-sources](https://mandumrimba.org/sumber-data) pages carry per-dataset
licenses, coverage, and update dates, plus an honest list of the gaps where
credible open data does not yet exist.

- **Global Forest Watch** (UMD / Wageningen), deforestation alerts, annual
  tree-cover loss, concession layers, CC BY 4.0
- **Maus et al. 2022**, global mining land use, CC BY 4.0
- **Protected Planet (WDPA)** + **KLHK PIPPIB**, protected areas & moratorium
- **GBIF** occurrences + **IUCN Red List** status + **Permen LHK P.106/2018**,
  **KKP** marine rules & **CITES**, protected-species selection
- **ESA WorldCover 2021**, natural-habitat cover (forest/savanna/wetland) used to
  weight the wildlife-distribution layer, CC BY 4.0
- **BNPB DIBI** (via UNDRR DesInventar), disaster events
- **Trase**, palm exporter ↔ deforestation linkage
- **GADM**, administrative boundaries · **HydroBASINS**, watersheds
- **OpenStreetMap / Nominatim**, location search (© OpenStreetMap contributors, ODbL)

Occurrence coordinates are validated against an Indonesia land mask and the
species' realm, so marine animals mis-plotted inland (or land animals offshore)
are dropped as gross errors while legitimate coastal records are kept. Museum
specimens older than 1990 are excluded so the map reflects present-day presence.

## How it's built

A [pnpm](https://pnpm.io) + [Turborepo](https://turbo.build) monorepo:

- **`apps/web`**, Next.js 14 (App Router), MapLibre GL with vector tiles,
  `next-intl` (Indonesian / English), Recharts.
- **`apps/api`**, NestJS: weekly ingest jobs that pull from the public sources
  above, build vector tiles, and expose a public read-only REST API.
- **`packages/shared`**, shared TypeScript domain types.

📖 **[DATA-FLOW.md](./DATA-FLOW.md)** explains how data moves from source to map ·
**[SETUP.md](./SETUP.md)** covers local setup, ingest jobs, and deployment.

## Local development

```bash
pnpm install

# each app ships an .env.example, copy and fill in source API keys + service
# connection strings (a database and an object store), then:
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

pnpm dev          # web on :3000, api on :4000
```

The ingest jobs run on a weekly schedule; data sources without a stable machine
endpoint are skipped cleanly when unconfigured, so the app runs with whatever
subset you have keys for.

## Editorial principles (non-negotiable)

1. **Evidence over accusation**, show the data as it is; never draw conclusions
   or make claims on the user's behalf.
2. **Every claim is clickable**, at most two clicks to the source dataset.
3. **Reproducible**, open pipeline, public methodology and changelog.
4. **Never fabricate**, data we cannot obtain is marked unavailable and the real
   provider is named; we never invent coordinates, ranges, or figures.
5. **Bilingual**, Indonesian first, English second.

## License

MIT (code). Data belongs to its respective sources, see the methodology page
for per-dataset licenses.
