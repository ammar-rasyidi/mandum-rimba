"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const heroBtn =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.98rem] font-semibold transition-[transform,filter,background-color] hover:-translate-y-px hover:no-underline";
const heroPrimary = `${heroBtn} bg-accent text-background shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] hover:brightness-110`;
const heroGhost = `${heroBtn} border border-white/30 bg-white/10 text-white backdrop-blur-md hover:bg-white/20`;

/**
 * Cinematic hero: the Indonesian archipelago rendered as a curved earth from
 * space (the whole observatory in one frame). Depth comes from scroll + a subtle
 * pointer tilt on the globe layer, with the content drifting the other way.
 * Both effects are DESKTOP-ONLY and skipped under reduced-motion, so mobile just
 * gets a light, static image.
 */
export default function HomeHero() {
  const t = useTranslations("home");
  const tSite = useTranslations("site");
  const globeRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const light = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
    if (reduce || light) return; // keep phones + reduced-motion static and cheap

    let raf = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      // Three depths, not one: the sky sits furthest away so it barely moves,
      // the earth is nearer, and the words ride forward against both. That
      // difference in rate is the whole illusion.
      if (skyRef.current)
        skyRef.current.style.transform = `translate3d(${px * 5}px, ${y * 0.08 + py * 4}px, 0)`;
      if (globeRef.current)
        globeRef.current.style.transform = `translate3d(${px * 16}px, ${y * 0.3 + py * 12}px, 0) scale(1.14)`;
      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(${px * -6}px, ${y * -0.05}px, 0)`;
        contentRef.current.style.opacity = String(Math.max(0, 1 - y / 640));
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onPointer = (e: PointerEvent) => {
      px = (e.clientX / window.innerWidth - 0.5) * 2;
      py = (e.clientY / window.innerHeight - 0.5) * 2;
      schedule();
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    apply();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("pointermove", onPointer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const badges = [
    t("badgeIndependent"),
    t("badgeNonprofit"),
    t("badgeOpenSource"),
    t("badgeEvidence"),
  ];

  return (
    <section className="relative -mt-20 flex min-h-[100svh] w-full flex-col justify-end overflow-hidden bg-[#03060c]">
      {/* the earth (its own layer so it can parallax under the content) */}
      <div ref={globeRef} className="absolute inset-0 will-change-transform" style={{ transform: "scale(1.14)" }}>
        <img
          src="/images/mandum_rimba_full_3d.jpg"
          alt=""
          aria-hidden
          className="hero-earth absolute inset-0 h-full w-full object-cover object-[center_42%]"
        />
      </div>
      {/* the sky: stars, aurora and the odd meteor, all one parallax layer so
          they hold together as a single distance */}
      <div ref={skyRef} aria-hidden className="pointer-events-none absolute inset-0 will-change-transform">
        <div className="hero-stars absolute inset-0" />
        <div
          className="aurora"
          style={{
            background:
              "linear-gradient(96deg, transparent 4%, rgba(88,214,150,0.5) 26%, rgba(120,220,255,0.32) 48%, rgba(150,120,240,0.34) 68%, transparent 94%)",
          }}
        />
        <div
          className="aurora aurora-2"
          style={{
            background:
              "linear-gradient(84deg, transparent 12%, rgba(255,213,79,0.22) 34%, rgba(88,214,150,0.4) 58%, transparent 88%)",
          }}
        />
        <div className="meteor" style={{ top: "12%", left: "72%", animationDelay: "3s" }} />
        <div className="meteor" style={{ top: "6%", left: "46%", animationDelay: "17s" }} />
        <div className="meteor" style={{ top: "20%", left: "88%", animationDelay: "31s" }} />
      </div>
      {/* atmospheric accent glow near the horizon + legibility scrims */}
      <div
        aria-hidden
        className="horizon-glow pointer-events-none absolute inset-0 bg-[radial-gradient(120%_75%_at_50%_-8%,rgba(129,199,132,0.22),transparent_55%)]"
      />
      {/* the curve of the atmosphere, catching light along the limb */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_46%_at_50%_2%,rgba(180,230,255,0.16),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,6,12,0.5)_0%,transparent_24%,transparent_44%,rgba(3,6,12,0.58)_64%,rgba(3,6,12,0.22)_78%,rgba(3,6,12,0)_88%)]"
      />
      {/* The page colour, brought up from nothing over the bottom third. Many
          stops on an ease curve rather than two on a straight line: a linear
          ramp in opacity is read by the eye as a band with an edge, which is
          exactly what this looked like before. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(var(--bg-rgb)/0)_52%,rgb(var(--bg-rgb)/0.04)_62%,rgb(var(--bg-rgb)/0.14)_70%,rgb(var(--bg-rgb)/0.32)_78%,rgb(var(--bg-rgb)/0.58)_86%,rgb(var(--bg-rgb)/0.84)_93%,rgb(var(--bg-rgb)/1)_100%)]"
      />

      <div ref={contentRef} className="relative z-10 mx-auto w-full max-w-[1080px] px-5 pb-40 pt-32 sm:pb-52 will-change-transform">
        <div className="hero-in max-w-[46rem]">
          <div style={{ ["--d" as string]: "0ms" }}>
            <span className="inline-flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-white/85">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              {tSite("name")}
            </span>
          </div>
          <h1
            style={{ ["--d" as string]: "90ms" }}
            className="mt-5 text-[2.75rem] font-bold leading-[0.98] tracking-[-0.03em] text-white [text-shadow:0_2px_40px_rgba(0,0,0,0.55)] [text-wrap:balance] sm:text-[3.9rem] lg:text-[4.9rem]"
          >
            {t("heroTitle")}
          </h1>
          <p
            style={{ ["--d" as string]: "180ms" }}
            className="mt-6 max-w-[40rem] text-[1.08rem] leading-relaxed text-white/85 [text-shadow:0_1px_16px_rgba(0,0,0,0.5)] sm:text-[1.2rem]"
          >
            {tSite("tagline")}
          </p>
          <div style={{ ["--d" as string]: "270ms" }} className="mt-8 flex flex-wrap gap-3">
            <Link className={heroPrimary} href="/peta">
              {t("openMap")}
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <Link className={heroGhost} href={{ pathname: "/peta", query: { story: "gunung-leuser" } }}>
              {t("storyKicker")}
            </Link>
          </div>
          <div style={{ ["--d" as string]: "360ms" }} className="mt-9 flex flex-wrap gap-2">
            {badges.map((b) => (
              <span
                key={b}
                className="rounded-full border border-white/25 bg-white/5 px-3 py-1 text-[0.74rem] text-white/85 backdrop-blur-sm"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-1">
        <span className="text-[0.66rem] font-medium uppercase tracking-[0.18em] text-muted">
          {t("heroScroll")}
        </span>
        <svg className="scroll-cue text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </section>
  );
}
