"""
Build the "Udara & asap" field and publish it to R2 as static JSON.

See README.md for why this exists. In one sentence: Open-Meteo's free quota is
counted per location, so assembling a raster from point queries put a hard
ceiling on resolution and eventually spent the whole day's allowance. CAMS
serves the entire PM2.5 grid in a single request, so resolution stops being
something we ration.

Output (gzipped, under the `air/` prefix):
    air/index.json      bbox, grid dims, timestamps, attribution
    air/t/<ISO>.json    one time step: {pm25, u, v, maxSpeed}

Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
     ADS_API_KEY (optional; without it PM2.5 falls back to Open-Meteo at 1°).
"""

import argparse
import gzip
import json
import math
import os
import pathlib
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone

import boto3
import requests

# ── Region ──────────────────────────────────────────────────────────────────
# Southeast Asia, not Indonesia alone: haze does not stop at the border. Riau's
# smoke reaches Kuala Lumpur and Singapore, and Indochina's burning season blows
# south, so a map cropped to the coastline hides half of what it explains.
WEST, SOUTH, EAST, NORTH = 90.0, -13.0, 145.0, 22.0

# CAMS is native ~0.4°; 0.5° keeps a plume's shape while halving the payload.
PM_STEP = 0.5
# The Open-Meteo fallback is charged per location, so it gets a coarser grid.
PM_STEP_FALLBACK = 1.0
# Wind is genuinely smooth at continental scale and the client interpolates
# between nodes, so finer would cost quota and buy nothing visible.
WIND_STEP = 2.5

# 3-hourly out to 48 h: enough for "where is the smoke heading tomorrow"
# without shipping a megabyte of hours nobody scrubs to.
LEAD_HOURS = list(range(0, 49, 3))

PREFIX = "air"
UA = "MandumRimba/0.1 (public-interest environmental observatory, Indonesia)"
ATTRIBUTION = (
    "PM2.5: Copernicus Atmosphere Monitoring Service (CAMS). "
    "Angin 10 m: NOAA GFS. Keduanya via Copernicus ADS / Open-Meteo, "
    "hasil model, bukan pengukuran darat."
)

ADS_URL = "https://ads.atmosphere.copernicus.eu/api"
ADS_DATASET = "cams-global-atmospheric-composition-forecasts"
OPEN_METEO_AIR = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_WX = "https://api.open-meteo.com/v1/forecast"

# Open-Meteo's minutely ceiling is ~600 locations; stay under it and never
# fire batches in parallel, which earns an immediate 429 regardless of size.
BATCH = 200
BUDGET_PER_MIN = 500


def axis(step):
    """Grid coordinates, west→east and south→north, as the payload orders them."""
    nx = round((EAST - WEST) / step) + 1
    ny = round((NORTH - SOUTH) / step) + 1
    lons = [round(WEST + i * step, 4) for i in range(nx)]
    lats = [round(SOUTH + j * step, 4) for j in range(ny)]
    return nx, ny, lons, lats


def scaled(v):
    """Payload values are integers ×10; None means unknown, never zero."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else int(round(f * 10))


# ── PM2.5 from Copernicus ADS (the whole grid, one request) ─────────────────
def pm25_from_ads(run_times, run_lead):
    """
    Returns (step, nx, ny, {iso_time: [values]}) or None if ADS is unavailable.

    A missing key is a normal, expected state — the fallback below still
    produces a usable field — so this logs and returns None rather than raising.
    """
    key = os.environ.get("ADS_API_KEY")
    if not key:
        print("[air] ADS_API_KEY not set, falling back to Open-Meteo", flush=True)
        return None

    try:
        import cdsapi
        import xarray as xr
    except ImportError as exc:
        print(f"[air] ADS deps missing ({exc}), falling back", flush=True)
        return None

    # CAMS runs at 00 and 12 UTC and publishes some hours later; ask for the
    # most recent run that is plausibly complete rather than "today", which
    # fails for the first hours of every UTC day.
    run = datetime.now(timezone.utc) - timedelta(hours=8)
    date = run.strftime("%Y-%m-%d")
    cycle = "12:00" if run.hour >= 12 else "00:00"

    out = os.path.join(tempfile.gettempdir(), "cams_pm25.nc")
    try:
        client = cdsapi.Client(url=ADS_URL, key=key)
        client.retrieve(
            ADS_DATASET,
            {
                "variable": ["particulate_matter_2.5um"],
                "date": f"{date}/{date}",
                "time": [cycle],
                "leadtime_hour": [str(h) for h in run_lead],
                "type": ["forecast"],
                "data_format": "netcdf",
                # ADS wants [north, west, south, east]
                "area": [NORTH, WEST, SOUTH, EAST],
            },
            out,
        )
    except Exception as exc:  # noqa: BLE001 — any ADS failure must not lose the run
        print(f"[air] ADS retrieve failed ({exc}), falling back", flush=True)
        return None

    try:
        ds = xr.open_dataset(out)
        var = next(
            (v for v in ("pm2p5", "pm2p5_conc", "particulate_matter_2.5um") if v in ds),
            None,
        )
        if var is None:
            var = list(ds.data_vars)[0]
        da = ds[var]

        nx, ny, lons, lats = axis(PM_STEP)
        # CAMS latitudes run north→south; interp puts both axes on our grid and
        # our order in one step, so nothing downstream has to know the difference
        lat_name = "latitude" if "latitude" in da.dims else "lat"
        lon_name = "longitude" if "longitude" in da.dims else "lon"
        da = da.interp({lat_name: lats, lon_name: lons})

        # CAMS PM2.5 is kg/m³; the map speaks µg/m³
        unit = str(ds[var].attrs.get("units", "")).lower()
        factor = 1e9 if unit.startswith("kg") else 1.0

        lead_dim = next(
            (d for d in da.dims if d not in (lat_name, lon_name)),
            None,
        )
        frames = {}
        for i, iso in enumerate(run_times):
            if lead_dim is None:
                plane = da
            elif i >= da.sizes[lead_dim]:
                break
            else:
                plane = da.isel({lead_dim: i})
            vals = plane.values.reshape(-1)
            frames[iso] = [scaled(v * factor) for v in vals]
        ds.close()
        print(f"[air] CAMS: {nx}×{ny} @ {PM_STEP}°, {len(frames)} steps", flush=True)
        return PM_STEP, nx, ny, frames
    except Exception as exc:  # noqa: BLE001
        print(f"[air] CAMS parse failed ({exc}), falling back", flush=True)
        return None
    finally:
        if os.path.exists(out):
            os.remove(out)


# ── Open-Meteo (wind always; PM2.5 only as the fallback) ────────────────────
_spent = []


def _reserve(n):
    """Rolling per-minute location budget, matching apps/api/src/api/open-meteo.ts."""
    global _spent
    while True:
        cutoff = time.time() - 60
        _spent = [t for t in _spent if t > cutoff]
        if len(_spent) + n <= BUDGET_PER_MIN:
            break
        time.sleep(max(1.0, _spent[0] + 60 - time.time() + 0.5))
    now = time.time()
    _spent.extend([now] * n)


def fetch_points(base, query, lats, lons):
    """Multi-location Open-Meteo query, batched under the ~8 kB URI limit and
    paced under the location budget. Sequential on purpose: concurrent batches
    return 429 no matter how small they are."""
    rows = []
    for i in range(0, len(lats), BATCH):
        la = lats[i : i + BATCH]
        lo = lons[i : i + BATCH]
        _reserve(len(la))
        url = (
            f"{base}?latitude={','.join(str(v) for v in la)}"
            f"&longitude={','.join(str(v) for v in lo)}&{query}"
        )
        res = requests.get(url, timeout=120, headers={"User-Agent": UA})
        if res.status_code == 429:
            reason = ""
            try:
                reason = res.json().get("reason", "")
            except Exception:  # noqa: BLE001
                pass
            # the daily limit does not clear by waiting; fail loudly instead of
            # hammering a service that already said no
            raise RuntimeError(f"Open-Meteo quota: {reason or res.text[:120]}")
        res.raise_for_status()
        body = res.json()
        rows.extend(body if isinstance(body, list) else [body])
    return rows


def grid_points(step):
    nx, ny, lons, lats = axis(step)
    plat, plon = [], []
    for la in lats:
        for lo in lons:
            plat.append(la)
            plon.append(lo)
    return nx, ny, plat, plon


def wind_from_open_meteo(run_times):
    nx, ny, plat, plon = grid_points(WIND_STEP)
    rows = fetch_points(
        OPEN_METEO_WX,
        "hourly=wind_speed_10m,wind_direction_10m&models=gfs_global"
        "&wind_speed_unit=ms&forecast_days=3&timezone=UTC",
        plat,
        plon,
    )
    times = next((r.get("hourly", {}).get("time") for r in rows if r.get("hourly")), [])
    idx = {t: i for i, t in enumerate(times)}

    frames = {}
    for iso in run_times:
        h = idx.get(iso)
        if h is None:
            continue
        u_row, v_row = [], []
        for r in rows:
            hourly = r.get("hourly") or {}
            spd = (hourly.get("wind_speed_10m") or [None])[h : h + 1]
            dirn = (hourly.get("wind_direction_10m") or [None])[h : h + 1]
            s = spd[0] if spd else None
            d = dirn[0] if dirn else None
            if s is None or d is None:
                u_row.append(None)
                v_row.append(None)
                continue
            # meteorological direction is where wind comes FROM; particles need
            # the components it blows TOWARD
            rad = math.radians(d)
            u_row.append(scaled(-s * math.sin(rad)))
            v_row.append(scaled(-s * math.cos(rad)))
        frames[iso] = (u_row, v_row)
    print(f"[air] wind: {nx}×{ny} @ {WIND_STEP}°, {len(frames)} steps", flush=True)
    return nx, ny, frames


def pm25_from_open_meteo(run_times):
    nx, ny, plat, plon = grid_points(PM_STEP_FALLBACK)
    rows = fetch_points(
        OPEN_METEO_AIR,
        "hourly=pm2_5&domains=cams_global&forecast_days=3&timezone=UTC",
        plat,
        plon,
    )
    times = next((r.get("hourly", {}).get("time") for r in rows if r.get("hourly")), [])
    idx = {t: i for i, t in enumerate(times)}

    frames = {}
    for iso in run_times:
        h = idx.get(iso)
        if h is None:
            continue
        frames[iso] = [
            scaled(((r.get("hourly") or {}).get("pm2_5") or [None] * (h + 1))[h])
            for r in rows
        ]
    print(
        f"[air] PM2.5 (fallback): {nx}×{ny} @ {PM_STEP_FALLBACK}°, {len(frames)} steps",
        flush=True,
    )
    return PM_STEP_FALLBACK, nx, ny, frames


# ── R2 ──────────────────────────────────────────────────────────────────────
class LocalSink:
    """Writes the same keys to a directory instead of R2, so the whole build can
    be exercised locally with no credentials and nothing published. Files land
    UNCOMPRESSED so you can read them; R2 gets gzip."""

    def __init__(self, root):
        self.root = pathlib.Path(root)

    def put_object(self, **kw):
        path = self.root / kw["Key"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(gzip.decompress(kw["Body"]))


def r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def put_json(s3, bucket, key, obj, max_age):
    body = gzip.compress(
        json.dumps(obj, separators=(",", ":")).encode(), compresslevel=9
    )
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType="application/json",
        ContentEncoding="gzip",
        CacheControl=f"public, max-age={max_age}",
    )
    return len(body)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--out",
        metavar="DIR",
        help="write to this directory instead of R2 (no credentials needed)",
    )
    ap.add_argument(
        "--steps",
        type=int,
        default=len(LEAD_HOURS),
        help="how many 3-hourly steps to build; fewer costs less upstream "
        "when the PM2.5 fallback is in use (default: all)",
    )
    args = ap.parse_args()

    lead = LEAD_HOURS[: max(1, args.steps)]

    # Time axis in UTC, aligned to the 3-hourly steps both sources can serve.
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    base = now - timedelta(hours=now.hour % 3)
    run_times = [
        (base + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in lead
    ]

    pm = pm25_from_ads(run_times, lead) or pm25_from_open_meteo(run_times)
    pm_step, pm_nx, pm_ny, pm_frames = pm
    wind_nx, wind_ny, wind_frames = wind_from_open_meteo(run_times)

    # only publish steps where BOTH fields exist: a frame with wind and no
    # colour (or the reverse) renders as a bug, not as missing data
    times = [t for t in run_times if t in pm_frames and t in wind_frames]
    if not times:
        print("[air] no complete time steps, refusing to publish", flush=True)
        sys.exit(1)

    if args.out:
        s3 = LocalSink(args.out)
        bucket = "(local)"
        print(f"[air] dry run, writing to {args.out}", flush=True)
    else:
        s3 = r2_client()
        bucket = os.environ["R2_BUCKET"]
    total = 0
    for iso in times:
        u_row, v_row = wind_frames[iso]
        max_speed = 0.0
        for a, b in zip(u_row, v_row):
            if a is None or b is None:
                continue
            max_speed = max(max_speed, math.hypot(a / 10, b / 10))
        total += put_json(
            s3,
            bucket,
            f"{PREFIX}/t/{iso}.json",
            {
                "pm25": pm_frames[iso],
                "u": u_row,
                "v": v_row,
                "maxSpeed": round(max_speed, 1),
            },
            # a step never changes once published; only the index moves
            max_age=86400,
        )

    index = {
        "bbox": [WEST, SOUTH, EAST, NORTH],
        "pm": {"nx": pm_nx, "ny": pm_ny, "step": pm_step},
        "wind": {"nx": wind_nx, "ny": wind_ny, "step": WIND_STEP},
        "times": times,
        "source": "cams-ads" if pm_step == PM_STEP else "open-meteo",
        "attribution": ATTRIBUTION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    # short max-age: this is the file that tells clients a newer run exists
    total += put_json(s3, bucket, f"{PREFIX}/index.json", index, max_age=900)

    print(
        f"[air] published {len(times)} steps ({total/1024:.0f} kB gzipped) "
        f"from {index['source']}",
        flush=True,
    )


if __name__ == "__main__":
    main()
