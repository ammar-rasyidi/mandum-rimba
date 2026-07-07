# Biodiversity-map distribution build

Builds the `/biodiversitas` map's **endemic fauna** and **iconic flora**
DISTRIBUTION AREAS (sebaran) from curated GBIF occurrence points. Like the
`/peta` "Peta Sebaran Satwa" layer, the points are contoured into smooth,
per-island density areas instead of shown as raw dots. This is an **offline**
build, run occasionally, not part of the scheduled Modal pipeline.

## What it produces

| Output (to `apps/web/public/data/`) | Map layer |
| --- | --- |
| `endemic-fauna-dist-id.geojson` | Endemic wildlife distribution (coloured by Sundaland / Wallacea / Papua zone) |
| `endemic-flora-dist-id.geojson` | Endemic & iconic flora distribution |

## Method

1. **Inputs** (`inputs/`): curated GBIF occurrence points per taxon —
   `endemic-species-id.geojson` (fauna, props `{taxon, grp}`) and
   `endemic-flora-id.geojson` (flora, props `{taxon}`, produced by `pull_flora.py`,
   see below). Points already curated, so there is no IUCN / habitat / flagship
   filtering here (unlike the wildlife build). Stray out-of-country records are
   dropped by the Indonesia bbox.
2. **Per-island contours**: each `(zone, island)` group is kernel-density
   binned, gaussian-blurred, contoured at a low quantile, de-staircased
   (shapely simplify) and rounded (Chaikin). Contouring **per island**
   (`assign_island`, the same partition as `../species-distribution/contour.py`)
   keeps a taxon on its actual island — Komodo stays on Nusa Tenggara,
   Cendrawasih stays on Papua.
3. Each polygon is tagged with the `taxa` recorded inside it (for the map popup)
   and, for fauna, its biogeographic `grp`.

## Run it

`pull_flora.py` needs only the standard library; `contour_bio.py` needs
`numpy`, `matplotlib`, `shapely`.

```bash
python pull_flora.py                 # GBIF occurrences -> inputs/endemic-flora-id.geojson
python contour_bio.py [sigma] [low_quantile] [min_area]
# contour defaults: 3.0 0.45 0.15  (raise sigma = smoother/looser; raise quantile = tighter)
```

`pull_flora.py` pulls georeferenced Indonesia records (no geospatial issue) for
the curated flora label list — a mix of genera (more points) and single iconic
species. Outputs are written straight into `apps/web/public/data/`. (The fauna
input `endemic-species-id.geojson` was curated earlier and has no puller yet.)

## Click profiles (fauna & flora)

The **distribution areas** come from GBIF occurrences, but the per-species info
shown when an area is clicked comes from curated, hand-verified catalogs:
[`apps/web/src/data/flora-species.json`](../../apps/web/src/data/flora-species.json)
(18 flora taxa) and
[`apps/web/src/data/fauna-species.json`](../../apps/web/src/data/fauna-species.json)
(8 endemic-wildlife taxa). Each entry carries scientific name, common EN/ID names,
type, endemic status, range, habitat, IUCN status, CITES appendix, legal
protection, a short description and a primary reference — sourced from **POWO
(Kew), IUCN Red List, CITES and peer-reviewed work**. Where a global conservation
status is not formally assessed, that is stated explicitly, never guessed. The
JSON keys must stay in sync with the `taxon` labels in the matching input
GeoJSON (fauna: `endemic-species-id.geojson`; flora: `endemic-flora-id.geojson`).

## Sources

GBIF (CC0 / CC BY, occurrence points) for the areas; POWO/Kew, IUCN Red List and
CITES for the species profiles. There is no open-licensed authoritative
range-polygon dataset — IUCN's expert ranges forbid redistribution — so, as on
the wildlife layer, open GBIF occurrences contoured into areas are the honest
open alternative. See the in-app methodology and data-sources pages.
