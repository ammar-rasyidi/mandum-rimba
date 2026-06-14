import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  Alert,
  AlertDocument,
  Region,
  RegionDocument,
} from "../common/schemas";
import { JobLockService } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import { HttpService } from "../common/http.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";

const GFW_BASE = "https://data-api.globalforestwatch.org";

// dataset id + the date/confidence column names of each alert system in the
// GFW Data API (https://data-api.globalforestwatch.org)
const ALERT_SYSTEMS = [
  {
    system: "radd",
    dataset: "wur_radd_alerts",
    dateField: "wur_radd_alerts__date",
    confidenceField: "wur_radd_alerts__confidence",
  },
  {
    system: "glad_l",
    dataset: "umd_glad_landsat_alerts",
    dateField: "umd_glad_landsat_alerts__date",
    confidenceField: "umd_glad_landsat_alerts__confidence",
  },
  {
    system: "glad_s2",
    dataset: "umd_glad_sentinel2_alerts",
    dateField: "umd_glad_sentinel2_alerts__date",
    confidenceField: "umd_glad_sentinel2_alerts__confidence",
  },
] as const;

interface GfwQueryRow {
  latitude: number;
  longitude: number;
  [key: string]: unknown;
}

/**
 * 01:00 WIB — near-real-time deforestation alerts (RADD / GLAD-L / GLAD-S2)
 * from the GFW Data API, upserted as Points.
 *
 * GFW's raster analysis lambda rejects responses over ~6 MB
 * (Function.ResponseSizeTooLarge), so we query per *kabupaten* (falling back
 * to provinces when no kabupaten are seeded) and recursively bisect the date
 * window whenever a chunk is still too large.
 */
@Injectable()
export class GfwAlertsService implements OnModuleInit {
  static readonly JOB = "gfw-alerts";
  private readonly logger = new Logger(GfwAlertsService.name);

  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Region.name) private regionModel: Model<RegionDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly http: HttpService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(GfwAlertsService.JOB, () => this.run());
  }

  @Cron("0 0 1 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(GfwAlertsService.JOB, async () => {
      const apiKey = process.env.GFW_API_KEY;
      if (!apiKey) {
        this.logger.warn("GFW_API_KEY not set — skipping");
        return { skipped: true };
      }

      // only fetch alerts newer than what we already have (minus a 7-day
      // revisit window: GFW backfills confidence upgrades)
      const latest = await this.alertModel
        .findOne()
        .sort({ alertDate: -1 })
        .select("alertDate");
      const from = latest
        ? new Date(latest.alertDate.getTime() - 7 * 86_400_000)
        : new Date(Date.now() - 90 * 86_400_000);
      const to = new Date();

      // kabupaten keep each query under the lambda's response-size cap
      const kabCount = await this.regionModel.countDocuments({
        level: "kabupaten",
      });
      const regions = await this.regionModel
        .find({ level: kabCount > 0 ? "kabupaten" : "province" })
        .select("name geomSimplified geom");

      let upserted = 0;
      let fetched = 0;

      for (const region of regions) {
        const geometry = region.geomSimplified ?? region.geom;
        for (const sys of ALERT_SYSTEMS) {
          const rows = await this.fetchChunked(
            sys,
            geometry,
            from,
            to,
            apiKey,
            region.name,
          );

          fetched += rows.length;
          if (rows.length > 0) {
            await this.archiver.archiveRaw(
              GfwAlertsService.JOB,
              `${sys.system}-${region.name.toLowerCase().replace(/\s+/g, "-")}.json`,
              JSON.stringify(rows),
            );
          }

          const ops = rows
            .filter(
              (r) =>
                typeof r.latitude === "number" &&
                typeof r.longitude === "number" &&
                r[sys.dateField],
            )
            .map((r) => {
              const alertDate = new Date(String(r[sys.dateField]));
              const geom = {
                type: "Point" as const,
                coordinates: [r.longitude, r.latitude] as [number, number],
              };
              return {
                updateOne: {
                  filter: {
                    system: sys.system,
                    alertDate,
                    "geom.coordinates": geom.coordinates,
                  },
                  update: {
                    $set: {
                      confidence: String(r[sys.confidenceField] ?? "nominal"),
                    },
                    $setOnInsert: {
                      system: sys.system,
                      alertDate,
                      geom,
                      regionId: region._id,
                      insideConcessionId: null,
                      insideProtected: false,
                      insideMoratorium: false,
                      flaggedAt: null,
                    },
                  },
                  upsert: true,
                },
              };
            });

          if (ops.length > 0) {
            const res = await this.alertModel.bulkWrite(ops as never[], {
              ordered: false,
            });
            upserted += res.upsertedCount;
          }
        }
      }

      return { stats: { fetched, upserted, regions: regions.length } };
    });
  }

  /**
   * Fetch one system × region × date window; on failure (the API 500s with
   * Function.ResponseSizeTooLarge when the point list exceeds ~6 MB, and the
   * status code alone doesn't distinguish causes) bisect the window down to
   * single days before giving up on a chunk.
   */
  private async fetchChunked(
    sys: (typeof ALERT_SYSTEMS)[number],
    geometry: Record<string, unknown>,
    from: Date,
    to: Date,
    apiKey: string,
    label: string,
  ): Promise<GfwQueryRow[]> {
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    const sql =
      `SELECT latitude, longitude, ${sys.dateField}, ${sys.confidenceField} ` +
      `FROM results WHERE ${sys.dateField} >= '${fromStr}' AND ${sys.dateField} <= '${toStr}'`;

    try {
      const res = await this.http.post<{ data: GfwQueryRow[] }>(
        `${GFW_BASE}/dataset/${sys.dataset}/latest/query/json`,
        { sql, geometry },
        { headers: { "x-api-key": apiKey } },
      );
      return res.data ?? [];
    } catch (err) {
      const days = (to.getTime() - from.getTime()) / 86_400_000;
      if (days <= 1) {
        this.logger.error(
          `${sys.system} ${label} ${fromStr}..${toStr} failed even at 1 day: ${err}`,
        );
        return [];
      }
      this.logger.warn(
        `${sys.system} ${label} ${fromStr}..${toStr} failed, bisecting (${err})`,
      );
      const mid = new Date((from.getTime() + to.getTime()) / 2);
      const first = await this.fetchChunked(sys, geometry, from, mid, apiKey, label);
      const second = await this.fetchChunked(
        sys,
        geometry,
        new Date(mid.getTime() + 86_400_000),
        to,
        apiKey,
        label,
      );
      return [...first, ...second];
    }
  }

  /** rough area represented by one alert pixel (10m RADD/S2, 30m GLAD-L) in ha */
  static pixelAreaHa(system: string): number {
    return system === "radd" || system === "glad_s2" ? 0.01 : 0.09;
  }
}
