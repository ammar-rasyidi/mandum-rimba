"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import styles from "./HomeHero.module.css";

const heroBtn =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.98rem] font-semibold transition-[transform,filter,background-color] hover:-translate-y-px hover:no-underline";
const heroPrimary = `${heroBtn} bg-accent text-background shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] hover:brightness-110`;
const heroGhost = `${heroBtn} border border-white/30 bg-white/10 text-white backdrop-blur-md hover:bg-white/20`;

/** Scroll-driven background depth; foreground links stay stationary and visible. */
export default function HomeHero() {
  const t = useTranslations("home");
  const english = useLocale() === "en";
  const tSite = useTranslations("site");
  const globeRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);

  const stickerRef = useRef<HTMLElement>(null);
  const [night, setNight] = useState(false);
  useEffect(() => {
    const update = () => setNight(document.documentElement.dataset.theme === "dark");
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const card = stickerRef.current;
    if (!card) return;
    const media = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let frame = 0;
    let x = 0, y = 0, targetX = 0, targetY = 0, lastTime = 0;
    const paint = () => {
      card.style.setProperty("--sticker-x", String(x));
      card.style.setProperty("--sticker-y", String(y));
    };
    const tick = (time: number) => {
      const dt = lastTime ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;
      const blend = 1 - Math.exp(-dt / 130);
      x += (targetX - x) * blend;
      y += (targetY - y) * blend;
      paint();
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.001) frame = requestAnimationFrame(tick);
      else { x = targetX; y = targetY; paint(); frame = 0; lastTime = 0; }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(tick); };
    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType === "touch") return;
      const rect = card.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      targetY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
      schedule();
    };
    const reset = () => { targetX = 0; targetY = 0; schedule(); };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; lastTime = 0; x = y = targetX = targetY = 0; paint(); };
    const visibility = () => { if (document.hidden) stop(); };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerleave", reset);
    card.addEventListener("pointercancel", reset);
    window.addEventListener("blur", stop);
    window.addEventListener("scroll", reset, { passive: true });
    media.addEventListener("change", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerleave", reset);
      card.removeEventListener("pointercancel", reset);
      window.removeEventListener("blur", stop);
      window.removeEventListener("scroll", reset);
      media.removeEventListener("change", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    const hero = heroRef.current;
    const globe = globeRef.current;
    const sky = skyRef.current;
    if (!hero || !globe || !sky) return;
    const media = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let frame = 0;
    let lastTime = 0;
    let current = 0;
    let target = 0;
    const paint = () => {
      globe.style.transform = `translate3d(0, ${current}px, 0) scale(1.14)`;
      sky.style.transform = `translate3d(0, ${current * 0.3}px, 0)`;
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    };
    const tick = (time: number) => {
      const dt = lastTime ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;
      current += (target - current) * (1 - Math.exp(-dt / 100));
      if (Math.abs(target - current) < 0.05) {
        current = target;
        paint();
        stop();
        return;
      }
      paint();
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      if (!media.matches || document.hidden) {
        stop();
        current = target = 0;
        paint();
        return;
      }
      const rect = hero.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
        stop();
        return;
      }
      // Let visitors reach the bottom of a tall hero before depth starts.
      // Keep the offset inside the image's overscan so no edge is exposed.
      const start = Math.max(48, rect.height - window.innerHeight + 80);
      const distance = Math.max(0, -rect.top - start);
      target = Math.min(distance * 0.12, rect.height * 0.055);
      if (!frame && Math.abs(target - current) > 0.05) frame = requestAnimationFrame(tick);
    };
    const resize = new ResizeObserver(sync);
    resize.observe(hero);
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      stop();
      resize.disconnect();
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const badges = [
    t("badgeIndependent"),
    t("badgeNonprofit"),
    t("badgeOpenSource"),
    t("badgeEvidence"),
  ];

  return (
    <section ref={heroRef} className="relative mx-auto mt-0 lg:-mt-[33px] mb-8 flex min-h-[calc(100svh-104px)] lg:min-h-[calc(100svh-71px)] w-[calc(100%-24px)] flex-col justify-end overflow-hidden rounded-[24px] bg-[#03060c] shadow-[0_2px_4px_rgba(15,35,28,0.04),0_14px_30px_-10px_rgba(15,35,28,0.18),0_36px_64px_-28px_rgba(15,35,28,0.24)] ring-1 ring-black/5 sm:w-[calc(100%-48px)] sm:rounded-[36px] lg:max-w-[1600px]">
      {/* the earth (its own layer so it can parallax under the content) */}
      <div ref={globeRef} className="absolute inset-0 will-change-transform" style={{ transform: "scale(1.14)" }}>
        <img
          src="/images/mandum_rimba_full_3d.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-[center_42%]"
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
      <div className={`relative z-10 mx-auto w-full max-w-[1280px] px-6 pb-28 pt-32 sm:px-10 sm:pb-36 sm:pt-40 ${styles.layout}`}>
        <div className={`hero-in max-w-[46rem] ${styles.copy}`}>
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
        <aside ref={stickerRef} className={styles.card} aria-label="Lam Rimba">
          <div className={styles.glass} />
          <div className={styles.promo}>
            <img src={night ? "/images/lam-rimba/logo-dark.svg" : "/images/lam-rimba/logo.svg"} width="253" height="53" alt="Lam Rimba" className={styles.logo} />
            <p>{english ? <>Care for wildlife.<br />Bring the forest to life.</> : <>Rawat satwanya,<br />hidupkan rimbanya.</>}</p>
            <a href="https://lam.mandumrimba.org/" className={styles.play}>
              <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6Z" fill="currentColor" /></svg></span>
              {english ? "Enter Lam Rimba" : "Masuk ke Lam Rimba"}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </a>
          </div>
          <svg className={styles.planet} viewBox="390 150 670 690" role="img" aria-label={english ? "Actual Lam Rimba game planet" : "Planet asli dari game Lam Rimba"}>
            <defs><filter id="lam-hero-sticker" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="7" result="softShape" /><feColorMatrix in="softShape" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -2" result="roundedShape" /><feMorphology in="roundedShape" operator="dilate" radius="13" result="expanded" /><feGaussianBlur in="expanded" stdDeviation="4" result="roundedBorder" /><feColorMatrix in="roundedBorder" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="outline" /><feFlood floodColor="#fffef9" /><feComposite in2="outline" operator="in" result="border" /><feMerge><feMergeNode in="border" /><feMergeNode in="SourceGraphic" /></feMerge></filter><filter id="lam-hero-sky-key" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  10 0 -10 0 1" /><feComponentTransfer><feFuncA type="discrete" tableValues="0 1" /></feComponentTransfer></filter><clipPath id="lam-hero-planet-cutout"><path d="M701 169 741 171 770 196 768 207 798 205 826 222 848 247 887 244 920 264 944 302 949 348 975 381 980 422 956 435 972 466 982 486 988 524 976 553 983 580 967 614 949 635 940 672 913 702 883 715 866 742 827 753 800 774 767 767 746 785 697 780 693 807 649 805 620 782 589 779 578 749 548 736 531 706 501 684 493 647 470 619 476 591 451 568 454 535 426 521 424 495 443 467 448 434 440 399 463 369 477 340 482 307 474 286 493 268 496 242 525 225 541 243 575 247 601 222 638 218 655 201 685 199Z"/><path d="m932 723 18-12 14 7 17-8-12 13-9 17-21 5Z"/><path d="m1007 480 9-9 10 11-8 15 11 12-15 5-8-17Z"/></clipPath></defs>
            <g filter="url(#lam-hero-sticker)"><image href="/images/lam-rimba/planet.webp" x="0" y="0" width="1440" height="900" clipPath="url(#lam-hero-planet-cutout)" filter="url(#lam-hero-sky-key)" /></g>
          </svg>
          <svg className={styles.rays} viewBox="0 0 70 65" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" aria-hidden="true"><path d="m10 25 4-20m13 29 19-20m-9 35 25-6"/></svg>
        </aside>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-1">
        <span className="text-[0.66rem] font-medium uppercase tracking-[0.18em] text-white/80">
          {t("heroScroll")}
        </span>
        <svg className="scroll-cue text-white/80" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </section>
  );
}
