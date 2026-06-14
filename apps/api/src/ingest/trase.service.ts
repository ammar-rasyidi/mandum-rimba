import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Company, CompanyDocument } from "../common/schemas";
import { JobLockService, JobResult } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import { HttpService } from "../common/http.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";
import { parseCsv, slugify } from "./util/geo";

/**
 * 04:00 WIB — Trase palm-oil exporter ↔ deforestation linkage (CC-licensed
 * bulk downloads from trase.earth). Configure TRASE_CSV_URL with the
 * Indonesia palm oil flows export. Company profiles are built ONLY from
 * published datasets like this one (editorial principle #4).
 */
@Injectable()
export class TraseService implements OnModuleInit {
  static readonly JOB = "trase";
  private readonly logger = new Logger(TraseService.name);

  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly http: HttpService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(TraseService.JOB, () => this.run());
  }

  @Cron("0 0 4 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(TraseService.JOB, async (): Promise<JobResult> => {
      const url = process.env.TRASE_CSV_URL;
      if (!url) {
        this.logger.warn("TRASE_CSV_URL not configured — skipping");
        return { skipped: true };
      }

      const csv = await this.http.get<string>(url, { responseType: "text" });

      const hash = this.archiver.hash(csv);
      const prev = await this.companyModel.findOne({
        "sources.sourceId": "trase",
        "sources.contentHash": hash,
      });
      if (prev) return { skipped: true, stats: { unchanged: 1 } };

      await this.archiver.archiveRaw(TraseService.JOB, "trase.csv", csv, "text/csv");

      const rows = parseCsv(csv);
      const retrievedAt = new Date().toISOString();
      let upserted = 0;

      for (const row of rows) {
        const name = row.EXPORTER ?? row.exporter ?? row.company ?? "";
        if (!name || name.toUpperCase() === "UNKNOWN") continue;

        await this.companyModel.updateOne(
          { slug: slugify(name) },
          {
            $set: { name },
            $addToSet: {
              commodities: "palm oil",
              traseLinks: url,
              sources: {
                sourceId: "trase",
                sourceUrl: url,
                retrievedAt,
                license: "Trase — CC BY 4.0",
                contentHash: hash,
              },
            },
          },
          { upsert: true },
        );
        upserted++;
      }

      return { stats: { rows: rows.length, upserted } };
    });
  }
}
