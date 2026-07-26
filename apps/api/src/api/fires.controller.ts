import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import axios from "axios";

/**
 * Titik api (karhutla): near-real-time active-fire hotspots for Indonesia from
 * NASA FIRMS. The FIRMS MAP_KEY lives ONLY here on the backend (set
 * FIRMS_MAP_KEY in the API environment) — it never reaches the browser. We
 * fetch the CSV, convert to GeoJSON, and cache in-process for an hour (FIRMS
 * NRT refreshes ~every 3h). Register a free key at
 * https://firms.modaps.eosdis.nasa.gov/api/map_key/. Without a key we return an
 * empty collection so the map layer degrades gracefully.
 */

const AREA = "95,-11,141,6"; // Indonesia bbox: west,south,east,north
const SOURCE = "VIIRS_SNPP_NRT"; // 375 m VIIRS, near-real-time
const DAYS = 2; // trailing window (FIRMS allows up to 10)
const TTL_MS = 60 * 60 * 1000; // 1 hour

type FC = { type: "FeatureCollection"; features: unknown[] };
const EMPTY: FC = { type: "FeatureCollection", features: [] };

let cache: { at: number; data: FC } | null = null;

/** VIIRS reports confidence as a letter; normalise to a stable token */
function conf(raw: string): "high" | "nominal" | "low" {
  const v = raw.trim().toLowerCase();
  if (v === "h" || v === "high") return "high";
  if (v === "l" || v === "low") return "low";
  return "nominal";
}

function csvToGeojson(csv: string): FC {
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

  const features: unknown[] = [];
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

@Controller("fires")
export class FiresController {
  @Get()
  async list(@Res() res: Response) {
    res.setHeader("Content-Type", "application/geo+json");
    res.setHeader(
      "Cache-Control",
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );

    const key = process.env.FIRMS_MAP_KEY;
    if (!key) return res.send(EMPTY);
    if (cache && Date.now() - cache.at < TTL_MS) return res.send(cache.data);

    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${SOURCE}/${AREA}/${DAYS}`;
    try {
      const { data } = await axios.get<string>(url, {
        timeout: 30_000,
        responseType: "text",
        headers: {
          "User-Agent":
            "MandumRimba/0.1 (public-interest environmental observatory, Indonesia)",
        },
      });
      // FIRMS returns a plain-text error (not CSV) when the key/quota is bad
      if (
        typeof data !== "string" ||
        (!data.startsWith("latitude") && !data.startsWith("country_id"))
      )
        return res.send(cache?.data ?? EMPTY);
      const fc = csvToGeojson(data);
      cache = { at: Date.now(), data: fc };
      return res.send(fc);
    } catch {
      // serve the last good payload if we have one, else empty
      return res.send(cache?.data ?? EMPTY);
    }
  }
}
