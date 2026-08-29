import { fetchPoints, FORECAST_BASE, type LatLon } from "./open-meteo";

/**
 * The 10 m wind field behind the animated air map: the vectors the particle
 * layer advects, so you can see which way the smoke is actually going.
 *
 * WIND ONLY, and 2° — both forced by the location budget (see open-meteo.ts).
 * A 25×11 grid is 275 locations, one request, ~1.4 s, and it can refresh
 * hourly all day (6.600/day) without approaching the daily ceiling. The 1°
 * grid this started as would have been 1.029 locations per variable: two
 * minutes of paced fetching per refresh and ~49.000 locations a day. Wind is
 * a smooth field, so 2° costs the animation almost nothing once the client
 * interpolates between nodes — cambecc/earth, the original of this look, runs
 * on 1° GFS.
 *
 * PM2.5 deliberately does NOT come from a grid here. The colour field is built
 * on the client from the 502 kabupaten points that /v1/air already returns:
 * denser than any grid we could afford over land, free in quota terms, and
 * honestly blank over open sea where we have no reason to claim a value.
 *
 * GFS is pinned rather than "best_match", which chooses a different model per
 * location and would put seams through a field that must be continuous.
 */

/** Indonesian window on whole degrees, so nodes land on GFS grid points. */
export const FIELD_BBOX = {
  west: 94,
  south: -12,
  east: 142,
  north: 8,
} as const;
export const FIELD_STEP = 2;
export const FIELD_NX =
  Math.round((FIELD_BBOX.east - FIELD_BBOX.west) / FIELD_STEP) + 1;
export const FIELD_NY =
  Math.round((FIELD_BBOX.north - FIELD_BBOX.south) / FIELD_STEP) + 1;

export const FIELD_ATTRIBUTION =
  "Angin 10 m: NOAA GFS via Open-Meteo (model, bukan pengukuran darat).";

export interface WindField {
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

export async function buildWindField(): Promise<WindField> {
  const grid = nodes();
  const rows = await fetchPoints(
    FORECAST_BASE,
    "current=wind_speed_10m,wind_direction_10m&models=gfs_global" +
      "&wind_speed_unit=ms&forecast_days=1&timezone=Asia%2FJakarta",
    grid,
    // 275 nodes fit one request comfortably under both the URI and the budget
    grid.length,
  );

  const u: (number | null)[] = [];
  const v: (number | null)[] = [];
  let validAt: string | null = null;
  let maxSpeed = 0;

  for (let i = 0; i < grid.length; i++) {
    const c = rows[i]?.current;
    validAt ??= c?.time ?? null;
    const [uu, vv] = toUv(c?.wind_speed_10m, c?.wind_direction_10m);
    if (uu === null || vv === null) {
      u.push(null);
      v.push(null);
      continue;
    }
    maxSpeed = Math.max(maxSpeed, Math.hypot(uu, vv));
    u.push(Math.round(uu * 10));
    v.push(Math.round(vv * 10));
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
    maxSpeed: Math.round(maxSpeed * 10) / 10,
  };
}
