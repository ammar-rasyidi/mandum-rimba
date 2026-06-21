import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { JobLockService } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import { HttpService } from "../common/http.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";

/**
 * 04:30 WIB, Nusantara Atlas monthly deforestation reports.
 * Their license does not permit blanket redistribution of underlying data, so
 * this job only snapshots the public report index for cite-and-link use on
 * story/methodology pages. Raw HTML archived for provenance.
 */
@Injectable()
export class NusantaraAtlasService implements OnModuleInit {
  static readonly JOB = "nusantara-atlas";
  private readonly logger = new Logger(NusantaraAtlasService.name);
  private static readonly REPORTS_URL = "https://nusantara-atlas.org/reports/";

  constructor(
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly http: HttpService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(NusantaraAtlasService.JOB, () => this.run());
  }

  @Cron("0 30 4 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(NusantaraAtlasService.JOB, async () => {
      let html: string;
      try {
        html = await this.http.get<string>(NusantaraAtlasService.REPORTS_URL, {
          responseType: "text",
        });
      } catch (err) {
        this.logger.warn(`report index fetch failed: ${err}`);
        return { skipped: true };
      }

      await this.archiver.archiveRaw(
        NusantaraAtlasService.JOB,
        "reports-index.html",
        html,
        "text/html",
      );
      return { stats: { bytes: html.length } };
    });
  }
}
