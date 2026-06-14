import { Injectable } from "@nestjs/common";

export type JobRunner = () => Promise<void>;

/**
 * Name → runner registry. Every cron job self-registers on module init so
 * POST /v1/admin/jobs/:name/run can trigger any of them by name.
 */
@Injectable()
export class JobRegistryService {
  private readonly jobs = new Map<string, JobRunner>();

  register(name: string, runner: JobRunner): void {
    this.jobs.set(name, runner);
  }

  names(): string[] {
    return [...this.jobs.keys()];
  }

  async run(name: string): Promise<boolean> {
    const runner = this.jobs.get(name);
    if (!runner) return false;
    // fire and forget — admin trigger returns immediately, jobRuns tracks it
    void runner();
    return true;
  }
}

/** Cron methods bail out when CRON_ENABLED=false (local dev). */
export function cronEnabled(): boolean {
  return (process.env.CRON_ENABLED ?? "true") !== "false";
}
