import "dotenv/config";
import { fetchIgVideos } from "../common/ig";
import { ArchiverService } from "../common/archiver.service";

/**
 * Social relay — RUN THIS ON A RESIDENTIAL MACHINE (your laptop, a home server,
 * a Raspberry Pi), NOT on the datacenter/prod server. Instagram rate-limits
 * datacenter IPs (429); a residential IP works. It fetches the latest videos and
 * publishes them to R2 at `social/<handle>.json`, which the prod API then serves.
 *
 * Instagram CDN video URLs expire in a few hours, so run this on a schedule
 * (every 30-60 min) — cron / launchd / Task Scheduler. Needs the R2 write creds
 * (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET) in env/.env.
 *
 *   pnpm --filter @mandumrimba/api social:relay             # default handle
 *   pnpm --filter @mandumrimba/api social:relay a_handle b  # explicit handles
 *   SOCIAL_HANDLES=btn_tessonilo,other pnpm ... social:relay
 */
async function main() {
  const handles = (
    process.argv.slice(2).length
      ? process.argv.slice(2)
      : (process.env.SOCIAL_HANDLES ?? "btn_tessonilo,bbtn_gunungleuser").split(",")
  )
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const arch = new ArchiverService();
  if (!arch.enabled) {
    console.error(
      "R2 credentials missing — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (and R2_BUCKET).",
    );
    process.exit(1);
  }

  let failures = 0;
  for (const h of handles) {
    try {
      const items = await fetchIgVideos(h, 4);
      await arch.putJson(`social/${h}.json`, { items, at: Date.now() });
      console.log(`✓ ${h}: ${items.length} videos -> social/${h}.json`);
    } catch (e) {
      failures++;
      console.error(`✗ ${h}: ${(e as Error).message}`);
    }
  }
  process.exit(failures ? 1 : 0);
}

void main();
