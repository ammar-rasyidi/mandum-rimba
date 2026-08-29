import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseInterceptors,
} from "@nestjs/common";
import type { Response } from "express";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import {
  nowcastPm25,
  usAqiFromPm25,
  type AirQualityPoint,
} from "@mandumrimba/shared";
import { buildWindField, type WindField } from "./air-field";
import { AIR_QUALITY_BASE, fetchPoints, type OpenMeteoRow } from "./open-meteo";
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

/**
 * Six hours, not one. We hold a 96-hour hourly SERIES per district and read the
 * current hour out of it on every request, so the served value is always the
 * right hour even when the fetch is hours old. CAMS publishes two cycles a day,
 * so refreshing four times a day loses nothing — and it costs 2.008 locations a
 * day against the 10.000 free ceiling, where hourly refetching would have cost
 * 12.048 and silently started failing. See open-meteo.ts.
 */
const TTL_MS = 6 * 60 * 60 * 1000;
/** Wind refreshes hourly: 275 locations a time is cheap (6.600/day). */
const FIELD_TTL_MS = 60 * 60 * 1000;

const ATTRIBUTION =
  "Copernicus Atmosphere Monitoring Service (CAMS) via Open-Meteo. " +
  "PM2.5 dimodelkan, bukan diukur di darat. Indeks AQI dihitung sendiri " +
  "dengan breakpoint US EPA (revisi 2024).";

interface AirFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: AirQualityPoint;
}

interface AirCollection {
  type: "FeatureCollection";
  /** true while the first upstream series is still being fetched: the map
   *  should show "memuat", not "udara bersih", and retry shortly */
  warming?: boolean;
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
export class AirController {
  /** kabupaten sample points: derived once, boundaries change ~never */
  private sites: Site[] | null = null;
  /** raw upstream series, NOT the rendered collection: the current hour is
   *  read out of it per request, so a 6-hour-old fetch still serves this hour */
  private cache: { at: number; rows: (OpenMeteoRow | undefined)[] } | null =
    null;
  private inFlight: Promise<void> | null = null;
  private fieldCache: { at: number; data: WindField } | null = null;
  /** de-dupes concurrent cold builds; one fetch, many waiters */
  private fieldInFlight: Promise<WindField | null> | null = null;

  constructor(
    @InjectModel(Region.name) private regionModel: Model<RegionDocument>,
  ) {}

  /**
   * GET /v1/air — one point per kabupaten/kota, current PM2.5 + NowCast + the
   * worst hour modelled in the next 24 h. Empty collection when regions are
   * unseeded or the upstream is down, so the map layer degrades gracefully.
   */
  @Get()
  async list(
    @Res({ passthrough: true }) res: Response,
  ): Promise<AirCollection> {
    const sites = await this.loadSites();
    if (sites.length === 0) {
      res.setHeader("Cache-Control", "no-store");
      return EMPTY();
    }

    if (!this.cache || Date.now() - this.cache.at >= TTL_MS) {
      // Never block on a cold fetch. 502 districts is most of a minute's
      // location budget, so a build can be paced out over 60 s — longer than
      // the Vercel function budget. Start it, say so, and let the client come
      // back; a stale-but-real series is served meanwhile.
      void this.refresh(sites);
    }

    const rows = this.cache?.rows;
    if (!rows) {
      // warming: must not be cached, or the CDN pins an empty map for an hour
      res.setHeader("Cache-Control", "no-store");
      return { ...EMPTY(), warming: true };
    }

    res.setHeader(
      "Cache-Control",
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );
    return {
      ...EMPTY(),
      features: sites.flatMap((site, i) => {
        const f = this.toFeature(site, rows[i]);
        return f ? [f] : [];
      }),
    };
  }

  private async refresh(sites: Site[]): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = fetchPoints(
      AIR_QUALITY_BASE,
      // one series per district: yesterday for the NowCast window, three days
      // forward so "worst hour in the next 24 h" stays in range for a full
      // cache lifetime
      "current=pm2_5&hourly=pm2_5&domains=cams_global" +
        "&past_days=1&forecast_days=3&timezone=Asia%2FJakarta",
      sites.map((s) => ({ lat: s.lat, lon: s.lon })),
    )
      .then((rows) => {
        this.cache = { at: Date.now(), rows };
      })
      .catch(() => {
        // keep the previous series; a blank map is worse than an old one
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  /**
   * GET /v1/air/field — the 10 m wind field the particle animation advects.
   * Wind only and 2°, because the quota is counted per location; the PM2.5
   * colour field is interpolated on the client from /v1/air. One upstream
   * request, refreshed hourly. See air-field.ts.
   */
  @Get("field")
  @UseInterceptors(CacheHeaderInterceptor)
  async field(): Promise<WindField | null> {
    const fresh =
      this.fieldCache && Date.now() - this.fieldCache.at < FIELD_TTL_MS;
    if (fresh) return this.fieldCache!.data;

    if (this.fieldCache) {
      // stale-but-usable: hand it over now, refresh behind the request
      void this.refreshField();
      return this.fieldCache.data;
    }
    return this.refreshField();
  }

  private async refreshField(): Promise<WindField | null> {
    if (this.fieldInFlight) return this.fieldInFlight;
    this.fieldInFlight = buildWindField()
      .then((data) => {
        this.fieldCache = { at: Date.now(), data };
        return data;
      })
      .catch(() => this.fieldCache?.data ?? null)
      .finally(() => {
        this.fieldInFlight = null;
      });
    return this.fieldInFlight;
  }

  /**
   * GET /v1/air/point?lat=&lon= — the full picture for one place: current
   * value, NowCast, and the hourly series 24 h back to 5 days forward. This is
   * what answers "besok asapnya bagaimana" for a specific village, including
   * places with no kabupaten centroid near them.
   */
  @Get("point")
  @UseInterceptors(CacheHeaderInterceptor)
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

    const [reading] = await fetchPoints(
      AIR_QUALITY_BASE,
      "current=pm2_5&hourly=pm2_5&domains=cams_global" +
        "&past_days=1&forecast_days=5&timezone=Asia%2FJakarta",
      [{ lat, lon }],
    );
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

  private toFeature(site: Site, r?: OpenMeteoRow): AirFeature | null {
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
