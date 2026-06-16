import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { JobRegistryService } from "./common/job-registry.service";

/**
 * One-shot job runner — invoked by Modal's scheduled functions:
 *
 *   node dist/jobs-cli.js <jobName>
 *
 * Boots a Nest *application context* (no HTTP server) so every service runs
 * its onModuleInit and self-registers in the JobRegistryService, then awaits
 * the named job to completion and exits. The native `tippecanoe` binary is
 * available because Modal's image installs it (see modal_app.py).
 *
 * Cron timers from @nestjs/schedule are inert here: this process sets
 * CRON_ENABLED=false implicitly by running a single job and exiting.
 */
async function main() {
  const jobName = process.argv[2];
  const logger = new Logger("JobsCLI");

  if (!jobName) {
    logger.error("usage: node dist/jobs-cli.js <jobName>");
    process.exit(2);
  }

  // never let the in-process @Cron timers fire while we run a one-shot job
  process.env.CRON_ENABLED = "false";

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const registry = app.get(JobRegistryService);
    logger.log(`running job "${jobName}" …`);
    const started = Date.now();
    await registry.runAndWait(jobName);
    logger.log(`job "${jobName}" finished in ${Date.now() - started}ms`);
    await app.close();
    process.exit(0);
  } catch (err) {
    logger.error(`job "${jobName}" failed: ${(err as Error).message}`);
    await app.close().catch(() => undefined);
    process.exit(1);
  }
}

void main();
