"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { useLocale, useTranslations } from "next-intl";
import { LAYERS } from "@/lib/layers";
import { API_BASE } from "@/lib/api";
import { LOSS_ATTRIBUTION, LOSS_COLOR } from "@/lib/forest-loss";
import StorySocial from "./StorySocial";
import type { Annotation, Bi, PlaceStory } from "./placeStories";

/** a terrain-anchored callout: glowing dot on the map + leader line + info card.
 *  Built as a plain element so MapLibre keeps it pinned (and elevated) as the
 *  camera flies. */
/** small geo-anchored data callout (numbers/labels), sits above its point.
 *  Photo callouts are NOT built here — they render as fixed side cards. */
function buildAnnotation(a: Annotation, en: boolean): HTMLDivElement {
  const tx = (b?: Bi) => (b ? (en ? b.en : b.id) : "");
  const el = document.createElement("div");
  el.style.cssText =
    "opacity:0;transition:opacity .7s ease;pointer-events:none;display:flex;flex-direction:column;align-items:flex-start;font-family:-apple-system,system-ui,sans-serif;";
  el.innerHTML = `
    <div style="background:rgba(11,18,14,.84);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:9px 13px;box-shadow:0 16px 36px -14px #000;white-space:nowrap;max-width:280px;">
      ${a.value ? `<div style="font:800 1.15rem/1 -apple-system,system-ui,sans-serif;color:#fff;letter-spacing:-.01em;font-variant-numeric:tabular-nums;">${a.value}</div>` : ""}
      <div style="font:600 .6rem/1.3 -apple-system,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.14em;color:#7fd6a8;${a.value ? "margin-top:3px;" : ""}">${tx(a.title)}</div>
      ${a.note ? `<div style="font-size:.68rem;color:rgba(255,255,255,.72);margin-top:2px;white-space:normal;font-style:italic;">${tx(a.note)}</div>` : ""}
      ${a.sub ? `<div style="font-size:.66rem;color:rgba(255,255,255,.58);margin-top:2px;white-space:normal;">${tx(a.sub)}</div>` : ""}
      ${a.source ? `<div style="font:500 .56rem/1.3 -apple-system,system-ui,sans-serif;color:rgba(255,255,255,.4);margin-top:5px;">${en ? "Source" : "Sumber"}: ${a.source.name}</div>` : ""}
    </div>
    <svg width="20" height="30" viewBox="0 0 20 30" style="margin-left:16px;display:block;"><line x1="10" y1="0" x2="10" y2="30" stroke="#57b98a" stroke-width="1.5" stroke-dasharray="3 4"/></svg>
    <div style="width:13px;height:13px;border-radius:50%;background:#57b98a;margin-left:9.5px;margin-top:-4px;box-shadow:0 0 0 4px rgba(87,185,138,.22),0 0 16px 2px rgba(87,185,138,.85);"></div>`;
  return el;
}

/**
 * Cinematic player for a place story on the 3D terrain. Runs a scripted camera
 * (an epic descent, then a slow move between beats), frames the view with
 * letterbox bars + a vignette, and shows one sourced fact per beat. Manual
 * pacing so people can actually read; the camera flights are the "epic" part.
 */
export default function PlaceStory({
  mapRef,
  story,
  activeLayers,
  onClose,
  onSetLayers,
  onAnimateLoss,
  lossYear,
  lossYears,
  lossPlaying,
  onToggleLossPlay,
  onShare,
}: {
  mapRef: React.MutableRefObject<MapLibreMap | null>;
  story: PlaceStory;
  /** layer ids currently on — drives the legend */
  activeLayers: string[];
  onClose: () => void;
  /** set the exact layers on for a beat (others off) */
  onSetLayers?: (ids: string[]) => void;
  /** play/stop the tree-cover-loss year animation for a beat */
  onAnimateLoss?: (on: boolean) => void;
  /** current year of the loss animation (for the on-screen timeline) */
  lossYear?: number;
  /** the full 2001..now year list (for the progress track) */
  lossYears?: number[];
  /** whether the loss animation is currently auto-playing */
  lossPlaying?: boolean;
  /** pause/resume the loss auto-play */
  onToggleLossPlay?: () => void;
  /** open the share sheet with this beat's facts baked into a social card */
  onShare?: (ctx: {
    id: string;
    name: string;
    region: string;
    eyebrow: string;
    big: string;
    label: string;
    source?: string;
  }) => void;
}) {
  const locale = useLocale();
  const tr = useTranslations("map");
  const t = <T extends { id: string; en: string }>(b: T) =>
    locale === "en" ? b.en : b.id;

  // legend: the active data layers, with swatch + source
  const legend = LAYERS.filter((l) => activeLayers.includes(l.id));
  const [idx, setIdx] = useState(0);
  const [entered, setEntered] = useState(false);
  const [fs, setFs] = useState(false);
  const [needRotate, setNeedRotate] = useState(false); // mobile held in portrait
  const [playing, setPlaying] = useState(true); // story autoplay — on by default
  const [soundOn, setSoundOn] = useState(!!(story.sound || story.music));
  const audioRef = useRef<HTMLAudioElement[]>([]);
  // the real WDPA park outline (fetched); falls back to the offline polygon
  const [boundaryGeom, setBoundaryGeom] = useState<
    GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  >(story.boundaryQuery ? null : story.boundary ?? null);
  const markers = useRef<maplibregl.Marker[]>([]);
  // true once the loss timeline has genuinely advanced past the first year this
  // beat (so a stale end-year value can't auto-skip the animation)
  const lossRan = useRef(false);
  const last = story.chapters.length - 1;

  const fly = (i: number) => {
    setIdx(i);
    const ch = story.chapters[i];
    // every beat shows EXACTLY its layers; a beat with none clears them all so
    // the satellite terrain stays clean (no leftovers from a previous beat/view)
    onSetLayers?.(ch.layers ?? []);
    onAnimateLoss?.(!!ch.animateLoss);
    const map = mapRef.current;
    if (!map) return;
    const cam = {
      center: ch.cam.center,
      zoom: ch.cam.zoom,
      pitch: ch.cam.pitch,
      bearing: ch.cam.bearing,
      duration: ch.cam.duration ?? 5000,
      essential: true,
    };
    if (i === 0) map.flyTo({ ...cam, curve: 1.35 });
    else map.easeTo(cam);
  };

  // opening: bump relief, snap high & far, then descend + tilt into beat 0
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c0 = story.chapters[0].cam;
    map.jumpTo({
      center: c0.center,
      zoom: Math.max(4.8, c0.zoom - 4.6),
      pitch: 0,
      bearing: 0,
    });
    // set the drama exaggeration AFTER MapView's own terrain effect has settled
    // (parent effects run after child effects, so a synchronous set here loses)
    const t0 = setTimeout(() => {
      try {
        map.setTerrain({ source: "terrain-dem", exaggeration: 1.5 });
      } catch {
        /* terrain source not ready — the flight still reads fine */
      }
      setEntered(true);
      fly(0);
    }, 300);
    return () => {
      clearTimeout(t0);
      try {
        mapRef.current?.setTerrain({ source: "terrain-dem", exaggeration: 1.0 });
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard: ←/→ to move, Esc to leave
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && idx < last) fly(idx + 1);
      else if (e.key === "ArrowLeft" && idx > 0) fly(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, last, onClose]);

  // STORY AUTOPLAY: auto-advance through beats while `playing`. Each beat holds
  // for its camera flight + a read pause. The loss beat is NOT timed here — it
  // advances as soon as the 2001→2025 timeline finishes (effect below).
  useEffect(() => {
    if (!playing || !entered || idx >= last) return;
    const cur = story.chapters[idx];
    if (cur.animateLoss) return; // advanced on loss completion, not a fixed timer
    const flight = cur.cam.duration ?? 5000;
    const read = idx === 0 ? 2600 : 3800 + (cur.points?.length ?? 0) * 1500;
    const timer = setTimeout(() => fly(idx + 1), flight + read);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, playing, entered, last]);

  // reset the "has the loss actually played this beat" flag on every beat change
  useEffect(() => {
    lossRan.current = false;
  }, [idx]);

  // once the loss timeline reaches the final year (2025), move on to the next
  // beat after a short pause. Guarded by lossRan so the initial stale 2025 value
  // (lossYearIdx defaults to the last year) doesn't skip the whole animation.
  useEffect(() => {
    if (!playing || idx >= last) return;
    if (!story.chapters[idx].animateLoss || !lossYears || lossYear == null) return;
    const lastYear = lossYears[lossYears.length - 1];
    if (lossYear < lastYear) {
      lossRan.current = true; // the timeline is genuinely running now
      return;
    }
    if (!lossRan.current) return; // stale end value before the animation started
    const timer = setTimeout(() => fly(idx + 1), 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, idx, last, lossYear, lossYears]);

  // play/pause the story; on the loss beat keep the year animation in lock-step
  const togglePlay = () => {
    setPlaying((p) => {
      const next = !p;
      if (story.chapters[idx].animateLoss && !!lossPlaying !== next)
        onToggleLossPlay?.();
      return next;
    });
  };

  // restart the whole story from the first beat and play through again
  // (fly(0) resets layers + stops the loss animation for beat 0)
  const replay = () => {
    fly(0);
    setPlaying(true);
  };

  // audio: a jungle ambient bed + cinematic music, layered and looped with a
  // gentle fade-in. Autoplay works when the story was opened by a click. On a
  // REFRESH of the deep link there's no gesture, so the browser blocks it — we
  // then unlock on the first interaction (the disclaimer tap, any click/key).
  useEffect(() => {
    const tracks = [
      story.sound ? { src: story.sound.src, vol: 0.2 } : null, // ambient bed, quiet
      story.music ? { src: story.music.src, vol: 0.42 } : null, // music, foreground
    ].filter(Boolean) as { src: string; vol: number }[];
    if (!tracks.length) return;

    const els = tracks.map((t) => {
      const a = new Audio(t.src);
      a.loop = true;
      a.volume = 0;
      return a;
    });
    audioRef.current = els;

    let raf = 0;
    let faded = false;
    const fadeIn = () => {
      if (faded) return;
      faded = true;
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 3000);
        els.forEach((a, i) => (a.volume = tracks[i].vol * p));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const EVTS = ["pointerdown", "touchstart", "keydown"] as const;
    let removeUnlock = () => {};
    const play = () => Promise.allSettled(els.map((a) => a.play()));

    play().then((res) => {
      if (res.some((r) => r.status === "fulfilled")) {
        setSoundOn(true);
        fadeIn();
        return;
      }
      // blocked (refresh with no gesture) — arm a one-shot gesture unlock
      const unlock = () => {
        removeUnlock();
        play().then(() => {
          setSoundOn(true);
          fadeIn();
        });
      };
      EVTS.forEach((e) => window.addEventListener(e, unlock, { once: true }));
      removeUnlock = () =>
        EVTS.forEach((e) => window.removeEventListener(e, unlock));
      setSoundOn(false);
    });

    return () => {
      cancelAnimationFrame(raf);
      removeUnlock();
      els.forEach((a) => {
        a.pause();
        a.src = "";
      });
      audioRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSound = () => {
    const els = audioRef.current;
    if (!els.length) return;
    setSoundOn((on) => {
      if (on) els.forEach((a) => a.pause());
      else els.forEach((a) => a.play().catch(() => {}));
      return !on;
    });
  };

  // floating terrain markers for the current beat
  useEffect(() => {
    const map = mapRef.current;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (!map) return;
    // only the small data callouts are geo-anchored; photo cards render fixed
    const anns = (story.chapters[idx].annotations ?? []).filter((a) => !a.photo);
    const added = anns.map((a) => {
      const el = buildAnnotation(a, locale === "en");
      const mk = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(a.lngLat)
        .addTo(map);
      requestAnimationFrame(() => {
        el.style.opacity = "1";
      });
      return mk;
    });
    markers.current = added;
    return () => added.forEach((m) => m.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // immersive: hide the site nav (via a body flag) for the duration
  useEffect(() => {
    document.body.dataset.immersive = "1";
    return () => {
      delete document.body.dataset.immersive;
    };
  }, []);

  // keep fullscreen state in sync (Esc, F11, etc.)
  useEffect(() => {
    const sync = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFs = () => {
    if (!document.fullscreenElement)
      document.documentElement
        .requestFullscreen?.()
        .then(() => {
          // best-effort landscape lock (Android/Chrome supports it; iOS ignores)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (screen.orientation as any)?.lock?.("landscape").catch(() => {});
        })
        .catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  // this cinematic story is built for a wide canvas (like desktop). On a touch
  // device held in portrait, prompt the viewer to rotate so it matches.
  useEffect(() => {
    const check = () => {
      const portrait = window.innerHeight > window.innerWidth;
      const touch =
        window.matchMedia("(pointer: coarse)").matches ||
        (navigator.maxTouchPoints ?? 0) > 0;
      const smallish = Math.min(window.innerWidth, window.innerHeight) <= 820;
      setNeedRotate(portrait && touch && smallish);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  // fetch the real WDPA park outline once; fall back to the offline polygon
  useEffect(() => {
    if (!story.boundaryQuery) return;
    let alive = true;
    fetch(`${API_BASE}/v1/protected/geometry?q=${encodeURIComponent(story.boundaryQuery)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { geom?: GeoJSON.Polygon | GeoJSON.MultiPolygon }) => {
        if (alive && d?.geom) setBoundaryGeom(d.geom);
      })
      .catch(() => {
        if (alive) setBoundaryGeom(story.boundary ?? null);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // draw the park outline as a flat, terrain-draped highlight. Added as soon as
  // the geometry is fetched — NOT gated on isStyleLoaded()/idle, which stay
  // false while satellite tiles stream during the flight and made the area
  // appear late.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundaryGeom) return;
    const SID = "story-boundary";
    let cancelled = false;
    const add = () => {
      if (cancelled || map.getSource(SID)) return;
      map.addSource(SID, {
        type: "geojson",
        data: { type: "Feature", geometry: boundaryGeom, properties: {} },
      });
      map.addLayer({
        id: "story-boundary-fill",
        type: "fill",
        source: SID,
        paint: {
          "fill-color": "#57b98a",
          // transparent so the tree-cover-loss underneath reads through
          "fill-opacity": 0.22,
        },
      });
      map.addLayer({
        id: "story-boundary-line",
        type: "line",
        source: SID,
        paint: {
          "line-color": "#9dffcf",
          "line-width": 2.5,
          "line-opacity": 0.9,
          "line-blur": 0.6,
        },
      });
    };
    // add now; if the style isn't initialised yet, retry once on load
    const ensure = () => {
      if (cancelled) return;
      try {
        add();
      } catch {
        map.once("load", ensure);
      }
    };
    ensure();

    return () => {
      cancelled = true;
      map.off("load", ensure);
      const m = mapRef.current;
      if (!m) return;
      try {
        if (m.getLayer("story-boundary-line")) m.removeLayer("story-boundary-line");
        if (m.getLayer("story-boundary-fill")) m.removeLayer("story-boundary-fill");
        if (m.getSource(SID)) m.removeSource(SID);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryGeom]);

  const ch = story.chapters[idx];
  const isArrival = idx === 0;
  const isLast = idx === last;
  const showLoss = !!(
    ch.animateLoss &&
    lossYear != null &&
    lossYears &&
    lossYears.length > 1
  );
  const lossPct = showLoss
    ? (Math.max(0, lossYears!.indexOf(lossYear!)) / (lossYears!.length - 1)) * 100
    : 0;
  // photo callouts float in the empty side margins (not over the fact card):
  // build a social card from this beat's facts and open the share sheet
  const share = () => {
    setPlaying(false);
    onShare?.({
      id: story.id,
      name: story.name,
      region: t(story.region),
      eyebrow: ch.stat ? t(ch.title) : locale === "en" ? "PLACE STORY" : "Kisah Kawasan",
      big: ch.stat ? ch.stat.value : t(ch.title),
      label: ch.stat ? t(ch.stat.label) : t(ch.body).replace(/\s+/g, " ").slice(0, 84),
      source: ch.source?.name,
    });
  };

  // split across right + left columns so several never stack or clip
  const photoAnns = (ch.annotations ?? []).filter((a) => a.photo);
  const rightPhotos = photoAnns.filter((_, i) => i % 2 === 0);
  const leftPhotos = photoAnns.filter((_, i) => i % 2 === 1);
  const renderPhoto = (a: Annotation, i: number) => (
    // entrance wrapper (fades/slides in once) holds an inner card that bobs
    // continuously, so the two transforms never fight
    <div
      key={a.photo!.src}
      className="pointer-events-auto shrink-0 animate-[panel-in_0.6s_ease] w-[164px] md:w-[232px]"
      style={{ animationDelay: `${i * 0.12}s` }}
    >
      <div
        className="story-float overflow-hidden rounded-2xl border border-white/14 bg-black/60 shadow-[0_14px_40px_-14px_rgba(0,0,0,0.65)] ring-1 ring-[#57b98a]/15 backdrop-blur-md"
        style={{ animation: `story-float ${5.4 + i * 0.6}s ease-in-out ${i * 0.7}s infinite` }}
      >
        {/* full-width, proportional image bleeding to the card edges */}
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.photo!.src}
            alt={t(a.title)}
            loading="lazy"
            className="block aspect-[4/3] w-full object-cover"
          />
          {/* soft gradient so the image melts into the card body */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/70 to-transparent" />
        </div>
        <div className="p-3.5">
          {a.value && (
            <div className="text-xl font-extrabold leading-none text-white tabular-nums">
              {a.value}
            </div>
          )}
          <div
            className={`text-[0.6rem] uppercase tracking-[0.16em] text-[#7fd6a8] ${a.value ? "mt-1.5" : ""}`}
          >
            {t(a.title)}
          </div>
          {a.note && (
            <div className="mt-1 text-[0.72rem] italic leading-snug text-white/70">
              {t(a.note)}
            </div>
          )}
          {a.sub && (
            <div className="mt-0.5 text-[0.7rem] leading-snug text-white/55">{t(a.sub)}</div>
          )}
          <div className="mt-2 text-[0.54rem] leading-tight text-white/40">
            {locale === "en" ? "Photo" : "Foto"}: {a.photo!.credit} · {a.photo!.license} ·
            Wikimedia Commons
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[40]">
      {/* mobile portrait: cover the story and ask to rotate to landscape, so the
          experience matches desktop's wide canvas */}
      {needRotate && (
        <div className="pointer-events-auto fixed inset-0 z-[80] flex flex-col items-center justify-center gap-5 bg-[#0a0f0c] px-8 text-center">
          <div className="motion-safe:animate-[rotate-hint_2.6s_ease-in-out_infinite]">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect
                x="7"
                y="2.5"
                width="10"
                height="19"
                rx="2.2"
                stroke="#57b98a"
                strokeWidth="1.7"
              />
              <path d="M10.5 19h3" stroke="#57b98a" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-[1.05rem] font-semibold text-white">
            {locale === "en" ? "Rotate your device" : "Putar perangkat"}
          </div>
          <p className="max-w-[15rem] text-[0.85rem] leading-relaxed text-white/55">
            {locale === "en"
              ? "This story is built for a wide screen. Turn to landscape for the full experience, just like on desktop."
              : "Kisah ini dibuat untuk layar lebar. Putar ke mode landscape untuk pengalaman penuh, seperti di desktop."}
          </p>
          <button
            onClick={onClose}
            className="mt-1 text-[0.8rem] text-white/45 underline underline-offset-2 transition-colors hover:text-white/75"
          >
            {locale === "en" ? "Exit" : "Keluar"}
          </button>
        </div>
      )}

      {/* letterbox bars + vignette — the cinematic frame */}
      <div
        className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/85 to-transparent transition-[height] duration-700"
        style={{ height: entered ? "16vh" : 0 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent transition-[height] duration-700"
        style={{ height: entered ? "34vh" : 0 }}
      />
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          opacity: entered ? 1 : 0,
          boxShadow: "inset 0 0 220px 40px rgba(0,0,0,0.55)",
        }}
      />

      {/* top: place name + close */}
      <div className="pointer-events-auto absolute inset-x-0 top-0 flex items-start justify-between p-4 md:p-6">
        <div className="animate-[panel-in_0.6s_ease]">
          <div className="flex items-center gap-2 text-[0.66rem] uppercase tracking-[0.22em] text-white/70">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#57b98a]" />
            Mandum Rimba · Kisah Kawasan
          </div>
          <div className="mt-1 text-[0.72rem] tracking-[0.1em] text-white/80">
            {t(story.region)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {story.sound && (
            <button
              onClick={toggleSound}
              aria-label={
                soundOn
                  ? locale === "en"
                    ? "Mute"
                    : "Matikan suara"
                  : locale === "en"
                    ? "Sound on"
                    : "Nyalakan suara"
              }
              title={
                soundOn
                  ? locale === "en"
                    ? "Mute ambient sound"
                    : "Matikan suara"
                  : locale === "en"
                    ? "Turn on ambient sound"
                    : "Nyalakan suara"
              }
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50"
            >
              {soundOn ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
                  <path d="m16 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
            </button>
          )}
          {onShare && (
            <button
              onClick={share}
              aria-label={locale === "en" ? "Share" : "Bagikan"}
              title={locale === "en" ? "Share this story" : "Bagikan cerita ini"}
              className="flex h-8 items-center gap-1.5 rounded-full border border-white/20 bg-black/30 px-3 text-[0.78rem] text-white/85 backdrop-blur transition-colors hover:bg-black/50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3m0 0-4 4m4-4 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {locale === "en" ? "Share" : "Bagikan"}
            </button>
          )}
          <button
            onClick={toggleFs}
            aria-label={fs ? "Exit fullscreen" : "Fullscreen"}
            title={fs ? "Exit fullscreen" : "Fullscreen"}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50"
          >
            {fs ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M15 20v-3a2 2 0 0 1 2-2h3M4 15h3a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <button
            onClick={onClose}
            className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-[0.78rem] text-white/85 backdrop-blur transition-colors hover:bg-black/50"
          >
            {locale === "en" ? "Close" : "Tutup"} ✕
          </button>
        </div>
      </div>

      {/* top-left: horizontal legend chips, aligned under the story title. Wraps
          to more rows when many layers are on. Source shows on hover + click.
          (desktop only — on mobile it moves into the bottom stack) */}
      {legend.length > 0 && (
        <div className="pointer-events-auto absolute left-6 top-[4.75rem] hidden max-w-[min(64vw,760px)] animate-[panel-in_0.5s_ease] md:block">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[0.56rem] uppercase tracking-[0.18em] text-white/50">
              {locale === "en" ? "Legend" : "Legenda"}
            </span>
            {legend.map((l) => (
              <a
                key={l.id}
                href={l.sourceUrl}
                target="_blank"
                rel="noreferrer"
                title={l.sourceName}
                className="flex items-center gap-1.5 rounded-full border border-white/12 bg-black/45 px-2.5 py-1 backdrop-blur-md transition-colors hover:bg-black/65"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: l.color }}
                />
                <span className="whitespace-nowrap text-[0.7rem] leading-none text-white/90">
                  {tr.has(`layerNames.${l.id}`) ? tr(`layerNames.${l.id}`) : l.id}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* DESKTOP: floating photos spread into the empty side margins. No
          overflow clip here (it would cut the soft shadow + the bob). */}
      {rightPhotos.length > 0 && (
        <div className="absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col gap-5 md:flex">
          {rightPhotos.map(renderPhoto)}
        </div>
      )}
      {leftPhotos.length > 0 && (
        <div className="absolute left-6 top-[calc(50%+2.5rem)] hidden -translate-y-1/2 flex-col gap-5 md:flex">
          {leftPhotos.map(renderPhoto)}
        </div>
      )}

      {/* DESKTOP tree-cover-loss timeline — pinned right, vertical. On mobile it
          moves into the bottom stack (compact, horizontal) so it never covers
          the fact card / info. */}
      {showLoss && (() => {
        const pct = lossPct;
        const en = locale === "en";
        return (
          <div className="pointer-events-auto absolute right-6 top-1/2 hidden w-[196px] -translate-y-1/2 md:block">
            <div className="animate-[panel-in_0.5s_ease] rounded-2xl border border-white/12 bg-black/55 p-4 backdrop-blur-md">
              <div
                className="text-[0.56rem] uppercase tracking-[0.2em]"
                style={{ color: LOSS_COLOR }}
              >
                {en ? "Tree cover loss" : "Tutupan pohon hilang"}
              </div>
              <div className="mt-1 text-[3.2rem] font-extrabold leading-none tabular-nums text-white">
                {lossYear}
              </div>

              {/* vertical year track: 2001 (top) → now (bottom), filling down */}
              <div className="mt-3 flex gap-3">
                <div className="relative w-1 flex-none rounded-full bg-white/15" style={{ height: 148 }}>
                  <div
                    className="absolute inset-x-0 top-0 rounded-full"
                    style={{ height: `${pct}%`, background: LOSS_COLOR }}
                  />
                  <div
                    className="absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                    style={{ top: `${pct}%`, boxShadow: `0 0 12px 2px ${LOSS_COLOR}` }}
                  />
                </div>
                <div className="flex flex-col justify-between py-0.5 text-[0.6rem] tabular-nums text-white/45">
                  <span>{lossYears[0]}</span>
                  <span className="text-white/70">{lossYear}</span>
                  <span>{lossYears[lossYears.length - 1]}</span>
                </div>
              </div>

              <div className="mt-3.5 border-t border-white/10 pt-2 text-[0.52rem] leading-tight text-white/40">
                {en ? "Source" : "Sumber"}: {LOSS_ATTRIBUTION}
              </div>
            </div>
          </div>
        );
      })()}

      {/* bottom: the fact card for this beat */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 p-4 md:p-8">
        {/* closing beat: latest videos from the official account (auto-updating,
            muted autoplay) — falls back to a follow card if the feed is empty */}
        {isLast && story.instagram && (
          <StorySocial
            handle={story.instagram.handle}
            url={story.instagram.url}
            name={t(story.instagram.name)}
            en={locale === "en"}
          />
        )}
        {/* MOBILE: compact tree-cover-loss timeline, stacked above the card */}
        {showLoss && (
          <div className="mx-auto mb-3 max-w-[640px] rounded-2xl border border-white/12 bg-black/60 px-4 py-3 backdrop-blur-md md:hidden">
            <div className="flex items-center justify-between gap-3">
              <span
                className="text-[0.56rem] uppercase tracking-[0.18em]"
                style={{ color: LOSS_COLOR }}
              >
                {locale === "en" ? "Tree cover loss" : "Tutupan pohon hilang"}
              </span>
              <span className="text-2xl font-extrabold leading-none tabular-nums text-white">
                {lossYear}
              </span>
            </div>
            <div className="relative mt-2.5 h-1 rounded-full bg-white/15">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${lossPct}%`, background: LOSS_COLOR }}
              />
              <div
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{ left: `${lossPct}%`, boxShadow: `0 0 8px 1px ${LOSS_COLOR}` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[0.52rem] tabular-nums text-white/45">
              <span>{lossYears![0]}</span>
              <span>{lossYears![lossYears!.length - 1]}</span>
            </div>
            <div className="mt-1.5 text-[0.5rem] leading-tight text-white/35">
              {locale === "en" ? "Source" : "Sumber"}: {LOSS_ATTRIBUTION}
            </div>
          </div>
        )}
        {/* MOBILE: compact legend chips, stacked above the card */}
        {legend.length > 0 && (
          <div className="mx-auto mb-3 flex max-w-[640px] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-white/12 bg-black/55 px-4 py-2.5 backdrop-blur-md md:hidden">
            {legend.map((l) => (
              <span
                key={l.id}
                className="flex items-center gap-1.5 text-[0.68rem] leading-none text-white/85"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: l.color }}
                />
                {tr.has(`layerNames.${l.id}`) ? tr(`layerNames.${l.id}`) : l.id}
              </span>
            ))}
          </div>
        )}
        {/* MOBILE: photos as a horizontal scroll strip ABOVE the fact card, so
            all info stays visible and nothing overlaps or clips */}
        {photoAnns.length > 0 && (
          <div className="mx-auto mb-3 flex max-w-[640px] gap-3 overflow-x-auto px-1 py-3 md:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {photoAnns.map(renderPhoto)}
          </div>
        )}
        <div
          key={idx}
          className="mx-auto max-w-[640px] rounded-2xl border border-white/12 bg-black/65 p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md animate-[panel-in_0.6s_cubic-bezier(.2,.7,.2,1)] md:p-6"
        >
          {isArrival ? (
            <h1 className="m-0 text-white [text-wrap:balance]">
              <span className="block text-[2.2rem] font-bold leading-[1.02] tracking-[-0.02em] md:text-[3rem]">
                {t(ch.title)}
              </span>
            </h1>
          ) : (
            <>
              <div className="mb-1 text-[0.68rem] uppercase tracking-[0.2em] text-[#7fd6a8]">
                {t(ch.title)}
              </div>
              {ch.stat && (
                <div className="mb-1.5 flex items-baseline gap-3">
                  <span className="text-[2.1rem] font-bold leading-none tracking-[-0.02em] text-white tabular-nums md:text-[2.6rem]">
                    {ch.stat.value}
                  </span>
                  <span className="text-[0.8rem] text-white/70">
                    {t(ch.stat.label)}
                  </span>
                </div>
              )}
              <p className="m-0 max-w-[52ch] text-[0.98rem] leading-snug text-white/90 [text-wrap:pretty]">
                {t(ch.body)}
              </p>
              {ch.points && ch.points.length > 0 && (
                <ul className="mt-2.5 flex max-w-[54ch] list-none flex-col gap-1.5 p-0">
                  {ch.points.map((pt, i) => (
                    <li key={i} className="flex gap-2 text-[0.86rem] leading-snug text-white/85">
                      <span
                        aria-hidden
                        className="mt-[0.5em] h-1.5 w-1.5 flex-none rounded-full"
                        style={{ background: LOSS_COLOR }}
                      />
                      <span>
                        {t(pt.text)}
                        {pt.source && (
                          <a
                            href={pt.source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1.5 whitespace-nowrap text-[0.6rem] text-white/45 hover:text-white/75"
                          >
                            [{pt.source.name}]
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {ch.source && (
                <a
                  href={ch.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-block text-[0.66rem] text-white/55 hover:text-white/80"
                >
                  {locale === "en" ? "Source" : "Sumber"}: {ch.source.name}
                </a>
              )}
              {isLast && (story.music || story.sound) && (
                <div className="mt-2 text-[0.58rem] leading-tight text-white/40">
                  {story.music && (
                    <>
                      {locale === "en" ? "Music" : "Musik"}: {story.music.credit} ·{" "}
                      {story.music.license}
                    </>
                  )}
                  {story.music && story.sound && " · "}
                  {story.sound && (
                    <>
                      {locale === "en" ? "Ambience" : "Suasana"}: {story.sound.credit} ·{" "}
                      {story.sound.license}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* progress + transport controls: back · play/pause · forward · stop */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex gap-1.5">
              {story.chapters.map((_, i) => (
                <button
                  key={i}
                  onClick={() => fly(i)}
                  aria-label={`beat ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === idx ? "w-6 bg-[#57b98a]" : "w-1.5 bg-white/35 hover:bg-white/60"
                  }`}
                />
              ))}
            </div>
            <span className="flex-1" />
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => fly(idx - 1)}
                disabled={idx === 0}
                aria-label={locale === "en" ? "Previous" : "Sebelumnya"}
                title={locale === "en" ? "Previous" : "Sebelumnya"}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50 disabled:opacity-30 disabled:hover:bg-black/30"
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden><path d="M9.5 1L4 6l5.5 5V1zM3 1H1.5v10H3V1z" /></svg>
              </button>
              <button
                onClick={isLast ? replay : togglePlay}
                aria-label={
                  isLast
                    ? locale === "en"
                      ? "Replay"
                      : "Ulangi"
                    : playing
                      ? locale === "en"
                        ? "Pause"
                        : "Jeda"
                      : locale === "en"
                        ? "Play"
                        : "Main"
                }
                title={
                  isLast
                    ? locale === "en"
                      ? "Replay from the start"
                      : "Ulangi dari awal"
                    : playing
                      ? locale === "en"
                        ? "Pause"
                        : "Jeda"
                      : locale === "en"
                        ? "Play"
                        : "Main"
                }
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#57b98a] text-[#07130d] transition-[filter] hover:brightness-110"
              >
                {isLast ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : playing ? (
                  <svg width="15" height="15" viewBox="0 0 12 12" fill="currentColor" aria-hidden><rect width="3.5" height="12" rx="1" /><rect x="8.5" width="3.5" height="12" rx="1" /></svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 12 12" fill="currentColor" aria-hidden><path d="M1.5 0.5l10 5.5-10 5.5z" /></svg>
                )}
              </button>
              <button
                onClick={() => fly(idx + 1)}
                disabled={isLast}
                aria-label={locale === "en" ? "Next" : "Lanjut"}
                title={locale === "en" ? "Next" : "Lanjut"}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50 disabled:opacity-30 disabled:hover:bg-black/30"
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden><path d="M2.5 1L8 6l-5.5 5V1zM9 1h1.5v10H9V1z" /></svg>
              </button>
              <button
                onClick={onClose}
                aria-label={locale === "en" ? "Stop — back to map" : "Stop — balik ke peta"}
                title={locale === "en" ? "Stop — back to map" : "Stop — balik ke peta"}
                className="ml-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden><rect width="12" height="12" rx="2" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
