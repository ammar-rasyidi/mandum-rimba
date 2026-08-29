import {
  AIR_QUALITY_BASE,
  fetchPoints,
  FORECAST_BASE,
  type LatLon,
} from "./open-meteo";

/**
 * The regional field behind the animated air map: surface PM2.5 (CAMS) for the
 * colour, 10 m wind (GFS) for the streamlines, over Southeast Asia rather than
 * Indonesia alone. Haze does not stop at the border — Riau's smoke reaches
 * Kuala Lumpur and Singapore, Indochina's burning season blows south — so a map
 * cropped to the coastline hides half of what it is trying to explain.
 *
 * TWO RESOLUTIONS, because the two fields need different things:
 *
 *  - PM2.5 at 1° (2,016 nodes). A plume has structure, and the first version's
 *    2.5° grid could not render it: interpolating between nodes 275 km apart
 *    turns a smoke band into a diamond. 1° is still coarser than CAMS's own
 *    ~0.4°, so this samples the model rather than inventing detail.
 *  - Wind at 2.5° (345 nodes). A wind field genuinely is smooth at this scale
 *    and the particle layer interpolates between nodes anyway, so spending
 *    quota here would buy nothing visible.
 *
 * HOURLY SERIES, NOT A SNAPSHOT. Each refresh pulls three days of hourly values
 * and the controller reads the current hour out of them per request, which
 * decouples freshness from refresh cost: a 12-hour cadence still serves the
 * right hour, and 12 hours is exactly CAMS's own publishing cycle. The
 * arithmetic matters because Open-Meteo's free quota is counted PER LOCATION
 * (see open-meteo.ts): 2,361 locations twice a day is 4,722 against a ceiling
 * of 10,000 that /v1/air already spends 2,008 of. Refreshing hourly, as the
 * first version did, would be 56,664.
 *
 * The district points from /v1/air are deliberately NOT blended into this field
 * any more. They look like independent higher-resolution readings and are not —
 * they are the same CAMS model sampled at kabupaten centroids, so mixing them
 * in added no information while producing exactly the artefact it looked like:
 * a circular blob around every district centre. They stay what they always
 * were, per-district numbers for the popup and the forecast figures.
 *
 * GFS is pinned rather than "best_match", which chooses a different model per
 * location and would put seams through a field that must be continuous.
 */

/** Southeast Asia: Sumatra's west coast to Papua, Java to southern China. */
export const FIELD_BBOX = {
  west: 90,
  south: -13,
  east: 145,
  north: 22,
} as const;

export const PM_STEP = 1;
export const WIND_STEP = 2.5;

const dim = (step: number) => ({
  nx: Math.round((FIELD_BBOX.east - FIELD_BBOX.west) / step) + 1,
  ny: Math.round((FIELD_BBOX.north - FIELD_BBOX.south) / step) + 1,
  step,
});

export const FIELD_ATTRIBUTION =
  "PM2.5: Copernicus CAMS. Angin 10 m: NOAA GFS. Keduanya via Open-Meteo, " +
  "hasil model, bukan pengukuran darat.";

/**
 * One grid's values for a single hour. Row-major from the SOUTH edge northward,
 * west to east: index `y * nx + x` is the node at
 * (west + x·step, south + y·step).
 */
export interface GridLayer {
  nx: number;
  ny: number;
  step: number;
  /** scaled integers: µg/m³ × 10, or m/s × 10. null where upstream had no
   *  value — the client must read that as "unknown", never as zero. */
  values: (number | null)[];
}

export interface AirGrid {
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  generatedAt: string;
  /** the hour these values belong to (WIB), not when we fetched */
  validAt: string | null;
  attribution: string;
  pm25: GridLayer;
  /** eastward and northward components, the way the wind BLOWS */
  u: GridLayer;
  v: GridLayer;
  /** peak wind speed in the field, m/s, so the client can scale particles
   *  without a second pass over the arrays */
  maxSpeed: number;
}

/** What is held in memory between refreshes: every hour, not just the current
 *  one, so serving the current hour is a lookup rather than another fetch. */
export interface AirGridSeries {
  fetchedAt: number;
  /** local (Asia/Jakarta) wall-clock hours, e.g. "2026-08-29T14:00" */
  times: string[];
  pmDim: { nx: number; ny: number; step: number };
  windDim: { nx: number; ny: number; step: number };
  /** [hourIndex][nodeIndex] */
  pm25: (number | null)[][];
  u: (number | null)[][];
  v: (number | null)[][];
}

function nodes(step: number): LatLon[] {
  const { nx, ny } = dim(step);
  const out: LatLon[] = [];
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      out.push({
        lat: FIELD_BBOX.south + y * step,
        lon: FIELD_BBOX.west + x * step,
      });
    }
  }
  return out;
}

/**
 * Meteorological wind direction is where the wind blows FROM, degrees clockwise
 * from north. Particles need the components it blows TOWARD, hence the flip.
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

function scaled(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? Math.round(v * 10) : null;
}

export async function buildAirGridSeries(): Promise<AirGridSeries> {
  const pmNodes = nodes(PM_STEP);
  const windNodes = nodes(WIND_STEP);

  // `past_days` stays 0: this field only ever shows now or later, so a day of
  // history would cost response size for nothing. forecast_days=3 leaves
  // headroom, so a missed refresh still covers the current hour.
  const pmRows = await fetchPoints(
    AIR_QUALITY_BASE,
    "hourly=pm2_5&domains=cams_global&forecast_days=3&timezone=Asia%2FJakarta",
    pmNodes,
  );
  const windRows = await fetchPoints(
    FORECAST_BASE,
    "hourly=wind_speed_10m,wind_direction_10m&models=gfs_global" +
      "&wind_speed_unit=ms&forecast_days=3&timezone=Asia%2FJakarta",
    windNodes,
  );

  // every node shares one time axis; take it from the first that reports one
  const times =
    pmRows.find((r) => r?.hourly?.time?.length)?.hourly?.time ??
    windRows.find((r) => r?.hourly?.time?.length)?.hourly?.time ??
    [];

  const pm25: (number | null)[][] = [];
  const u: (number | null)[][] = [];
  const v: (number | null)[][] = [];

  for (let h = 0; h < times.length; h++) {
    pm25.push(pmNodes.map((_, i) => scaled(pmRows[i]?.hourly?.pm2_5?.[h])));

    const uh: (number | null)[] = [];
    const vh: (number | null)[] = [];
    for (let i = 0; i < windNodes.length; i++) {
      const hourly = windRows[i]?.hourly;
      const [uu, vv] = toUv(
        hourly?.wind_speed_10m?.[h],
        hourly?.wind_direction_10m?.[h],
      );
      uh.push(scaled(uu));
      vh.push(scaled(vv));
    }
    u.push(uh);
    v.push(vh);
  }

  return {
    fetchedAt: Date.now(),
    times,
    pmDim: dim(PM_STEP),
    windDim: dim(WIND_STEP),
    pm25,
    u,
    v,
  };
}

/** Index of the hour containing `at`, or -1 for an empty series. */
function hourIndex(times: string[], at: Date): number {
  if (times.length === 0) return -1;
  // Open-Meteo returns Asia/Jakarta wall-clock strings with no zone suffix, so
  // compare them against a WIB-shifted "now" and parse them as if UTC
  const wibNow = at.getTime() + 7 * 3600_000;
  for (let i = times.length - 1; i >= 0; i--) {
    if (Date.parse(`${times[i]}Z`) <= wibNow) return i;
  }
  return 0;
}

/** One hour out of the held series — what GET /v1/air/field returns. */
export function sliceAirGrid(
  series: AirGridSeries,
  at: Date = new Date(),
): AirGrid | null {
  const h = hourIndex(series.times, at);
  if (h < 0) return null;

  const uh = series.u[h] ?? [];
  const vh = series.v[h] ?? [];
  let maxSpeed = 0;
  for (let i = 0; i < uh.length; i++) {
    const a = uh[i];
    const b = vh[i];
    if (a == null || b == null) continue;
    const s = Math.hypot(a / 10, b / 10);
    if (s > maxSpeed) maxSpeed = s;
  }

  return {
    bbox: [
      FIELD_BBOX.west,
      FIELD_BBOX.south,
      FIELD_BBOX.east,
      FIELD_BBOX.north,
    ],
    generatedAt: new Date(series.fetchedAt).toISOString(),
    validAt: series.times[h] ?? null,
    attribution: FIELD_ATTRIBUTION,
    pm25: { ...series.pmDim, values: series.pm25[h] ?? [] },
    u: { ...series.windDim, values: uh },
    v: { ...series.windDim, values: vh },
    maxSpeed: Math.round(maxSpeed * 10) / 10,
  };
}
