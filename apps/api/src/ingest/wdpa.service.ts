import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  Alert,
  AlertDocument,
  ProtectedArea,
  ProtectedAreaDocument,
} from "../common/schemas";
import { JobLockService } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import { HttpService } from "../common/http.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";
import {
  GfwVectorSource,
  fetchGfwVector,
  gfwDatasetUrl,
  parseGeometry,
} from "./util/gfw-vector";
import { repairRings } from "./util/geo";

interface ProtectedSource extends GfwVectorSource {
  kind: "protected" | "moratorium";
  license: string;
  pick: (row: Record<string, unknown>) => { name: string; ref: string };
}

// Versions pinned for reproducibility; row counts verified live:
// WDPA IDN 688 sites, PIPPIB moratorium 42,028 polygons (paged).
const SOURCES: ProtectedSource[] = [
  {
    dataset: "wdpa_protected_areas",
    version: "v202512",
    kind: "protected",
    where: "iso3='IDN'",
    fields: ["gfw_fid", "site_id", "name", "desig_eng", "iucn_cat"],
    pageSize: 100, // park polygons are huge; keep pages small
    license: "Protected Planet / WDPA terms — no commercial redistribution",
    pick: (r) => ({
      name: String(r.name ?? r.site_id ?? "Unknown"),
      ref: String(r.site_id ?? r.gfw_fid),
    }),
  },
  {
    dataset: "idn_forest_moratorium",
    version: "v20200923",
    kind: "moratorium",
    fields: ["gfw_fid", "pippib_en"],
    pageSize: 500,
    license: "KLHK PIPPIB — public data (via GFW, CC BY 4.0)",
    pick: (r) => ({
      name: String(r.pippib_en ?? "Forest moratorium (PIPPIB)"),
      ref: String(r.gfw_fid),
    }),
  },
];

/**
 * 03:30 WIB — Protected Planet (WDPA) protected areas + KLHK moratorium
 * polygons (PIPPIB), both served as GFW Data API vector datasets.
 */
@Injectable()
export class WdpaService implements OnModuleInit {
  static readonly JOB = "wdpa";
  private readonly logger = new Logger(WdpaService.name);

  constructor(
    @InjectModel(ProtectedArea.name)
    private protectedModel: Model<ProtectedAreaDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly http: HttpService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(WdpaService.JOB, () => this.run());
  }

  @Cron("0 30 3 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(WdpaService.JOB, async () => {
      const apiKey = process.env.GFW_API_KEY;
      if (!apiKey) {
        this.logger.warn("GFW_API_KEY not set — skipping");
        return { skipped: true };
      }

      let upserted = 0;
      let invalid = 0;
      for (const src of SOURCES) {
        const retrievedAt = new Date();
        let page = 0;
        try {
          for await (const rows of fetchGfwVector(this.http, apiKey, src)) {
            await this.archiver.archiveRaw(
              WdpaService.JOB,
              `${src.dataset}-page-${page++}.json`,
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
              const { name, ref } = src.pick(row);
              const set = {
                kind: src.kind,
                name,
                sourceUrl: gfwDatasetUrl(src),
                retrievedAt,
                license: src.license,
              };
              try {
                await this.protectedModel.updateOne(
                  { source: src.dataset, sourceRef: ref },
                  { $set: { ...set, geom } },
                  { upsert: true },
                );
                upserted++;
              } catch {
                // 2dsphere rejected the ring structure — retry repaired
                try {
                  await this.protectedModel.updateOne(
                    { source: src.dataset, sourceRef: ref },
                    { $set: { ...set, geom: repairRings(geom) } },
                    { upsert: true },
                  );
                  upserted++;
                } catch (err2) {
                  invalid++;
                  this.logger.warn(
                    `${src.dataset} ${ref}: unrepairable geometry (${err2 instanceof Error ? err2.message.slice(0, 120) : err2})`,
                  );
                }
              }
            }
            this.logger.log(`${src.dataset}: page ${page} done (${upserted} total)`);
          }
        } catch (err) {
          this.logger.error(`${src.dataset} failed at page ${page}: ${err}`);
        }
      }

      // polygon reference data changed → existing spatial flags are stale;
      // unset flaggedAt so the next derive run re-checks every alert
      let flagsInvalidated = 0;
      if (upserted > 0) {
        const res = await this.alertModel.updateMany(
          {},
          { $set: { flaggedAt: null } },
        );
        flagsInvalidated = res.modifiedCount;
      }

      return {
        stats: { upserted, invalid, flagsInvalidated, sources: SOURCES.length },
      };
    });
  }
}
