import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import * as turf from "@turf/turf";
import type { MultiPolygon } from "geojson";
import axios from "axios";
import { execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import {
  Disaster,
  DisasterDocument,
  Region,
  RegionDocument,
} from "../common/schemas";
import { JobLockService, JobResult } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";

const execFileAsync = promisify(execFile);

// DesInventar is the UNDRR-hosted mirror of BNPB DIBI (DIBI itself is a
// Superset UI with no machine endpoint; its CKAN portal points at a Google
// Drive folder). This export is the only stable event-level source.
const DEFAULT_EXPORT_URL =
  "https://www.desinventar.net/DesInventar/download/DI_export_idn.zip";

const EVENT_TYPE_MAP: Record<string, "flood" | "flash_flood" | "landslide"> = {
  BANJIR: "flood",
  "BANJIR BANDANG": "flash_flood",
  "TANAH LONGSOR": "landslide",
  // combined category: counted as flood (landslide impact is not separable)
  "BANJIR DAN TANAH LONGSOR": "flood",
};

interface DibiRecord {
  serial: string;
  evento: string;
  name0: string; // province
  name1: string; // kabupaten
  lugar: string;
  fechano: string;
  fechames: string;
  fechadia: string;
  muertos: string;
  afectados: string;
  damnificados: string;
  evacuados: string;
}

/**
 * 02:00 WIB — BNPB DIBI flood/landslide events via the DesInventar full
 * export (zip → 343 MB XML, streamed line-by-line; never loaded whole).
 * Events carry admin names but no coordinates: geom is the centroid of the
 * matching seeded kabupaten (documented approximation), regionId likewise.
 * Events in regions we haven't seeded yet are stored with geom/regionId null
 * and picked up by the next run after seeding (hash check skips otherwise,
 * so re-trigger manually after seeding new provinces).
 */
@Injectable()
export class BnpbDibiService implements OnModuleInit {
  static readonly JOB = "bnpb-dibi";
  private readonly logger = new Logger(BnpbDibiService.name);

  constructor(
    @InjectModel(Disaster.name) private disasterModel: Model<DisasterDocument>,
    @InjectModel(Region.name) private regionModel: Model<RegionDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(BnpbDibiService.JOB, () => this.run());
  }

  @Cron("0 0 2 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(
      BnpbDibiService.JOB,
      async (): Promise<JobResult> => {
      const url = process.env.DESINVENTAR_EXPORT_URL ?? DEFAULT_EXPORT_URL;
      const workDir = await mkdtemp(join(tmpdir(), "fw-dibi-"));

      try {
        const zipPath = join(workDir, "DI_export_idn.zip");
        const res = await axios.get(url, {
          responseType: "stream",
          timeout: 600_000,
          headers: { "User-Agent": "MandumRimba/0.1 (public-interest observatory)" },
        });
        await pipeline(res.data, createWriteStream(zipPath));

        // change detection: zip size as the cheap change key
        const { size } = await import("node:fs/promises").then((fs) =>
          fs.stat(zipPath),
        );
        const prev = await this.locks.lastSuccess(BnpbDibiService.JOB);
        if (prev?.stats?.zipBytes === size) {
          return { skipped: true, stats: { zipBytes: size } };
        }

        await this.archiver.putFile(
          `raw/${BnpbDibiService.JOB}/${new Date().toISOString().slice(0, 10)}/DI_export_idn.zip`,
          zipPath,
          "application/zip",
        );

        // stream-extract the single XML entry (unzip -p; the file is too big
        // for in-memory unzipping)
        const xmlPath = join(workDir, "export.xml");
        await execFileAsync(
          "/bin/sh",
          ["-c", `unzip -p '${zipPath}' '*.xml' > '${xmlPath}'`],
          { maxBuffer: 1024 },
        );

        const regionIndex = await this.buildRegionIndex();
        const retrievedAt = new Date();
        let parsed = 0;
        let upserted = 0;
        let geocoded = 0;

        for await (const rec of this.streamFichas(xmlPath)) {
          parsed++;
          const type = EVENT_TYPE_MAP[rec.evento.trim().toUpperCase()];
          if (!type) continue;

          const year = Number(rec.fechano);
          if (!year || year < 1900) continue;
          const month = Math.min(Math.max(Number(rec.fechames) || 1, 1), 12);
          const day = Math.min(Math.max(Number(rec.fechadia) || 1, 1), 28);
          const eventDate = new Date(Date.UTC(year, month - 1, day));

          const match = regionIndex.get(
            normalizeName(rec.name0) + "|" + normalizeName(rec.name1),
          );
          if (match) geocoded++;

          const affected =
            (Number(rec.afectados) || 0) +
            (Number(rec.damnificados) || 0) +
            (Number(rec.evacuados) || 0);

          await this.disasterModel.updateOne(
            { sourceRef: `dibi-${rec.serial}` },
            {
              $set: {
                eventDate,
                type,
                regionId: match?.id ?? null,
                deaths: Number(rec.muertos) || 0,
                affected,
                description: [rec.evento, rec.lugar, rec.name1, rec.name0]
                  .filter(Boolean)
                  .join(" — "),
                sourceUrl: url,
                retrievedAt,
                geom: match?.centroid ?? null,
                watershedLinkedAt: null,
              },
            },
            { upsert: true },
          );
          upserted++;
        }

        return {
          stats: { zipBytes: size, parsed, upserted, geocoded },
        };
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    });
  }

  /** "ACEH BARAT" / "AcehBarat" / "Aceh Barat" all → "acehbarat" */
  private async buildRegionIndex(): Promise<
    Map<string, { id: Types.ObjectId; centroid: { type: "Point"; coordinates: [number, number] } }>
  > {
    const provinces = await this.regionModel
      .find({ level: "province" })
      .select("name");
    const provinceName = new Map(
      provinces.map((p) => [String(p._id), p.name]),
    );

    const kabupaten = await this.regionModel
      .find({ level: "kabupaten" })
      .select("name parentId geomSimplified");

    const index = new Map<
      string,
      { id: Types.ObjectId; centroid: { type: "Point"; coordinates: [number, number] } }
    >();
    for (const kab of kabupaten) {
      const prov = provinceName.get(String(kab.parentId));
      if (!prov || !kab.geomSimplified) continue;
      const centroid = turf.centroid(
        turf.feature(kab.geomSimplified as unknown as MultiPolygon),
      ).geometry;
      index.set(normalizeName(prov) + "|" + normalizeName(kab.name), {
        id: kab._id as Types.ObjectId,
        centroid: {
          type: "Point",
          coordinates: centroid.coordinates as [number, number],
        },
      });
    }
    return index;
  }

  /** Stream <TR> records inside the <fichas> section of the 343 MB XML. */
  private async *streamFichas(xmlPath: string): AsyncGenerator<DibiRecord> {
    const rl = createInterface({
      input: createReadStream(xmlPath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    let inFichas = false;
    let record: Record<string, string> | null = null;
    const fieldRe = /^<(\w+)>(.*?)<\/\1>$/;

    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!inFichas) {
        if (line.includes("<fichas>")) inFichas = true;
        continue;
      }
      if (line.includes("</fichas>")) return;

      if (line.startsWith("<TR>")) {
        record = {};
        const first = line.slice(4); // "<TR><serial>...</serial>"
        const m = first.match(fieldRe);
        if (m) record[m[1]] = m[2];
        continue;
      }
      if (line.startsWith("</TR>")) {
        if (record?.serial) yield record as unknown as DibiRecord;
        record = null;
        continue;
      }
      if (record) {
        const m = line.match(fieldRe);
        if (m) record[m[1]] = decodeEntities(m[2]);
      }
    }
  }
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
