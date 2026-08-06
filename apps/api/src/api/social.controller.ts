import {
  Controller,
  Get,
  Param,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { ArchiverService } from "../common/archiver.service";
import { fetchIgVideos, type IgItem } from "../common/ig";

/**
 * Latest public videos for a place story's official account, played muted +
 * autoplay on the closing beat.
 *
 * Instagram rate-limits datacenter IPs (429), so in PROD we don't scrape it
 * directly. A relay on a residential machine (see scripts/social-relay.ts) runs
 * the fetch and publishes `social/<handle>.json` to R2; here we read that public
 * copy. As a fallback (dev / residential IP) we fetch Instagram live. The client
 * falls back to a plain follow card when the list is empty.
 */
const TTL_MS = 10 * 60 * 1000; // 10 min in-memory cache
const R2_PUBLIC =
  process.env.R2_PUBLIC_URL ??
  "https://pub-e71bae449b864ca78974083cc5663453.r2.dev";

@Controller("social")
export class SocialController {
  private cache = new Map<string, { at: number; data: IgItem[] }>();

  constructor(private readonly archiver: ArchiverService) {}

  /**
   * Manual relay trigger — fetches Instagram now and publishes to R2. ONLY works
   * when served by an instance on a residential IP (your laptop / home API /
   * dev), because Instagram 429s datacenter IPs. On prod this will just report
   * the upstream error. Protect with SOCIAL_RELAY_KEY (?key=...).
   *
   *   GET /v1/social/relay?key=SECRET               (handles from SOCIAL_HANDLES)
   *   GET /v1/social/relay?key=SECRET&handle=btn_tessonilo
   */
  @Get("relay")
  async relay(
    @Query("key") key?: string,
    @Query("handle") handle?: string,
  ): Promise<{ ok: boolean; results: { handle: string; count?: number; error?: string }[] }> {
    const secret = process.env.SOCIAL_RELAY_KEY;
    if (secret && key !== secret) throw new UnauthorizedException("bad key");
    if (!this.archiver.enabled)
      return { ok: false, results: [{ handle: "-", error: "R2 credentials missing" }] };

    const handles = (
      handle
        ? [handle]
        : (process.env.SOCIAL_HANDLES ?? "btn_tessonilo,bbtn_gunungleuser").split(",")
    )
      .map((h) => h.trim().toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 40))
      .filter(Boolean);

    const results = [];
    let ok = true;
    for (const h of handles) {
      try {
        const items = await fetchIgVideos(h, 4);
        await this.archiver.putJson(`social/${h}.json`, { items, at: Date.now() });
        this.cache.set(h, { at: Date.now(), data: items });
        results.push({ handle: h, count: items.length });
      } catch (e) {
        ok = false;
        results.push({ handle: h, error: (e as Error).message });
      }
    }
    return { ok, results };
  }

  @Get("ig/:handle")
  async ig(
    @Param("handle") handle: string,
    @Query("debug") debug?: string,
  ): Promise<{ items: IgItem[]; stale?: boolean; source?: string; error?: string }> {
    const key = (handle || "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 40);
    if (!key) return { items: [] };

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < TTL_MS) return { items: cached.data };

    // 1. relay copy on R2 (written from a residential IP → not rate-limited).
    //    Cache-bust per minute so the CDN edge doesn't serve a stale object.
    try {
      const bust = Math.floor(Date.now() / 60000);
      const r = await fetch(`${R2_PUBLIC}/social/${key}.json?t=${bust}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const j = (await r.json()) as { items?: IgItem[] };
        if (j?.items?.length) {
          this.cache.set(key, { at: Date.now(), data: j.items });
          return { items: j.items, ...(debug ? { source: "r2" } : {}) };
        }
      }
    } catch {
      /* no relay copy yet — fall through to a live fetch */
    }

    // 2. live fallback (works on dev / residential IPs; 429s on datacenter)
    try {
      const items = await fetchIgVideos(key, 4);
      this.cache.set(key, { at: Date.now(), data: items });
      return { items, ...(debug ? { source: "live" } : {}) };
    } catch (e) {
      if (cached) return { items: cached.data, stale: true };
      return { items: [], ...(debug ? { error: (e as Error).message } : {}) };
    }
  }
}
