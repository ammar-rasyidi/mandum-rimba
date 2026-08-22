/**
 * NASA Worldview / GIBS imagery for the karhutla (land & forest fire) view.
 *
 * Two things the existing layers cannot give you:
 *  - **Real imagery for a chosen day** — the true-colour mosaic Worldview shows,
 *    where a burn scar and its smoke plume are visible with the naked eye, so a
 *    hotspot can be corroborated against what the sensor actually saw.
 *  - **Hotspots for any past day** — the `fires` layer is NASA FIRMS NRT, capped
 *    at the last 48 hours. GIBS serves the same FIRMS thermal anomalies back to
 *    2000, so a fire season can be replayed day by day.
 *
 * Layer names here are the EXACT NASA Worldview / GIBS layer identifiers, shown
 * verbatim in the UI: anyone can paste one into worldview.earthdata.nasa.gov and
 * see the same pixels. That is the "≤ 2 clicks to the source" rule for a layer
 * that is imagery rather than a dataset we ingest.
 *
 * Transport (verified against GIBS GetCapabilities 2026-08):
 *  - Imagery uses WMTS REST in EPSG:3857 — 256 px JPEG, GoogleMapsCompatible_Level9
 *    (z 0–8), which MapLibre consumes as a plain raster source.
 *  - Hotspots CANNOT use WMTS: GIBS publishes the thermal-anomaly tiles as MVT in
 *    EPSG:4326/3413 only (the 3857 .mvt endpoint 404s), and MapLibre renders in
 *    Web Mercator. So they come from the GIBS **WMS** endpoint, which does render
 *    them into EPSG:3857 PNG. Consequence: the hotspot layer is a picture, not
 *    features — it cannot be clicked (GIBS has GetFeatureInfo disabled). For
 *    clickable hotspots with FRP/confidence, the `fires` layer (FIRMS, 48 h) stays.
 *
 * Nothing is ingested or proxied: both endpoints are public, keyless and
 * CORS-open (`access-control-allow-origin: *`).
 */

/** shown in the MapLibre attribution control while either layer is on */
export const GIBS_ATTRIBUTION =
  'Imagery & fire detections: <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noreferrer">NASA EOSDIS Worldview / GIBS</a> (LANCE, FIRMS)';

export interface GibsProduct {
  /** the exact NASA Worldview / GIBS layer identifier — this IS the label */
  id: string;
  /** the sensor + platform, for a readable second line */
  platform: string;
  /** first date GIBS serves (from GetCapabilities) — the date picker's floor */
  start: string;
}

/** An imagery product additionally carries its tile pyramid: imagery comes from
 *  WMTS (where the pyramid is part of the URL), hotspots from WMS (where it is
 *  not a thing at all). */
export interface GibsImageryProduct extends GibsProduct {
  /** GIBS TileMatrixSet. NOT uniform: PACE/OCI is published on Level7 while
   *  every other true-colour product is on Level9, and asking for the wrong one
   *  is a hard 400 rather than an empty tile. */
  tms: string;
  /** deepest zoom GIBS actually serves for this product, verified by request
   *  (GIBS is looser than its own capabilities, so this is measured, not
   *  derived from the Level number). MapLibre stretches the last tile beyond. */
  maxZoom: number;
}

/**
 * True-colour mosaics, in the order Worldview stacks them (newest platform
 * first). VIIRS is 375 m and sharper; MODIS Terra reaches back to 2000, so it is
 * the only option for historic fire seasons (1997, 2015 haze events are before
 * VIIRS). Same five products as the shared Worldview permalink.
 */
export const GIBS_IMAGERY: GibsImageryProduct[] = [
  {
    id: "OCI_PACE_True_Color",
    platform: "OCI · PACE",
    start: "2024-02-25",
    tms: "GoogleMapsCompatible_Level7",
    maxZoom: 7, // z8 returns 400
  },
  {
    id: "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
    platform: "VIIRS · NOAA-21",
    start: "2023-02-10",
    tms: "GoogleMapsCompatible_Level9",
    maxZoom: 8,
  },
  {
    id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    platform: "VIIRS · NOAA-20",
    start: "2018-01-05",
    tms: "GoogleMapsCompatible_Level9",
    maxZoom: 8,
  },
  {
    id: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    platform: "VIIRS · Suomi NPP",
    start: "2015-11-24",
    tms: "GoogleMapsCompatible_Level9",
    maxZoom: 8,
  },
  {
    id: "MODIS_Aqua_CorrectedReflectance_TrueColor",
    platform: "MODIS · Aqua",
    start: "2002-07-03",
    tms: "GoogleMapsCompatible_Level9",
    maxZoom: 8,
  },
  {
    id: "MODIS_Terra_CorrectedReflectance_TrueColor",
    platform: "MODIS · Terra",
    start: "2000-02-24",
    tms: "GoogleMapsCompatible_Level9",
    maxZoom: 8,
  },
];
/**
 * Thermal anomalies / fire detections. "_All" = day + night passes combined
 * (Worldview's default); the FIRMS algorithm behind them is the same one the
 * `fires` layer uses. MODIS_Combined merges Aqua+Terra and reaches back to 2002.
 */
export const GIBS_HOTSPOT: GibsProduct[] = [
  {
    id: "VIIRS_NOAA21_Thermal_Anomalies_375m_All",
    platform: "VIIRS 375 m · NOAA-21",
    start: "2024-01-17",
  },
  {
    id: "VIIRS_NOAA20_Thermal_Anomalies_375m_All",
    platform: "VIIRS 375 m · NOAA-20",
    start: "2020-01-01",
  },
  {
    id: "VIIRS_SNPP_Thermal_Anomalies_375m_All",
    platform: "VIIRS 375 m · Suomi NPP",
    start: "2012-01-20",
  },
  {
    id: "MODIS_Combined_Thermal_Anomalies_All",
    platform: "MODIS 1 km · Aqua + Terra",
    start: "2002-07-04",
  },
];

const WMTS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const WMS = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi";

/**
 * Worldview's reference overlays: the place names, coastlines, borders and roads
 * that make raw imagery readable. They matter here because the true-colour layer
 * paints OVER our basemap, taking its labels with it — without these you get a
 * beautiful, unnavigable picture.
 *
 * Note these are the plain identifiers, NOT the `_15m` ones in Worldview's own
 * permalink: GIBS advertises `Reference_Labels_15m` et al. in EPSG:3857 but 404s
 * on every tile at every zoom (and `Reference_Features_15m` just aliases the
 * coastlines). The plain variants genuinely serve raster PNG across z0–8.
 *
 * All three are static — no TIME dimension — so they are unaffected by the date.
 */
export const GIBS_REFERENCE: { key: string; id: string }[] = [
  { key: "labels", id: "Reference_Labels" },
  { key: "features", id: "Reference_Features" }, // borders + roads
  { key: "coastlines", id: "Coastlines" },
];

/** WMTS REST template for a (time-independent) reference overlay */
export function gibsReferenceTiles(product: string): string {
  return `${WMTS}/${product}/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`;
}

// MODIS Terra: the deepest archive (2000) and Worldview's own default pick
export const DEFAULT_IMAGERY = "MODIS_Terra_CorrectedReflectance_TrueColor";
export const DEFAULT_HOTSPOT = GIBS_HOTSPOT[1].id; // NOAA-20, same platform

/** the reference overlays are all Level9, which tops out at z8 */
export const GIBS_REFERENCE_MAXZOOM = 8;

/** look up an imagery product (falls back to the default if the id is unknown,
 *  e.g. a stale ?kimg= from an older share link) */
export function gibsImageryProduct(productId: string): GibsImageryProduct {
  return (
    GIBS_IMAGERY.find((p) => p.id === productId) ??
    GIBS_IMAGERY.find((p) => p.id === DEFAULT_IMAGERY)!
  );
}

/** deepest zoom to request for a product — the raster source's `maxzoom` */
export function gibsImageryMaxZoom(productId: string): number {
  return gibsImageryProduct(productId).maxZoom;
}

/** WMTS REST template for a true-colour mosaic on a given day (`{z}/{y}/{x}`,
 *  note the WMTS row-before-column order). */
export function gibsImageryTiles(productId: string, date: string): string {
  const p = gibsImageryProduct(productId);
  return `${WMTS}/${p.id}/default/${date}/${p.tms}/{z}/{y}/{x}.jpg`;
}

/** WMS GetMap template for the hotspot overlay. MapLibre substitutes
 *  `{bbox-epsg-3857}` per tile; WMS 1.3.0 + EPSG:3857 takes x,y axis order, so
 *  MapLibre's minx,miny,maxx,maxy is already correct. */
export function gibsHotspotTiles(product: string, date: string): string {
  const q = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: product,
    CRS: "EPSG:3857",
    WIDTH: "512",
    HEIGHT: "512",
    FORMAT: "image/png",
    TRANSPARENT: "TRUE",
    TIME: date,
  });
  // BBOX is appended raw: URLSearchParams would percent-encode MapLibre's
  // {bbox-epsg-3857} placeholder braces and the token would never be replaced
  return `${WMS}?${q.toString()}&BBOX={bbox-epsg-3857}`;
}

const DAY_MS = 86_400_000;

/** `yyyy-mm-dd` in UTC — GIBS's time dimension is UTC, not local. */
function isoUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Newest day worth showing: **yesterday UTC**, not today.
 *
 * GIBS today is real but partial — over Indonesia the VIIRS day pass is ~06:30
 * UTC and NRT processing lands ~3 h later, so before ~09:30 UTC "today" renders
 * as a blank map, which reads as a broken layer rather than as data that hasn't
 * arrived. Yesterday is always a complete global mosaic. Today stays reachable:
 * it's `gibsMaxDate()`, the picker's ceiling.
 */
export function gibsDefaultDate(): string {
  return isoUtc(Date.now() - DAY_MS);
}

/** the picker's ceiling: today UTC (partial, but this is what Worldview shows) */
export function gibsMaxDate(): string {
  return isoUtc(Date.now());
}

/** shift a `yyyy-mm-dd` by whole days, staying in UTC and clamped to `[min, today]` */
export function gibsShiftDate(
  date: string,
  days: number,
  min: string,
): string {
  const next = isoUtc(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);
  return gibsClampDate(next, min);
}

/** keep a date inside `[min, today]` — used when the product changes to one
 *  whose archive starts later than the date currently selected */
export function gibsClampDate(date: string, min: string): string {
  const max = gibsMaxDate();
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

/** the earliest date a product is served for (falls back to the VIIRS era) */
export function gibsProductStart(productId: string): string {
  const p =
    GIBS_IMAGERY.find((x) => x.id === productId) ??
    GIBS_HOTSPOT.find((x) => x.id === productId);
  return p?.start ?? "2012-01-20";
}

/** the two map layers backed by GIBS, and which product field drives each */
export const GIBS_LAYER_IDS = ["karhutla-image", "karhutla-hotspot"] as const;

/**
 * The earliest day that is valid for every GIBS layer currently switched on:
 * the LATEST archive start among them. Both the panel (to bound the picker) and
 * the map (to sanitise a day arriving from the URL) derive the floor from this,
 * so a layer can never be left silently painting an empty day from before its
 * archive begins.
 */
export function gibsDateFloor(
  activeLayerIds: string[],
  imagery: string,
  hotspot: string,
): string {
  const starts = GIBS_LAYER_IDS.filter((id) => activeLayerIds.includes(id)).map(
    (id) => gibsProductStart(id === "karhutla-image" ? imagery : hotspot),
  );
  // nothing on: no constraint beyond the oldest archive we offer at all
  return starts.sort().pop() ?? GIBS_IMAGERY[GIBS_IMAGERY.length - 1].start;
}

/** deep link to the same day/layer on Worldview itself, framed on Indonesia —
 *  the "see it at the source" link under the layer */
export function worldviewUrl(
  imagery: string,
  hotspot: string,
  date: string,
): string {
  const layers = [
    "Reference_Labels_15m",
    "Reference_Features_15m",
    "Coastlines_15m",
    hotspot,
    imagery,
  ].join(",");
  const v = "94.5,-11.2,141.5,6.5"; // INDONESIA_BOUNDS
  return `https://worldview.earthdata.nasa.gov/?v=${v}&l=${layers}&lg=true&t=${date}`;
}
