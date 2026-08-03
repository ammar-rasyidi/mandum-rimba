"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface IgItem {
  video: string;
  poster?: string;
  permalink?: string;
  caption?: string;
}

/**
 * Closing-beat social strip: the latest public videos from the place's official
 * account, muted + autoplaying, refreshed periodically so it stays live. Falls
 * back to a plain follow card when the feed is empty (e.g. the source blocks the
 * server), so it never breaks the story.
 */
export default function StorySocial({
  handle,
  url,
  name,
  en,
}: {
  handle: string;
  url: string;
  name: string;
  en: boolean;
}) {
  const [items, setItems] = useState<IgItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`${API_BASE}/v1/social/ig/${handle}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { items?: IgItem[] } | null) => {
          if (alive && d) setItems(d.items ?? []);
        })
        .catch(() => {
          if (alive) setItems([]);
        });
    load();
    const t = setInterval(load, 10 * 60 * 1000); // auto-update every 10 min
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [handle]);

  const Header = (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-2.5"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          background:
            "linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden>
          <path d="M12 2.2c3.2 0 3.6 0 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.25.06-1.65.07-4.85.07s-3.6 0-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.2 15.6 2.2 15.2 2.2 12s0-3.58.07-4.85C2.42 3.92 3.94 2.38 7.15 2.27 8.4 2.2 8.8 2.2 12 2.2zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 24 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 100 12.32 6.16 6.16 0 000-12.32zM12 16a4 4 0 110-8 4 4 0 010 8zm6.41-11.85a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-[0.86rem] font-semibold leading-tight text-white group-hover:underline">
          @{handle}
        </span>
        <span className="block truncate text-[0.66rem] leading-tight text-white/55">
          {name}
        </span>
      </span>
      <span className="ml-auto shrink-0 rounded-full bg-white/12 px-3 py-1 text-[0.72rem] text-white/90 transition-colors group-hover:bg-white/20">
        {en ? "Follow" : "Ikuti"}
      </span>
    </a>
  );

  // empty / blocked / loading-empty → just the follow card
  const hasVideos = items && items.length > 0;

  return (
    <div className="mx-auto mb-3 w-full max-w-[640px] rounded-2xl border border-white/12 bg-black/55 p-3 backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.16em] text-white/45">
        {en ? `Latest from ${name}` : `Kabar terbaru dari ${name}`}
      </div>
      {Header}
      {hasVideos && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {items!.map((it, i) => (
            <a
              key={i}
              href={it.permalink ?? url}
              target="_blank"
              rel="noreferrer"
              title={it.caption || undefined}
              className="group relative block aspect-[9/16] w-full overflow-hidden rounded-lg border border-white/10 bg-black/40"
            >
              {/* muted autoplay preview; poster shows if the CDN URL is gone */}
              <video
                src={it.video}
                poster={it.poster}
                muted
                autoPlay
                loop
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
