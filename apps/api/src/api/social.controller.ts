import { Controller, Get, Param } from "@nestjs/common";

/**
 * Latest public videos for a place story's official account. The frontend plays
 * them muted + autoplay on the closing beat. We fetch the account's public web
 * profile and keep a short cache so the feed auto-updates without hammering the
 * source; if the source blocks us (e.g. datacenter IPs in prod) we serve the
 * last good copy, else an empty list and the client falls back to a follow card.
 *
 * NOTE: Instagram CDN video URLs are short-lived, so the cache TTL is kept low
 * and the client refetches periodically.
 */
interface IgItem {
  video: string;
  poster?: string;
  permalink?: string;
  caption?: string;
  ts: number;
}

const APP_ID = "936619743392459"; // public web app id used by instagram.com
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
const TTL_MS = 30 * 60 * 1000; // 30 min

@Controller("social")
export class SocialController {
  private cache = new Map<string, { at: number; data: IgItem[] }>();

  @Get("ig/:handle")
  async ig(@Param("handle") handle: string): Promise<{ items: IgItem[]; stale?: boolean }> {
    const key = (handle || "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 40);
    if (!key) return { items: [] };

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < TTL_MS) return { items: cached.data };

    try {
      const res = await fetch(
        `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(key)}`,
        {
          // the Sec-Fetch headers are required — Instagram's edge rejects the
          // request with a "SecFetch Policy violation" (400) without them
          headers: {
            "x-ig-app-id": APP_ID,
            "user-agent": UA,
            accept: "*/*",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
          },
          signal: AbortSignal.timeout(9000),
        },
      );
      if (!res.ok) throw new Error(`ig ${res.status}`);
      const json = (await res.json()) as Record<string, any>;
      const edges: any[] =
        json?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];

      const items: IgItem[] = [];
      const collect = (n: any) => {
        if (!n?.is_video || !n?.video_url) return;
        items.push({
          video: n.video_url,
          poster: n.display_url,
          permalink: n.shortcode
            ? `https://www.instagram.com/reel/${n.shortcode}/`
            : undefined,
          caption: (n?.edge_media_to_caption?.edges?.[0]?.node?.text ?? "").slice(0, 160),
          ts: n.taken_at_timestamp ?? 0,
        });
      };
      for (const e of edges) {
        collect(e?.node);
        for (const k of e?.node?.edge_sidecar_to_children?.edges ?? []) collect(k?.node);
      }
      items.sort((a, b) => b.ts - a.ts);
      const top = items.slice(0, 4);
      this.cache.set(key, { at: Date.now(), data: top });
      return { items: top };
    } catch {
      // source blocked/offline — serve the last good copy if we have one
      if (cached) return { items: cached.data, stale: true };
      return { items: [] };
    }
  }
}
