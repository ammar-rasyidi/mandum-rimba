"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Product showcase: the live map in its two most striking modes (3D terrain +
 * flat archipelago), framed like an app window in a carousel. Auto-advances on
 * desktop, pauses on hover, and supports swipe on touch. Light everywhere: it's
 * just two <img> and a CSS transform, no map engine.
 */
export default function MapShowcase() {
  const t = useTranslations("home");
  const slides = [
    { img: "/images/mandum_rimba_3d_terrain.jpg", title: t("showcase3dTitle"), body: t("showcase3dBody") },
    { img: "/images/mandum_rimba_flat_map.jpg", title: t("showcaseFlatTitle"), body: t("showcaseFlatBody") },
  ];
  const n = slides.length;
  const [i, setI] = useState(0);
  const paused = useRef(false);
  const go = (k: number) => setI(((k % n) + n) % n);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (!paused.current && !document.hidden) setI((v) => (v + 1) % n);
    }, 6000);
    return () => clearInterval(id);
  }, [n]);

  // touch swipe
  const down = useRef<number | null>(null);
  const onDown = (e: React.PointerEvent) => {
    down.current = e.clientX;
  };
  const onUp = (e: React.PointerEvent) => {
    if (down.current == null) return;
    const dx = e.clientX - down.current;
    if (Math.abs(dx) > 45) go(i + (dx < 0 ? 1 : -1));
    down.current = null;
  };

  return (
    <section
      className="reveal mt-20"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <span className="inline-flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-accent">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        {t("showcaseKicker")}
      </span>
      <h2 className="mb-0 mt-3 text-[1.9rem] font-bold leading-[1.1] tracking-tight [text-wrap:balance]">
        {t("showcaseTitle")}
      </h2>
      <p className="mt-3 max-w-[46rem] text-[1.02rem] leading-relaxed text-muted">
        {t("showcaseBody")}
      </p>

      {/* app-window frame */}
      <div className="relative mt-7">
        {/* soft accent glow behind the frame */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_40%,var(--accent-dim),transparent_70%)] blur-2xl"
        />
        <div className="overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-raised)] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.7)]">
          {/* window chrome */}
          <div className="flex items-center gap-2 border-b border-[var(--glass-border)] px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="mx-auto flex items-center gap-1.5 rounded-md bg-[var(--bg)] px-3 py-1 text-[0.72rem] text-muted">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              mandumrimba.org/peta
            </span>
          </div>
          {/* slide viewport, matches the screenshots' native ratio (2926×1530)
              so the full frame shows with no cropping */}
          <div
            className="relative aspect-[2926/1530] cursor-grab touch-pan-y overflow-hidden bg-[var(--bg)] active:cursor-grabbing"
            onPointerDown={onDown}
            onPointerUp={onUp}
          >
            <div
              className="flex h-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: `translateX(-${i * 100}%)` }}
            >
              {slides.map((s) => (
                <img
                  key={s.img}
                  src={s.img}
                  alt={s.title}
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full shrink-0 select-none object-contain"
                />
              ))}
            </div>
          </div>
        </div>

        {/* arrows */}
        <button
          type="button"
          onClick={() => go(i - 1)}
          aria-label="Previous"
          className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md transition hover:bg-black/70"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => go(i + 1)}
          aria-label="Next"
          className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md transition hover:bg-black/70"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* caption + dots + CTA */}
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-[3.2rem] max-w-[36rem]">
          <div className="text-[1.05rem] font-semibold text-foreground">{slides[i].title}</div>
          <p className="mt-1 text-[0.92rem] leading-relaxed text-muted">{slides[i].body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="flex items-center gap-2">
            {slides.map((s, k) => (
              <button
                key={s.img}
                type="button"
                onClick={() => go(k)}
                aria-label={`${s.title}`}
                className={`h-2 rounded-full transition-all ${
                  k === i ? "w-6 bg-accent" : "w-2 bg-[var(--border)] hover:bg-muted"
                }`}
              />
            ))}
          </div>
          <Link
            href="/peta"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[0.92rem] font-semibold text-background transition hover:brightness-110 hover:no-underline"
          >
            {t("openMap")}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
