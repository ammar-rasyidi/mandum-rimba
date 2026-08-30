"use client";

import { useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import { usAqiFromPm25 } from "@mandumrimba/shared";
import { API_BASE } from "@/lib/api";
import { rasteriseGrid, WindSampler, type AirGridData } from "@/lib/air-field";

/**
 * Udara & asap, the animated layer: a PM2.5 colour field with the 10 m wind
 * drawn through it as moving particles, so a plume reads as something going
 * somewhere rather than a static stain.
 *
 * Two different mechanisms on purpose:
 *  - the colour field is a real MapLibre ImageSource, so it sits UNDER the
 *    data layers in the normal z-order and pans/zooms with the map for free;
 *  - the particles are a plain 2D canvas over the map. They are ephemeral and
 *    screen-space, so putting them in the GL layer stack would buy nothing and
 *    cost a custom WebGL layer's worth of state juggling.
 *
 * Particles are cleared (not reprojected) while the map moves. Reprojecting
 * mid-gesture smears every trail across the screen; a clean restart on moveend
 * reads better and costs one frame.
 */

const FIELD_SRC = "src-air-pm25";
const FIELD_LAYER = "lyr-air-pm25";

const PARTICLE_COUNT = 5200;
/**
 * Screen pixels per frame for the FASTEST wind in the field; everything else
 * scales below it. Advecting in degrees instead — the obvious first try — makes
 * the streaks collapse to dots when you zoom out, because a degree becomes a
 * fraction of a pixel. Speed has to be expressed in what the eye measures.
 *
 * Kept slow enough to read as weather rather than as an effect, but not so slow
 * that streak length has to be bought with a long fade — see FADE.
 */
const TARGET_PX_PER_FRAME = 1.6;
/** frames before a particle is recycled, so the field keeps reseeding */
const MAX_AGE = 140;
/**
 * Alpha of the wash that erases old frames. It sets two things at once, and the
 * second is easy to miss: streak LENGTH is roughly speed ÷ fade, but so is how
 * long a strand lingers after the thing that drew it has moved on.
 *
 * At 0.016 a trail was still 5% visible ~190 frames later — about three
 * seconds — so the picture kept drifting under its own residue and the field's
 * apparent colour shifted as white built up over it. 0.06 clears in well under
 * a second; the speed above is raised to keep strands a similar length.
 */
const FADE = 0.06;

interface AirIndex {
  bbox: [number, number, number, number];
  pm: { nx: number; ny: number; step: number };
  wind: { nx: number; ny: number; step: number };
  /** UTC wall-clock hours, e.g. "2026-08-30T09:00" */
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

export interface AirFieldProps {
  map: maplibregl.Map | null;
  /** the map's positioned container; the particle canvas is appended here */
  container: HTMLElement | null;
  visible: boolean;
  /** paint the layer under this one, so points and polygons stay on top */
  beforeId?: string;
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
 *
 * With a CARTO key the labels are baked into the basemap tiles themselves, so
 * there is nothing to sit under; transparency is the only lever there, which is
 * why the alpha ramp does the real work in both cases.
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

export default function AirField({
  map,
  container,
  visible,
  beforeId,
  onStatus,
}: AirFieldProps) {
  const [grid, setGrid] = useState<AirGridData | null>(null);
  const [prov, setProv] = useState<{
    between: [string, string] | null;
    runAt: string | null;
  }>({ between: null, runAt: null });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // ---- data ---------------------------------------------------------------

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let gridRetry: ReturnType<typeof setTimeout> | undefined;

    /**
     * The field is a static file on R2, rebuilt twice a day by Modal
     * (scripts/air-field) and served through the same-origin /air/* rewrite —
     * so a page load costs two small CDN requests and never touches a weather
     * API. The index lists the published time steps; we pull only the one
     * nearest to now, which keeps the payload at tens of kB rather than the
     * megabyte a full time cube would cost.
     *
     * The old /v1/air/field endpoint stays as a fallback for the window before
     * the first Modal run has published anything.
     */
    const loadFromCdn = async (): Promise<boolean> => {
      const idxRes = await fetch("/air/index.json", { cache: "no-cache" });
      if (!idxRes.ok) return false;
      const idx = (await idxRes.json()) as AirIndex;
      if (!idx?.times?.length) return false;

      // The series is 3-hourly, so no step is "now". Picking the nearest one
      // meant the map could show a step up to 1.5 h AHEAD and label it as
      // current — a forecast presented as an observation. Instead, take the two
      // steps that bracket now and blend them, which is what every weather
      // viewer does and what makes the label honest: the field really is valid
      // at the moment it claims.
      const now = Date.now();
      const ms = (t: string) => Date.parse(`${t}:00Z`);
      const sorted = [...idx.times].sort((a, b) => ms(a) - ms(b));

      let before = sorted[0];
      let after = sorted[0];
      for (const t of sorted) {
        if (ms(t) <= now) before = t;
        if (ms(t) >= now) {
          after = t;
          break;
        }
      }
      // now beyond the last published step: hold the last one rather than
      // extrapolating off the end of the forecast
      if (ms(after) < now) after = sorted[sorted.length - 1];

      const span = ms(after) - ms(before);
      const frac =
        span > 0 ? Math.min(1, Math.max(0, (now - ms(before)) / span)) : 0;

      const prefix = idx.steps ?? "air/t";
      const load = async (t: string) => {
        const r = await fetch(
          `/${prefix}/${encodeURIComponent(t)}.json`.replace("//", "/"),
        );
        return r.ok ? ((await r.json()) as AirStep) : null;
      };
      const [a, bStep] = await Promise.all([
        load(before),
        before === after ? Promise.resolve(null) : load(after),
      ]);
      if (!a) return false;
      if (cancelled) return true;

      /** blend two value arrays; a gap in either stays a gap */
      const mix = (
        p1: (number | null)[],
        p2: (number | null)[] | undefined,
      ): (number | null)[] =>
        p2 && frac > 0
          ? p1.map((v, i) => {
              const w = p2[i];
              return v == null || w == null
                ? null
                : Math.round(v + frac * (w - v));
            })
          : p1;

      const step: AirStep = bStep
        ? {
            pm25: mix(a.pm25, bStep.pm25),
            u: mix(a.u, bStep.u),
            v: mix(a.v, bStep.v),
            maxSpeed: a.maxSpeed + frac * (bStep.maxSpeed - a.maxSpeed),
          }
        : a;

      // the hour the blend actually represents: now, to the minute
      const validNow = new Date(now).toISOString().slice(0, 16);
      setProv({
        between: bStep ? [before, after] : [before, before],
        runAt: idx.runAt ?? null,
      });

      const expected = idx.pm.nx * idx.pm.ny;
      if (step.pm25?.length !== expected) {
        // a mismatch here means a stale file against a fresh index; rendering
        // it would silently misplace every row rather than fail
        console.warn(
          `[air] step has ${step.pm25?.length} values, index expects ${expected} — ignoring`,
        );
        return false;
      }

      setGrid({
        bbox: idx.bbox,
        pm25: { ...idx.pm, values: step.pm25 },
        u: { ...idx.wind, values: step.u },
        v: { ...idx.wind, values: step.v },
        maxSpeed: step.maxSpeed,
        validAt: validNow,
        attribution: idx.attribution,
      });
      return true;
    };

    const loadGrid = async () => {
      try {
        if (await loadFromCdn()) return;
      } catch {
        // fall through to the API
      }
      try {
        const res = await fetch(`${API_BASE}/v1/air/field`);
        const json = (await res.json()) as
          (AirGridData & { warming?: boolean }) | null;
        if (cancelled) return;
        // a cold backend answers `warming` rather than holding the connection
        // open past the function timeout; come back for it
        if (!json || json.warming) {
          gridRetry = setTimeout(loadGrid, 8000);
          return;
        }
        setGrid(json);
      } catch {
        /* the colour field and particles simply do not start */
      }
    };

    void loadGrid();
    return () => {
      cancelled = true;
      if (gridRetry) clearTimeout(gridRetry);
    };
  }, [visible]);

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

  // ---- PM2.5 colour field, as a MapLibre ImageSource ----------------------

  useEffect(() => {
    if (!map || !grid) return;

    const [west, south, east, north] = grid.bbox;
    const raster = rasteriseGrid(
      grid.pm25,
      { west, south, east, north },
      (pm25) => usAqiFromPm25(pm25)?.aqi ?? 0,
    );
    if (!raster) return;

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

    let done = false;
    const add = (): boolean => {
      if (done) return true;
      const url = raster.canvas.toDataURL("image/png");
      const existing = map.getSource(FIELD_SRC) as
        maplibregl.ImageSource | undefined;
      if (existing) {
        existing.updateImage({ url, coordinates });
      } else {
        map.addSource(FIELD_SRC, { type: "image", url, coordinates });
        map.addLayer(
          {
            id: FIELD_LAYER,
            type: "raster",
            source: FIELD_SRC,
            paint: {
              // ONE dial, in the alpha channel. A second global multiplier here
              // would fight the per-pixel severity ramp and make the result
              // impossible to reason about.
              "raster-opacity": 0.45,
              "raster-fade-duration": 0,
            },
          },
          // Under the basemap's labels, not on top of everything. Added with
          // no beforeId the raster lands at the top of the stack and buries
          // every place name — which is what it did. Anchoring to the first
          // symbol layer keeps city names crisp at any opacity, so the field's
          // strength and the map's legibility stop competing.
          labelAnchor(map, beforeId),
        );
      }
      map.setLayoutProperty(
        FIELD_LAYER,
        "visibility",
        visible ? "visible" : "none",
      );
      done = true;
      return true;
    };

    /**
     * Do NOT gate this on isStyleLoaded() or wait for `styledata`/`idle`. The
     * map keeps retrying any tileset that 404s, so on a deployment where one
     * PMTiles object is missing it never goes idle and the layer silently never
     * appears — which is exactly how this failed the first time. The component
     * only mounts after the map's own load handler has run, so the style is
     * ready; just attempt the add and retry briefly if MapLibre disagrees.
     */
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      try {
        if (add()) return;
      } catch {
        // style not ready yet
      }
      if (++tries < 20) timer = setTimeout(attempt, 250);
    };
    attempt();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [map, grid, visible, beforeId]);

  // keep visibility in step without rebuilding the raster
  useEffect(() => {
    if (!map || !map.getLayer(FIELD_LAYER)) return;
    map.setLayoutProperty(
      FIELD_LAYER,
      "visibility",
      visible ? "visible" : "none",
    );
  }, [map, visible, grid]);

  // remove the layer entirely on unmount, so a style change cannot orphan it
  useEffect(() => {
    return () => {
      if (!map) return;
      if (map.getLayer(FIELD_LAYER)) map.removeLayer(FIELD_LAYER);
      if (map.getSource(FIELD_SRC)) map.removeSource(FIELD_SRC);
    };
  }, [map]);

  // ---- wind particles, on a canvas over the map ---------------------------

  useEffect(() => {
    if (!map || !container || !grid || !visible) return;

    const sampler = new WindSampler(grid);
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
    const rescale = () => {
      const b = map.getBounds();
      const span = b.getEast() - b.getWest();
      const degPerPx = span / Math.max(1, container.clientWidth);
      degPerStep = (TARGET_PX_PER_FRAME * degPerPx) / sampler.maxSpeed;
    };
    rescale();

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      if (moving) return;

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
  }, [map, container, grid, visible]);

  return null;
}
