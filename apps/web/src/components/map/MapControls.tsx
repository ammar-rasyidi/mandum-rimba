"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useTranslations } from "next-intl";

/* ── inline icons (no icon dependency, matches SiteNav) ── */
const Plus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);
const Minus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);
const RotateCCW = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M3 8.5 4.5 12 8 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const RotateCW = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M19.5 12a7.5 7.5 0 1 0-2.2 5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M21 8.5 19.5 12 16 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
/** compass whose needle points to true north as the map rotates */
const Compass = ({ bearing }: { bearing: number }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden
    style={{ transform: `rotate(${-bearing}deg)` }}
  >
    <path d="M12 3 15 12 12 10 9 12Z" fill="var(--danger)" />
    <path d="M12 21 9 12 12 14 15 12Z" fill="currentColor" opacity="0.55" />
  </svg>
);

const CONTINUOUS_DELAY = 180; // ms held before a tap becomes a continuous spin
const SPIN_SPEED = 1.4; // deg per frame while held
const STEP = 45; // deg per quick tap

export default function MapControls({
  mapRef,
  ready,
  panelOpen,
  detailOpen,
}: {
  mapRef: React.MutableRefObject<MapLibreMap | null>;
  ready: boolean;
  /** layer sheet expanded — hide the controls on mobile so it doesn't cover them */
  panelOpen: boolean;
  /** a left-side detail popup is open — hide the controls on desktop (they sit
   *  bottom-left, under the popup) */
  detailOpen: boolean;
}) {
  const t = useTranslations("map");
  const [bearing, setBearing] = useState(0);
  const raf = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinning = useRef(false);
  const pressed = useRef(false); // a real press is in progress (not a hover)

  // keep the compass needle in sync with the live map bearing
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const sync = () => setBearing(map.getBearing());
    map.on("rotate", sync);
    sync();
    return () => {
      map.off("rotate", sync);
    };
  }, [mapRef, ready]);

  // clean up any in-flight spin on unmount
  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  const startPress = (dir: 1 | -1) => {
    if (!mapRef.current) return;
    pressed.current = true;
    spinning.current = false;
    // after a short hold, a press turns into a continuous spin
    holdTimer.current = setTimeout(() => {
      if (!pressed.current) return;
      spinning.current = true;
      const frame = () => {
        const m = mapRef.current;
        if (!m) return;
        m.setBearing(m.getBearing() + dir * SPIN_SPEED);
        raf.current = requestAnimationFrame(frame);
      };
      raf.current = requestAnimationFrame(frame);
    }, CONTINUOUS_DELAY);
  };

  // `step` = do the quick-tap rotate on release. Only ever fires from a real
  // press (pressed guard), so hovering on/off a button never rotates the map.
  const endPress = (dir: 1 | -1, step: boolean) => {
    if (!pressed.current) return;
    pressed.current = false;
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    if (step && !spinning.current) {
      const map = mapRef.current;
      if (map)
        map.easeTo({ bearing: map.getBearing() + dir * STEP, duration: 400 });
    }
    spinning.current = false;
  };

  const zoom = (d: 1 | -1) => {
    const map = mapRef.current;
    if (map) (d > 0 ? map.zoomIn() : map.zoomOut());
  };
  const resetNorth = () => {
    // reset heading to north but keep the current tilt (so 3D stays 3D)
    mapRef.current?.easeTo({ bearing: 0, duration: 500 });
  };

  // slightly smaller on mobile so the whole stack clears the bottom sheet's
  // header below the hamburger; full size on desktop
  const btn =
    "flex h-9 w-9 items-center justify-center text-muted transition-colors hover:text-foreground active:bg-[var(--glass-highlight)] md:h-11 md:w-11";
  const divider = <div className="h-px w-full bg-[var(--glass-border)]" />;

  // vertical on both; mobile sits top-right below the hamburger, desktop sits
  // bottom-left. Hide when a panel would cover the controls: on mobile that's
  // the expanded layer sheet (or a detail popup); on desktop it's a left-side
  // detail popup (the layer panel is top-right, nowhere near bottom-left).
  const mobileHidden = panelOpen || detailOpen;
  return (
    <div
      className={`pointer-events-none absolute right-3 top-[4.5rem] z-[6] flex-col gap-2 md:bottom-8 md:left-3 md:right-auto md:top-auto ${
        mobileHidden ? "hidden" : "flex"
      } ${detailOpen ? "md:hidden" : "md:flex"}`}
    >
      {/* zoom */}
      <div className="glass pointer-events-auto flex flex-col overflow-hidden rounded-2xl">
        <button className={btn} onClick={() => zoom(1)} aria-label={t("zoomIn")} title={t("zoomIn")}>
          <Plus />
        </button>
        {divider}
        <button className={btn} onClick={() => zoom(-1)} aria-label={t("zoomOut")} title={t("zoomOut")}>
          <Minus />
        </button>
      </div>

      {/* rotate left · reset north · rotate right (vertical) */}
      <div className="glass pointer-events-auto flex flex-col overflow-hidden rounded-2xl">
        <button
          className={btn}
          onPointerDown={() => startPress(-1)}
          onPointerUp={() => endPress(-1, true)}
          onPointerLeave={() => endPress(-1, false)}
          onPointerCancel={() => endPress(-1, false)}
          aria-label={t("rotateLeft")}
          title={t("rotateHint")}
        >
          <RotateCCW />
        </button>
        {divider}
        <button className={btn} onClick={resetNorth} aria-label={t("resetNorth")} title={t("resetNorth")}>
          <Compass bearing={bearing} />
        </button>
        {divider}
        <button
          className={btn}
          onPointerDown={() => startPress(1)}
          onPointerUp={() => endPress(1, true)}
          onPointerLeave={() => endPress(1, false)}
          onPointerCancel={() => endPress(1, false)}
          aria-label={t("rotateRight")}
          title={t("rotateHint")}
        >
          <RotateCW />
        </button>
      </div>
    </div>
  );
}
