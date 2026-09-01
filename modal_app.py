"""
Mandum Rimba, heavy data pipeline on Modal.

This runs everything Vercel can't: the nightly ingest jobs, and the tiles job
that shells out to the native `tippecanoe` binary. It writes to the SAME
MongoDB Atlas + Cloudflare R2 that the Vercel API/web read from, Modal and
Vercel never call each other, the datastores are the handoff.

Deploy:        modal deploy modal_app.py
Run one job:   modal run modal_app.py::run_job --job tiles
Run all ingest: modal run modal_app.py::run_job --job ingest   (data only)
Run everything: modal run modal_app.py::run_job --job all      (ingest+tiles+status)
Secrets:       a Modal secret named "mandumrimba-env" holding MONGODB_URI,
               R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
               R2_PUBLIC_BASE_URL, GFW_API_KEY, TRASE_CSV_URL, MODI_CSV_URL,
               MINING_IUP_GEOJSON_URL, ADMIN_API_KEY, and (optional but
               wanted) ADS_API_KEY for the Copernicus CAMS download.
"""

import subprocess

import modal

# ── Image: tippecanoe (compiled) + Node 22 + the built API ──────────────────
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install(
        "git",
        "build-essential",
        "libsqlite3-dev",
        "zlib1g-dev",
        "ca-certificates",
        "curl",
        "unzip",
    )
    # build tippecanoe from source (the tiles job calls it via execFile)
    .run_commands(
        "git clone --depth 1 --branch 2.70.0 https://github.com/felt/tippecanoe.git /tmp/tippecanoe",
        "make -C /tmp/tippecanoe -j4",
        "make -C /tmp/tippecanoe install",
        "rm -rf /tmp/tippecanoe",
    )
    # PM2.5 comes from Copernicus ADS as NetCDF, which xarray reads without the
    # eccodes/GRIB toolchain — that is precisely why ADS was chosen over a GRIB
    # product. boto3 writes the result to R2.
    .pip_install(
        "xarray>=2024.6.0",
        "h5netcdf>=1.3.0",
        # h5netcdf no longer depends on h5py itself; without it xarray fails to
        # open the CAMS NetCDF *after* downloading it
        "h5py>=3.11",
        # xarray's .interp() regrids CAMS onto our axes and needs scipy
        "scipy>=1.13",
        "numpy>=1.26",
        "cdsapi>=0.7.2",
        "boto3>=1.34",
        "requests>=2.32",
    )
    # Node 22 + pnpm (matches the repo's packageManager)
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
        "npm install -g pnpm@9.15.0",
    )
    # bake the monorepo in, then install + build the api (and its shared dep)
    .add_local_dir(
        ".",
        "/repo",
        copy=True,
        ignore=[
            "**/node_modules",
            "**/.next",
            "**/.turbo",
            "**/.git",
            "**/dist",
            "**/.data",
            "**/*.pmtiles",
            "**/*.mbtiles",
        ],
    )
    .run_commands(
        "cd /repo && pnpm install --frozen-lockfile=false",
        # `turbo run` (not a bare `pnpm --filter`) so the workspace dependency
        # is built first: turbo.json declares dependsOn ["^build"], and the API
        # imports @mandumrimba/shared. A bare filtered build compiles only the
        # API and fails on the missing types — and only in this image, because
        # a local checkout usually has packages/shared/dist lying around from a
        # previous build while the image copy ignores **/dist. vercel.json has
        # always used turbo for the same reason; this now matches it.
        "cd /repo && pnpm turbo run build --filter=@mandumrimba/api",
    )
    .workdir("/repo/apps/api")
    # the in-process @nestjs/schedule crons must stay inert; Modal schedules us
    .env({"CRON_ENABLED": "false", "NODE_ENV": "production"})
)

app = modal.App("mandumrimba-pipeline", image=image)
env_secret = modal.Secret.from_name("mandumrimba-env")

# The data-ingest jobs (order among them is not significant). Mirrors the
# staggered WIB cron times in the NestJS services.
INGEST_JOBS = [
    "gfw-alerts",
    "gfw-annual",
    "bnpb-dibi",
    "concessions",
    "modi-esdm",
    "mining",
    "wdpa",
    "trase",
    "nusantara-atlas",
    "gbif-occurrences",
    "wetlands",
]

# Full pipeline: ingest first (so polygons/points exist), THEN tiles builds
# PMTiles from them, THEN status records the run.
JOB_ORDER = [*INGEST_JOBS, "tiles", "status"]

# Convenience aliases for `run_job` so you don't have to fire each job by hand.
JOB_GROUPS = {
    "ingest": INGEST_JOBS,  # all data sources, no tile build
    "all": JOB_ORDER,  # ingest + tiles + status
    "pipeline": JOB_ORDER,
}


def _run(job: str) -> None:
    """Invoke the Nest standalone job runner for one job (raises on failure)."""
    print(f"[mandumrimba] ▶ job: {job}", flush=True)
    subprocess.run(
        ["node", "dist/jobs-cli.js", job],
        cwd="/repo/apps/api",
        check=True,
    )
    print(f"[mandumrimba] ✓ job: {job}", flush=True)


def _run_many(jobs: list[str]) -> None:
    """Run several jobs in order; isolate failures so one bad source doesn't
    block the rest, but surface them at the end."""
    failed: list[str] = []
    for job in jobs:
        try:
            _run(job)
        except Exception as exc:  # noqa: BLE001, keep going, report at end
            print(f"[mandumrimba] ✗ job {job} FAILED: {exc}", flush=True)
            failed.append(job)
    if failed:
        raise RuntimeError(f"finished with failures: {failed}")


# Every 6 months: 1 Jan & 1 Jul at 18:00 UTC = 2nd 01:00 WIB. The upstream sources
# (GBIF, WDPA, GFW, ...) refresh on the order of months-to-years, so twice a year
# keeps the map current without churn or compute cost. (Trigger manually any time
# with run_job for a one-off refresh.)
@app.function(secrets=[env_secret], schedule=modal.Cron("0 18 1 1,7 *"), timeout=6 * 3600)
def pipeline() -> None:
    _run_many(JOB_ORDER)


# ── Air field: the only thing here that runs often ─────────────────────────
# 11:00 and 23:00 UTC (18:00 and 06:00 WIB). CAMS runs at 00 and 12 UTC and is
# published about ten hours later — the 00Z cycle by 10:00 UTC, the 12Z cycle by
# 22:00 UTC (ECMWF's documented timing, and 00Z was observed landing at 10:03).
# An hour of slack after each, because firing before publication does not fail
# loudly: the builder just falls back to the previous run and produces a
# plausible, quietly stale field.
#
# It is separate from `pipeline` above on purpose: the ingest sources refresh on
# the order of months, air quality on the order of hours. Sharing one schedule
# would mean either stale air or pointlessly re-pulling GBIF twice a day.
#
# Output is static JSON on R2 (`air/index.json` + `air/t/<iso>.json`), which the
# web fetches straight from the CDN — no Vercel function, no browser-side
# weather API call, and no per-request upstream cost. See
# scripts/air-field/README.md for why a gridded source replaced point queries.
@app.function(secrets=[env_secret], schedule=modal.Cron("0 11,23 * * *"), timeout=45 * 60)
def air_field() -> None:
    print("[mandumrimba] ▶ job: air-field", flush=True)
    subprocess.run(
        ["python", "-u", "/repo/scripts/air-field/build_air_field.py"],
        check=True,
    )
    print("[mandumrimba] ✓ job: air-field", flush=True)


# On-demand job(s):
#   modal run modal_app.py::run_job --job tiles      (one job)
#   modal run modal_app.py::run_job --job ingest     (all data sources)
#   modal run modal_app.py::run_job --job all        (ingest + tiles + status)
@app.function(secrets=[env_secret], timeout=6 * 3600)
def run_job(job: str) -> None:
    if job in JOB_GROUPS:
        _run_many(JOB_GROUPS[job])
    else:
        _run(job)
