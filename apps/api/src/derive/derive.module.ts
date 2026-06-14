import { Injectable, Logger, Module, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { JobLockService } from "../common/job-lock.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";
import { SpatialFlagsService } from "./spatial-flags.service";
import { DiscrepanciesService } from "./discrepancies.service";
import { WatershedLinkService } from "./watershed-link.service";

/**
 * 05:00 WIB — the derive pipeline runs as one locked job after all ingestion:
 * spatialFlags → discrepancies → watershedLink (order matters: aggregation
 * reads the flags written by step 1).
 */
@Injectable()
export class DeriveService implements OnModuleInit {
  static readonly JOB = "derive";
  private readonly logger = new Logger(DeriveService.name);

  constructor(
    private readonly locks: JobLockService,
    private readonly registry: JobRegistryService,
    private readonly spatialFlags: SpatialFlagsService,
    private readonly discrepancies: DiscrepanciesService,
    private readonly watershedLink: WatershedLinkService,
  ) {}

  onModuleInit() {
    this.registry.register(DeriveService.JOB, () => this.run());
  }

  @Cron("0 0 5 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(DeriveService.JOB, async () => {
      const flags = await this.spatialFlags.run();
      const agg = await this.discrepancies.run();
      const ws = await this.watershedLink.run();
      return {
        stats: {
          flagged: flags.flagged,
          discrepancyGroups: agg.upserted,
          watershedLinked: ws.linked,
        },
      };
    });
  }
}

@Module({
  providers: [
    DeriveService,
    SpatialFlagsService,
    DiscrepanciesService,
    WatershedLinkService,
  ],
})
export class DeriveModule {}
