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

interface ProtectedFields {
  name: string;
  nameAlt: string;
  ref: string;
  category: string;
  desig: string;
  desigEng: string;
  iucnCat: string;
  areaHa: number;
  statusYear: number;
}

interface ProtectedSource extends GfwVectorSource {
  kind: "protected" | "moratorium";
  license: string;
  pick: (row: Record<string, unknown>) => ProtectedFields;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Map a WDPA designation to one of our conservation-category chips. Match on
 * the Indonesian `desig` first (most specific), English as fallback. Marine
 * "Laut" variants fold into their base category (e.g. Taman Nasional Laut→TN).
 */
function classifyProtected(desig: string, desigEng: string): string {
  const d = desig.toLowerCase();
  const e = desigEng.toLowerCase();
  if (d.includes("taman nasional") || e.includes("national park")) return "TN";
  if (d.includes("hutan lindung") || e.includes("protected forest")) return "HL";
  if (d.includes("cagar alam") || e.includes("nature reserve")) return "CA";
  if (
    d.includes("suaka margasatwa") ||
    e.includes("wildlife reserve") ||
    e.includes("wildlife sanctuary") ||
    e.includes("game reserve")
  ) {
    return "SM";
  }
  return "KK"; // Kawasan konservasi lain (TWA, Tahura, Taman Buru, …)
}

// Versions pinned for reproducibility; row counts verified live:
// WDPA IDN ~961 national designations, PIPPIB moratorium polygons (paged).
const SOURCES: ProtectedSource[] = [
  {
    dataset: "wdpa_protected_areas",
    version: "v202512",
    kind: "protected",
    where: "iso3='IDN'",
    fields: [
      "gfw_fid",
      "site_pid", // WDPA parcel id (v202512 has site_pid, not wdpa_pid)
      "name",
      "name_eng",
      "desig",
      "desig_eng",
      "iucn_cat",
      "gfw_area__ha",
      "status_yr",
    ],
    pageSize: 100, // park polygons are huge; keep pages small
    license: "Protected Planet / WDPA terms — no commercial redistribution",
    pick: (r) => {
      const desig = String(r.desig ?? "");
      const desigEng = String(r.desig_eng ?? "");
      // WDPA Indonesia: `name_eng` holds the recognizable/gazetted park name
      // (e.g. "Tesso Nilo"); `name` is sometimes an obscure local block name
      // (e.g. "Air Sawan"). Lead with name_eng, keep the other as an alias.
      const nm = String(r.name ?? "");
      const nmEng = String(r.name_eng ?? "");
      const name = nmEng || nm || String(r.site_pid ?? "Unknown");
      return {
        name,
        nameAlt: nm && nm !== name ? nm : "",
        ref: String(r.site_pid ?? r.gfw_fid),
        category: classifyProtected(desig, desigEng),
        desig,
        desigEng,
        iucnCat: String(r.iucn_cat ?? ""),
        areaHa: Math.round(num(r.gfw_area__ha)),
        statusYear: num(r.status_yr),
      };
    },
  },
  {
    dataset: "idn_forest_moratorium",
    version: "v20200923",
    kind: "moratorium",
    fields: ["gfw_fid", "pippib_en", "gfw_area__ha"],
    pageSize: 500,
    license: "KLHK PIPPIB — public data (via GFW, CC BY 4.0)",
    pick: (r) => ({
      name: String(r.pippib_en ?? "Forest moratorium (PIPPIB)"),
      nameAlt: "",
      ref: String(r.gfw_fid),
      category: "moratorium",
      desig: "",
      desigEng: "",
      iucnCat: "",
      areaHa: Math.round(num(r.gfw_area__ha)),
      statusYear: 0,
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
              const picked = src.pick(row);
              const { ref } = picked;
              const set = {
                kind: src.kind,
                category: picked.category,
                name: picked.name,
                nameAlt: picked.nameAlt,
                desig: picked.desig,
                desigEng: picked.desigEng,
                iucnCat: picked.iucnCat,
                areaHa: picked.areaHa,
                statusYear: picked.statusYear,
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

      return {
        stats: { upserted, invalid, sources: SOURCES.length },
      };
    });
  }
}
