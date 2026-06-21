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
    // fire and forget, admin trigger returns immediately, jobRuns tracks it
    void runner();
    return true;
  }

  /**
   * Await the job to completion, used by the standalone CLI (`jobs-cli.ts`)
   * that Modal invokes on a schedule, so the process stays alive until the
   * job finishes. Throws "unknown job" if the name isn't registered.
   */
  async runAndWait(name: string): Promise<void> {
    const runner = this.jobs.get(name);
    if (!runner) {
      throw new Error(
        `unknown job "${name}"; available: ${this.names().join(", ")}`,
      );
    }
    await runner();
  }
}

/** Cron methods bail out when CRON_ENABLED=false (local dev). */
export function cronEnabled(): boolean {
  return (process.env.CRON_ENABLED ?? "true") !== "false";
}
