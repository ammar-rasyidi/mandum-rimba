import {
  AIR_QUALITY_BASE,
  fetchPoints,
  FORECAST_BASE,
  type LatLon,
} from "./open-meteo";

/**
 * The regional field behind the animated air map: 10 m wind (GFS) and surface
 * PM2.5 (CAMS) on one grid, covering Southeast Asia rather than Indonesia
 * alone. Haze does not stop at the border — Riau's smoke reaches Kuala Lumpur
 * and Singapore, and Indochina's burning season blows south — so a map cropped
 * to the coastline would hide half of what it is trying to explain.
 *
 * 2.5° over 85–150 E, -12.5–25 N is 432 nodes: one request per variable, and
 * with the two variables refreshed every 4 hours it costs 5.184 locations a day
 * against the free tier's 10.000 (see open-meteo.ts — the quota is counted per
 * location). Hourly would be 20.736 and would fail. Nothing is lost at 4 hours:
 * GFS publishes every 6, CAMS every 12.
 *
 * Both fields are smooth at continental scale, so the client's bilinear
 * interpolation carries the resolution. cambecc/earth, the original of this
 * look, animates 1° GFS globally. The finer PM2.5 detail over Indonesia comes
 * from the 502 district readings in /v1/air, which the client blends on top of
 * this backdrop.
 *
 * GFS is pinned rather than "best_match", which chooses a different model per
 * location and would put seams through a field that must be continuous.
 */

/** Southeast Asia: Sumatra's west coast to Papua, Java to southern China. */
export const FIELD_BBOX = {
  west: 85,
  south: -12.5,
  east: 150,
  north: 25,
} as const;
export const FIELD_STEP = 2.5;
export const FIELD_NX =
  Math.round((FIELD_BBOX.east - FIELD_BBOX.west) / FIELD_STEP) + 1;
export const FIELD_NY =
  Math.round((FIELD_BBOX.north - FIELD_BBOX.south) / FIELD_STEP) + 1;

export const FIELD_ATTRIBUTION =
  "PM2.5: Copernicus CAMS. Angin 10 m: NOAA GFS. Keduanya via Open-Meteo, " +
  "hasil model, bukan pengukuran darat.";

export interface AirGrid {
  /** [west, south, east, north] — the field's corners */
  bbox: [number, number, number, number];
  nx: number;
  ny: number;
  step: number;
  generatedAt: string;
  /** model timestamp the values belong to (WIB), not when we fetched */
  validAt: string | null;
  attribution: string;
  /**
   * Row-major from the SOUTH edge northward, west to east: index `y * nx + x`
   * is the node at (west + x·step, south + y·step). Metres per second × 10,
   * as integers, pointing the way the wind BLOWS. null where upstream had no
   * value — the client must treat that as "unknown", not as calm.
   */
  u: (number | null)[];
  v: (number | null)[];
  /** surface PM2.5, µg/m³ × 10, same indexing. The regional backdrop for the
   *  colour field; Indonesian detail comes from /v1/air's district points. */
  pm25: (number | null)[];
  /** peak speed in the field, m/s — lets the client scale particles without
   *  a second pass over the arrays */
  maxSpeed: number;
}

function nodes(): LatLon[] {
  const out: LatLon[] = [];
  for (let y = 0; y < FIELD_NY; y++) {
    for (let x = 0; x < FIELD_NX; x++) {
      out.push({
        lat: FIELD_BBOX.south + y * FIELD_STEP,
        lon: FIELD_BBOX.west + x * FIELD_STEP,
      });
    }
  }
  return out;
}

/**
 * Meteorological wind direction is where the wind blows FROM, degrees
 * clockwise from north. Particles need the components it blows TOWARD, hence
 * the negation.
 */
function toUv(
  speed: number | null | undefined,
  dirDeg: number | null | undefined,
): [number | null, number | null] {
  if (
    speed == null ||
    dirDeg == null ||
    !Number.isFinite(speed) ||
    !Number.isFinite(dirDeg)
  ) {
    return [null, null];
  }
  const rad = (dirDeg * Math.PI) / 180;
  return [-speed * Math.sin(rad), -speed * Math.cos(rad)];
}

export async function buildAirGrid(): Promise<AirGrid> {
  const grid = nodes();

  // two upstreams, one grid. Sequential, and the shared budget in
  // open-meteo.ts paces them so the pair never trips the minutely limit.
  const wind = await fetchPoints(
    FORECAST_BASE,
    "current=wind_speed_10m,wind_direction_10m&models=gfs_global" +
      "&wind_speed_unit=ms&forecast_days=1&timezone=Asia%2FJakarta",
    grid,
    grid.length, // 432 nodes fit one request under the 8 kB URI limit
  );
  const air = await fetchPoints(
    AIR_QUALITY_BASE,
    "current=pm2_5&domains=cams_global&forecast_days=1&timezone=Asia%2FJakarta",
    grid,
    grid.length,
  );

  const u: (number | null)[] = [];
  const v: (number | null)[] = [];
  const pm25: (number | null)[] = [];
  let validAt: string | null = null;
  let maxSpeed = 0;

  for (let i = 0; i < grid.length; i++) {
    const w = wind[i]?.current;
    validAt ??= w?.time ?? null;
    const [uu, vv] = toUv(w?.wind_speed_10m, w?.wind_direction_10m);
    if (uu === null || vv === null) {
      u.push(null);
      v.push(null);
    } else {
      maxSpeed = Math.max(maxSpeed, Math.hypot(uu, vv));
      u.push(Math.round(uu * 10));
      v.push(Math.round(vv * 10));
    }

    const p = air[i]?.current?.pm2_5;
    pm25.push(p != null && Number.isFinite(p) ? Math.round(p * 10) : null);
  }

  return {
    bbox: [
      FIELD_BBOX.west,
      FIELD_BBOX.south,
      FIELD_BBOX.east,
      FIELD_BBOX.north,
    ],
    nx: FIELD_NX,
    ny: FIELD_NY,
    step: FIELD_STEP,
    generatedAt: new Date().toISOString(),
    validAt,
    attribution: FIELD_ATTRIBUTION,
    u,
    v,
    pm25,
    maxSpeed: Math.round(maxSpeed * 10) / 10,
  };
}
