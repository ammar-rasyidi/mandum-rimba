import { NextResponse } from "next/server";

/**
 * Near-real-time active-fire hotspots for Indonesia, from NASA FIRMS.
 *
 * FIRMS serves VIIRS/MODIS detections as CSV keyed by a free MAP_KEY
 * (register at https://firms.modaps.eosdis.nasa.gov/api/map_key/). We fetch it
 * server-side (so the key never reaches the browser), convert to GeoJSON, and
 * cache for an hour — NRT data refreshes roughly every 3 hours. The map loads
 * the result like any other GeoJSON layer.
 *
 * Set FIRMS_MAP_KEY in the environment. Without it we return an empty
 * collection so the layer degrades gracefully instead of erroring.
 */

export const revalidate = 3600; // seconds

const AREA = "95,-11,141,6"; // Indonesia bbox: west,south,east,north
const SOURCE = "VIIRS_SNPP_NRT"; // 375 m VIIRS, near-real-time
const DAYS = 2; // trailing window (FIRMS allows up to 10)

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** VIIRS reports confidence as a letter; normalise to a stable token */
function conf(raw: string): "high" | "nominal" | "low" {
  const v = raw.trim().toLowerCase();
  if (v === "h" || v === "high") return "high";
  if (v === "l" || v === "low") return "low";
  return "nominal";
}

function csvToGeojson(csv: string): GeoJSON.FeatureCollection {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return EMPTY;
  const head = lines[0].split(",");
  const col = (name: string) => head.indexOf(name);
  const iLat = col("latitude");
  const iLon = col("longitude");
  const iDate = col("acq_date");
  const iTime = col("acq_time");
  const iSat = col("satellite");
  const iConf = col("confidence");
  const iFrp = col("frp");
  const iDn = col("daynight");
  if (iLat < 0 || iLon < 0) return EMPTY;

  const features: GeoJSON.Feature[] = [];
  for (let i = 1; i < lines.length; i++) {
    const r = lines[i].split(",");
    const lng = parseFloat(r[iLon]);
    const lat = parseFloat(r[iLat]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const frp = iFrp >= 0 ? parseFloat(r[iFrp]) : NaN;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        conf: iConf >= 0 ? conf(r[iConf]) : "nominal",
        date: iDate >= 0 ? r[iDate] : "",
        time: iTime >= 0 ? r[iTime].padStart(4, "0") : "",
        sat: iSat >= 0 ? r[iSat] : "",
        frp: Number.isFinite(frp) ? Math.round(frp * 10) / 10 : null,
        daynight: iDn >= 0 ? r[iDn] : "",
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export async function GET() {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key)
    return NextResponse.json(EMPTY, { headers: { "x-fires": "no-map-key" } });

  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${SOURCE}/${AREA}/${DAYS}`;
  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok)
      return NextResponse.json(EMPTY, {
        headers: { "x-fires": `upstream-${res.status}` },
      });
    const csv = await res.text();
    // FIRMS returns a plain-text error (not CSV) when the key/quota is bad
    if (!csv.startsWith("latitude") && !csv.startsWith("country_id"))
      return NextResponse.json(EMPTY, { headers: { "x-fires": "bad-response" } });
    const fc = csvToGeojson(csv);
    return NextResponse.json(fc, {
      headers: {
        "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "x-fires": `ok-${fc.features.length}`,
      },
    });
  } catch {
    return NextResponse.json(EMPTY, { headers: { "x-fires": "fetch-error" } });
  }
}
