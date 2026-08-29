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
 * Under 1 px/frame is a deliberate crawl: this is weather, and a field that
 * races across the screen reads as an effect rather than as air moving. Streak
 * LENGTH is set by FADE (roughly speed ÷ fade pixels), so the strands stay
 * long even though they travel slowly.
 */
const TARGET_PX_PER_FRAME = 0.95;
/** frames before a particle is recycled, so the field keeps reseeding */
const MAX_AGE = 300;
/** alpha of the wash that erases old frames: lower = longer streamlines. Paired
 *  with the speed above, this keeps ~60 px strands at a walking pace. */
const FADE = 0.016;

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
    s: { validAt: string | null; attribution: string } | null,
  ) => void;
}

export default function AirField({
  map,
  container,
  visible,
  beforeId,
  onStatus,
}: AirFieldProps) {
  const [grid, setGrid] = useState<AirGridData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // ---- data ---------------------------------------------------------------

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let gridRetry: ReturnType<typeof setTimeout> | undefined;

    const loadGrid = async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/air/field`);
        const json = (await res.json()) as
          (AirGridData & { warming?: boolean }) | null;
        if (cancelled) return;
        // cold backend: the grid is two paced upstream requests, so it answers
        // `warming` rather than holding the connection open. Come back for it.
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
        ? { validAt: grid.validAt, attribution: grid.attribution }
        : null,
    );
  }, [visible, grid, onStatus]);

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
              // the raster carries its own severity-driven alpha; this keeps
              // coastlines and labels legible underneath it
              "raster-opacity": 0.9,
              "raster-fade-duration": 0,
            },
          },
          beforeId && map.getLayer(beforeId) ? beforeId : undefined,
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
