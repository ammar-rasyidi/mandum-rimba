import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { MultiPolygon, Polygon } from "geojson";
import {
  Alert,
  AlertDocument,
  Concession,
  ConcessionDocument,
} from "../common/schemas";
import { JobLockService } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import { HttpService } from "../common/http.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";
import { areaHa, repairRings } from "./util/geo";
import {
  GfwVectorSource,
  fetchGfwVector,
  gfwDatasetUrl,
  parseGeometry,
} from "./util/gfw-vector";

// Maus et al. (2022) "An update on global mining land use", Scientific Data,
// served by the GFW Data API as pangaea_global_mining. Satellite-mapped mined
// areas (the physical footprint), filterable by iso3_code. Verified live:
// 1,448 IDN polygons / 8,020 km2 spanning Aceh→Papua (Kalimantan coal,
// Sulawesi/Maluku nickel, Papua).
const SOURCE: GfwVectorSource = {
  dataset: "pangaea_global_mining",
  version: "v2",
  fields: ["gfw_fid", "area", "country_name"],
  where: "iso3_code='IDN'",
  pageSize: 200,
};

/**
 * 03:00 WIB, mining land-use footprint (Maus et al. via GFW Data API),
 * stored as the `mining` TYPE inside the concessions collection so it sits
 * alongside palm/pulp/logging in the Concessions layer.
 *
 * NOTE: this is observed mined *land* (footprint), not permit boundaries.
 * Open mining-concession (IUP) polygons are not published for Indonesia (ESDM
 * MOMI is login-locked); if you obtain a credible IUP GeoJSON it can be loaded
 * via MINING_IUP_GEOJSON_URL in the concessions job. Documented on /sumber-data.
 */
@Injectable()
export class MiningService implements OnModuleInit {
  static readonly JOB = "mining";
  private readonly logger = new Logger(MiningService.name);

  constructor(
    @InjectModel(Concession.name)
    private concessionModel: Model<ConcessionDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly http: HttpService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(MiningService.JOB, () => this.run());
  }

  @Cron("0 0 3 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(MiningService.JOB, async () => {
      const apiKey = process.env.GFW_API_KEY;
      if (!apiKey) {
        this.logger.warn("GFW_API_KEY not set, skipping");
        return { skipped: true };
      }

      const retrievedAt = new Date();
      let upserted = 0;
      let page = 0;
      try {
        for await (const rows of fetchGfwVector(this.http, apiKey, SOURCE)) {
          await this.archiver.archiveRaw(
            MiningService.JOB,
            `pangaea-mining-page-${page++}.json`,
            JSON.stringify(rows),
          );
          for (const row of rows) {
            const geom = parseGeometry(row);
            if (
              !geom ||
              (geom.type !== "Polygon" && geom.type !== "MultiPolygon")
            ) {
              continue;
            }
            const set = {
              companyName: "-", // Maus footprint is unattributed (no operator)
              companySlug: "",
              type: "mining" as const,
              commodity: "tambang",
              permitStatus: null,
              permitYear: null,
              areaHa: row.area
                ? Number(row.area) * 100 // km² → ha
                : areaHa(geom as Polygon | MultiPolygon),
              sourceUrl: gfwDatasetUrl(SOURCE),
              retrievedAt,
              license: "CC BY 4.0 (Maus et al. 2022, Scientific Data)",
            };
            const filter = {
              source: SOURCE.dataset,
              sourceRef: String(row.gfw_fid),
            };
            try {
              await this.concessionModel.updateOne(
                filter,
                { $set: { ...set, geom } },
                { upsert: true },
              );
              upserted++;
            } catch {
              await this.concessionModel.updateOne(
                filter,
                {
                  $set: {
                    ...set,
                    geom: repairRings(geom as Polygon | MultiPolygon),
                  },
                },
                { upsert: true },
              );
              upserted++;
            }
          }
        }
      } catch (err) {
        this.logger.error(`mining ingest failed at page ${page}: ${err}`);
      }

      return { stats: { upserted, pages: page } };
    });
  }
}
