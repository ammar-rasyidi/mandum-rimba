"use client";

import { useEffect, useRef, useState } from "react";
import { type Map as MapLibreMap } from "maplibre-gl";
import { useLocale, useTranslations } from "next-intl";
import { LAYERS } from "@/lib/layers";
import { API_BASE } from "@/lib/api";
import { LOSS_ATTRIBUTION, LOSS_COLOR } from "@/lib/forest-loss";
import StorySocial from "./StorySocial";
import type { Annotation, Bi, PlaceStory } from "./placeStories";

/**
 * A terrain-anchored callout: a glowing dot pinned to the point, and a card that
 * floats free of it on a leader line.
 *
 * The card is deliberately NOT laid out by the document: it is positioned every
 * frame by the solver in the markers effect, which knows each card's real
 * measured size and can push them apart until none overlap and all of them are
 * inside the frame. Predicting any of that ahead of time does not work, because
 * where a card lands depends on terrain elevation, exaggeration and the live
 * camera, so the browser is the only place that knows the truth.
 */
function buildAnnotation(
  a: Annotation,
  en: boolean,
  compact = false,
  /** a phone on its side: one row of callouts is all the sky allows, so they
   *  have to be narrow enough that a beat with six of them still fits across */
  tight = false,
): HTMLDivElement {
  const tx = (b?: Bi) => (b ? (en ? b.en : b.id) : "");
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;left:0;top:0;opacity:0;pointer-events:none;font-family:-apple-system,system-ui,sans-serif;will-change:transform,opacity;";
  // An EXPLICIT width, never max-width. The card is absolutely positioned inside
  // a container that has no size of its own, so a max-width has nothing to
  // resolve against: the shrink-to-fit width collapses to the longest word and
  // every card ends up a tall thin ribbon of broken text.
  const withPhoto = !!a.photo;
  const cardW = compact
    ? withPhoto
      ? tight
        ? // three of these have to sit across a 320px screen, which leaves 292px
          // once the frame padding is off: 88 x 3 plus two 10px gaps is 284
          "width:88px;"
        : "width:124px;"
      : tight
        ? "width:100px;"
        : "width:132px;"
    : a.photo
      ? "width:200px;"
      : "width:270px;";
  el.innerHTML = `
    <div data-lead style="position:absolute;left:0;top:0;height:0;width:0;border-top:1.5px dashed rgba(87,185,138,.85);transform-origin:0 0;pointer-events:none;"></div>
    <div data-dot style="position:absolute;left:0;top:0;width:13px;height:13px;border-radius:50%;background:#57b98a;transform:translate(-50%,-50%);box-shadow:0 0 0 4px rgba(87,185,138,.22),0 0 16px 2px rgba(87,185,138,.85);"></div>
    <div data-card style="position:absolute;left:0;top:0;background:rgba(11,18,14,.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.16);border-radius:12px;overflow:hidden;box-shadow:0 16px 36px -14px #000;will-change:transform;${cardW}">
      ${withPhoto ? `<img src="${a.photo!.src}" alt="${tx(a.title)}" loading="lazy" style="display:block;width:100%;aspect-ratio:${compact ? "16/9" : "4/3"};object-fit:cover;" />` : ""}
      <div style="padding:${compact ? "6px 9px" : "9px 13px"};">
        ${a.value ? `<div style="font:800 ${compact ? ".92rem" : "1.15rem"}/1 -apple-system,system-ui,sans-serif;color:#fff;letter-spacing:-.01em;font-variant-numeric:tabular-nums;">${a.value}</div>` : ""}
        <div style="font:600 ${compact ? ".52rem" : ".6rem"}/1.3 -apple-system,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.14em;color:#7fd6a8;${a.value ? "margin-top:3px;" : ""}">${tx(a.title)}</div>
        ${a.note ? `<div style="font-size:${compact ? ".58rem" : ".68rem"};color:rgba(255,255,255,.72);margin-top:2px;font-style:italic;">${tx(a.note)}</div>` : ""}
        ${!compact && a.sub ? `<div style="font-size:.66rem;color:rgba(255,255,255,.58);margin-top:2px;">${tx(a.sub)}</div>` : ""}
        ${!compact && a.source ? `<div style="font:500 .56rem/1.3 -apple-system,system-ui,sans-serif;color:rgba(255,255,255,.4);margin-top:5px;">${en ? "Source" : "Sumber"}: ${a.source.name}</div>` : ""}
      </div>
    </div>`;
  return el;
}

/* ════════════════════════════════════════════════════════════════════════════
 * THE AEROPLANE
 *
 * We fly the CAMERA, not the map's look-at point. That distinction is the whole
 * design: `center` is where the camera is *aimed* (about 40 km ahead of us at
 * this tilt), so steering it means the world swings around rather than the
 * aircraft turning through it — no amount of banking reads as flight. MapLibre's
 * calculateCameraOptionsFromCameraLngLatAltRotation lets us give a real camera
 * position + attitude and get the centre/zoom back, so here the aircraft flies
 * and the view follows from where its nose is pointing.
 *
 * The route is a spine with a slow left-right weave laid over it, and the bank
 * comes off the actual turn rate — so it leans into each turn the way a plane
 * does, and rolls level on the straights.
 * ════════════════════════════════════════════════════════════════════════════ */
const D2R = Math.PI / 180;
const M_PER_DEG_LAT = 110540;
const mPerDegLng = (lat: number) => 111320 * Math.cos(lat * D2R);

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** uniform Catmull-Rom through p1→p2 (p0/p3 are the neighbouring waypoints) */
const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
};

/** compass heading (deg) from one point to the next */
const headingTo = (
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
) =>
  Math.atan2(
    (b.lng - a.lng) * mPerDegLng(b.lat),
    (b.lat - a.lat) * M_PER_DEG_LAT,
  ) / D2R;

/** a Catmull-Rom curve through the points, resampled to constant ground speed */
function makePath(pts: [number, number][]) {
  const n = pts.length;
  const P = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
  const SEG = 260; // dense: a coarse table makes the speed visibly step
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = P(i - 1);
    const b = P(i);
    const c = P(i + 1);
    const d = P(i + 2);
    for (let s = 0; s < SEG; s++) {
      const t = s / SEG;
      xs.push(catmull(a[0], b[0], c[0], d[0], t));
      ys.push(catmull(a[1], b[1], c[1], d[1], t));
    }
  }
  xs.push(P(n - 1)[0]);
  ys.push(P(n - 1)[1]);
  const cum = [0];
  for (let i = 1; i < xs.length; i++) {
    const dx = (xs[i] - xs[i - 1]) * mPerDegLng(ys[i]);
    const dy = (ys[i] - ys[i - 1]) * M_PER_DEG_LAT;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const total = cum[cum.length - 1] || 1;
  const at = (f: number) => {
    const target = clamp01(f) * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= target) lo = mid;
      else hi = mid;
    }
    const k = (target - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return {
      lng: xs[lo] + (xs[hi] - xs[lo]) * k,
      lat: ys[lo] + (ys[hi] - ys[lo]) * k,
    };
  };
  return { at, total };
}

/** the lng/lat box a fetched park outline occupies */
function geometryBounds(
  g: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [[number, number], [number, number]] {
  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  const scan = (ring: GeoJSON.Position[]) => {
    for (const [x, y] of ring) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  };
  if (g.type === "Polygon") g.coordinates.forEach(scan);
  else g.coordinates.forEach((poly) => poly.forEach(scan));
  return [
    [w, s],
    [e, n],
  ];
}

const AIR = {
  PITCH_MIN: 58,
  PITCH_MAX: 84,
  /** put the callout's anchor dot this far below the middle of the frame, so the
   *  card body — which hangs above the dot — sits centred and readable */
  DOT_BELOW_CENTRE: 0.14,
  ALT: 4600, // cruise altitude (m) over the lowlands...
  ALT_END: 8200, // ...climbing for the summit, which stands 3.404 m up
  /** start easing the aim across to the next callout this far before arriving at
   *  the current one, so the aeroplane begins its turn before it gets there */
  HANDOVER: 0.6,
  K_BANK: 1.4, // degrees of bank per degree-per-second of turn
  MAX_BANK: 12, // an airliner's lazy lean, not a fighter break
  /** Time constants, in seconds, for the three attitude filters. Nothing about
   *  the aeroplane's attitude may change abruptly, so every one of them is slow:
   *  the heading lag is what makes a turn read as a turn, and the tilt filter is
   *  what stops the nose snatching as a callout comes up. */
  HDG_TAU: 1.3,
  ROLL_TAU: 1.8,
  PITCH_TAU: 2.2,
  /** The speed profile: starts from rest, opens up, settles back to rest. It
   *  MUST reach zero at both ends. A floor above zero looks gentler on paper,
   *  but the flight then halts while it is still moving, which is an infinitely
   *  hard stop and the worst jolt in the whole sequence. The long ease is what
   *  keeps the acceleration itself mild. Zero here means the flight genuinely
   *  comes to rest on the summit. */
  SLOW_MIN: 0,
  EASE: 0.36,
  /** How far short of the final aim the aeroplane stops, in metres. Flying all
   *  the way ONTO the summit ends the story looking straight down at it; holding
   *  off leaves it standing in the middle of the frame. */
  ARRIVE_BACK: 21000,
  /** roll out over the last of the flight, so the wings are already level when
   *  the story hands over to the next beat */
  OUTRO: 0.14,
  /** In flight, a callout is revealed once its point comes within this range of
   *  what the camera is looking at. It is not about decluttering: it is about
   *  the DOT. Reveal a card too early and its point is still a speck on the
   *  horizon, so the card sits there tethered to nothing. At this range each
   *  card appears just as its dot lands on terrain you can actually see, and
   *  every card still gets 17 to 31 seconds on screen. */
  FAR: 55000,
  FAR_FADE: 20000,
};

/** Screen-space layout for the closing biodiversity montage: scattered tiles
 *  (top/left %, width px, rotation deg, entrance delay ms). Kept clear of the
 *  bottom-centre where the fact card sits. */
const GALLERY_TILES = [
  { t: 15, l: 5, w: 196, r: -6, d: 0 },
  { t: 17, l: 27, w: 156, r: 4, d: 140 },
  { t: 13, l: 48, w: 176, r: -3, d: 280 },
  { t: 16, l: 68, w: 156, r: 6, d: 420 },
  { t: 14, l: 85, w: 182, r: -7, d: 560 },
  { t: 37, l: 4, w: 166, r: 5, d: 220 },
  { t: 40, l: 22, w: 148, r: -5, d: 360 },
  { t: 36, l: 85, w: 170, r: 4, d: 300 },
  { t: 39, l: 64, w: 150, r: -4, d: 500 },
  { t: 55, l: 7, w: 168, r: -5, d: 340 },
  { t: 57, l: 86, w: 160, r: 6, d: 460 },
  { t: 36, l: 44, w: 150, r: -3, d: 640 },
  { t: 56, l: 27, w: 144, r: 5, d: 620 },
  { t: 55, l: 67, w: 150, r: -6, d: 700 },
];

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
  const [isCompact, setIsCompact] = useState(false); // small OR short viewport
  /** barely any height to work with: a phone on its side. The decorative rows
   *  come off so the story itself still fits instead of spilling over the top. */
  const [isShort, setIsShort] = useState(false);
  /** enough width to sit the player beside the words rather than under them.
   *  Below this the info column would be about 160px, which is too narrow to
   *  read a paragraph in. */
  const [sideBySide, setSideBySide] = useState(false);
  /** small in EITHER direction. Callouts get the narrow build here: a 320px
   *  screen cannot take three of the wider ones across, and stacking more rows
   *  instead runs out of sky. */
  const [isTight, setIsTight] = useState(false);
  /** phone held upright. Landscape genuinely suits this story better, so we say
   *  so, but as a hint that can be waved away rather than the full-screen gate
   *  that used to sit here: that blocked the story outright on a phone held the
   *  way phones are held. */
  const [portraitPhone, setPortraitPhone] = useState(false);
  const [hintGone, setHintGone] = useState(false);
  const [playing, setPlaying] = useState(true); // story autoplay — on by default
  const [soundOn, setSoundOn] = useState(!!(story.sound || story.music));
  const audioRef = useRef<HTMLAudioElement[]>([]);
  // the real WDPA park outline (fetched); falls back to the offline polygon
  const [boundaryGeom, setBoundaryGeom] = useState<
    GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  >(story.boundaryQuery ? null : story.boundary ?? null);
  /** our own screen-space layer for the terrain callouts (see the markers effect
   *  for why these aren't maplibregl.Markers) */
  const overlay = useRef<HTMLDivElement | null>(null);
  /** latest fetched park outline, so fly() never reads a stale one */
  const boundaryRef = useRef<GeoJSON.Polygon | GeoJSON.MultiPolygon | null>(null);
  /** the bottom sheet, measured so callouts can be kept clear of whatever height
   *  it actually is rather than of a guessed reserve */
  const sheetRef = useRef<HTMLDivElement>(null);
  const glideRaf = useRef<number | null>(null);
  // true once the loss timeline has genuinely advanced past the first year this
  // beat (so a stale end-year value can't auto-skip the animation)
  const lossRan = useRef(false);
  const last = story.chapters.length - 1;

  /**
   * Frame a beat on the park outline instead of on center/zoom. Padding keeps
   * the outline clear of the fact card along the bottom and of the chrome
   * elsewhere, so it lands as large as it will go in the space that is actually
   * free, at any window size. Returns false if there is nothing to fit yet.
   */
  const fitBoundary = (ch: PlaceStory["chapters"][number], duration: number) => {
    const map = mapRef.current;
    if (!map || !ch.cam.fitBoundary) return false;
    // The fetched outline is the real thing; the story's own bounds stand in
    // until it lands, and for good if the request fails. Either way the beat is
    // FITTED rather than falling back to a hand-set zoom, which is what kept
    // getting this wrong.
    const box: [[number, number], [number, number]] = boundaryRef.current
      ? geometryBounds(boundaryRef.current)
      : [
          [story.bounds[0], story.bounds[1]],
          [story.bounds[2], story.bounds[3]],
        ];
    const h = map.getContainer().clientHeight || 800;
    const w = map.getContainer().clientWidth || 1200;
    const fitted = map.cameraForBounds(box, {
      padding: {
        top: Math.min(90, h * 0.12),
        bottom: h * 0.36, // the fact card
        left: Math.min(56, w * 0.06),
        right: Math.min(56, w * 0.06),
      },
      bearing: ch.cam.bearing,
      pitch: ch.cam.pitch,
    });
    if (!fitted) return false;
    map.easeTo({
      ...fitted,
      pitch: ch.cam.pitch,
      roll: 0,
      duration,
      easing: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
      essential: true,
    });
    return true;
  };

  const fly = (i: number) => {
    setIdx(i);
    const ch = story.chapters[i];
    // every beat shows EXACTLY its layers; a beat with none clears them all so
    // the satellite terrain stays clean (no leftovers from a previous beat/view)
    onSetLayers?.(ch.layers ?? []);
    onAnimateLoss?.(!!ch.animateLoss);
    const map = mapRef.current;
    if (!map) return;
    // Leaving the flown opening means moving from an aeroplane's attitude (high
    // up, tilted right over toward the horizon) to a map vantage, which is a big
    // change and reads as a lurch on the default curve. This easing is flat at
    // both ends, so the camera creeps away from the summit, does the work in the
    // middle, and settles rather than arriving still moving. Kept brisk: the
    // curve is what makes it smooth, dragging it out just makes it feel stuck.
    const glide = (x: number) =>
      x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    const fromFlight = i === 1 && !!story.chapters[0].cam.air;
    const cam = {
      center: ch.cam.center,
      zoom: ch.cam.zoom,
      pitch: ch.cam.pitch,
      bearing: ch.cam.bearing,
      roll: 0, // level the wings, only the opening fly-through banks
      duration: (ch.cam.duration ?? 5000) * (fromFlight ? 0.8 : 1),
      easing: glide,
      essential: true,
    };
    if (glideRaf.current) {
      cancelAnimationFrame(glideRaf.current);
      glideRaf.current = null;
    }
    // FIT THE PARK, if this beat asks for it.
    if (fitBoundary(ch, cam.duration)) return;

    // FIT THE CALLOUTS on a small screen. Every beat's zoom was set against a
    // 1440x810 desktop, where the frame reaches 405px from the centre. A phone
    // reaches 187px at the same zoom, and these callouts sit 387 to 491px out,
    // so on a phone they were not being hidden by any rule: they were simply
    // off the side of the screen. Framing the points themselves is the only
    // thing that holds at every size.
    if (isCompact && !ch.cam.air) {
      const pts = (ch.annotations ?? []).map((a) => a.lngLat);
      if (pts.length) {
        pts.push(ch.cam.center);
        let w = 180;
        let so = 90;
        let e = -180;
        let n = -90;
        for (const [x, y] of pts) {
          if (x < w) w = x;
          if (x > e) e = x;
          if (y < so) so = y;
          if (y > n) n = y;
        }
        const H = map.getContainer().clientHeight || 700;
        const sheet = sheetRef.current?.getBoundingClientRect().height ?? H * 0.4;
        // A beat whose single callout sits on the camera centre gives a box with
        // no size, and fitting that zooms to the maximum. Those beats already
        // frame their subject, so leave them be.
        const spread = Math.max(e - w, n - so);
        const fitted =
          spread < 0.015
            ? undefined
            : map.cameraForBounds(
          [
            [w, so],
            [e, n],
          ],
          {
            // The callout CARD hangs above and beside its dot, so this leaves
            // room for the card and not just for the point. Capped, because
            // padding that eats the frame forces the fit far further out than
            // the points actually need.
            padding: {
              top: isShort ? 60 : 90,
              bottom: Math.min(H * 0.56, sheet + 16),
              left: isShort ? 48 : 56,
              right: isShort ? 48 : 56,
            },
            bearing: ch.cam.bearing,
            pitch: ch.cam.pitch,
          },
        );
        if (fitted) {
          map.easeTo({
            ...fitted,
            pitch: ch.cam.pitch,
            roll: 0,
            duration: cam.duration,
            easing: glide,
            essential: true,
          });
          return;
        }
      }
    }
    if (i === 0 && ch.cam.air) {
      // FLY THE AEROPLANE, CALLOUT TO CALLOUT. The camera IS the aircraft (see
      // makePath / the AIR block); it heads straight at the next callout with it
      // centred in the frame the whole way in, then banks over toward the one
      // after. One jumpTo per frame — no easeTo underneath, no terrain queries.
      const air = ch.cam.air;
      const cards = (ch.annotations ?? []).map((a) => a.lngLat);
      // the aeroplane flies at each callout in turn and then on to `end`, so the
      // run finishes looking at the summit rather than stopping dead at a card
      const aims: [number, number][] = air.end ? [...cards, air.end] : cards;
      // The flown line stops short of the final aim (see ARRIVE_BACK), so the
      // run finishes with the summit standing in the middle of the frame rather
      // than directly underneath the camera.
      const flown: [number, number][] = [...cards];
      if (air.end) {
        const prev = cards[cards.length - 1] ?? air.start;
        const b =
          headingTo(
            { lng: prev[0], lat: prev[1] },
            { lng: air.end[0], lat: air.end[1] },
          ) * D2R;
        flown.push([
          air.end[0] - (Math.sin(b) * AIR.ARRIVE_BACK) / mPerDegLng(air.end[1]),
          air.end[1] - (Math.cos(b) * AIR.ARRIVE_BACK) / M_PER_DEG_LAT,
        ]);
      }
      const fp = makePath([air.start, ...flown]);
      // where along the route each aim point sits, so we know what we're flying at
      const stations = aims.map((c) => {
        let bf = 0;
        let bd = Infinity;
        for (let k = 0; k <= 1200; k++) {
          const f = k / 1200;
          const p = fp.at(f);
          const d = Math.hypot(
            (c[0] - p.lng) * mPerDegLng(p.lat),
            (c[1] - p.lat) * M_PER_DEG_LAT,
          );
          if (d < bd) {
            bd = d;
            bf = f;
          }
        }
        return bf;
      });
      const dur = ch.cam.duration ?? 20000;
      const t0 = performance.now();
      // Speed is constant apart from one long ease off the ground and into the
      // arrival. Both use smoothstep, whose slope is zero at each end, so there
      // is no point where the speed changes abruptly.
      const speed = (t: number) =>
        AIR.SLOW_MIN +
        (1 - AIR.SLOW_MIN) *
          Math.min(smoothstep(clamp01(t / AIR.EASE)), smoothstep(clamp01((1 - t) / AIR.EASE)));
      // Distance flown by time t is simply the speed curve integrated up to t.
      // READ the table at t; do NOT search it for where the distance equals t.
      // Searching inverts the curve, and the inverse of an ease-in-ease-out is
      // fast-slow-fast: it made the aeroplane accelerate hardest at exactly the
      // two moments it should have been gentlest, the take-off and the arrival.
      const M = 4000;
      const S = [0];
      for (let k = 1; k <= M; k++) S.push(S[k - 1] + (speed(k / M) + speed((k - 1) / M)) / 2);
      const tot = S[M] || 1;
      const distanceAt = (t: number) => {
        const x = clamp01(t) * M;
        const i = Math.min(M - 1, Math.floor(x));
        return (S[i] + (S[i + 1] - S[i]) * (x - i)) / tot;
      };

      // The descent from orbit runs on the front of the same loop, so the hand
      // over into the flight is just the next frame: same camera, same heading,
      // same position, no cut and nothing to line up.
      const openMs = air.openMs ?? 0;
      const openAlt = air.openAlt ?? 0;
      const openPitch = air.openPitch ?? 60;

      let hdg = NaN; // low-passed heading: the lag between where the nose points
      let roll = 0; //  and where we're aiming IS the turn, and drives the bank
      let pit = NaN;
      let aimHdg = NaN; // last heading taken from a usefully distant aim point
      let last = t0;
      const step = (now: number) => {
        const elapsed = now - t0;
        if (openMs && elapsed < openMs) {
          // COMING DOWN. Height falls geometrically, which is what a descent
          // through three orders of magnitude has to do to feel even, and the
          // ease flattens at the bottom so it settles into the cruise instead of
          // arriving still dropping.
          const k = smoothstep(clamp01(elapsed / openMs));
          const p0 = fp.at(0);
          const b0 = headingTo(p0, fp.at(0.005));
          const alt = openAlt * Math.pow(air.alt / openAlt, k);
          const pitch = openPitch + (AIR.PITCH_MAX - openPitch) * k;
          // open with north up, the way a globe is read, and swing round onto
          // the flight's heading on the way down
          const bearing = b0 * k;
          map.jumpTo({
            ...map.calculateCameraOptionsFromCameraLngLatAltRotation(
              [p0.lng, p0.lat],
              alt,
              bearing,
              pitch,
              0,
            ),
            bearing,
            pitch,
            roll: 0,
          });
          glideRaf.current = requestAnimationFrame(step);
          return;
        }
        const t = Math.min(1, (elapsed - openMs) / dur);
        // Clamped, so a stutter or a backgrounded tab cannot produce one huge
        // step, and every filter below is in SECONDS rather than frames: the
        // motion is then identical at 60Hz and 120Hz instead of twice as quick.
        const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000));
        last = now;
        if (Number.isNaN(pit)) pit = AIR.PITCH_MAX; // carried over from the descent
        const lag = (tau: number) => 1 - Math.exp(-dt / tau);
        const f = distanceAt(t);
        const p = fp.at(f);

        // AIM: the next callout ahead. Over the last stretch of each leg, ease
        // the aim across to the following one — that anticipation is what turns
        // the aeroplane, so it banks BEFORE it arrives instead of pivoting.
        let k = stations.findIndex((s) => s > f + 1e-6);
        if (k < 0) k = aims.length - 1;
        const legA = k === 0 ? 0 : stations[k - 1];
        const u = clamp01((f - legA) / (stations[k] - legA || 1));
        let aim = aims[k];
        if (u > 1 - AIR.HANDOVER && k < aims.length - 1) {
          const w = smoothstep((u - (1 - AIR.HANDOVER)) / AIR.HANDOVER);
          aim = [
            aims[k][0] + (aims[k + 1][0] - aims[k][0]) * w,
            aims[k][1] + (aims[k + 1][1] - aims[k][1]) * w,
          ];
        }

        const alt = air.alt + (air.altEnd - air.alt) * smoothstep(clamp01((f - 0.45) / 0.5));
        const range = Math.hypot(
          (aim[0] - p.lng) * mPerDegLng(p.lat),
          (aim[1] - p.lat) * M_PER_DEG_LAT,
        );
        // Arriving ON the thing we're aiming at makes the bearing to it
        // undefined (atan2(0,0) is 0, i.e. due north), which threw the nose
        // right round on the last frame of the flight. Inside this radius the
        // aim tells us nothing new, so hold the heading we already had.
        if (range > 800) aimHdg = headingTo(p, { lng: aim[0], lat: aim[1] });
        let want = Number.isNaN(aimHdg) ? headingTo(p, { lng: aim[0], lat: aim[1] }) : aimHdg;
        if (Number.isNaN(hdg)) hdg = want;
        while (want - hdg > 180) want -= 360;
        while (want - hdg < -180) want += 360;
        const prev = hdg;
        hdg += (want - hdg) * lag(AIR.HDG_TAU);
        // BANK: lean into the turn by how fast we're actually turning, so the
        // wings come level again on the straights of their own accord. The turn
        // rate is capped before it becomes a bank angle, so one short frame can
        // never throw the aeroplane onto its side.
        const omega = Math.max(-16, Math.min(16, (hdg - prev) / dt));
        // wings level themselves out before the hand-over to the next beat
        const outro = 1 - smoothstep(clamp01((t - (1 - AIR.OUTRO)) / AIR.OUTRO));
        const bank =
          Math.max(-AIR.MAX_BANK, Math.min(AIR.MAX_BANK, omega * AIR.K_BANK)) * outro;
        roll += (bank - roll) * lag(AIR.ROLL_TAU);

        // TILT so the callout we're flying at sits in the middle of the frame,
        // dropped a little below centre because the card hangs above its dot.
        // The range is floored for the same reason the heading is held: right on
        // top of a point the geometry sends the tilt diving into its own limit.
        const tiltRange = Math.max(range, 2500);
        const H = map.getContainer().clientHeight || 800;
        const focal = H / 2 / Math.tan((36.87 * D2R) / 2);
        const drop = Math.atan2(H * AIR.DOT_BELOW_CENTRE, focal) / D2R;
        const wantPitch = Math.max(
          AIR.PITCH_MIN,
          Math.min(AIR.PITCH_MAX, 90 - Math.atan2(alt, tiltRange) / D2R + drop),
        );
        // Smoothed hard, and this one matters most: the raw value dives as we
        // close on a callout and then stops dead against its limit, which is
        // felt as the nose being yanked down and caught. Filtered, the tilt only
        // ever eases. It also decides the map centre, so anything sudden here
        // shows up as the whole view lurching.
        if (Number.isNaN(pit)) pit = wantPitch;
        else pit += (wantPitch - pit) * lag(AIR.PITCH_TAU);
        const pitch = pit;

        map.jumpTo({
          ...map.calculateCameraOptionsFromCameraLngLatAltRotation(
            [p.lng, p.lat],
            alt,
            hdg,
            pitch,
            roll,
          ),
          bearing: hdg,
          pitch,
          roll,
        });
        if (t < 1) glideRaf.current = requestAnimationFrame(step);
        else {
          glideRaf.current = null;
          if (Math.abs(roll) > 0.02) map.setRoll(0); // absorb the last fraction
        }
      };
      glideRaf.current = requestAnimationFrame(step);
    } else if (i === 0 && ch.cam.intro) {
      // SMOOTH CLIMB glide: a single eased interpolation from the low intro
      // vantage to `center`, with zoom easing from close (low, over the lowlands)
      // to higher (clearing the ridges and arriving at the summit). No per-frame
      // terrain sampling, so the motion is buttery, not jittery.
      const s = ch.cam.intro;
      const e = ch.cam;
      const dur = ch.cam.duration ?? 12000;
      const t0 = performance.now();
      // easeInOutCubic — gentle acceleration + settle, no stutter
      const ease = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const L = (a: number, b: number, f: number) => a + (b - a) * f;
      const step = (now: number) => {
        const f = Math.min(1, (now - t0) / dur);
        const k = ease(f);
        map.jumpTo({
          center: [L(s.center[0], e.center[0], k), L(s.center[1], e.center[1], k)],
          zoom: L(s.zoom, e.zoom, k),
          pitch: L(s.pitch, e.pitch, k),
          bearing: L(s.bearing, e.bearing, k),
        });
        if (f < 1) glideRaf.current = requestAnimationFrame(step);
        else glideRaf.current = null;
      };
      glideRaf.current = requestAnimationFrame(step);
    } else if (i === 0) {
      map.flyTo({ ...cam, curve: 1.35 });
    } else map.easeTo(cam);
  };

  // opening: bump relief, snap high & far, then descend + tilt into beat 0
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c0 = story.chapters[0].cam;
    // STOP THE ARRIVAL SNAP. By default MapLibre keeps the camera centre clamped
    // to the ground: when a camera animation finishes it re-reads the terrain
    // height under the centre and rewrites the zoom to keep the same altitude.
    // Land on a 3.404 m summit at 1.5x exaggeration and that correction is a
    // multi-kilometre lurch, fired the instant the move ends — the shake at the
    // end of the flight, and a smaller version of it at every other beat. For a
    // scripted camera we want the vantage we asked for, so hold the elevation
    // fixed for the duration of the story.
    try {
      map.setCenterClampedToGround(false);
      map.setCenterElevation(0); // deterministic: don't inherit the map's last one
    } catch {
      /* older maplibre — the story still plays, just with the settle */
    }
    // an airplane opening starts parked at the first waypoint, already pointed
    // down the route, so the first frame of the flight isn't a snap
    if (c0.air) {
      // park the aircraft at the head of its run-in, already aimed at the first
      // callout, so the first frame of the flight isn't a snap
      const first = (story.chapters[0].annotations ?? [])[0]?.lngLat ?? c0.center;
      const p = { lng: c0.air.start[0], lat: c0.air.start[1] };
      const b = headingTo(p, { lng: first[0], lat: first[1] });
      // Park at exactly the attitude the opening's own first frame will ask for,
      // worked out the same way, so starting it doesn't snap the view. With a
      // descent configured that is the view from orbit; otherwise it is the
      // aeroplane already on the line.
      const range = Math.hypot(
        (first[0] - p.lng) * mPerDegLng(p.lat),
        (first[1] - p.lat) * M_PER_DEG_LAT,
      );
      const hh = map.getContainer().clientHeight || 800;
      const drop =
        Math.atan2(hh * AIR.DOT_BELOW_CENTRE, hh / 2 / Math.tan((36.87 * D2R) / 2)) / D2R;
      const pitch = c0.air.openMs
        ? (c0.air.openPitch ?? 0)
        : Math.max(
            AIR.PITCH_MIN,
            Math.min(AIR.PITCH_MAX, 90 - Math.atan2(c0.air.alt, range) / D2R + drop),
          );
      const alt = c0.air.openMs ? (c0.air.openAlt ?? c0.air.alt) : c0.air.alt;
      // with a descent configured the opening frame is north-up, matching the
      // first frame the descent itself will draw
      const bearing = c0.air.openMs ? 0 : b;
      map.jumpTo({
        ...map.calculateCameraOptionsFromCameraLngLatAltRotation(
          [p.lng, p.lat],
          alt,
          bearing,
          pitch,
          0,
        ),
        bearing,
        pitch,
        roll: 0,
      });
    } else if (c0.intro) {
      // a glide-in opening starts low at the intro vantage
      map.jumpTo({
        center: c0.intro.center,
        zoom: c0.intro.zoom,
        pitch: c0.intro.pitch,
        bearing: c0.intro.bearing,
      });
    } else {
      map.jumpTo({
        center: c0.center,
        zoom: Math.max(4.8, c0.zoom - 4.6),
        pitch: 0,
        bearing: 0,
      });
    }
    // Set the drama exaggeration AFTER MapView's own terrain effect has settled
    // (parent effects run after child effects, so a synchronous set here loses).
    // RAMPED, not switched: going straight from 1.0 to 1.5 makes the whole
    // landscape inflate in a single frame, which is a jolt right as the story
    // opens.
    let exagRaf = 0;
    const t0 = setTimeout(() => {
      const from = 1.0;
      const to = 1.5;
      const start = performance.now();
      const DURATION = 900;
      const ramp = (now: number) => {
        const k = smoothstep(clamp01((now - start) / DURATION));
        try {
          map.setTerrain({
            source: "terrain-dem",
            exaggeration: from + (to - from) * k,
          });
        } catch {
          /* terrain source not ready — the flight still reads fine */
        }
        if (k < 1) exagRaf = requestAnimationFrame(ramp);
      };
      exagRaf = requestAnimationFrame(ramp);
      setEntered(true);
      fly(0);
    }, 300);
    return () => {
      clearTimeout(t0);
      if (exagRaf) cancelAnimationFrame(exagRaf);
      if (glideRaf.current) cancelAnimationFrame(glideRaf.current);
      try {
        mapRef.current?.setRoll(0); // never leave the map banked behind us
        mapRef.current?.setCenterClampedToGround(true); // back to normal panning
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
    const flight = (cur.cam.duration ?? 5000) + (cur.cam.air?.openMs ?? 0);
    // Orbit beats linger longer so the camera circles a good arc before moving
    // on. The flown opening holds longest of all: it comes to rest with Gunung
    // Leuser's summit standing in the middle of the frame, and that view is the
    // end of the first chapter, so it is given time to land before the story
    // moves on.
    const read =
      idx === 0
        ? cur.cam.air
          ? 2400
          : 2600
        : (cur.cam.orbit ? 7000 : 3800) + (cur.points?.length ?? 0) * 1500;
    const timer = setTimeout(() => fly(idx + 1), flight + read);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, playing, entered, last]);

  // ORBIT: on flagged beats, once the fly-in settles, slowly circle the camera
  // around the centered subject (setBearing rotates around the map center, which
  // is the animal) so you view the "giant" from every side. Keeps going even when
  // paused, so people can linger on it; stops on beat change or a manual drag.
  useEffect(() => {
    const map = mapRef.current;
    const cam = story.chapters[idx].cam;
    if (!map || !entered || !cam.orbit) return;
    const DEG_PER_MS = 9 / 1000; // ~9 deg/sec, a slow cinematic circle
    let raf = 0;
    let base = 0;
    let t0 = 0;
    let stopped = false;
    const spin = (now: number) => {
      if (stopped) return;
      if (!t0) {
        t0 = now;
        base = map.getBearing();
      }
      map.setBearing(base + (now - t0) * DEG_PER_MS);
      raf = requestAnimationFrame(spin);
    };
    const stop = () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      map.off("dragstart", stop);
    };
    // begin after the easeTo into this beat has arrived
    const startTimer = setTimeout(
      () => {
        if (stopped) return;
        map.on("dragstart", stop); // hand control back the moment they grab the map
        raf = requestAnimationFrame(spin);
      },
      (cam.duration ?? 5000) + 250,
    );
    return () => {
      clearTimeout(startTimer);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, entered]);

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
    // Reaching 2025 is not the same as SHOWING 2025: the final year's tiles are
    // still coming in. Hold on the finished picture until the map has actually
    // drawn it, then pause so it can be taken in, and only then move on. The cap
    // is there so a slow or failed tile can't strand the story on this beat.
    let done = false;
    let pause: ReturnType<typeof setTimeout>;
    const advance = () => {
      if (done) return;
      done = true;
      map?.off("idle", onIdle);
      clearTimeout(cap);
      pause = setTimeout(() => fly(idx + 1), 2400);
    };
    const map = mapRef.current;
    const onIdle = () => advance();
    const cap = setTimeout(advance, 9000);
    if (!map || map.areTilesLoaded()) advance();
    else map.on("idle", onIdle);
    return () => {
      done = true;
      clearTimeout(cap);
      clearTimeout(pause);
      map?.off("idle", onIdle);
    };
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
        // clamp: the first rAF timestamp can precede t0 → a tiny negative p,
        // and setting a negative volume throws IndexSizeError.
        const p = Math.max(0, Math.min(1, (now - t0) / 3000));
        els.forEach((a, i) => (a.volume = Math.max(0, Math.min(1, tracks[i].vol * p))));
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

  // Terrain callouts for the current beat.
  //
  // The rule here is simple and absolute: every callout on a beat is SHOWN, and
  // no two of them overlap. Neither can be arranged ahead of time, because where
  // a card lands on screen depends on the terrain height under its point, the
  // 1.5x exaggeration, and the live camera. So the dot is pinned to the terrain
  // and the CARD is laid out at runtime by a solver that measures the real DOM
  // boxes, pushes any overlapping pair apart, and clamps every card inside the
  // frame. A leader line joins each card back to its own dot.
  useEffect(() => {
    const map = mapRef.current;
    overlay.current = null; // the previous host is fading itself out, leave it be
    if (!map) return;
    // data callouts + `float` photo cards are geo-anchored on the terrain;
    // plain photo cards render fixed in the side columns. On compact screens skip
    // all geo markers entirely — they'd collide with the bottom stack.
    // On a phone every callout goes on the terrain. Desktop routes the photo
    // ones that are not `float` into its side columns instead, and a phone has
    // no side columns: they were being pushed into a strip above the fact card,
    // which is 92px of a 195px sheet on a phone held sideways and left nothing
    // for the story itself.
    const anns = (story.chapters[idx].annotations ?? []).filter(
      (a) => isCompact || !a.photo || a.float,
    );
    if (!anns.length) return;

    const host = document.createElement("div");
    host.style.cssText =
      "position:absolute;inset:0;overflow:visible;pointer-events:none;";
    map.getCanvasContainer().appendChild(host);
    overlay.current = host;

    const built = anns.map((a, i) => {
      const el = buildAnnotation(a, locale === "en", isCompact, isTight);
      host.appendChild(el);
      const p = map.project(a.lngLat);
      return {
        a,
        el,
        card: el.querySelector("[data-card]") as HTMLElement,
        lead: el.querySelector("[data-lead]") as HTMLElement,
        x: p.x, // anchor: the dot, on the terrain point
        y: p.y,
        ox: 0, // card offset from the anchor, solved every frame
        oy: -78,
        px: NaN, // where the card is actually DRAWN, eased toward anchor+offset
        py: NaN,
        op: 0,
        w: 160,
        h: 90,
        phase: i * 1.7,
        rate: 0.00105 + i * 0.00013,
      };
    });

    const stillness = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const air = !!story.chapters[idx].cam.air;
    let lastCam = "";
    let measured = 0;
    let sheetTop = Infinity;

    let lastFrame = 0;
    let raf = requestAnimationFrame(function track(now: number) {
      // Everything below eases in SECONDS, not per frame. Per-frame easing runs
      // twice as fast on a 120Hz screen as on a 60Hz one, which is what made the
      // callouts feel like they were snapping about at different speeds.
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60;
      lastFrame = now;
      const ease = (tau: number) => 1 - Math.exp(-dt / tau);
      const W = map.getContainer().clientWidth || 1;
      const H = map.getContainer().clientHeight || 1;
      const cen = map.getCenter();
      const camNow = `${cen.lng},${cen.lat},${map.getZoom()},${map.getBearing()},${map.getPitch()}`;
      const moving = camNow !== lastCam;
      lastCam = camNow;
      const cosLat = Math.cos((cen.lat * Math.PI) / 180);
      // How far BEHIND the look-at point the camera itself sits. `center` is
      // what the camera aims at, not where it is, and at these tilts the camera
      // is tens of kilometres back from it. Needed to tell whether a point is
      // genuinely in front of us.
      const mPerPx = (156543.03 * cosLat) / Math.pow(2, map.getZoom());
      const camToCentre = (H / 2 / Math.tan((36.87 * Math.PI) / 180 / 2)) * mPerPx;
      const camBack = camToCentre * Math.sin((map.getPitch() * Math.PI) / 180);
      const brg = (map.getBearing() * Math.PI) / 180;

      // re-measure occasionally: photo cards change height when the image lands
      if (now - measured > 400) {
        measured = now;
        for (const c of built) {
          c.w = c.card.offsetWidth || c.w;
          c.h = c.card.offsetHeight || c.h;
        }
        // where the fact card actually starts. Measured, because on a phone it
        // is a different height on every beat and a fixed reserve either wastes
        // the screen or lets callouts slide underneath it.
        const r = sheetRef.current?.getBoundingClientRect();
        const host = map.getContainer().getBoundingClientRect();
        sheetTop = r && r.height > 0 ? r.top - host.top : Infinity;
      }

      // 1. anchors follow the terrain point
      for (const c of built) {
        const p = map.project(c.a.lngLat);
        if (moving) {
          c.x = p.x;
          c.y = p.y;
        } else {
          const d = Math.hypot(p.x - c.x, p.y - c.y);
          if (d > 0.9) {
            const k = ease(d > 8 ? 0.18 : 0.6);
            c.x += (p.x - c.x) * k;
            c.y += (p.y - c.y) * k;
          }
        }
      }

      // 2. VISIBILITY. A callout is hidden only when its point is genuinely
      //    behind us or a long way outside the frame. Nothing is ever hidden for
      //    being central, or close, or near another one.
      for (const c of built) {
        // Is the point in front of the camera at all? map.project() has no
        // notion of behind: for a point past the camera the perspective divide
        // flips sign and it comes back as a perfectly plausible on-screen
        // position, usually up in the sky. That is what left a callout hanging
        // over the horizon, tethered to a dot floating above the terrain, once
        // the aeroplane had flown past it.
        const dE = (c.a.lngLat[0] - cen.lng) * 111320 * cosLat;
        const dN = (c.a.lngLat[1] - cen.lat) * 110540;
        const ahead = dE * Math.sin(brg) + dN * Math.cos(brg) + camBack;
        // ...and does its dot land on the GROUND? Anything projecting up into
        // the top of the frame is either past the horizon or a point behind us
        // that the projection has flipped, and either way the callout ends up
        // hanging in the sky tethered to nothing. Cheap, and it holds whatever
        // the projection does, which matters because this map draws on a globe
        // with exaggerated terrain and the geometry is not worth predicting.
        // Only where the camera is tilted far enough that sky is actually in
        // shot. On the flat, looking-down beats the whole frame is ground, and
        // this was throwing away every callout in the top quarter of it.
        const dotOnGround = map.getPitch() < 55 || c.y > H * 0.26;
        const onFrame =
          ahead > 2000 &&
          dotOnGround &&
          c.x > -W * 0.6 &&
          c.x < W * 1.6 &&
          c.y < H * 1.9;
        let vis = onFrame ? 1 : 0;
        if (air && vis > 0) {
          const dm = Math.hypot(
            (c.a.lngLat[0] - cen.lng) * 111320 * Math.cos((cen.lat * Math.PI) / 180),
            (c.a.lngLat[1] - cen.lat) * 110540,
          );
          vis *= smoothstep(clamp01((AIR.FAR - dm) / AIR.FAR_FADE));
        }
        c.op += (vis - c.op) * ease(0.45); // half a second to fade up or away
      }

      // 3. LAYOUT. Cards are laid out left to right in the same order as their
      //    dots, and given DISJOINT horizontal spans by a two-pass sweep. Spans
      //    that don't overlap mean two cards cannot overlap whatever their
      //    heights are, so this is correct by construction. (A relaxation that
      //    pushes overlapping pairs apart was tried first and cycles instead of
      //    converging once cards are crowded or share a position exactly.)
      const PAD = 14;
      const TOP = isCompact ? 58 : 76; // below the story's top bar
      // clear of the fact card as measured, falling back to a reserve
      const BOT = Math.min(
        sheetTop === Infinity ? H - (air ? 150 : 190) : sheetTop - 10,
        H - 40,
      );
      const GAP = 10;
      // every card is laid out, visible or not, so one that is fading in is
      // already in its final place rather than sliding into it in view
      const live = built;
      if (live.length) {
        const avail = W - 2 * PAD;
        const order = live
          .map((_, i) => i)
          .sort((i, j) => live[i].x - live[j].x || i - j);

        // Pack into AS MANY ROWS AS FIT, rather than one or two. Six callouts
        // will not sit side by side on a phone at any legible size, and capping
        // the count just hid half of them; stacked two per row they all show.
        const rows: number[][] = [];
        let cur: number[] = [];
        let curW = 0;
        for (const i of order) {
          const need = live[i].w + (cur.length ? GAP : 0);
          if (cur.length && curW + need > avail) {
            rows.push(cur);
            cur = [];
            curW = 0;
          }
          curW += cur.length ? need : live[i].w;
          cur.push(i);
        }
        if (cur.length) rows.push(cur);

        // and only as many rows as there is sky for. Anything beyond that fades
        // out rather than piling up behind the sheet.
        const rowH = Math.max(...live.map((c) => c.h)) + 12;
        const maxRows = Math.max(1, Math.floor((BOT - TOP) / rowH));
        const shown = rows.slice(0, maxRows);
        const noRoom = new Set(rows.slice(maxRows).flat());

        shown.forEach((row, ri) => {
          let cursor = PAD;
          const lx: number[] = [];
          for (const i of row) {
            const c = live[i];
            const want = Math.max(cursor + c.w / 2, Math.min(c.x, W - PAD - c.w / 2));
            lx[i] = want;
            cursor = want + c.w / 2 + GAP;
          }
          let edge = W - PAD;
          for (let k = row.length - 1; k >= 0; k--) {
            const c = live[row[k]];
            lx[row[k]] = Math.min(lx[row[k]], edge - c.w / 2);
            edge = lx[row[k]] - c.w / 2 - GAP;
          }
          for (const i of row) {
            const c = live[i];
            // one row can float near its own dot; several have to take fixed
            // bands, or they would collide as the camera moves
            const bottom =
              shown.length === 1
                ? Math.min(Math.max(c.y - 78, TOP + c.h), BOT)
                : TOP + rowH * (ri + 1) - 12;
            c.ox += (lx[i] - c.x - c.ox) * ease(0.3);
            c.oy += (bottom - c.y - c.oy) * ease(0.3);
          }
        });
        for (const i of noRoom) live[i].op += (0 - live[i].op) * ease(0.45);
      }

      // 4. draw. The DOT is pinned exactly to its terrain point, but the card
      //    glides to where the layout wants it instead of tracking the ground
      //    one for one: anchored to terrain and flown past at speed, a card
      //    otherwise tears across the frame. The leader line takes up the slack.
      for (const c of built) {
        c.el.style.opacity = c.op.toFixed(3);
        if (c.op < 0.005) {
          c.px = NaN; // next time it appears, start settled rather than flying in
          continue;
        }
        c.el.style.transform = `translate(${Math.round(c.x * 4) / 4}px,${Math.round(c.y * 4) / 4}px)`;
        const bob = stillness ? 0 : 3 * Math.sin(now * c.rate + c.phase);
        const tx = c.x + c.ox;
        const ty = c.y + c.oy;
        if (Number.isNaN(c.px)) {
          c.px = tx;
          c.py = ty;
        } else {
          const g = ease(0.22);
          c.px += (tx - c.px) * g;
          c.py += (ty - c.py) * g;
        }
        const cx = c.px - c.x;
        const cy = c.py - c.y + bob;
        c.card.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) translate(-50%,-100%)`;
        // Leader line from the dot to the bottom of the card, drawn as one
        // rotated dashed edge. (An SVG was tried and drew nothing: a 0x0 svg has
        // no rendering area, so the cards floated with no visible tether.)
        const len = Math.hypot(cx, cy);
        c.lead.style.width = `${len.toFixed(1)}px`;
        c.lead.style.transform = `rotate(${Math.atan2(cy, cx).toFixed(4)}rad)`;
      }
      raf = requestAnimationFrame(track);
    });

    return () => {
      cancelAnimationFrame(raf);
      // fade the beat's callouts out rather than cutting them, so moving between
      // beats is a dissolve at both ends instead of a pop
      host.style.transition = "opacity .45s ease";
      host.style.opacity = "0";
      setTimeout(() => host.remove(), 500);
      if (overlay.current === host) overlay.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, isCompact, isShort, isTight]);

  // On the tree-cover-loss beat, dim the protected-area fill so the magenta loss
  // layer underneath reads clearly (its default 0.45 opacity buries it). Restore
  // on every other beat, and on close.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const dim = !!story.chapters[idx].animateLoss;
    const set = () => {
      if (map.getLayer("lyr-protected"))
        map.setPaintProperty("lyr-protected", "fill-opacity", dim ? 0.12 : 0.45);
    };
    set();
    const t = setTimeout(set, 800); // re-apply once the layer toggle settles
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);
  useEffect(
    () => () => {
      const map = mapRef.current;
      if (map?.getLayer("lyr-protected"))
        map.setPaintProperty("lyr-protected", "fill-opacity", 0.45);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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

  // Breakpoints for the whole story. Portrait, landscape and desktop are all
  // supported layouts; a phone held upright gets a hint that landscape suits it
  // better, not a wall. A wide-but-short viewport also takes the compact layout,
  // since the desktop side panels would overlap the card there.
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsCompact(w < 768 || h < 640);
      setIsShort(h < 500);
      setSideBySide(w < 768 && w >= 600);
      setIsTight(w < 400 || h < 500);
      const touch =
        window.matchMedia("(pointer: coarse)").matches ||
        (navigator.maxTouchPoints ?? 0) > 0;
      setPortraitPhone(h > w && touch && Math.min(w, h) <= 820);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  // the rotate hint shows its piece and then gets out of the way
  useEffect(() => {
    if (!portraitPhone || hintGone) return;
    const t = setTimeout(() => setHintGone(true), 7000);
    return () => clearTimeout(t);
  }, [portraitPhone, hintGone]);

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

  // Keep the outline reachable from fly(), and re-frame if it lands after the
  // beat has already begun (it is fetched, so on a slow connection the fit would
  // otherwise fall back to the hand-set center/zoom and stay there).
  useEffect(() => {
    boundaryRef.current = boundaryGeom;
    if (!boundaryGeom) return;
    // camera only: re-running the beat would restart the loss animation at 2001
    fitBoundary(story.chapters[idx], 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryGeom]);

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

  // Type scale for the fact card. A phone held sideways has about 190px of
  // sheet to work with, so it gets its own step rather than desktop sizes in a
  // smaller box, which is what made everything look oversized.
  const sz = isShort
    ? {
        title: "text-[1.15rem]",
        eyebrow: "text-[0.55rem]",
        stat: "text-[1.1rem]",
        statLabel: "text-[0.66rem]",
        body: "text-[0.76rem]",
        point: "text-[0.72rem]",
        source: "text-[0.58rem]",
      }
    : isCompact
      ? {
          title: "text-[1.5rem]",
          eyebrow: "text-[0.6rem]",
          stat: "text-[1.45rem]",
          statLabel: "text-[0.72rem]",
          body: "text-[0.85rem]",
          point: "text-[0.8rem]",
          source: "text-[0.62rem]",
        }
      : {
          title: "text-[2.2rem] md:text-[3rem]",
          eyebrow: "text-[0.68rem]",
          stat: "text-[2.1rem] md:text-[2.6rem]",
          statLabel: "text-[0.8rem]",
          body: "text-[0.98rem]",
          point: "text-[0.86rem]",
          source: "text-[0.66rem]",
        };

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

  // photos: `float` ones hover on the terrain (geo-anchored, handled by the
  // markers effect); the rest fill the side columns. On compact all photos fall
  // back to the bottom strip. Split side photos across right + left so they never
  // stack or clip.
  const photoAnns = (ch.annotations ?? []).filter((a) => a.photo);
  const sidePhotos = photoAnns.filter((a) => !a.float);
  const rightPhotos = sidePhotos.filter((_, i) => i % 2 === 0);
  const leftPhotos = sidePhotos.filter((_, i) => i % 2 === 1);
  // full card (desktop, floats in the side margins) or a small thumbnail (the
  // compact strip on phones — image + name only, so it fits a short screen)
  const renderPhoto = (a: Annotation, i: number, compact = false) => {
    if (compact) {
      return (
        <div
          key={a.photo!.src}
          className="pointer-events-auto relative h-[84px] w-[64px] shrink-0 overflow-hidden rounded-lg border border-white/14 bg-black/50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.photo!.src}
            alt={t(a.title)}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1 pt-3">
            <div className="text-[0.5rem] font-semibold leading-tight text-white">
              {t(a.title)}
            </div>
          </div>
        </div>
      );
    }
    return (
      // entrance wrapper (fades in once) holds an inner card that bobs
      <div
        key={a.photo!.src}
        className="pointer-events-auto w-[232px] shrink-0 animate-[panel-in_0.6s_ease]"
        style={{ animationDelay: `${i * 0.12}s` }}
      >
        <div
          className="story-float overflow-hidden rounded-2xl border border-white/14 bg-black/60 shadow-[0_14px_40px_-14px_rgba(0,0,0,0.65)] ring-1 ring-[#57b98a]/15 backdrop-blur-md"
          style={{ animation: `story-float ${5.4 + i * 0.6}s ease-in-out ${i * 0.7}s infinite` }}
        >
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.photo!.src}
              alt={t(a.title)}
              loading="lazy"
              className="block aspect-[4/3] w-full object-cover"
            />
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
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[40]">
      {/* Turn-your-phone hint. Sits above the sheet, says its piece for seven
          seconds, and can be tapped away. The story plays perfectly well in
          portrait, so this is a suggestion and never a blocker. */}
      {portraitPhone && !hintGone && (
        <button
          onClick={() => setHintGone(true)}
          className="pointer-events-auto absolute left-1/2 top-[4.75rem] z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/75 py-2 pl-3 pr-3.5 text-left backdrop-blur-md animate-[panel-in_0.5s_ease]"
        >
          <svg
            className="shrink-0 motion-safe:animate-[rotate-hint_2.6s_ease-in-out_infinite]"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <rect x="7" y="2.5" width="10" height="19" rx="2.2" stroke="#57b98a" strokeWidth="1.7" />
            <path d="M10.5 19h3" stroke="#57b98a" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span className="text-[0.68rem] leading-tight text-white/85">
            {locale === "en"
              ? "Turn your phone sideways for the full view"
              : "Putar perangkat untuk tampilan penuh"}
          </span>
          <span className="ml-1 shrink-0 text-[0.8rem] leading-none text-white/40">✕</span>
        </button>
      )}

      {/* letterbox bars + vignette — the cinematic frame */}
      <div
        className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/85 to-transparent transition-[height] duration-700"
        style={{ height: entered ? (isCompact ? "11vh" : "16vh") : 0 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent transition-[height] duration-700"
        style={{ height: entered ? (isCompact ? "26vh" : "34vh") : 0 }}
      />
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          opacity: entered ? 1 : 0,
          boxShadow: "inset 0 0 220px 40px rgba(0,0,0,0.55)",
        }}
      />

      {/* closing biodiversity montage: images fly in + drift across the screen.
          Keyed on idx so it replays each time this beat is entered. Sits behind
          the fact card. Skipped on mobile-portrait (rotate gate). */}
      {ch.gallery && ch.gallery.length > 0 && (
        <div key={`gallery-${idx}`} className="pointer-events-none absolute inset-0 overflow-hidden">
          {GALLERY_TILES.slice(0, isCompact ? 8 : GALLERY_TILES.length).map((tile, i) => {
            const item = ch.gallery![i % ch.gallery!.length];
            const w = isCompact ? Math.round(tile.w * 0.62) : tile.w;
            const h = Math.round(w * 0.72);
            return (
              <div
                key={i}
                className="absolute"
                style={{ top: `${tile.t}%`, left: `${tile.l}%`, transform: `rotate(${tile.r}deg)` }}
              >
                <div className="gallery-in" style={{ ["--d" as string]: `${tile.d}ms` }}>
                  <div
                    className={`story-float group relative overflow-hidden rounded-xl shadow-[0_22px_55px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/15 ${
                      isCompact ? "pointer-events-none" : "pointer-events-auto"
                    }`}
                    style={{
                      width: `${w}px`,
                      height: `${h}px`,
                      animationDuration: `${6 + (i % 5)}s`,
                      animationDelay: `${tile.d + 500}ms`,
                    }}
                  >
                    <img src={item.src} alt={t(item.title)} className="block h-full w-full object-cover" />
                    {/* hover: reveal the species / plant name */}
                    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/92 via-black/30 to-transparent p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <div className="text-[0.74rem] font-semibold leading-tight text-white">
                        {t(item.title)}
                      </div>
                      {item.sub && (
                        <div className="mt-0.5 text-[0.62rem] italic leading-tight text-white/70">
                          {t(item.sub)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* top: place name + close */}
      <div
        className={`pointer-events-auto absolute inset-x-0 top-0 flex items-start justify-between gap-2 ${
          isCompact
            ? "p-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]"
            : "p-4 md:p-6"
        }`}
      >
        <div className="min-w-0 animate-[panel-in_0.6s_ease]">
          <div
            className={`flex items-center gap-2 uppercase tracking-[0.22em] text-white/70 ${
              isCompact ? "text-[0.56rem]" : "text-[0.66rem]"
            }`}
          >
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#57b98a]" />
            <span className="truncate">
              {isCompact ? "Kisah Kawasan" : "Mandum Rimba \u00b7 Kisah Kawasan"}
            </span>
          </div>
          <div
            className={`truncate tracking-[0.1em] text-white/80 ${
              isCompact ? "mt-0.5 text-[0.66rem]" : "mt-1 text-[0.72rem]"
            }`}
          >
            {t(story.region)}
          </div>
        </div>
        {/* 44px targets on touch, and icon-only: the labelled pills ran off the
            side of a 375px screen and the 32px buttons were under the size a
            finger can reliably hit. */}
        <div className={`flex shrink-0 items-center ${isCompact ? "gap-1" : "gap-2"}`}>
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
              className={`flex items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50 ${isCompact ? "h-11 w-11" : "h-8 w-8"}`}
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
              className={`flex items-center justify-center gap-1.5 rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50 ${
                isCompact ? "h-11 w-11" : "h-8 px-3 text-[0.78rem]"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3m0 0-4 4m4-4 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {!isCompact && (locale === "en" ? "Share" : "Bagikan")}
            </button>
          )}
          <button
            onClick={toggleFs}
            aria-label={fs ? "Exit fullscreen" : "Fullscreen"}
            title={fs ? "Exit fullscreen" : "Fullscreen"}
            className={`flex items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50 ${isCompact ? "h-11 w-11" : "h-8 w-8"}`}
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
            aria-label={locale === "en" ? "Close" : "Tutup"}
            className={`flex items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50 ${
              isCompact ? "h-11 w-11" : "px-3 py-1 text-[0.78rem]"
            }`}
          >
            {isCompact ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <>{locale === "en" ? "Close" : "Tutup"} ✕</>
            )}
          </button>
        </div>
      </div>

      {/* top-left: horizontal legend chips, aligned under the story title. Wraps
          to more rows when many layers are on. Source shows on hover + click.
          (desktop only — on mobile it moves into the bottom stack) */}
      {!isCompact && legend.length > 0 && (
        <div className="pointer-events-auto absolute left-6 top-[4.75rem] max-w-[min(64vw,760px)] animate-[panel-in_0.5s_ease]">
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
      {!isCompact && rightPhotos.length > 0 && (
        <div className="absolute right-6 top-1/2 flex -translate-y-1/2 flex-col gap-5">
          {rightPhotos.map((a, i) => renderPhoto(a, i))}
        </div>
      )}
      {!isCompact && leftPhotos.length > 0 && (
        <div className="absolute left-6 top-[calc(50%+2.5rem)] flex -translate-y-1/2 flex-col gap-5">
          {leftPhotos.map((a, i) => renderPhoto(a, i))}
        </div>
      )}

      {/* DESKTOP tree-cover-loss timeline — pinned right, vertical. On mobile it
          moves into the bottom stack (compact, horizontal) so it never covers
          the fact card / info. */}
      {!isCompact && showLoss && (() => {
        const pct = lossPct;
        const en = locale === "en";
        return (
          <div className="pointer-events-auto absolute right-6 top-1/2 w-[196px] -translate-y-1/2">
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

      {/* bottom: the fact card for this beat. On compact it's a bounded flex
          column (dvh = the real visible height, minus the top bar) so nothing
          overflows up into the chrome — the card fills what's left and scrolls. */}
      <div
        ref={sheetRef}
        className={`pointer-events-auto absolute inset-x-0 bottom-0 ${
          isCompact
            ? // Capped so the map is never squeezed to a strip. On a phone held
              // sideways the sheet was taking about seventy per cent of the
              // screen; half is the most it may have. Padded for the home
              // indicator, or the transport row sits under it.
              `flex flex-col p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] ${
                isShort ? "max-h-[52dvh]" : "max-h-[calc(100dvh-4.75rem)]"
              }`
            : "p-4 md:p-8"
        }`}
      >
        {/* closing beat: latest videos from the official account (auto-updating,
            muted autoplay) — falls back to a follow card if the feed is empty */}
        {isLast && story.instagram && (
          <StorySocial
            handle={story.instagram.handle}
            url={story.instagram.url}
            name={t(story.instagram.name)}
            en={locale === "en"}
            compact={isCompact}
            tiny={isShort}
          />
        )}
        {/* COMPACT: the loss timeline as one line. Four stacked rows of label,
            year, track, endpoints and attribution is a panel; on a phone it only
            has to answer "which year am I looking at, and how far through". The
            source stays on the fact card, which cites it anyway. */}
        {isCompact && showLoss && (
          <div className="mx-auto mb-1.5 flex w-full max-w-[640px] shrink-0 items-center gap-2.5 rounded-full border border-white/12 bg-black/60 px-3 py-1.5 backdrop-blur-md">
            <span
              className="shrink-0 text-[0.58rem] font-semibold uppercase tracking-[0.14em]"
              style={{ color: LOSS_COLOR }}
            >
              {locale === "en" ? "Loss" : "Hilang"}
            </span>
            <div className="relative h-1 flex-1 rounded-full bg-white/15">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${lossPct}%`, background: LOSS_COLOR }}
              />
              <div
                className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{ left: `${lossPct}%`, boxShadow: `0 0 8px 1px ${LOSS_COLOR}` }}
              />
            </div>
            <span className="shrink-0 text-[0.9rem] font-extrabold leading-none tabular-nums text-white">
              {lossYear}
            </span>
          </div>
        )}
        {/* COMPACT: legend chips, stacked above the card */}
        {isCompact && !isShort && legend.length > 0 && (
          <div className="mx-auto mb-2 flex w-full max-w-[640px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-white/12 bg-black/55 px-4 py-1.5 backdrop-blur-md">
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
        <div
          key={idx}
          className={`relative mx-auto flex w-full max-w-[640px] rounded-2xl border border-white/12 bg-black/65 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md animate-[panel-in_0.6s_cubic-bezier(.2,.7,.2,1)] ${
            isCompact
              ? // Words on the left, player on the right where the screen is
                // wide enough. A phone held sideways has no height to spare, so
                // that is where this matters; upright it stacks instead, because
                // side by side would leave about 160px for a paragraph.
                `flex-1 ${sideBySide ? "items-end gap-3" : "flex-col"} ${
                  isShort ? "min-h-[4.5rem] p-2.5 pb-3" : "min-h-[6.5rem] p-3 pb-3.5"
                }`
              : "flex-col p-5 md:p-6"
          }`}
        >
          <div
            className={
              isCompact
                ? `min-h-0 min-w-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin] ${sideBySide ? "self-stretch" : ""}`
                : ""
            }
          >
          {isArrival ? (
            <h1 className="m-0 text-white [text-wrap:balance]">
              <span
                className={`block font-bold leading-[1.02] tracking-[-0.02em] ${sz.title}`}
              >
                {t(ch.title)}
              </span>
            </h1>
          ) : (
            <>
              <div className={`mb-1 uppercase tracking-[0.2em] text-[#7fd6a8] ${sz.eyebrow}`}>
                {t(ch.title)}
              </div>
              {ch.stat && (
                <div className={`flex items-baseline gap-2.5 ${isShort ? "mb-1" : "mb-1.5"}`}>
                  <span
                    className={`font-bold leading-none tracking-[-0.02em] text-white tabular-nums ${sz.stat}`}
                  >
                    {ch.stat.value}
                  </span>
                  <span className={`text-white/70 ${sz.statLabel}`}>
                    {t(ch.stat.label)}
                  </span>
                </div>
              )}
              <p
                className={`m-0 max-w-[52ch] leading-snug text-white/90 [text-wrap:pretty] ${sz.body}`}
              >
                {t(ch.body)}
              </p>
              {ch.points && ch.points.length > 0 && (
                <ul className="mt-2.5 flex max-w-[54ch] list-none flex-col gap-1.5 p-0">
                  {ch.points.map((pt, i) => (
                    <li key={i} className={`flex gap-2 leading-snug text-white/85 ${sz.point}`}>
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
                  className={`mt-1.5 inline-block text-white/55 hover:text-white/80 ${sz.source}`}
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
          </div>
          {isCompact && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-2xl bg-white/10">
              <div
                className="h-full rounded-r-full bg-[#57b98a] transition-[width] duration-500"
                style={{ width: `${((idx + 1) / story.chapters.length) * 100}%` }}
              />
            </div>
          )}

          {/* Progress and transport. On a phone these become two rows: thirteen
              six-pixel dots and four buttons could not share one 375px line, and
              the dots were far too small to hit anyway. The dots become a plain
              progress bar with a beat count, and stepping is done with the
              buttons, which is what a thumb can actually use. */}
          <div
            className={`shrink-0 ${
              isCompact
                ? `flex items-center gap-2 ${sideBySide ? "flex-col" : "mt-2 justify-end"}`
                : "mt-3 flex items-center gap-3"
            }`}
          >
            {isCompact ? (
              <span
                className={`tabular-nums leading-none text-white/50 ${
                  isShort ? "text-[0.58rem]" : "text-[0.62rem]"
                }`}
              >
                {idx + 1}/{story.chapters.length}
              </span>
            ) : (
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
            )}
            {!isCompact && <span className="flex-1" />}
            <div
              className={`flex items-center ${
                isCompact ? (isShort ? "gap-1.5" : "gap-2") : "gap-1.5"
              }`}
            >
              <button
                onClick={() => fly(idx - 1)}
                disabled={idx === 0}
                aria-label={locale === "en" ? "Previous" : "Sebelumnya"}
                title={locale === "en" ? "Previous" : "Sebelumnya"}
                className={`flex items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50 disabled:opacity-30 disabled:hover:bg-black/30 ${isCompact ? (isShort ? "h-10 w-10" : "h-11 w-11") : "h-9 w-9"}`}
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
                className={`flex items-center justify-center rounded-full bg-[#57b98a] text-[#07130d] transition-[filter] hover:brightness-110 ${
                  isCompact ? (isShort ? "h-12 w-12" : "h-[3.25rem] w-[3.25rem]") : "h-11 w-11"
                }`}
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
                className={`flex items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50 disabled:opacity-30 disabled:hover:bg-black/30 ${isCompact ? (isShort ? "h-10 w-10" : "h-11 w-11") : "h-9 w-9"}`}
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden><path d="M2.5 1L8 6l-5.5 5V1zM9 1h1.5v10H9V1z" /></svg>
              </button>
              {/* Stop does exactly what the X in the top bar does. On a phone
                  that is a wasted target in the row your thumb uses most, so it
                  is left to the desktop layout. */}
              {!isCompact && (
                <button
                  onClick={onClose}
                  aria-label={locale === "en" ? "Stop, back to map" : "Stop, balik ke peta"}
                  title={locale === "en" ? "Stop, back to map" : "Stop, balik ke peta"}
                  className="ml-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/85 backdrop-blur transition-colors hover:bg-black/50"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden><rect width="12" height="12" rx="2" /></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
