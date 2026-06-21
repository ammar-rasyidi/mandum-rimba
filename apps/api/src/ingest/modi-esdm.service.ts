import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Company, CompanyDocument } from "../common/schemas";
import { JobLockService } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import { HttpService } from "../common/http.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";
import { parseCsv, slugify } from "./util/geo";

/**
 * 03:00 WIB, ESDM MODI / Minerba One Map mining permit registry (IUP).
 * Phase 4 source. Expects MODI_CSV_URL pointing at a CSV export with columns
 * including company name, commodity, status, province. Registry attributes
 * only, concession *geometries* for mining come from Kepo Hutan / Minerba
 * One Map WFS in a later iteration.
 */
@Injectable()
export class ModiEsdmService implements OnModuleInit {
  static readonly JOB = "modi-esdm";
  private readonly logger = new Logger(ModiEsdmService.name);

  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly http: HttpService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(ModiEsdmService.JOB, () => this.run());
  }

  @Cron("0 0 3 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(ModiEsdmService.JOB, async () => {
      const url = process.env.MODI_CSV_URL;
      if (!url) {
        this.logger.warn("MODI_CSV_URL not configured, skipping");
        return { skipped: true };
      }

      const csv = await this.http.get<string>(url, { responseType: "text" });
      await this.archiver.archiveRaw(ModiEsdmService.JOB, "modi.csv", csv, "text/csv");

      const rows = parseCsv(csv);
      const retrievedAt = new Date().toISOString();
      let upserted = 0;

      for (const row of rows) {
        const name =
          row.nama_perusahaan ?? row.company ?? row.nama_usaha ?? "";
        if (!name) continue;
        const commodity = (row.komoditas ?? row.commodity ?? "").toLowerCase();

        await this.companyModel.updateOne(
          { slug: slugify(name) },
          {
            $set: { name },
            $addToSet: {
              commodities: commodity || "unknown",
              sources: {
                sourceId: "modi_esdm",
                sourceUrl: url,
                retrievedAt,
                license: "ESDM MODI, public registry",
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
