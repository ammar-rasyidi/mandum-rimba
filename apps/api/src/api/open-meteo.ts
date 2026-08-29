import axios from "axios";

/**
 * Shared Open-Meteo client for the air endpoints, and the budget that keeps
 * them inside the free non-commercial tier.
 *
 * The quota is counted PER LOCATION, not per request — this was measured, not
 * assumed: one 600-location request succeeds, a second one in the same minute
 * returns `{"reason":"Minutely API request limit exceeded"}`. So the published
 * limits read as 600 locations/min, 5.000/hour, 10.000/day, and a naive hourly
 * refresh of 502 kabupaten (12.048/day) would quietly exceed the daily one.
 *
 * Two consequences, both enforced here:
 *  - every caller reserves its locations from one rolling 60-second budget, so
 *    two endpoints waking up together queue instead of 429-ing each other;
 *  - callers fetch the hourly SERIES once and re-read the current hour out of
 *    it, rather than re-fetching to learn what changed. CAMS only publishes two
 *    cycles a day, so a 6-hour refresh loses nothing and costs 2.008 locations
 *    a day instead of 12.048.
 *
 * Parallelism is deliberately absent. Six concurrent batches earn an immediate
 * 429 no matter how small they are.
 */

const UA =
  "MandumRimba/0.1 (public-interest environmental observatory, Indonesia)";

/** Measured ceiling is 600/min; leave headroom for a second endpoint waking. */
const BUDGET_PER_MIN = 500;
const WINDOW_MS = 60_000;
/** ~650 locations is the most that fits under nginx's 8 kB URI limit. */
export const MAX_BATCH = 200;

/** timestamps of recently spent locations, oldest first */
let spent: number[] = [];

function spentInWindow(): number {
  const cutoff = Date.now() - WINDOW_MS;
  spent = spent.filter((t) => t > cutoff);
  return spent.length;
}

/**
 * Wait until `n` locations fit in the rolling window, then charge them.
 * Serialised by construction: callers are sequential, so there is no race to
 * guard beyond the array itself.
 */
async function reserve(n: number): Promise<void> {
  for (;;) {
    if (spentInWindow() + n <= BUDGET_PER_MIN) break;
    // wait for the oldest reservation to age out, plus a little slack
    const waitMs = Math.max(1000, spent[0] + WINDOW_MS - Date.now() + 250);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, WINDOW_MS)));
  }
  const now = Date.now();
  for (let i = 0; i < n; i++) spent.push(now);
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface OpenMeteoRow {
  latitude: number;
  longitude: number;
  current?: {
    time?: string;
    pm2_5?: number | null;
    wind_speed_10m?: number | null;
    wind_direction_10m?: number | null;
  };
  hourly?: { time?: string[]; pm2_5?: (number | null)[] };
}

/** Trim "94.0" to "94": shorter coordinates mean more locations per request. */
function short(v: number): string {
  return String(Math.round(v * 1e4) / 1e4);
}

/**
 * GET a multi-location Open-Meteo query, batched under the URI limit and paced
 * under the location budget. Results come back positionally, aligned to
 * `points`; a short upstream response leaves trailing entries undefined rather
 * than silently shifting everything by one.
 */
export async function fetchPoints(
  base: string,
  query: string,
  points: LatLon[],
  batchSize = MAX_BATCH,
): Promise<(OpenMeteoRow | undefined)[]> {
  const out: (OpenMeteoRow | undefined)[] = [];
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await reserve(batch.length);
    const url =
      `${base}?latitude=${batch.map((p) => short(p.lat)).join(",")}` +
      `&longitude=${batch.map((p) => short(p.lon)).join(",")}&${query}`;
    // A 429 means someone drained the minutely budget first (the accounting
    // above is ours, not the server's). Wait the window out and retry rather
    // than failing a whole grid over a few seconds of contention.
    let data: OpenMeteoRow | OpenMeteoRow[] | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        ({ data } = await axios.get<OpenMeteoRow | OpenMeteoRow[]>(url, {
          timeout: 60_000,
          headers: { "User-Agent": UA },
        }));
        break;
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response
          ?.status;
        if (status !== 429 || attempt >= 2) throw err;
        // reset our own accounting too: the server disagrees with it
        spent = [];
        await new Promise((r) => setTimeout(r, WINDOW_MS + 2000));
      }
    }
    // single-location requests return an object, multi-location an array
    const rows = Array.isArray(data) ? data : [data];
    for (let j = 0; j < batch.length; j++) out.push(rows[j]);
  }
  return out;
}

export const AIR_QUALITY_BASE =
  process.env.OPEN_METEO_AIR_URL ??
  "https://air-quality-api.open-meteo.com/v1/air-quality";
export const FORECAST_BASE =
  process.env.OPEN_METEO_FORECAST_URL ??
  "https://api.open-meteo.com/v1/forecast";
