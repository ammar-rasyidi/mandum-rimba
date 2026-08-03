/**
 * Instagram public-profile video fetcher, shared by the social relay and the
 * dev fallback in SocialController. Instagram rate-limits datacenter IPs (429),
 * so in prod this is NOT called directly — a relay on a residential machine
 * runs it and publishes the result to R2. Locally / on a residential IP it
 * works fine.
 */
export interface IgItem {
  video: string;
  poster?: string;
  permalink?: string;
  caption?: string;
  ts: number;
}

const APP_ID = "936619743392459"; // public web app id used by instagram.com
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

/** Fetch the latest public videos for a handle. Throws on upstream failure. */
export async function fetchIgVideos(handle: string, limit = 4): Promise<IgItem[]> {
  const key = handle.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 40);
  if (!key) return [];

  const url = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(key)}`;
  const headers = {
    // Sec-Fetch headers are required — Instagram's edge returns 400 without them
    "x-ig-app-id": APP_ID,
    "user-agent": UA,
    accept: "*/*",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  };

  // retry a couple of times on transient 429 bursts
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(9000) });
    if (res.status !== 429) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
  if (!res || !res.ok) throw new Error(`upstream ${res?.status ?? "no-response"}`);
  const raw = await res.text();
  if (!raw.trim().startsWith("{"))
    throw new Error(`non-json (blocked?): ${raw.slice(0, 60)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = JSON.parse(raw) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edges: any[] = json?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];

  const items: IgItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  return items.slice(0, limit);
}
