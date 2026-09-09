"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import { usAqiFromPm25 } from "@mandumrimba/shared";
import {
  rasteriseGrid,
  subsampleFor,
  sampleLayer,
  WindSampler,
  type AirGridData,
} from "@/lib/air-field";
import { useTranslations } from "next-intl";
import maplibre from "maplibre-gl";

/**
 * Udara & asap, the animated layer: a PM2.5 colour field with the 10 m wind
 * drawn through it as moving particles, so a plume reads as something going
 * somewhere rather than a static stain.
 *
 * Two different mechanisms on purpose:
 *  - the colour field is a real MapLibre source, so it sits UNDER the data
 *    layers in the normal z-order and pans/zooms with the map for free;
 *  - the particles are a plain 2D canvas over the map. They are ephemeral and
 *    screen-space, so putting them in the GL layer stack would buy nothing and
 *    cost a custom WebGL layer's worth of state juggling.
 *
 * TIME. The field is an hourly series, and `atMs` picks the moment shown
 * (null = live "now"). Two things make that affordable:
 *
 *  1. Steps are fetched ONE AT A TIME and cached, never as a series. A page
 *     load still costs the two steps bracketing now (~190 kB); scrubbing to
 *     an hour costs that hour (~96 kB) and only if someone asks for it.
 *
 *  2. The picture is cross-faded on the GPU rather than re-rasterised.
 *     Rasterising this grid is ~54 ms on a fast laptop (1200x1100 px, bicubic,
 *     measured) — about 18 fps at best and several times worse on a mid-range
 *     phone, so redrawing per frame could never be smooth. Instead each step is
 *     rasterised ONCE into its own canvas, and playback just animates the two
 *     layers' opacity, which the GPU does for free at 60 fps.
 *
 * The cross-fade is an approximation: two RGBA layers dissolved by opacity is
 * not identical to interpolating the VALUES and rasterising once, because the
 * per-pixel severity alpha composites rather than averages. Mid-fade the field
 * reads very slightly fainter than a true blend. It is endpoint-exact, and the
 * numbers people can actually quote — the click popup — are computed from the
 * value-space blend below, not read off the picture.
 */

/**
 * ONE source and ONE layer, for the whole life of the component.
 *
 * The first attempt used two raster layers and dissolved them with
 * raster-opacity. It flickered: advancing an hour meant swapping which step
 * each layer held, and a MapLibre source is bound to its canvas at creation,
 * so "swapping" meant removeLayer + addLayer every model hour — with the new
 * layer starting at opacity 0. Once an hour the field blinked out and back.
 *
 * So the dissolve happens BEFORE the map sees it: both steps are drawn into a
 * single compose canvas with globalAlpha, and the map holds that one canvas
 * forever. Nothing is ever added or removed while playing, so there is nothing
 * left to blink. It also halves what the map composites per frame.
 */
const SRC_STILL = "src-air-pm25-still";
const LAYER_STILL = "lyr-air-pm25-still";
const SRC_PLAY = "src-air-pm25-play";
const LAYER_PLAY = "lyr-air-pm25-play";

/**
 * The field's one global dial. Per-pixel alpha already encodes severity, so a
 * second multiplier here would fight it; this only sets how much of the map
 * shows through overall.
 */
const BASE_OPACITY = 0.45;

/**
 * Model hours advanced per real second while playing. A full 50-hour pass
 * takes about 36 s.
 *
 * Speed is paid for in RASTERISES, not in composites: every model hour crossed
 * needs one, and it blocks the main thread wherever it is scheduled — moving
 * it off the boundary only moves the stall. Measured with the playback detail
 * below: 0.7 h/s cost 8 stalls over 7 s, 1.4 cost 12, 2.0 cost 20.
 *
 * 2.0 was tried and reverted. It was affordable only by dropping the playback
 * raster to one sample per grid node, and that was visibly softer and less
 * saturated while moving — a bad trade for a layer whose whole point is where
 * the plume actually is.
 */
const PLAY_HOURS_PER_SEC = 1.4;
/** How often the label is told the time, in ms. 60 fps of React would thrash. */
const TICK_MS = 200;
/**
 * Recomposite every Nth animation frame — counted in FRAMES, not milliseconds.
 *
 * Each composite costs about one frame: two full-canvas drawImage calls, a
 * texture upload, and a map repaint. Measured across rates from 25 to 4 a
 * second, the per-update cost never changed; only how many updates there were.
 *
 * So the choice is not "how cheap" but "how EVEN". A 40 ms timer against 16.7 ms
 * frames lands on frames 0, 3, 5, 8, 10 — a limping two-three-two cadence, and
 * uneven pacing reads as judder even when the average frame rate is high. Every
 * second frame is a rock-steady 30 updates a second, which looks smoother than
 * a jittery 47 despite being nominally slower.
 *
 * The field's content changes over hours, so 30 Hz is far more than it needs.
 * The particles keep running at the full frame rate on their own canvas, and
 * they are what carries the sense of motion.
 */
const COMPOSITE_EVERY = 3;
/** Rasterised canvases kept in memory. Each is ~5 MB at 1200x1100 RGBA. */
const MAX_RASTERS = 6;

/**
 * How much detail to give up while playing: half the samples per cell, so a
 * quarter of the pixels. Pausing rasterises at full detail again.
 *
 * Bicubic sampling is the layer's one expensive operation and it lands on every
 * model hour crossed — 250 ms against a 16.7 ms budget at full detail, which is
 * what made playback judder. A quarter of the pixels is the floor that still
 * looks like the still image; an eighth of that (one sample per node) was tried
 * for speed and rejected as visibly washed out.
 */
const PLAY_SUB_DIVISOR = 2;

const PARTICLE_COUNT = 5200;
/**
 * Screen pixels per frame for the FASTEST wind in the field; everything else
 * scales below it. Advecting in degrees instead — the obvious first try — makes
 * the streaks collapse to dots when you zoom out, because a degree becomes a
 * fraction of a pixel. Speed has to be expressed in what the eye measures.
 */
const TARGET_PX_PER_FRAME = 1.6;
/** frames before a particle is recycled, so the field keeps reseeding */
const MAX_AGE = 140;
/**
 * Alpha of the wash that erases old frames. It sets streak LENGTH (roughly
 * speed / fade) and how long a strand lingers after the thing that drew it has
 * moved on. At 0.016 a trail was still faintly visible three seconds later, so
 * the picture drifted under its own residue; 0.06 clears in well under a second.
 */
const FADE = 0.06;

interface AirIndex {
  bbox: [number, number, number, number];
  pm: { nx: number; ny: number; step: number };
  wind: { nx: number; ny: number; step: number };
  /** UTC wall-clock hours, e.g. "2026-09-05T09:00" */
  times: string[];
  /** immutable path prefix holding this build's step files */
  steps?: string;
  /** the CAMS run these steps came from, UTC */
  runAt?: string | null;
  /** hours between published steps */
  stepHours?: number;
  attribution: string;
}

interface AirStep {
  pm25: (number | null)[];
  u: (number | null)[];
  v: (number | null)[];
  maxSpeed: number;
}

interface Particle {
  lon: number;
  lat: number;
  age: number;
}

/** The published axis, handed up so a player can be drawn for it. */
export interface AirAxis {
  /** epoch ms of every published step, ascending */
  stepsMs: number[];
  /** the CAMS run, UTC */
  runAt: string | null;
}

export interface AirFieldProps {
  map: maplibregl.Map | null;
  /** the map's positioned container; the particle canvas is appended here */
  container: HTMLElement | null;
  visible: boolean;
  /** paint the layer under this one, so points and polygons stay on top */
  beforeId?: string;
  /** the moment to show, epoch ms. null = live "now". */
  atMs?: number | null;
  /** advance on our own clock, cross-fading between steps */
  playing?: boolean;
  /** the published axis, once the index is in */
  onAxis?: (a: AirAxis | null) => void;
  /** the moment actually on screen while playing (throttled, not per frame) */
  onTick?: (ms: number) => void;
  onStatus?: (
    s: {
      /** the hour shown, which for a blend is not a model step */
      validAt: string | null;
      /** the two published steps it was blended from, UTC */
      between: [string, string] | null;
      /** the CAMS run those steps came from, UTC */
      runAt: string | null;
      attribution: string;
    } | null,
  ) => void;
}

/**
 * Where to insert the field so the map stays readable underneath it.
 *
 * The Esri basemaps carry no text — place names arrive as a SEPARATE raster
 * layer, `basemap-labels`, and MapView deliberately declares it with the
 * basemaps so ordinary data layers stack above it. A full-coverage atmospheric
 * raster is the one layer for which that is wrong: added above, it buries every
 * city name no matter how the symbol layers are ordered. Anchoring to the first
 * *symbol* layer does not help here, because on this path the labels are not
 * symbols at all — they are pixels.
 */
function labelAnchor(
  map: maplibregl.Map,
  beforeId?: string,
): string | undefined {
  if (beforeId && map.getLayer(beforeId)) return beforeId;
  if (map.getLayer("basemap-labels")) return "basemap-labels";
  try {
    const first = map
      .getStyle()
      .layers.find((l) => l.type === "symbol" && !l.id.startsWith("lyr-air"));
    return first?.id;
  } catch {
    return undefined;
  }
}

/** compass point for a bearing the wind blows FROM, in Indonesian short form */
const COMPASS = ["U", "TL", "T", "TG", "S", "BD", "B", "BL"];
function fromDirection(u: number, v: number): string {
  // u,v point where the wind is going; people name where it comes from
  const deg = (Math.atan2(-u, -v) * 180) / Math.PI;
  const idx = Math.round(((deg + 360) % 360) / 45) % 8;
  return COMPASS[idx];
}

const msOf = (t: string) => Date.parse(`${t}:00Z`);

export default function AirField({
  map,
  container,
  visible,
  beforeId,
  atMs = null,
  playing = false,
  onAxis,
  onTick,
  onStatus,
}: AirFieldProps) {
  const t = useTranslations("map");
  const [index, setIndex] = useState<AirIndex | null>(null);
  const [grid, setGrid] = useState<AirGridData | null>(null);
  const [prov, setProv] = useState<{
    between: [string, string] | null;
    runAt: string | null;
  }>({ between: null, runAt: null });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  /**
   * The particle effect reads the field through this rather than through the
   * `grid` state, so a new model hour swaps the wind WITHOUT restarting the
   * animation and reseeding every particle. `hasGrid` is the only thing it
   * keys on — a boolean, so it flips once.
   */
  const gridRef = useRef<AirGridData | null>(null);
  gridRef.current = grid;
  const hasGrid = grid != null;

  /** step files, keyed by ISO hour. Fetched on demand, never as a series. */
  const stepsRef = useRef(new Map<string, AirStep>());
  /** one rasterised canvas per step, the expensive thing worth keeping */
  const rastersRef = useRef(new Map<string, HTMLCanvasElement>());
  /** which step each field layer is currently showing */
  const shownRef = useRef<{ a: string | null; b: string | null }>({
    a: null,
    b: null,
  });
  /** the play clock, in epoch ms; a ref so 60 fps never touches React */
  const clockRef = useRef<number | null>(null);
  /**
   * The model time to show, epoch ms — a ref, so 60 fps never touches React.
   *
   * Deliberately NOT the dissolve fraction. A fraction is meaningless without
   * the pair it belongs to, and the pair on screen lags the pair being asked
   * for by however long a fetch and rasterise take. Storing the TIME lets the
   * renderer work out the fraction against whatever it actually holds.
   */
  const shownMsRef = useRef(Date.now());

  /**
   * Two compose canvases, and two layers that are created once and never torn
   * down — only shown or hidden.
   *
   * The size matters per frame, not just per hour: a full-detail canvas is
   * uploaded to the GPU on every frame of playback, and pinning it to full
   * size took the median frame from 17 ms to 33 ms — a steady 30 fps. But the
   * still image must stay sharp. So there is one canvas at each detail level,
   * and play/pause swaps which layer is visible. Visibility is a layout
   * property: instant, and nothing is added or removed, so it cannot blink the
   * way removeLayer/addLayer did.
   */
  /** frames since playback started, for the even composite cadence */
  const frameRef = useRef(0);
  const composeStillRef = useRef<HTMLCanvasElement | null>(null);
  const composePlayRef = useRef<HTMLCanvasElement | null>(null);
  /** the two rasters currently in play, already drawn at full resolution */
  /**
   * The two PM2.5 steps in play, kept RAW. The click popup interpolates two
   * sampled scalars from these; nothing blends the arrays themselves.
   */
  const readRef = useRef<{
    a: (number | null)[] | null;
    b: (number | null)[] | null;
    aKey: string | null;
    bKey: string | null;
  }>({ a: null, b: null, aKey: null, bKey: null });

  const pairCanvasRef = useRef<{
    a: HTMLCanvasElement | null;
    b: HTMLCanvasElement | null;
    /** the hours those canvases ARE, so the fade can be worked out from them */
    aKey: string | null;
    bKey: string | null;
  }>({ a: null, b: null, aKey: null, bKey: null });

  /**
   * Create both layers once, at their own fixed sizes. Called on every pair
   * change but does nothing after the first, so there is no per-hour churn.
   */
  const attach = useCallback(
    (
      m: maplibregl.Map,
      bbox: [number, number, number, number],
      stillW: number,
      stillH: number,
      playW: number,
      playH: number,
    ) => {
      const [west, south, east, north] = bbox;
      const coordinates: [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ] = [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ];

      const mk = (
        ref: React.MutableRefObject<HTMLCanvasElement | null>,
        srcId: string,
        layerId: string,
        w: number,
        h: number,
      ) => {
        let cv = ref.current;
        if (!cv) {
          cv = document.createElement("canvas");
          cv.width = w;
          cv.height = h;
          // Touch it once. A canvas source builds its texture from the canvas,
          // and a context that has never been used is not guaranteed to give
          // one — the raster draw then reaches for tile.texture.bind() on an
          // undefined texture and takes the whole map down.
          cv.getContext("2d")?.clearRect(0, 0, w, h);
          ref.current = cv;
        }
        if (m.getLayer(layerId)) return;
        m.addSource(srcId, {
          type: "canvas",
          canvas: cv,
          coordinates,
          // we drive the re-reads ourselves; leaving this on would upload a
          // texture every frame for a picture that is usually still
          animate: false,
        });
        m.addLayer(
          {
            id: layerId,
            type: "raster",
            source: srcId,
            // Born HIDDEN, always. Both layers were added with the default
            // visibility, i.e. visible, and only hidden a moment later once
            // renderFrame had decided which one was live — so for however many
            // frames fell in between, the map was asked to draw a raster whose
            // canvas had nothing in it yet. renderFrame reveals the right one
            // after it has drawn into it.
            layout: { visibility: "none" },
            paint: {
              // ONE dial. Per-pixel alpha already encodes severity, so a second
              // multiplier here would fight it. It is constant: the dissolve
              // lives in the canvas, not in this property.
              "raster-opacity": BASE_OPACITY,
              "raster-fade-duration": 0,
            },
          },
          // Under the basemap's labels, not on top of everything. Added with no
          // beforeId the raster lands at the top of the stack and buries every
          // place name — which is what it did.
          labelAnchor(m, beforeId),
        );
      };

      mk(composeStillRef, SRC_STILL, LAYER_STILL, stillW, stillH);
      mk(composePlayRef, SRC_PLAY, LAYER_PLAY, playW, playH);
      return true;
    },
    [beforeId],
  );

  /**
   * Draw the dissolve and hand the result to the map. A drawImage blit of an
   * already-rasterised canvas is cheap — the expensive part, bicubic sampling
   * of 83,076 nodes into 1.3 M pixels, happened once per step and is cached.
   *
   * `play()`/`pause()` is how a canvas source is told to re-read its canvas:
   * while playing it stays in play mode and re-reads every frame; when paused
   * we let one frame through and stop, so a scrub still updates the picture
   * without uploading a texture 60 times a second for a still image.
   */
  const renderFrame = useCallback(
    (opts?: { keepPlaying?: boolean }) => {
      // which detail level is on screen right now
      const usePlay = !!opts?.keepPlaying;

      // Throttle only while playing: a scrub or a pause must land immediately,
      // or the picture would lag the reader's own hand.
      if (usePlay) {
        frameRef.current += 1;
        if (frameRef.current % COMPOSITE_EVERY !== 0) return;
      }
      const cv = usePlay ? composePlayRef.current : composeStillRef.current;
      const { a, b } = pairCanvasRef.current;
      if (!cv || !a) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;

      /**
       * The fade is measured against the canvases IN HAND, not against the
       * pair we last asked for.
       *
       * This is what made it march forwards then snap back. At an hour
       * boundary `resolve` hands back the NEW pair with frac ~0, but the new
       * canvases are still being fetched and rasterised, so the old pair was
       * being drawn at frac 0 — which is a whole hour EARLIER than the hour
       * just shown. Every model hour the picture jumped back and caught up.
       *
       * Deriving the fraction from the loaded keys makes the wait harmless:
       * the fade simply saturates at 1 on the old pair, and the old pair at 1
       * is the same hour as the new pair at 0, so the swap is invisible.
       */
      const { aKey, bKey } = pairCanvasRef.current;
      const t0 = aKey ? Date.parse(`${aKey}:00Z`) : 0;
      const t1 = bKey ? Date.parse(`${bKey}:00Z`) : 0;
      const f =
        t1 > t0
          ? Math.min(1, Math.max(0, (shownMsRef.current - t0) / (t1 - t0)))
          : 0;

      /**
       * An exact linear cross-fade: out = a*(1-f) + b*f, alpha included.
       *
       * The obvious version — draw a, then draw b over it at alpha f — pulses,
       * for two separate reasons, and both were visible:
       *
       *  1. `a` at full alpha never fades OUT, so at f=1 the picture is still
       *     "b over a", not b. Wherever b is transparent (clean air) a's plume
       *     showed through; when the pair advanced, that ghost vanished all at
       *     once. A jump once per model hour.
       *  2. Two semi-transparent layers composited with source-over do not
       *     preserve total alpha. At f=0.5 with both opaque it lands at 0.75,
       *     not 1 — so the field thinned mid-fade and thickened again at each
       *     end. That is the breathing.
       *
       * `copy` writes a*(1-f) with nothing underneath, and `lighter` ADDS
       * b*f — colour and alpha together, in the premultiplied space the canvas
       * already stores. The weights sum to 1, so nothing can clip, and the two
       * endpoints are exactly a and exactly b.
       */
      ctx.globalCompositeOperation = "copy";
      ctx.globalAlpha = b && b !== a ? 1 - f : 1;
      ctx.drawImage(a, 0, 0, cv.width, cv.height);
      if (b && b !== a && f > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = f;
        ctx.drawImage(b, 0, 0, cv.width, cv.height);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      const m = map;
      if (!m) return;
      const activeLayer = usePlay ? LAYER_PLAY : LAYER_STILL;
      const idleLayer = usePlay ? LAYER_STILL : LAYER_PLAY;
      const src = m.getSource(usePlay ? SRC_PLAY : SRC_STILL) as
        | maplibregl.CanvasSource
        | undefined;
      if (!src) return;

      // Draw first, THEN show: swapping to a layer whose canvas is still empty
      // is exactly the blank frame this design exists to avoid.
      src.play();
      try {
        if (m.getLayer(activeLayer)) {
          m.setLayoutProperty(
            activeLayer,
            "visibility",
            visible ? "visible" : "none",
          );
        }
        if (m.getLayer(idleLayer)) {
          m.setLayoutProperty(idleLayer, "visibility", "none");
        }
      } catch {
        /* style not ready */
      }

      // One upload per composite, then stop — in BOTH modes. Leaving the
      // source in play mode is what made the texture go up every frame even
      // though the canvas had not changed since the last composite.
      requestAnimationFrame(() => {
        try {
          src.pause();
        } catch {
          /* source went away with the style */
        }
      });
    },
    [map, visible],
  );

  // ---- index -------------------------------------------------------------

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    /**
     * The field is a static file on R2, rebuilt twice a day by Modal
     * (modal_air.py) and served through the same-origin /air/* rewrite — so a
     * page load costs a couple of small CDN requests and never touches a
     * weather API. There is no API fallback: an endpoint that rebuilt this on
     * demand would need thousands of upstream locations per request, which is
     * what made it a scheduled job in the first place.
     */
    const load = async () => {
      try {
        const res = await fetch("/air/index.json", { cache: "no-cache" });
        const idx = res.ok ? ((await res.json()) as AirIndex) : null;
        if (idx?.times?.length) {
          if (cancelled) return;
          // a rebuild changes the immutable step prefix; anything cached under
          // the old one is a different grid and must not be blended with this
          stepsRef.current.clear();
          rastersRef.current.clear();
          shownRef.current = { a: null, b: null };
          setIndex(idx);
          return;
        }
      } catch {
        /* fall through to the retry */
      }
      // R2 has no field yet (a fresh bucket, or the first scheduled build has
      // not run). Retry rather than failing for good: the layer stays off,
      // which is a visible absence rather than a wrong picture.
      retry = setTimeout(load, 15000);
    };
    void load();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [visible]);

  useEffect(() => {
    onAxis?.(
      index
        ? {
            stepsMs: [...index.times].map(msOf).sort((x, y) => x - y),
            runAt: index.runAt ?? null,
          }
        : null,
    );
  }, [index, onAxis]);

  // ---- the moment on screen ----------------------------------------------

  /**
   * `atMs` is what the caller asked for; this is what we actually show. While
   * playing, the clock runs here (a ref) so the cross-fade can be driven at
   * 60 fps without a React render per frame.
   */
  const [pair, setPair] = useState<{
    before: string;
    after: string;
    frac: number;
  } | null>(null);

  /** the axis and a resolver over it, rebuilt only when a new index lands */
  const axis = useMemo(() => {
    if (!index) return null;
    const sorted = [...index.times].sort((a, b) => msOf(a) - msOf(b));
    const first = msOf(sorted[0]);
    const last = msOf(sorted[sorted.length - 1]);
    /** resolve a moment to the two steps that bracket it, plus the fraction */
    const resolve = (ms: number) => {
      const clamped = Math.min(last, Math.max(first, ms));
      let before = sorted[0];
      let after = sorted[sorted.length - 1];
      for (let i = 0; i < sorted.length; i++) {
        if (msOf(sorted[i]) <= clamped) before = sorted[i];
        if (msOf(sorted[i]) >= clamped) {
          after = sorted[i];
          break;
        }
      }
      const span = msOf(after) - msOf(before);
      const frac = span > 0 ? (clamped - msOf(before)) / span : 0;
      return { before, after, frac };
    };
    return { sorted, first, last, resolve };
  }, [index]);

  /**
   * `atMs` seeds the play clock but must NOT restart it: onTick pushes the
   * clock back up to MapView, which returns it as this very prop, so keeping
   * atMs in the playing effect's deps tore the loop down and rebuilt it five
   * times a second. A ref carries the seed instead.
   */
  const atMsRef = useRef<number | null>(atMs);
  atMsRef.current = atMs;

  // paused: follow the caller, or the wall clock when it has no opinion
  useEffect(() => {
    if (!axis || playing) return;
    const { resolve } = axis;
    clockRef.current = null;
    const p = resolve(atMs ?? Date.now());
    shownMsRef.current = atMs ?? Date.now();
    setPair(p);
    renderFrame();
  }, [axis, atMs, playing, renderFrame]);

  // playing: our own clock, straight onto the GPU
  useEffect(() => {
    // `visible` matters as much as `playing` here. Without it the clock kept
    // running after the layer was switched off — compositing and uploading a
    // texture for a picture nobody could see, and resuming mid-flight when the
    // layer came back.
    if (!axis || !playing || !visible) return;
    const { first, last, resolve } = axis;

    // Playing. The dissolve is driven straight onto the GPU here; React is
    // told ONLY when the bracketing PAIR changes, which is once per model
    // hour, not once per frame. Calling setPair every frame re-ran this
    // component (and its effects) 60 times a second for a value the picture
    // never read from React in the first place.
    clockRef.current = atMsRef.current ?? Date.now();
    let lastFrame = performance.now();
    let lastTick = 0;
    let shownBefore = "";
    let shownAfter = "";
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(250, now - lastFrame); // a backgrounded tab must not leap
      lastFrame = now;
      // dt is ms of wall time; 3_600_000 ms of model time per hour
      let ms =
        (clockRef.current ?? Date.now()) +
        (dt / 1000) * PLAY_HOURS_PER_SEC * 3_600_000;
      if (ms >= last) ms = first; // loop rather than stopping dead at the end
      clockRef.current = ms;

      const p = resolve(ms);
      shownMsRef.current = ms;
      renderFrame({ keepPlaying: true });
      if (p.before !== shownBefore || p.after !== shownAfter) {
        shownBefore = p.before;
        shownAfter = p.after;
        setPair(p); // new pair: fetch + rasterise, once per model hour
      }
      if (now - lastTick > TICK_MS) {
        lastTick = now;
        onTick?.(ms);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [axis, playing, visible, onTick, renderFrame]);

  // ---- fetch + rasterise the two steps in play ---------------------------

  useEffect(() => {
    if (!index || !pair) return;
    let cancelled = false;
    const prefix = index.steps ?? "air/t";
    const expected = index.pm.nx * index.pm.ny;

    const fetchStep = async (key: string): Promise<AirStep | null> => {
      const hit = stepsRef.current.get(key);
      if (hit) return hit;
      const r = await fetch(
        `/${prefix}/${encodeURIComponent(key)}.json`.replace("//", "/"),
      );
      if (!r.ok) return null;
      const step = (await r.json()) as AirStep;
      if (step.pm25?.length !== expected) {
        // a stale file against a fresh index would silently misplace every row
        console.warn(
          `[air] step ${key} has ${step.pm25?.length} values, index expects ${expected} — ignoring`,
        );
        return null;
      }
      stepsRef.current.set(key, step);
      return step;
    };

    // full detail when still, half the samples per cell while playing
    const fullSub = subsampleFor(index.pm.nx, index.pm.ny);
    const sub = playing
      ? Math.max(2, Math.round(fullSub / PLAY_SUB_DIVISOR))
      : fullSub;

    /** rasterise once per step per detail level; this is the 54 ms to avoid */
    const canvasFor = (key: string, step: AirStep): HTMLCanvasElement | null => {
      // the detail level is part of the identity: the same hour at play detail
      // and at still detail are different pictures
      const ck = `${key}@${sub}`;
      const hit = rastersRef.current.get(ck);
      if (hit) return hit;
      const [west, south, east, north] = index.bbox;
      const r = rasteriseGrid(
        { ...index.pm, values: step.pm25 },
        { west, south, east, north },
        (pm25) => usAqiFromPm25(pm25)?.aqi ?? 0,
        sub,
      );
      if (!r) return null;
      if (rastersRef.current.size >= MAX_RASTERS) {
        // drop the oldest; Map keeps insertion order
        const oldest = rastersRef.current.keys().next().value;
        if (oldest) rastersRef.current.delete(oldest);
      }
      rastersRef.current.set(ck, r.canvas);
      return r.canvas;
    };

    void (async () => {
      const [a, b] = await Promise.all([
        fetchStep(pair.before),
        pair.after === pair.before ? null : fetchStep(pair.after),
      ]);
      if (cancelled || !a) return;

      // The picture. Rasterising is the expensive step and happens once per
      // model hour; from here on the dissolve is a blit between two canvases
      // we already hold.
      if (map) {
        const ca = canvasFor(pair.before, a);
        const cb = b ? canvasFor(pair.after, b) : ca;
        if (ca && cb) {
          pairCanvasRef.current = {
            a: ca,
            b: cb,
            aKey: pair.before,
            bKey: pair.after,
          };
          // Size the compose canvas from FULL detail, always. A canvas
          // source binds its texture size when it is created, so letting the
          // canvas shrink on play and grow on pause would mean tearing the
          // source down twice a session. The play-detail raster is simply
          // drawn scaled up into it — a blit, not a resample.
          const playSub = Math.max(2, Math.round(fullSub / PLAY_SUB_DIVISOR));
          attach(
            map,
            index.bbox,
            (index.pm.nx - 1) * fullSub,
            (index.pm.ny - 1) * fullSub,
            (index.pm.nx - 1) * playSub,
            (index.pm.ny - 1) * playSub,
          );
          renderFrame({ keepPlaying: playing });
        }
      }

      // The numbers: a real value-space blend, which is what the click popup
      // quotes and what the particles fly through. Recomputed only when the
      // pair changes — mid-fade the readout is at most an hour's drift, and
      // the popup states the hour it belongs to.
      const mix = (
        p1: (number | null)[],
        p2: (number | null)[] | undefined,
      ): (number | null)[] =>
        p2 && pair.frac > 0
          ? p1.map((v, i) => {
              const w = p2[i];
              return v == null || w == null
                ? null
                : Math.round(v + pair.frac * (w - v));
            })
          : p1;

      /**
       * u and v only — 2,205 nodes each, and the particles genuinely need one
       * array to fly through.
       *
       * pm25 is deliberately NOT blended. It is 83,076 nodes, and .map() over
       * it allocated a fresh array of that size once per model hour: on the
       * exact frame the boundary lands, on top of the rasterise. That was the
       * stutter — 250 ms spikes against a 17 ms budget. Nothing needed it
       * either: the picture comes from the cross-faded canvases, and the only
       * other reader is the click popup, which now interpolates two sampled
       * numbers instead of a whole grid.
       */
      const blended: AirStep = b
        ? {
            pm25: a.pm25,
            u: mix(a.u, b.u),
            v: mix(a.v, b.v),
            maxSpeed: a.maxSpeed + pair.frac * (b.maxSpeed - a.maxSpeed),
          }
        : a;

      readRef.current = {
        a: a.pm25,
        b: b?.pm25 ?? null,
        aKey: pair.before,
        bKey: pair.after,
      };

      const shownMs =
        msOf(pair.before) +
        pair.frac * (msOf(pair.after) - msOf(pair.before));
      setProv({ between: [pair.before, pair.after], runAt: index.runAt ?? null });
      setGrid({
        bbox: index.bbox,
        pm25: { ...index.pm, values: blended.pm25 },
        u: { ...index.wind, values: blended.u },
        v: { ...index.wind, values: blended.v },
        maxSpeed: blended.maxSpeed,
        validAt: new Date(shownMs).toISOString().slice(0, 16),
        attribution: index.attribution,
      });

      /**
       * Look one step ahead, and RASTERISE it too.
       *
       * Fetching early was never the problem; the 54 ms rasterise was, because
       * it fell on the frame the boundary landed. Doing it now — while the
       * current hour is still dissolving, with a whole model hour of slack —
       * moves that work off the boundary entirely, so the swap becomes a
       * pointer change.
       *
       * It waits for an idle moment so the pre-work cannot itself become the
       * hitch it exists to prevent. Only ever ONE step ahead, so idle
       * scrubbing cannot quietly pull and rasterise the whole series.
       */
      const sorted = [...index.times].sort((x, y) => msOf(x) - msOf(y));
      const next = sorted[sorted.indexOf(pair.after) + 1];
      if (next) {
        void (async () => {
          const step = await fetchStep(next);
          if (cancelled || !step || rastersRef.current.has(`${next}@${sub}`)) return;
          // NOT requestIdleCallback: with rAF running every frame the browser
          // is never idle, so it only fired on its 2 s timeout — about three
          // model hours late, long after the boundary it was meant to cover.
          // A short timer lands it mid-fade, where there is slack.
          setTimeout(() => {
            if (!cancelled) canvasFor(next, step);
          }, 120);
        })();
      }
    })();

    return () => {
      cancelled = true;
    };
    // `frac` deliberately excluded: it changes every frame and would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, map, pair?.before, pair?.after, attach, renderFrame, visible, playing]);

  // ---- the single field layer --------------------------------------------

  useEffect(() => {
    onStatus?.(
      visible && grid
        ? {
            validAt: grid.validAt,
            between: prov.between,
            runAt: prov.runAt,
            attribution: grid.attribution,
          }
        : null,
    );
  }, [visible, grid, prov, onStatus]);

  // keep visibility in step without rebuilding anything
  // Hiding is unconditional; showing goes through renderFrame, which knows
  // which of the two detail layers is the live one.
  useEffect(() => {
    if (!map) return;
    if (!visible) {
      for (const id of [LAYER_STILL, LAYER_PLAY]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      }
      return;
    }
    renderFrame({ keepPlaying: playing });
  }, [map, visible, grid, playing, renderFrame]);

  // remove the layer on unmount, so a style change cannot orphan it
  useEffect(() => {
    return () => {
      const m = map;

      // Map instance may still exist while its style is being torn down.
      if (!m || !m.isStyleLoaded()) return;

      try {
        for (const [layerId, srcId] of [
          [LAYER_STILL, SRC_STILL],
          [LAYER_PLAY, SRC_PLAY],
        ] as const) {
          if (m.getLayer(layerId)) {
            m.removeLayer(layerId);
          }

          if (m.getSource(srcId)) {
            m.removeSource(srcId);
          }
        }
      } catch {
        // Map/style was destroyed or replaced during cleanup.
      }
    };
  }, [map]);

  // ---- wind particles, on a canvas over the map ---------------------------

  useEffect(() => {
    if (!map || !container || !grid || !visible) return;

    /**
     * The sampler follows the field, but the ANIMATION must not restart when it
     * does. Rebuilding this effect per model hour reseeded all 5,200 particles
     * mid-flight, which during playback is a flicker once per step rather than
     * wind. So the effect keys on the map and the layer's visibility only, and
     * the sampler is swapped in place the frame after the grid changes.
     */
    let samplerFor: AirGridData | null = null;
    let sampler = new WindSampler(gridRef.current ?? grid);
    const syncSampler = () => {
      const g = gridRef.current;
      if (!g || g === samplerFor) return;
      samplerFor = g;
      sampler = new WindSampler(g);
      rescale(); // maxSpeed changed, so the px-per-frame scale must follow
    };
    const canvas = document.createElement("canvas");
    canvas.className = "pointer-events-none absolute inset-0 z-[5]";
    container.appendChild(canvas);
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    let moving = false;

    const seed = (p: Particle) => {
      const [w, s, e, n] = grid.bbox;
      // seed across the visible map, not the whole field: at city zoom almost
      // every particle would otherwise spawn off-screen and never be seen
      const b = map.getBounds();
      const west = Math.max(w, b.getWest());
      const east = Math.min(e, b.getEast());
      const south = Math.max(s, b.getSouth());
      const north = Math.min(n, b.getNorth());
      p.lon = west + Math.random() * Math.max(0.001, east - west);
      p.lat = south + Math.random() * Math.max(0.001, north - south);
      p.age = Math.floor(Math.random() * MAX_AGE);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth: cw, clientHeight: ch } = container;
      canvas.width = Math.max(1, Math.round(cw * dpr));
      canvas.height = Math.max(1, Math.round(ch * dpr));
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    particles = Array.from({ length: PARTICLE_COUNT }, () => {
      const p: Particle = { lon: 0, lat: 0, age: 0 };
      seed(p);
      return p;
    });

    const clear = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    };

    const onMoveStart = () => {
      moving = true;
      clear();
    };
    const onMoveEnd = () => {
      moving = false;
      rescale(); // a new zoom means a new pixels-per-degree
      for (const p of particles) seed(p);
    };
    map.on("movestart", onMoveStart);
    map.on("moveend", onMoveEnd);
    const ro = new ResizeObserver(() => {
      resize();
      rescale();
      clear();
    });
    ro.observe(container);

    /**
     * Degrees per frame per (m/s), recomputed whenever the view changes so a
     * streak covers the same distance on screen at every zoom.
     */
    let degPerStep = 0;
    // hoisted so syncSampler (declared above) can call it; a function
    // declaration does not carry the null-narrowing of the guard above, so the
    // map and container are captured explicitly
    const theMap = map;
    const theBox = container;
    function rescale() {
      const b = theMap.getBounds();
      const span = b.getEast() - b.getWest();
      const degPerPx = span / Math.max(1, theBox.clientWidth);
      degPerStep = (TARGET_PX_PER_FRAME * degPerPx) / sampler.maxSpeed;
    }
    rescale();

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      if (moving) return;
      syncSampler();

      const { clientWidth: cw, clientHeight: ch } = container;
      // fade rather than clear: the residue of previous frames IS the streak
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0,0,0,${FADE})`;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = "source-over";

      // thin and faint: the flowing texture comes from thousands of overlapping
      // strands, not from any one being bold
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.beginPath();

      for (const p of particles) {
        const uv = sampler.sample(p.lon, p.lat);
        if (!uv || p.age++ > MAX_AGE) {
          seed(p);
          continue;
        }
        const from = map.project([p.lon, p.lat]);
        // longitude degrees shrink with latitude; without this, particles far
        // from the equator drift visibly faster than those on it
        const cos = Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
        p.lon += (uv[0] * degPerStep) / cos;
        p.lat += uv[1] * degPerStep;
        const to = map.project([p.lon, p.lat]);

        // a particle blown off-screen is wasted; recycle it next frame
        if (to.x < -50 || to.x > cw + 50 || to.y < -50 || to.y > ch + 50) {
          p.age = MAX_AGE + 1;
          continue;
        }
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      }
      ctx.stroke();
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      map.off("movestart", onMoveStart);
      map.off("moveend", onMoveEnd);
      ro.disconnect();
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map, container, hasGrid, visible]);

  // ---- click to read the field at a point -------------------------------

  useEffect(() => {
    if (!map || !grid || !visible) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      /**
       * Sample BOTH steps and interpolate the two numbers, rather than reading
       * a pre-blended grid. Same answer, but the blend costs two samples here
       * instead of 83,076 multiply-adds on every model hour.
       *
       * The fraction is measured against the steps actually held, exactly as
       * the picture is, so the number and the colour under the cursor always
       * agree even while the next hour is still loading.
       */
      const rd = readRef.current;
      const meta = grid.pm25;
      const pmA = rd.a ? sampleLayer({ ...meta, values: rd.a }, grid.bbox, lng, lat) : null;
      const pmB = rd.b ? sampleLayer({ ...meta, values: rd.b }, grid.bbox, lng, lat) : null;
      const rt0 = rd.aKey ? Date.parse(`${rd.aKey}:00Z`) : 0;
      const rt1 = rd.bKey ? Date.parse(`${rd.bKey}:00Z`) : 0;
      const rf =
        rt1 > rt0
          ? Math.min(1, Math.max(0, (shownMsRef.current - rt0) / (rt1 - rt0)))
          : 0;
      const pm =
        pmA != null && pmB != null ? pmA + rf * (pmB - pmA) : (pmA ?? pmB);
      if (pm == null) return; // outside the modelled box: say nothing

      const a = usAqiFromPm25(pm);
      const u = sampleLayer(grid.u, grid.bbox, lng, lat);
      const v = sampleLayer(grid.v, grid.bbox, lng, lat);
      const speed = u != null && v != null ? Math.hypot(u, v) : null;

      const rows: string[] = [
        `<div style="font-size:1.35rem;line-height:1.1;font-weight:600">${
          a ? a.aqi : "—"
        }<span style="font-size:.7rem;font-weight:400;opacity:.7"> AQI</span></div>`,
        `<div style="font-weight:600;margin-bottom:.35rem">${
          a ? t(`aqiCategory.${a.category}`) : ""
        }${a?.extrapolated ? ` <span style="opacity:.65;font-weight:400">(${t("aqiBeyondScale")})</span>` : ""}</div>`,
        `<div>PM2.5 <strong>${pm.toFixed(1)}</strong> µg/m³</div>`,
      ];
      if (speed != null && u != null && v != null) {
        rows.push(
          `<div>${t("windLabel")} <strong>${speed.toFixed(1)}</strong> m/s ${t(
            "windFrom",
          )} ${fromDirection(u, v)}</div>`,
        );
      }
      rows.push(
        `<div style="opacity:.7;margin-top:.35rem">${lat.toFixed(3)}°, ${lng.toFixed(3)}°</div>`,
        // never let a reading be mistaken for a measurement
        `<div style="opacity:.7;margin-top:.3rem;max-width:15rem">${t("popupNote")}</div>`,
      );

      new maplibre.Popup({ closeButton: true, maxWidth: "17rem" })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:.78rem;line-height:1.4">${rows.join("")}</div>`,
        )
        .addTo(map);
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, grid, visible, t]);

  return null;
}
