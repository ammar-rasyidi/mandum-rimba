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
               MINING_IUP_GEOJSON_URL, ADMIN_API_KEY.
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
        "cd /repo && pnpm --filter @mandumrimba/api build",
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
