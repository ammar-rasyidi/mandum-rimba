# air-field

Builds the gridded field behind the "Udara & asap" map layer and publishes it
to Cloudflare R2 as static JSON. Run twice a day by Modal
(`modal_app.py::air_field`); the web fetches the result straight from the CDN,
so neither Vercel nor the browser ever talks to a weather API.

## Why this exists

The first version queried Open-Meteo for one point per grid node and assembled
a raster from the answers. Open-Meteo's free quota is counted PER LOCATION, so
a single 2,016-node field cost 2,016 units of a 10,000/day allowance — a
resolution ceiling and a daily outage waiting to happen, and it happened.

A gridded product is one file. CAMS gives the whole PM2.5 field in a single
request, so resolution stops being something we ration.

## Sources

| field | source | cost per run |
|---|---|---|
| PM2.5 | Copernicus ADS, `cams-global-atmospheric-composition-forecasts` (NetCDF) | 1 request |
| PM2.5 (fallback) | Open-Meteo grid at 1° | 2,016 locations |
| wind 10 m | Open-Meteo `gfs_global`, 2.5° | 345 locations |

Wind stays on Open-Meteo deliberately: at 2.5° it is 345 locations (690/day),
far inside the free tier, and a wind field genuinely is smooth at that scale.
Only PM2.5 ever needed the gridded source.

Without `ADS_API_KEY` the script falls back to Open-Meteo for PM2.5 and still
works — at 1° instead of CAMS's native 0.4°, and at 4,032 locations a day.

## Output (R2, `air/` prefix, gzipped)

    air/index.json      bbox, grid dims, timestamps, attribution
    air/t/<ISO>.json    one time step: {pm25, u, v, maxSpeed}

The client fetches the index, picks the step nearest to now, and pulls only
that file — so a page load costs ~25 kB, and a future time slider costs one
small request per step rather than a megabyte up front.

## Getting an ADS key (free)

1. Register at https://ads.atmosphere.copernicus.eu (name, email, country).
2. Accept the licence on the dataset page. This is separate from registering
   and is the step that actually gates access — with a valid key but no
   accepted licence the API answers `403 required licences not accepted`,
   which is easy to misread as a broken key. One click:
   https://ads.atmosphere.copernicus.eu/datasets/cams-global-atmospheric-composition-forecasts?tab=download#manage-licences
3. Copy the personal access token from your ADS profile page into the
   `ADS_API_KEY` env var (and into the `mandumrimba-env` Modal secret).

## Local run

Dry run — no credentials, nothing published, files written where you can read
them. `--steps` only limits how many step files are written; it does not make
the run cheaper, because both sources are fetched once as an hourly series and
then sliced. A full 17-step build costs exactly what a 1-step build does.

    pip install -r requirements.txt
    python build_air_field.py --out /tmp/airfield --steps 2
    ls -R /tmp/airfield          # air/index.json + air/t/<iso>.json

Serve those to a local web build to see them on the map:

    python -m http.server 4002 -d /tmp/airfield        # in one shell
    TILES_ORIGIN=http://localhost:4002 pnpm --filter @mandumrimba/web dev

For real (publishes to R2):

    export $(grep -v '^#' ../../apps/api/.env | xargs)   # R2 creds [+ ADS_API_KEY]
    python build_air_field.py
