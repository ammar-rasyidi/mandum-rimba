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
import { areaHa, repairRings, slugify } from "./util/geo";
import {
  GfwVectorSource,
  fetchGfwVector,
  gfwDatasetUrl,
  parseGeometry,
} from "./util/gfw-vector";

interface ConcessionSource extends GfwVectorSource {
  type: "palm_hgu" | "pulp_hti" | "logging";
  commodity: string;
  /** map a row to (companyName, permitStatus), field names differ per dataset */
  pick: (row: Record<string, unknown>) => {
    companyName: string;
    permitStatus: string | null;
  };
}

// Greenpeace-lineage concession boundaries, served by the GFW Data API
// (the original Kepo Hutan downloads are gone; GFW hosts the maintained
// copies). Versions pinned for reproducibility; row counts verified live:
// oil palm 1,855 / wood fiber 295 / logging 259 (IDN). GFW's mining layer
// has zero IDN rows, mining arrives later via MODI/Minerba (Phase 4).
const SOURCES: ConcessionSource[] = [
  {
    dataset: "gfw_oil_palm",
    version: "v2025",
    type: "palm_hgu",
    commodity: "palm oil",
    where: "iso3='IDN'",
    fields: ["gfw_fid", "conc_name", "conc_stat", "company", "comp_group"],
    pick: (r) => ({
      companyName: String(r.company || r.conc_name || r.comp_group || "Unknown"),
      permitStatus: r.conc_stat ? String(r.conc_stat) : null,
    }),
  },
  {
    dataset: "gfw_wood_fiber",
    version: "v2025",
    type: "pulp_hti",
    commodity: "pulpwood",
    where: "iso3='IDN'",
    fields: ["gfw_fid", "conc_name", "conc_stat", "company", "comp_group"],
    pick: (r) => ({
      companyName: String(r.company || r.conc_name || r.comp_group || "Unknown"),
      permitStatus: r.conc_stat ? String(r.conc_stat) : null,
    }),
  },
  {
    dataset: "gfw_logging",
    version: "v202106",
    type: "logging",
    commodity: "timber",
    where: "country='IDN'",
    fields: ["gfw_fid", "name", "company", "status", "area_ha"],
    pick: (r) => ({
      companyName: String(r.company || r.name || "Unknown"),
      permitStatus: r.status ? String(r.status) : null,
    }),
  },
];

/**
 * 02:30 WIB, palm / pulpwood / logging concession boundaries via the GFW
 * Data API vector datasets (paged SQL + ST_AsGeoJSON).
 */
@Injectable()
export class ConcessionsService implements OnModuleInit {
  static readonly JOB = "concessions";
  private readonly logger = new Logger(ConcessionsService.name);

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
    this.registry.register(ConcessionsService.JOB, () => this.run());
  }

  @Cron("0 30 2 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(ConcessionsService.JOB, async () => {
      const apiKey = process.env.GFW_API_KEY;
      if (!apiKey) {
        this.logger.warn("GFW_API_KEY not set, skipping");
        return { skipped: true };
      }

      let upserted = 0;
      for (const src of SOURCES) {
        const retrievedAt = new Date();
        let page = 0;
        try {
          for await (const rows of fetchGfwVector(this.http, apiKey, src)) {
            await this.archiver.archiveRaw(
              ConcessionsService.JOB,
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
              const { companyName, permitStatus } = src.pick(row);
              const set = {
                companyName,
                companySlug: slugify(companyName),
                type: src.type,
                commodity: src.commodity,
                permitStatus,
                permitYear: null,
                areaHa: row.area_ha
                  ? Number(row.area_ha)
                  : areaHa(geom as Polygon | MultiPolygon),
                sourceUrl: gfwDatasetUrl(src),
                retrievedAt,
                license: "CC BY 4.0 (GFW / Greenpeace-derived)",
              };
              const filter = {
                source: src.dataset,
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
                // 2dsphere rejected the ring structure, retry repaired
                try {
                  await this.concessionModel.updateOne(
                    filter,
                    { $set: { ...set, geom: repairRings(geom as Polygon | MultiPolygon) } },
                    { upsert: true },
                  );
                  upserted++;
                } catch (err2) {
                  this.logger.warn(
                    `${src.dataset} ${row.gfw_fid}: unrepairable geometry (${err2 instanceof Error ? err2.message.slice(0, 120) : err2})`,
                  );
                }
              }
            }
          }
        } catch (err) {
          // one dataset failing must not block the others
          this.logger.error(`${src.dataset} failed at page ${page}: ${err}`);
        }
      }

      // optional: official mining concession (IUP) boundaries, if a hosted
      // GeoJSON is configured. Open all-mineral IUP polygons are NOT published
      // for Indonesia (ESDM MOMI is login-locked), so this stays unset by
      // default, wire it only with a credible, cited source you can obtain.
      const mining = await this.ingestMiningConcessions();
      upserted += mining;

      return {
        stats: { upserted, mining, sources: SOURCES.length },
      };
    });
  }

  /** Optional IUP mining-concession ingest from MINING_IUP_GEOJSON_URL.
   *  Expects a GeoJSON FeatureCollection of permit polygons; properties may
   *  include company/name/commodity/status. Returns the upserted count. */
  private async ingestMiningConcessions(): Promise<number> {
    const url = process.env.MINING_IUP_GEOJSON_URL;
    if (!url) return 0;

    let fc: {
      features?: {
        properties?: Record<string, unknown>;
        geometry?: Polygon | MultiPolygon;
        id?: string | number;
      }[];
    };
    try {
      fc = await this.http.get(url);
    } catch (err) {
      this.logger.error(`mining IUP fetch failed (${url}): ${err}`);
      return 0;
    }
    await this.archiver.archiveRaw(
      ConcessionsService.JOB,
      "mining-iup.geojson",
      JSON.stringify(fc),
      "application/geo+json",
    );

    const retrievedAt = new Date();
    let n = 0;
    for (const f of fc.features ?? []) {
      const geom = f.geometry;
      if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) {
        continue;
      }
      const p = f.properties ?? {};
      const companyName = String(
        p.company ?? p.COMPANY ?? p.nama ?? p.name ?? p.NAMA ?? "Unknown",
      );
      const sourceRef = String(
        p.id ?? p.ID ?? p.kode ?? f.id ?? `${companyName}-${n}`,
      );
      const set = {
        companyName,
        companySlug: slugify(companyName),
        type: "mining" as const,
        commodity: String(p.commodity ?? p.komoditas ?? p.mineral ?? ""),
        permitStatus: p.status ? String(p.status) : null,
        permitYear: null,
        areaHa: areaHa(geom),
        sourceUrl: url,
        retrievedAt,
        license: "See configured source (MINING_IUP_GEOJSON_URL)",
      };
      const filter = { source: "mining_iup", sourceRef };
      try {
        await this.concessionModel.updateOne(
          filter,
          { $set: { ...set, geom } },
          { upsert: true },
        );
        n++;
      } catch {
        try {
          await this.concessionModel.updateOne(
            filter,
            { $set: { ...set, geom: repairRings(geom) } },
            { upsert: true },
          );
          n++;
        } catch (err2) {
          this.logger.warn(`mining IUP ${sourceRef}: unstoreable geometry`);
          void err2;
        }
      }
    }
    this.logger.log(`mining IUP: upserted ${n} concession polygons`);
    return n;
  }
}
