import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  ForestLossAnnual,
  ForestLossAnnualDocument,
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
const DATASET = "umd_tree_cover_loss";
// GFW convention: ≥30% canopy density is the standard "tree cover" threshold
const CANOPY_THRESHOLD = 30;

interface LossRow {
  umd_tree_cover_loss__year: number;
  area__ha: number;
}

/**
 * 01:30 WIB — Hansen/UMD annual tree cover loss aggregated per region.
 * The dataset changes once a year; the daily run hash-checks the response per
 * region and no-ops when nothing changed (ingestion rules §4).
 */
@Injectable()
export class GfwAnnualService implements OnModuleInit {
  static readonly JOB = "gfw-annual";
  private readonly logger = new Logger(GfwAnnualService.name);

  constructor(
    @InjectModel(ForestLossAnnual.name)
    private lossModel: Model<ForestLossAnnualDocument>,
    @InjectModel(Region.name) private regionModel: Model<RegionDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly http: HttpService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(GfwAnnualService.JOB, () => this.run());
  }

  @Cron("0 30 1 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(GfwAnnualService.JOB, async () => {
      const apiKey = process.env.GFW_API_KEY;
      if (!apiKey) {
        this.logger.warn("GFW_API_KEY not set — skipping");
        return { skipped: true };
      }

      const regions = await this.regionModel
        .find()
        .select("name level geomSimplified geom");

      let upserted = 0;
      let unchanged = 0;

      for (const region of regions) {
        const geometry = region.geomSimplified ?? region.geom;
        const sql =
          `SELECT umd_tree_cover_loss__year, SUM(area__ha) AS area__ha ` +
          `FROM results WHERE umd_tree_cover_density_2000__threshold >= ${CANOPY_THRESHOLD} ` +
          `GROUP BY umd_tree_cover_loss__year`;

        let rows: LossRow[];
        try {
          const res = await this.http.post<{ data: LossRow[] }>(
            `${GFW_BASE}/dataset/${DATASET}/latest/query/json`,
            { sql, geometry },
            { headers: { "x-api-key": apiKey } },
          );
          rows = res.data ?? [];
        } catch (err) {
          this.logger.error(`loss query failed for ${region.name}: ${err}`);
          continue;
        }

        const payload = JSON.stringify(rows);
        const hash = this.archiver.hash(payload);
        const existing = await this.lossModel
          .find({ regionId: region._id, source: "gfw_umd_tree_cover_loss" })
          .select("year lossHa");
        const existingHash = this.archiver.hash(
          JSON.stringify(
            existing
              .sort((a, b) => a.year - b.year)
              .map((d) => ({
                umd_tree_cover_loss__year: d.year,
                area__ha: d.lossHa,
              })),
          ),
        );
        if (existing.length > 0 && hash === existingHash) {
          unchanged++;
          continue;
        }

        await this.archiver.archiveRaw(
          GfwAnnualService.JOB,
          `${region.name.toLowerCase().replace(/\s+/g, "-")}.json`,
          payload,
        );

        for (const row of rows) {
          if (!row.umd_tree_cover_loss__year) continue;
          await this.lossModel.updateOne(
            { regionId: region._id, year: row.umd_tree_cover_loss__year },
            {
              $set: {
                lossHa: Math.round(row.area__ha * 100) / 100,
                source: "gfw_umd_tree_cover_loss",
              },
            },
            { upsert: true },
          );
          upserted++;
        }
      }

      return { stats: { regions: regions.length, upserted, unchanged } };
    });
  }
}
