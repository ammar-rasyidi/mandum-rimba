import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { JobRun, JobRunDocument } from "./schemas";

export interface JobResult {
  stats?: Record<string, number>;
  skipped?: boolean;
}

/**
 * Per-job locking via the jobRuns collection: a job is "locked" while a run
 * with status=running exists and started < STALE_MS ago. Prevents overlapping
 * cron executions (reliability requirement §10) and doubles as the audit log
 * that powers /status.
 */
@Injectable()
export class JobLockService {
  private readonly logger = new Logger(JobLockService.name);
  private static readonly STALE_MS = 6 * 60 * 60 * 1000; // 6h: assume crashed

  constructor(
    @InjectModel(JobRun.name) private jobRunModel: Model<JobRunDocument>,
  ) {}

  /** Run `fn` under the named lock. Errors are recorded, never rethrown:
   *  one failed source must never block the others. */
  async withLock(
    job: string,
    fn: () => Promise<JobResult | void>,
  ): Promise<void> {
    const staleBefore = new Date(Date.now() - JobLockService.STALE_MS);
    const running = await this.jobRunModel.findOne({
      job,
      status: "running",
      startedAt: { $gte: staleBefore },
    });
    if (running) {
      this.logger.warn(`[${job}] previous run still in progress, skipping`);
      return;
    }

    const run = await this.jobRunModel.create({
      job,
      startedAt: new Date(),
      status: "running",
    });

    try {
      const result = (await fn()) ?? {};
      run.status = result.skipped ? "skipped" : "success";
      run.stats = result.stats ?? {};
      run.finishedAt = new Date();
      await run.save();
      this.logger.log(
        `[${job}] ${run.status} ${JSON.stringify(run.stats ?? {})}`,
      );
    } catch (err) {
      run.status = "failed";
      run.error = err instanceof Error ? err.stack ?? err.message : String(err);
      run.finishedAt = new Date();
      await run.save();
      this.logger.error(`[${job}] failed: ${run.error}`);
    }
  }

  async lastRuns(): Promise<JobRunDocument[]> {
    // latest run per job name
    return this.jobRunModel.aggregate([
      { $sort: { startedAt: -1 } },
      { $group: { _id: "$job", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
    ]);
  }

  async lastSuccess(job: string): Promise<JobRunDocument | null> {
    return this.jobRunModel
      .findOne({ job, status: "success" })
      .sort({ startedAt: -1 });
  }
}
