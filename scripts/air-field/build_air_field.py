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
import hashlib
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
# The Open-Meteo fallback is charged per location, so its resolution is a quota
# decision, not a taste one. At 0.75° the region is 74×48 = 3,552 locations;
# with wind's 345 that is 3,897 a run and 7,794 a day at two runs, inside the
# 10,000 ceiling and under the 5,000/hour one. 0.5° would be 7,881 a run and
# does not fit. This is an interim: once ADS_API_KEY is set, PM2.5 comes from
# CAMS at 0.5° for ONE request and Open-Meteo drops to just the 345 wind nodes,
# at which point this constant stops mattering.
PM_STEP_FALLBACK = 0.75
# Wind is genuinely smooth at continental scale and the client interpolates
# between nodes, so finer would cost quota and buy nothing visible.
WIND_STEP = 2.5

# 3-hourly out to 48 h from NOW — which is not the same as 48 h of lead time.
# A CAMS run is published hours after its reference time, so by the time we can
# fetch it the run is already 8-20 h old and lead 0 is yesterday. Ask far enough
# ahead that "now" is inside the window, then keep only the steps that are.
LEAD_HOURS = list(range(0, 73, 3))


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


def _parse(iso):
    """'2026-08-30T09:00' (UTC, no suffix) -> aware datetime."""
    return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)


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
def pm25_from_ads(run_lead):
    """
    Returns (step, nx, ny, frames, bbox) on CAMS's OWN grid, or None if ADS is
    unavailable. Keys of `frames` are the file's valid times, in UTC.

    A missing key is a normal, expected state — the fallback below still
    produces a usable field — so this logs and returns None rather than raising.
    """
    key = os.environ.get("ADS_API_KEY")
    if not key:
        print("[air] ADS_API_KEY not set, falling back to Open-Meteo", flush=True)
        return None

    try:
        import cdsapi
        import numpy as np
        import xarray as xr
    except ImportError as exc:
        print(f"[air] ADS deps missing ({exc}), falling back", flush=True)
        return None

    # CAMS runs at 00 and 12 UTC and is published some hours later — how many
    # varies. Guessing one offset and hoping fails with a bare 400 the moment
    # the guess is early, which is how this fell back to the coarse source on
    # its own. Walk backwards through the recent cycles instead and take the
    # first that actually exists.
    out = os.path.join(tempfile.gettempdir(), "cams_pm25.nc")
    now = datetime.now(timezone.utc)
    candidates = []
    probe = now.replace(minute=0, second=0, microsecond=0)
    probe = probe.replace(hour=12 if probe.hour >= 12 else 0)
    for _ in range(4):  # ~2 days back, plenty
        candidates.append(probe)
        probe -= timedelta(hours=12)

    client = cdsapi.Client(url=ADS_URL, key=key, quiet=True)
    got = None
    for run in candidates:
        try:
            client.retrieve(
                ADS_DATASET,
                {
                    "variable": ["particulate_matter_2.5um"],
                    "date": f"{run:%Y-%m-%d}/{run:%Y-%m-%d}",
                    "time": [f"{run:%H:%M}"],
                    "leadtime_hour": [str(h) for h in run_lead],
                    "type": ["forecast"],
                    "data_format": "netcdf",
                    # ADS wants [north, west, south, east]
                    "area": [NORTH, WEST, SOUTH, EAST],
                },
                out,
            )
            got = run
            break
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            if "licence" in msg.lower() or "license" in msg.lower():
                print(
                    "[air] ADS REFUSED: the dataset licence has not been accepted.\n"
                    "      The API key itself is fine. Accept it once here:\n"
                    f"      https://ads.atmosphere.copernicus.eu/datasets/{ADS_DATASET}"
                    "?tab=download#manage-licences",
                    flush=True,
                )
                return None
            print(f"[air] CAMS run {run:%Y-%m-%d %H:%M}Z unavailable, trying older", flush=True)
    if got is None:
        print("[air] no recent CAMS run available, falling back", flush=True)
        return None
    print(f"[air] CAMS run {got:%Y-%m-%d %H:%M}Z", flush=True)

    try:
        ds = xr.open_dataset(out)
        var = next(
            (v for v in ("pm2p5", "pm2p5_conc", "particulate_matter_2.5um") if v in ds),
            None,
        )
        if var is None:
            var = list(ds.data_vars)[0]
        da = ds[var]

        # Use CAMS's OWN grid. Do not regrid.
        #
        # Resampling 0.4° onto our 0.5° axes was producing a visible lattice of
        # blobs every 2°, and it was arithmetic, not data: interpolation error
        # is zero wherever a target node coincides with a source node and
        # largest halfway between, and 0.4 and 0.5 coincide exactly every 2°.
        # That beat, amplified by a steep colour ramp, is what looked like
        # stripes. A model grid should be shown as delivered.
        lat_name = "latitude" if "latitude" in da.dims else "lat"
        lon_name = "longitude" if "longitude" in da.dims else "lon"
        src_lat = ds[lat_name].values
        src_lon = ds[lon_name].values
        # CAMS runs north→south; the payload is ordered south→north
        flip = bool(src_lat[0] > src_lat[-1])
        if flip:
            da = da.isel({lat_name: slice(None, None, -1)})
            src_lat = src_lat[::-1]

        nx, ny = len(src_lon), len(src_lat)
        step = round(float(abs(src_lon[1] - src_lon[0])), 4)
        box = (
            float(src_lon[0]),
            float(src_lat[0]),
            float(src_lon[-1]),
            float(src_lat[-1]),
        )

        # CAMS PM2.5 is kg/m³; the map speaks µg/m³
        unit = str(ds[var].attrs.get("units", "")).lower()
        factor = 1e9 if unit.startswith("kg") else 1.0

        # The frame's time comes from the FILE, never from the clock. Labelling
        # CAMS frames with "now" was the bug that made this layer show
        # yesterday's lead-0 analysis — a razor-sharp emission spike that has
        # not dispersed yet — while claiming it was current.
        valid = ds["valid_time"].values.ravel()
        # the run these frames came from — the thing a reader would look up to
        # check us, and the only honest answer to "when was this produced"
        ref = ds["forecast_reference_time"].values.ravel()[0]
        run_at = np.datetime_as_string(ref, unit="m")
        lead_dim = next(
            (d for d in da.dims if d not in (lat_name, lon_name)),
            None,
        )
        n = da.sizes[lead_dim] if lead_dim else 1

        frames = {}
        for i in range(min(n, len(valid))):
            iso = np.datetime_as_string(valid[i], unit="m")  # "YYYY-MM-DDTHH:MM"
            plane = da.isel({lead_dim: i}) if lead_dim else da
            vals = plane.values.reshape(-1)
            frames[iso] = [scaled(v * factor) for v in vals]
        print(
            f"[air] CAMS native grid: {nx}×{ny} @ {step}° "
            f"({box[0]}..{box[2]}E, {box[1]}..{box[3]}N), {len(frames)} steps",
            flush=True,
        )
        return step, nx, ny, frames, box, run_at
    except ModuleNotFoundError as exc:
        # A missing dependency here is a deployment error, not a data problem,
        # and it surfaces only AFTER the download has already succeeded — which
        # makes it read like bad data. Name it for what it is.
        print(
            f"[air] CAMS parse failed: missing dependency {exc.name!r}. "
            "This is an environment problem, not an ADS one — "
            "pip install -r scripts/air-field/requirements.txt",
            flush=True,
        )
        return None
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


def wind_from_open_meteo(run_times, box):
    # Built on the SAME box PM2.5 defined, with a step chosen to span it
    # exactly. If the two grids disagreed about where the field starts, the
    # particles would drift relative to the colour they are meant to explain.
    w, s_, e, n = box
    nx = max(2, round((e - w) / WIND_STEP) + 1)
    ny = max(2, round((n - s_) / WIND_STEP) + 1)
    sx = (e - w) / (nx - 1)
    sy = (n - s_) / (ny - 1)
    plat, plon = [], []
    for j in range(ny):
        for i in range(nx):
            plat.append(round(s_ + j * sy, 4))
            plon.append(round(w + i * sx, 4))
    rows = fetch_points(
        OPEN_METEO_WX,
        "hourly=wind_speed_10m,wind_direction_10m&models=gfs_global"
        "&wind_speed_unit=ms&forecast_days=4&timezone=UTC",
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
    print(
        f"[air] wind: {nx}×{ny} @ {sx:.3f}×{sy:.3f}°, {len(frames)} steps",
        flush=True,
    )
    return nx, ny, sx, frames


def pm25_from_open_meteo(run_times):
    nx, ny, plat, plon = grid_points(PM_STEP_FALLBACK)
    rows = fetch_points(
        OPEN_METEO_AIR,
        "hourly=pm2_5&domains=cams_global&forecast_days=4&timezone=UTC",
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
    return PM_STEP_FALLBACK, nx, ny, frames, (WEST, SOUTH, EAST, NORTH), None


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



def previous_wind(s3, bucket, times, nx, ny):
    """
    Wind from the last published build, for when Open-Meteo is unavailable.

    PM2.5 is the expensive half and the one that matters; losing a whole run
    because the wind quota ran out means publishing nothing rather than
    publishing a current pollution field with slightly older streamlines. Wind
    at 2.5 degrees changes slowly enough that hours-old vectors are honest —
    and a map with no field at all is not.

    Returns {time: (u, v)} for whatever it can match, nearest hour wins.
    """
    try:
        idx = json.loads(
            gzip.decompress(
                s3.get_object(Bucket=bucket, Key=f"{PREFIX}/index.json")["Body"].read()
            )
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[air] no previous build to borrow wind from ({exc})", flush=True)
        return {}
    if idx.get("wind", {}).get("nx") != nx or idx.get("wind", {}).get("ny") != ny:
        print("[air] previous wind grid differs, not reusing", flush=True)
        return {}

    prefix = idx.get("steps") or f"{PREFIX}/t"
    have = {}
    for t in idx.get("times", []):
        try:
            body = s3.get_object(Bucket=bucket, Key=f"{prefix}/{t}.json")["Body"].read()
            step = json.loads(gzip.decompress(body))
            have[t] = (step["u"], step["v"])
        except Exception:  # noqa: BLE001, S112
            continue
    if not have:
        return {}

    out = {}
    keys = sorted(have)
    for t in times:
        nearest = min(keys, key=lambda k: abs(_parse(k) - _parse(t)))
        out[t] = have[nearest]
    print(
        f"[air] reusing wind from the previous build ({len(have)} steps available)",
        flush=True,
    )
    return out


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
        help="how many 3-hourly steps to publish (default: all). This does NOT "
        "change upstream cost: both sources are fetched once as a series and "
        "sliced per step. Use it to keep a test's output small, not cheap.",
    )
    args = ap.parse_args()

    lead = LEAD_HOURS

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    horizon = now + timedelta(hours=48)

    # PM2.5 defines the time axis, because CAMS decides its own valid times and
    # we must not pretend otherwise. Wind is then fetched for exactly those
    # hours. The fallback has no run offset, so it gets an axis built from now.
    pm = pm25_from_ads(lead)
    run_at = None
    if pm:
        pm_step, pm_nx, pm_ny, pm_frames, box, run_at = pm
        times = sorted(
            t
            for t in pm_frames
            if now - timedelta(hours=2) <= _parse(t) <= horizon
        )[: max(1, args.steps)]
        if not times:
            print("[air] CAMS returned no steps covering now, falling back", flush=True)
            pm = None
    if not pm:
        base = now - timedelta(hours=now.hour % 3)
        times = [
            (base + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M")
            for h in LEAD_HOURS[: max(1, args.steps)]
            if base + timedelta(hours=h) <= horizon
        ]
        pm_step, pm_nx, pm_ny, pm_frames, box, run_at = pm25_from_open_meteo(times)

    print(
        f"[air] time axis: {len(times)} steps, {times[0]} -> {times[-1]} "
        f"(now {now:%Y-%m-%dT%H:%M})",
        flush=True,
    )
    if args.out:
        s3 = LocalSink(args.out)
        bucket = "(local)"
        print(f"[air] dry run, writing to {args.out}", flush=True)
    else:
        s3 = r2_client()
        bucket = os.environ["R2_BUCKET"]

    try:
        wind_nx, wind_ny, wind_step, wind_frames = wind_from_open_meteo(times, box)
    except Exception as exc:  # noqa: BLE001
        print(f"[air] wind fetch failed ({exc})", flush=True)
        w, s_, e, n = box
        wind_nx = max(2, round((e - w) / WIND_STEP) + 1)
        wind_ny = max(2, round((n - s_) / WIND_STEP) + 1)
        wind_step = (e - w) / (wind_nx - 1)
        wind_frames = previous_wind(s3, bucket, times, wind_nx, wind_ny)
        if not wind_frames:
            print("[air] no wind at all, refusing to publish", flush=True)
            sys.exit(1)

    # only publish steps where BOTH fields exist: a frame with wind and no
    # colour (or the reverse) renders as a bug, not as missing data
    times = [t for t in times if t in pm_frames and t in wind_frames]
    if not times:
        print("[air] no complete time steps, refusing to publish", flush=True)
        sys.exit(1)

    # Step files are IMMUTABLE, and their path says so.
    #
    # They used to be keyed on the timestamp alone and served with a day's
    # max-age. Republishing a run with a different grid then reused the same
    # keys, so a browser holding yesterday's file read its 7,881 values against
    # an index announcing 12,144 — rows landed in the wrong places and the
    # field rendered as stripes that stopped halfway up the map. Only clients
    # with a warm cache saw it, which is why it survived a screenshot.
    #
    # The build id covers everything a reader must agree with us about: the
    # grid shape, the box, and the hours. Change any of them and the path
    # changes, so a stale file can never be read against a fresh index.
    build_id = hashlib.sha256(
        json.dumps(
            [pm_nx, pm_ny, pm_step, wind_nx, wind_ny, list(box), times],
            separators=(",", ":"),
        ).encode()
    ).hexdigest()[:12]
    step_prefix = f"{PREFIX}/t/{build_id}"
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
            f"{step_prefix}/{iso}.json",
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
        "bbox": list(box),
        "pm": {"nx": pm_nx, "ny": pm_ny, "step": pm_step},
        "wind": {"nx": wind_nx, "ny": wind_ny, "step": round(wind_step, 4)},
        "times": times,
        # where the step files for THIS build live
        "steps": step_prefix,
        "source": "cams-ads" if pm_step != PM_STEP_FALLBACK else "open-meteo",
        # model run these steps come from (UTC), so the display can say where
        # its numbers came from instead of only when they are meant to apply
        "runAt": run_at,
        # hours between published steps; anything shown between them is ours
        "stepHours": 3,
        "attribution": ATTRIBUTION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    # The index is the only mutable object, so it gets a short life. Everything
    # it points at is immutable and can be cached hard.
    total += put_json(s3, bucket, f"{PREFIX}/index.json", index, max_age=60)

    print(
        f"[air] published {len(times)} steps ({total/1024:.0f} kB gzipped) "
        f"from {index['source']}",
        flush=True,
    )


if __name__ == "__main__":
    main()
