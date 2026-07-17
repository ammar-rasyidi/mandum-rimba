import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { MultiPolygon, Polygon } from "geojson";
import { Wetland, WetlandDocument } from "../common/schemas";
import { JobLockService } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import { HttpService } from "../common/http.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";
import { areaHa, repairRings } from "./util/geo";

interface WetlandSource {
  kind: "mangrove" | "peatland";
  /** env var holding a GeoJSON FeatureCollection URL. Neither GMW nor the KLHK
   *  KHG map is served as a stable machine GeoJSON endpoint, so the maintainer
   *  prepares a hosted GeoJSON (download → convert → host) and points here. Unset
   *  → the kind is skipped cleanly, exactly like the mining-IUP concession path. */
  urlEnv: string;
  source: string;
  license: string;
  /** properties to try, in order, for a human-readable feature label */
  nameKeys: string[];
}

const SOURCES: WetlandSource[] = [
  {
    kind: "mangrove",
    urlEnv: "MANGROVE_GEOJSON_URL",
    source: "gmw_v3",
    license: "CC BY 4.0 (Global Mangrove Watch v3)",
    nameKeys: ["name", "NAME", "location"],
  },
  {
    kind: "peatland",
    urlEnv: "PEATLAND_GEOJSON_URL",
    source: "klhk_khg",
    license: "KLHK (Peta Kesatuan Hidrologis Gambut)",
    nameKeys: ["NAMOBJ", "nama", "NAMA", "name", "NAME", "KHG", "khg"],
  },
];

interface WetlandFeatureCollection {
  features?: {
    properties?: Record<string, unknown>;
    geometry?: Polygon | MultiPolygon;
    id?: string | number;
  }[];
}

/**
 * 02:45 WIB, wetland habitat extents (mangrove + peatland) from configured
 * GeoJSON sources. Each kind is independent: an unset URL is skipped, so the
 * pipeline runs with whatever you've wired. Geometry is upserted into the
 * `wetlands` collection; the `tiles` job builds one PMTiles per kind.
 */
@Injectable()
export class WetlandsService implements OnModuleInit {
  static readonly JOB = "wetlands";
  private readonly logger = new Logger(WetlandsService.name);

  constructor(
    @InjectModel(Wetland.name) private wetlandModel: Model<WetlandDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly http: HttpService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(WetlandsService.JOB, () => this.run());
  }

  @Cron("0 45 2 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(WetlandsService.JOB, async () => {
      const stats: Record<string, number> = {};
      for (const src of SOURCES) {
        const url = process.env[src.urlEnv];
        if (!url) {
          this.logger.warn(`${src.urlEnv} not set, skipping ${src.kind}`);
          continue;
        }
        stats[src.kind] = await this.ingest(src, url);
      }
      return { stats };
    });
  }

  private async ingest(src: WetlandSource, url: string): Promise<number> {
    let fc: WetlandFeatureCollection;
    try {
      fc = await this.http.get<WetlandFeatureCollection>(url);
    } catch (err) {
      this.logger.error(`${src.kind} fetch failed (${url}): ${err}`);
      return 0;
    }
    await this.archiver.archiveRaw(
      WetlandsService.JOB,
      `${src.kind}.geojson`,
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
      const name = src.nameKeys.map((k) => p[k]).find((v) => v != null);
      const sourceRef = String(
        p.id ?? p.ID ?? p.OBJECTID ?? p.fid ?? f.id ?? `${src.kind}-${n}`,
      );
      const set = {
        kind: src.kind,
        name: name != null ? String(name) : null,
        areaHa: areaHa(geom),
        sourceUrl: url,
        retrievedAt,
        license: src.license,
      };
      const filter = { source: src.source, sourceRef };
      try {
        await this.wetlandModel.updateOne(
          filter,
          { $set: { ...set, geom } },
          { upsert: true },
        );
        n++;
      } catch {
        // 2dsphere rejected the ring structure, retry repaired
        try {
          await this.wetlandModel.updateOne(
            filter,
            { $set: { ...set, geom: repairRings(geom) } },
            { upsert: true },
          );
          n++;
        } catch (err2) {
          this.logger.warn(
            `${src.kind} ${sourceRef}: unstoreable geometry (${err2 instanceof Error ? err2.message.slice(0, 120) : err2})`,
          );
        }
      }
    }
    this.logger.log(`${src.kind}: upserted ${n} polygons`);
    return n;
  }
}
