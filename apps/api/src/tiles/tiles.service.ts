import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Alert,
  AlertDocument,
  Concession,
  ConcessionDocument,
  Disaster,
  DisasterDocument,
  ProtectedArea,
  ProtectedAreaDocument,
  Region,
  RegionDocument,
  Wetland,
  WetlandDocument,
} from "../common/schemas";
import { JobLockService } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";

const execFileAsync = promisify(execFile);

interface LayerSpec {
  name: string;
  /** numeric change-key (doc count + latest epoch) for skip-if-unchanged */
  changeKey: () => Promise<number>;
  /** stream features as line-delimited GeoJSON into the temp file */
  export: (path: string) => Promise<number>;
  tippecanoeArgs: string[];
}

/**
 * 05:30 WIB, tippecanoe → PMTiles → R2. Geometry NEVER ships from the REST
 * API; this static pipeline is the only geometry path to the client.
 * Each layer keeps a numeric change-key in the jobRun stats; unchanged layers
 * are skipped. Requires the tippecanoe binary (built into the Docker image).
 */
@Injectable()
export class TilesService implements OnModuleInit {
  static readonly JOB = "tiles";
  private readonly logger = new Logger(TilesService.name);

  constructor(
    @InjectModel(Region.name) private regionModel: Model<RegionDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Concession.name)
    private concessionModel: Model<ConcessionDocument>,
    @InjectModel(ProtectedArea.name)
    private protectedModel: Model<ProtectedAreaDocument>,
    @InjectModel(Disaster.name) private disasterModel: Model<DisasterDocument>,
    @InjectModel(Wetland.name) private wetlandModel: Model<WetlandDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(TilesService.JOB, () => this.run());
  }

  @Cron("0 30 5 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(TilesService.JOB, async () => {
      const previous = await this.locks.lastSuccess(TilesService.JOB);
      const prevKeys = previous?.stats ?? {};

      const layers = this.layerSpecs();
      const stats: Record<string, number> = {};
      let built = 0;

      const workDir = await mkdtemp(join(tmpdir(), "fw-tiles-"));
      try {
        for (const layer of layers) {
          const key = await layer.changeKey();
          stats[`key_${layer.name}`] = key;

          if (prevKeys[`key_${layer.name}`] === key) {
            this.logger.log(`${layer.name}: unchanged, skipping`);
            continue;
          }

          const geojsonPath = join(workDir, `${layer.name}.geojsonl`);
          const features = await layer.export(geojsonPath);
          if (features === 0) {
            this.logger.log(`${layer.name}: no features, skipping`);
            continue;
          }

          const pmtilesPath = join(workDir, `${layer.name}.pmtiles`);
          await execFileAsync(
            "tippecanoe",
            [
              "-o",
              pmtilesPath,
              "--force",
              "--layer",
              layer.name,
              "--name",
              layer.name,
              ...layer.tippecanoeArgs,
              geojsonPath,
            ],
            { maxBuffer: 64 * 1024 * 1024 },
          );

          await this.archiver.putFile(
            `tiles/${layer.name}.pmtiles`,
            pmtilesPath,
            "application/vnd.pmtiles",
          );
          built++;
          stats[`features_${layer.name}`] = features;
        }
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }

      return { stats: { ...stats, built } };
    });
  }

  private layerSpecs(): LayerSpec[] {
    const alertsSince = new Date(Date.now() - 90 * 86_400_000);
    return [
      {
        name: "regions",
        changeKey: async () => this.regionModel.estimatedDocumentCount(),
        export: (path) =>
          this.streamCursor(
            path,
            this.regionModel
              .find()
              .select("slug name nameEn level geomSimplified geom")
              .lean()
              .cursor(),
            (d: Record<string, any>) => ({
              type: "Feature",
              geometry: d.geomSimplified ?? d.geom,
              properties: {
                id: String(d._id),
                slug: d.slug,
                name: d.name,
                nameEn: d.nameEn,
                level: d.level,
              },
            }),
          ),
        tippecanoeArgs: ["-zg", "--coalesce-densest-as-needed"],
      },
      {
        name: "alerts",
        changeKey: async () =>
          this.alertModel.countDocuments({
            alertDate: { $gte: alertsSince },
          }),
        export: (path) =>
          this.streamCursor(
            path,
            this.alertModel
              .find({ alertDate: { $gte: alertsSince } })
              .lean()
              .cursor(),
            (d: Record<string, any>) => ({
              type: "Feature",
              geometry: d.geom,
              properties: {
                id: String(d._id),
                date: d.alertDate?.toISOString().slice(0, 10),
                system: d.system,
                confidence: d.confidence,
              },
            }),
          ),
        tippecanoeArgs: [
          "-zg",
          "--drop-densest-as-needed",
          "--extend-zooms-if-still-dropping",
          "-r1",
          "--cluster-distance=10",
        ],
      },
      {
        name: "concessions",
        changeKey: async () => this.concessionModel.estimatedDocumentCount(),
        export: (path) =>
          this.streamCursor(
            path,
            this.concessionModel.find().lean().cursor(),
            (d: Record<string, any>) => ({
              type: "Feature",
              geometry: d.geom,
              properties: {
                id: String(d._id),
                company: d.companyName,
                companySlug: d.companySlug,
                type: d.type,
                commodity: d.commodity ?? "",
                areaHa: d.areaHa,
                source: d.source,
              },
            }),
          ),
        tippecanoeArgs: ["-zg", "--coalesce-densest-as-needed"],
      },
      {
        name: "protected",
        // estimatedDocumentCount misses in-place field updates (re-ingest with
        // new category/area); fold the latest retrievedAt epoch in too
        changeKey: async () => {
          const count = await this.protectedModel.estimatedDocumentCount();
          const latest = await this.protectedModel
            .findOne()
            .sort({ retrievedAt: -1 })
            .select("retrievedAt");
          return (
            count + Math.floor((latest?.retrievedAt?.getTime() ?? 0) / 1000)
          );
        },
        export: (path) =>
          this.streamCursor(
            path,
            this.protectedModel.find().lean().cursor(),
            (d: Record<string, any>) => ({
              type: "Feature",
              geometry: d.geom,
              properties: {
                id: String(d._id),
                kind: d.kind,
                cat: d.category, // TN | HL | CA | SM | KK | moratorium
                name: d.name,
                nameAlt: d.nameAlt ?? "",
                desig: d.desig ?? "",
                iucn: d.iucnCat ?? "",
                areaHa: d.areaHa ?? 0,
                year: d.statusYear ?? 0,
                source: d.source,
              },
            }),
          ),
        tippecanoeArgs: ["-zg", "--coalesce-densest-as-needed"],
      },
      {
        name: "disasters",
        changeKey: async () => this.disasterModel.estimatedDocumentCount(),
        export: (path) =>
          this.streamCursor(
            path,
            this.disasterModel
              .find({ geom: { $ne: null } })
              .lean()
              .cursor(),
            (d: Record<string, any>) => ({
              type: "Feature",
              geometry: d.geom,
              properties: {
                id: String(d._id),
                type: d.type,
                date: d.eventDate?.toISOString().slice(0, 10),
                deaths: d.deaths ?? 0,
                affected: d.affected ?? 0,
              },
            }),
          ),
        tippecanoeArgs: ["-zg", "--drop-densest-as-needed"],
      },
      // wetland habitat extents, one PMTiles per kind from the shared collection
      ...(["mangrove", "peatland"] as const).map((kind) => ({
        name: kind,
        changeKey: async () => {
          const count = await this.wetlandModel.countDocuments({ kind });
          const latest = await this.wetlandModel
            .findOne({ kind })
            .sort({ retrievedAt: -1 })
            .select("retrievedAt");
          return (
            count + Math.floor((latest?.retrievedAt?.getTime() ?? 0) / 1000)
          );
        },
        export: (path: string) =>
          this.streamCursor(
            path,
            this.wetlandModel.find({ kind }).lean().cursor(),
            (d: Record<string, any>) => ({
              type: "Feature",
              geometry: d.geom,
              properties: {
                id: String(d._id),
                name: d.name ?? "",
                areaHa: d.areaHa ?? 0,
                source: d.source,
              },
            }),
          ),
        tippecanoeArgs: ["-zg", "--coalesce-densest-as-needed"],
      })),
    ];
  }

  private async streamCursor(
    path: string,
    cursor: AsyncIterable<Record<string, unknown>>,
    toFeature: (doc: Record<string, any>) => Record<string, unknown>,
  ): Promise<number> {
    const out = createWriteStream(path);
    let count = 0;
    for await (const doc of cursor) {
      const feature = toFeature(doc);
      if (!(feature as { geometry?: unknown }).geometry) continue;
      if (!out.write(JSON.stringify(feature) + "\n")) {
        await new Promise<void>((r) => out.once("drain", () => r()));
      }
      count++;
    }
    await new Promise((r) => out.end(r));
    return count;
  }
}
