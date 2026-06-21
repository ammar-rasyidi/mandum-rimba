import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { JobRun, JobRunDocument } from "../common/schemas";
import { JobLockService } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";

export interface PipelineStatusJson {
  generatedAt: string;
  jobs: {
    job: string;
    lastRunAt: string | null;
    lastStatus: string | null;
    lastSuccessAt: string | null;
    stats: Record<string, number>;
    staleDays: number | null;
  }[];
}

/**
 * 06:00 WIB, write the pipeline status JSON to R2. This powers the public
 * /status page: a transparency/trust signal showing exactly when each source
 * was last refreshed and whether it succeeded.
 */
@Injectable()
export class StatusService implements OnModuleInit {
  static readonly JOB = "status";
  private readonly logger = new Logger(StatusService.name);

  constructor(
    @InjectModel(JobRun.name) private jobRunModel: Model<JobRunDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(StatusService.JOB, () => this.run());
  }

  @Cron("0 0 6 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(StatusService.JOB, async () => {
      const status = await this.build();
      await this.archiver.putJson("status/pipeline.json", status);

      // alert hook (§10): a job with no success for 2+ days deserves a ping.
      const stale = status.jobs.filter((j) => (j.staleDays ?? 0) >= 2);
      if (stale.length > 0) {
        this.logger.warn(
          `stale jobs (no success ≥2 days): ${stale.map((j) => j.job).join(", ")}`,
        );
      }

      return { stats: { jobs: status.jobs.length, stale: stale.length } };
    });
  }

  /** Also served live at GET /v1/status for the web app. */
  async build(): Promise<PipelineStatusJson> {
    const latest = await this.locks.lastRuns();
    const jobs = [];
    for (const run of latest) {
      const lastSuccess =
        run.status === "success" || run.status === "skipped"
          ? run
          : await this.jobRunModel
              .findOne({ job: run.job, status: { $in: ["success", "skipped"] } })
              .sort({ startedAt: -1 });
      const staleDays = lastSuccess
        ? Math.floor(
            (Date.now() - lastSuccess.startedAt.getTime()) / 86_400_000,
          )
        : null;
      jobs.push({
        job: run.job,
        lastRunAt: run.startedAt?.toISOString() ?? null,
        lastStatus: run.status ?? null,
        lastSuccessAt: lastSuccess?.startedAt?.toISOString() ?? null,
        stats: run.stats ?? {},
        staleDays,
      });
    }
    jobs.sort((a, b) => a.job.localeCompare(b.job));
    return { generatedAt: new Date().toISOString(), jobs };
  }
}
