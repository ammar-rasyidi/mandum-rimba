"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchSpeciesThumb, type SpeciesMedia } from "@/lib/species";

/** class → fallback glyph, shown when a species has no CC image so the tile
 *  still reads as intentional (and identifies the group at a glance) */
const CLASS_FALLBACK: Record<string, { icon: string }> = {
  aves: { icon: "🐦" },
  mammalia: { icon: "🦌" },
  reptilia: { icon: "🦎" },
  amphibia: { icon: "🐸" },
};

type Phase = "idle" | "loading" | "done" | "none";

/** Turn a Wikimedia thumbnail URL into the full-resolution original by dropping
 *  the `/thumb/` segment and the trailing `/<width>px-<file>`. Requesting a
 *  bigger *thumb* is unreliable (Wikimedia refuses to upscale past the original
 *  for many files, 400s, and we'd fall back to a blurry thumb); the original
 *  file always exists. Non-thumb URLs are returned unchanged, and the <img>
 *  onError falls back to the thumbnail if the original ever fails to load. */
function enlarge(url: string): string {
  const m = url.match(
    /^(https?:\/\/[^/]+\/wikipedia\/[^/]+)\/thumb\/(.+)\/\d+px-[^/]+$/,
  );
  return m ? `${m[1]}/${m[2]}` : url;
}

/** Square species thumbnail that only fetches once scrolled near the viewport
 *  (IntersectionObserver) — a locality can list dozens of species, so eager
 *  loading would fire dozens of Wikipedia requests on open. Falls back to a
 *  class glyph when no freely-licensed image exists. Click to enlarge. */
export default function SpeciesThumb({
  sci,
  cls,
  label,
  size = 46,
}: {
  sci: string;
  cls: string;
  /** common name for the enlarged-view caption; falls back to the sci name */
  label?: string;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [media, setMedia] = useState<SpeciesMedia | null>(null);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        setPhase("loading");
        fetchSpeciesThumb(sci).then((m) => {
          if (!active) return;
          if (m?.url) {
            setMedia(m);
            setPhase("done");
          } else {
            setPhase("none");
          }
        });
      },
      { rootMargin: "250px" },
    );
    io.observe(el);
    return () => {
      active = false;
      io.disconnect();
    };
  }, [sci]);

  // lock body scroll + close on Escape while the enlarged view is open
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [zoom]);

  const fallback = CLASS_FALLBACK[cls] ?? { icon: "🐾" };
  const hasImg = phase === "done" && !!media?.url;

  return (
    <div
      ref={ref}
      className="shrink-0 overflow-hidden rounded-[10px] border border-[var(--glass-border)] bg-[var(--glass-highlight)]"
      style={{ width: size, height: size }}
    >
      {hasImg ? (
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="block h-full w-full cursor-zoom-in"
          aria-label={`Perbesar foto ${label ?? sci}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media!.url}
            alt={sci}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setPhase("none")}
          />
        </button>
      ) : phase === "loading" ? (
        <div className="h-full w-full animate-pulse" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center opacity-70"
          style={{ fontSize: size * 0.5 }}
          aria-hidden
        >
          {fallback.icon}
        </div>
      )}

      {/* enlarged view — a full-screen overlay portalled to <body> so it sits
          above the map panels (which cap out at z-50). Tap anywhere to close. */}
      {zoom &&
        hasImg &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label ?? sci}
            onClick={() => setZoom(false)}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-[rgba(0,0,0,0.82)] p-4 backdrop-blur-sm animate-[panel-in_0.15s_ease]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enlarge(media!.url)}
              alt={sci}
              className="max-h-[78vh] w-auto max-w-full rounded-[12px] object-contain shadow-[var(--glass-shadow)]"
              onError={(e) => {
                // the larger render failed — fall back to the thumbnail we have
                if (e.currentTarget.src !== media!.url)
                  e.currentTarget.src = media!.url;
              }}
            />
            <figcaption className="max-w-[90vw] text-center text-white">
              <span className="text-[0.9rem] font-medium">{label ?? sci}</span>
              {label && (
                <span className="text-[0.82rem] italic opacity-80"> · {sci}</span>
              )}
              <span className="mt-0.5 block text-[0.72rem] opacity-70">
                📷 {media!.license}
              </span>
            </figcaption>
            <button
              type="button"
              onClick={() => setZoom(false)}
              aria-label="Tutup"
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg text-white backdrop-blur transition-colors hover:bg-white/25"
            >
              ✕
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
