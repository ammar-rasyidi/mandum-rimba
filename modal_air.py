"""
Mandum Rimba, "Udara & asap" field on Modal.

Downloads CAMS PM2.5 and GFS 10 m wind, and publishes the blended field to R2
as static JSON. The web app fetches it straight from the CDN — no Vercel
function, no browser-side weather API call.

This is a SEPARATE Modal app from modal_app.py, and the split is on purpose.
The two jobs have nothing in common but a secret:

  - cadence: the ingest sources (GBIF, WDPA, GFW) refresh on the order of
    months and run twice a YEAR; air quality refreshes on the order of hours
    and runs twice a DAY.
  - image: the pipeline needs tippecanoe compiled from source, Node 22, and a
    pnpm install + turbo build of the whole monorepo. This job needs Python and
    eight pip packages. Sharing the image made every air run pay a cold start
    on a multi-gigabyte layer, and made a broken API build stop the air field
    for reasons that have nothing to do with air.
  - blast radius: deploying a one-line fix to the builder no longer redeploys
    the ingest pipeline, and vice versa.

Deploy:   modal deploy modal_air.py
Run now:  modal run modal_air.py::air_field
Secret:   "mandumrimba-air-env" — ADS_API_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
          R2_SECRET_ACCESS_KEY, R2_BUCKET. Those five are the whole surface;
          this job never touches Mongo.

It has its OWN secret rather than borrowing "mandumrimba-env". That secret holds
a dozen keys this job has no business reading, including MONGODB_URI, and
Modal's CLI can only replace a secret wholesale — so adding ADS_API_KEY to it
from here would have silently dropped TRASE_CSV_URL, MODI_CSV_URL and
MINING_IUP_GEOJSON_URL, whose values are not in the local .env.

ADS_API_KEY is not optional in practice. Without it the builder falls back to
Open-Meteo, which is charged per location and cannot cover this box — it now
refuses rather than spending the day's quota on a partial field.
"""

import subprocess

import modal

# Plain Python. PM2.5 arrives from Copernicus ADS as NetCDF, which xarray reads
# without the eccodes/GRIB toolchain — that is precisely why ADS was chosen over
# a GRIB product, and it is what keeps this image small.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install_from_requirements("scripts/air-field/requirements.txt")
    .add_local_dir("scripts/air-field", "/app", ignore=["__pycache__", "*.pyc"])
)

app = modal.App("mandumrimba-air", image=image)
env_secret = modal.Secret.from_name("mandumrimba-air-env")


# 11:00 and 23:00 UTC (18:00 and 06:00 WIB). CAMS runs at 00 and 12 UTC and is
# published about ten hours later — the 00Z cycle by 10:00 UTC, the 12Z cycle by
# 22:00 UTC (ECMWF's documented timing; 00Z has been observed landing at 10:03).
# An hour of slack after each, because firing before publication does not fail
# loudly: the builder just walks back to the previous run and produces a
# plausible, quietly stale field.
#
# Timeout is generous because the ADS request QUEUES. The download itself takes
# seconds; waiting for Copernicus to serve it is the variable part.
@app.function(
    secrets=[env_secret],
    schedule=modal.Cron("0 11,23 * * *"),
    timeout=45 * 60,
    # A missed cycle means the map shows yesterday's air until the next run
    # 12 h later, so a transient R2 or network failure is worth retrying.
    # Modal caps initial_delay at 60 s, so this retries at +1 min and +3 min —
    # enough for a blip, not enough to outlast an ADS outage. That is fine:
    # the builder walks back through older CAMS cycles on its own, so an outage
    # degrades to a slightly older run rather than to nothing.
    retries=modal.Retries(
        max_retries=2, backoff_coefficient=2.0, initial_delay=60.0
    ),
)
def air_field() -> None:
    print("[mandumrimba] ▶ job: air-field", flush=True)
    subprocess.run(["python", "-u", "/app/build_air_field.py"], check=True)
    print("[mandumrimba] ✓ job: air-field", flush=True)
