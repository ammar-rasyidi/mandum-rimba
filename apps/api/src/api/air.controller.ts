import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import axios from "axios";
import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import {
  nowcastPm25,
  usAqiFromPm25,
  type AirQualityPoint,
} from "@mandumrimba/shared";
import { Region, RegionDocument } from "../common/schemas";
import { CacheHeaderInterceptor } from "./cache.interceptor";

/**
 * Udara & asap: modelled surface PM2.5 for Indonesia, from the Copernicus
 * Atmosphere Monitoring Service (CAMS global, ~45 km) via Open-Meteo.
 *
 * Why a live controller and not an ingest job: the Modal pipeline runs twice a
 * year, and this data changes hourly. So it works exactly like /v1/fires —
 * fetched at request time, cached in-process, served from Vercel behind the CDN.
 * Nothing is written to Mongo or archived to R2; there is no raw payload worth
 * keeping for a value that is superseded in 60 minutes.
 *
 * Why CAMS rather than a station API (IQAir, WAQI, OpenAQ): the places that
 * matter most during karhutla — inland Riau, Jambi, Kalimantan Tengah — have
 * almost no ground monitors, so every station-based source is blank precisely
 * where the smoke is. A model has a value everywhere, and a 5-day forecast.
 * The trade is honesty about resolution: a 45 km cell smooths local peaks, so
 * this UNDER-reads next to a burning block. Say so in the UI; do not dress a
 * model up as a measurement.
 *
 * Licence: CAMS data is free and open (Copernicus). Attribution to both CAMS
 * and Open-Meteo is required and ships in every response.
 *
 * No API key: Open-Meteo's non-commercial tier is keyless. OPEN_METEO_AIR_URL
 * exists only so a self-hosted or commercial endpoint can be swapped in.
 */

const DEFAULT_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";
/** Open-Meteo accepts 600+ comma-separated points, but the URL gets long;
 *  200 keeps us at ~3 kB per request, well under any proxy's limit. */
const BATCH = 200;
const TTL_MS = 60 * 60 * 1000; // CAMS publishes hourly
const UA =
  "MandumRimba/0.1 (public-interest environmental observatory, Indonesia)";

const ATTRIBUTION =
  "Copernicus Atmosphere Monitoring Service (CAMS) via Open-Meteo. " +
  "PM2.5 dimodelkan, bukan diukur di darat. Indeks AQI dihitung sendiri " +
  "dengan breakpoint US EPA (revisi 2024).";

interface OpenMeteoPoint {
  latitude: number;
  longitude: number;
  current?: { time?: string; pm2_5?: number | null };
  hourly?: { time?: string[]; pm2_5?: (number | null)[] };
}

interface AirFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: AirQualityPoint;
}

interface AirCollection {
  type: "FeatureCollection";
  generatedAt: string;
  attribution: string;
  model: string;
  features: AirFeature[];
}

const EMPTY = (): AirCollection => ({
  type: "FeatureCollection",
  generatedAt: new Date().toISOString(),
  attribution: ATTRIBUTION,
  model: "cams_global",
  features: [],
});

interface Site {
  slug: string;
  name: string;
  lon: number;
  lat: number;
}

@Controller("air")
@UseInterceptors(CacheHeaderInterceptor)
export class AirController {
  /** kabupaten sample points: derived once, boundaries change ~never */
  private sites: Site[] | null = null;
  private cache: { at: number; data: AirCollection } | null = null;

  constructor(
    @InjectModel(Region.name) private regionModel: Model<RegionDocument>,
  ) {}

  /**
   * GET /v1/air — one point per kabupaten/kota, current PM2.5 + NowCast + the
   * worst hour modelled in the next 24 h. Empty collection when regions are
   * unseeded or the upstream is down, so the map layer degrades gracefully.
   */
  @Get()
  async list(): Promise<AirCollection> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) {
      return this.cache.data;
    }
    const sites = await this.loadSites();
    if (sites.length === 0) return this.cache?.data ?? EMPTY();

    try {
      const readings = await this.fetchBatched(sites);
      const data: AirCollection = {
        ...EMPTY(),
        features: sites.flatMap((site, i) => {
          const f = this.toFeature(site, readings[i]);
          return f ? [f] : [];
        }),
      };
      this.cache = { at: Date.now(), data };
      return data;
    } catch {
      // last good payload beats a blank map during an upstream blip
      return this.cache?.data ?? EMPTY();
    }
  }

  /**
   * GET /v1/air/point?lat=&lon= — the full picture for one place: current
   * value, NowCast, and the hourly series 24 h back to 5 days forward. This is
   * what answers "besok asapnya bagaimana" for a specific village, including
   * places with no kabupaten centroid near them.
   */
  @Get("point")
  async point(@Query("lat") latRaw?: string, @Query("lon") lonRaw?: string) {
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      throw new BadRequestException("lat and lon are required, in degrees");
    }

    const [reading] = await this.fetch([{ lat, lon }], {
      pastDays: 1,
      forecastDays: 5,
    });
    const hourly = reading?.hourly;
    const times = hourly?.time ?? [];
    const values = hourly?.pm2_5 ?? [];
    const nowIdx = this.currentIndex(times, reading?.current?.time);

    const pm25 = reading?.current?.pm2_5 ?? null;
    const now = usAqiFromPm25(pm25);
    const nowcast = nowcastPm25(
      values.slice(Math.max(0, nowIdx - 11), nowIdx + 1).reverse(),
    );

    return {
      latitude: reading?.latitude ?? lat,
      longitude: reading?.longitude ?? lon,
      generatedAt: new Date().toISOString(),
      attribution: ATTRIBUTION,
      model: "cams_global",
      pm25,
      pm25Nowcast: nowcast,
      aqi: now?.aqi ?? null,
      aqiCategory: now?.category ?? null,
      aqiExtrapolated: now?.extrapolated ?? false,
      // full series so the client can draw the plume arriving and leaving
      series: times.map((t, i) => ({
        t,
        pm25: values[i] ?? null,
        aqi: usAqiFromPm25(values[i])?.aqi ?? null,
      })),
    };
  }

  // -------------------------------------------------------------------------

  /** Representative point per kabupaten. pointOnFeature (not centroid) so a
   *  crescent-shaped or multi-island district still samples over its own land
   *  rather than the sea between its parts. */
  private async loadSites(): Promise<Site[]> {
    if (this.sites) return this.sites;

    const regions = await this.regionModel
      .find({ level: "kabupaten" })
      .select("slug name geomSimplified geom")
      .lean();

    const sites: Site[] = [];
    for (const r of regions) {
      const geom = (r.geomSimplified ?? r.geom) as unknown as
        Polygon | MultiPolygon | undefined;
      if (!geom) continue;
      try {
        const p = turf.pointOnFeature({
          type: "Feature",
          properties: {},
          geometry: geom,
        } as Feature<Polygon | MultiPolygon>);
        const [lon, lat] = p.geometry.coordinates;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        sites.push({
          slug: r.slug,
          name: r.name,
          lon: Math.round(lon * 1e4) / 1e4,
          lat: Math.round(lat * 1e4) / 1e4,
        });
      } catch {
        // an unusable boundary drops one district, never the whole layer
      }
    }
    this.sites = sites;
    return sites;
  }

  private async fetchBatched(
    sites: Site[],
  ): Promise<(OpenMeteoPoint | undefined)[]> {
    const out: (OpenMeteoPoint | undefined)[] = [];
    for (let i = 0; i < sites.length; i += BATCH) {
      const batch = sites.slice(i, i + BATCH);
      const res = await this.fetch(batch, { pastDays: 1, forecastDays: 2 });
      // Open-Meteo returns results positionally; pad if it ever returns fewer
      for (let j = 0; j < batch.length; j++) out.push(res[j]);
    }
    return out;
  }

  private async fetch(
    points: { lat: number; lon: number }[],
    opts: { pastDays: number; forecastDays: number },
  ): Promise<OpenMeteoPoint[]> {
    const base = process.env.OPEN_METEO_AIR_URL ?? DEFAULT_BASE;
    const params = new URLSearchParams({
      latitude: points.map((p) => p.lat).join(","),
      longitude: points.map((p) => p.lon).join(","),
      current: "pm2_5",
      hourly: "pm2_5",
      // cams_global explicitly: `auto` would silently prefer the European
      // 11 km domain elsewhere, and we want one documented model everywhere.
      domains: "cams_global",
      past_days: String(opts.pastDays),
      forecast_days: String(opts.forecastDays),
      timezone: "Asia/Jakarta",
    });

    const { data } = await axios.get<OpenMeteoPoint | OpenMeteoPoint[]>(
      `${base}?${params}`,
      { timeout: 30_000, headers: { "User-Agent": UA } },
    );
    // single-location requests return an object, multi-location an array
    return Array.isArray(data) ? data : [data];
  }

  /** Index of the current hour in the hourly series; falls back to the last
   *  hour that is not in the future. */
  private currentIndex(times: string[], currentTime?: string): number {
    if (currentTime) {
      const i = times.indexOf(currentTime);
      if (i >= 0) return i;
    }
    const nowWib = Date.now() + 7 * 3600 * 1000;
    for (let i = times.length - 1; i >= 0; i--) {
      if (Date.parse(`${times[i]}Z`) <= nowWib) return i;
    }
    return 0;
  }

  private toFeature(site: Site, r?: OpenMeteoPoint): AirFeature | null {
    if (!r) return null;
    const times = r.hourly?.time ?? [];
    const values = r.hourly?.pm2_5 ?? [];
    const nowIdx = this.currentIndex(times, r.current?.time);

    const pm25 = r.current?.pm2_5 ?? null;
    const now = usAqiFromPm25(pm25);

    // NowCast wants most-recent-first over the trailing 12 h
    const nowcast = nowcastPm25(
      values.slice(Math.max(0, nowIdx - 11), nowIdx + 1).reverse(),
    );

    // worst hour in the next 24 h — the number that decides whether you keep
    // a child home from school tomorrow
    let maxV: number | null = null;
    let maxAt: string | null = null;
    for (let i = nowIdx + 1; i <= nowIdx + 24 && i < values.length; i++) {
      const v = values[i];
      if (v == null || !Number.isFinite(v)) continue;
      if (maxV === null || v > maxV) {
        maxV = v;
        maxAt = times[i] ?? null;
      }
    }

    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [site.lon, site.lat] },
      properties: {
        slug: site.slug,
        name: site.name,
        pm25: pm25 != null ? Math.round(pm25 * 10) / 10 : null,
        pm25Nowcast: nowcast,
        aqi: now?.aqi ?? null,
        aqiCategory: now?.category ?? null,
        aqiExtrapolated: now?.extrapolated ?? false,
        pm25Max24h: maxV != null ? Math.round(maxV * 10) / 10 : null,
        pm25Max24hAt: maxAt,
        aqiMax24h: usAqiFromPm25(maxV)?.aqi ?? null,
      },
    };
  }
}
