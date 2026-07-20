/**
 * GFW (Hansen/UMD) tree cover loss, served live as encoded raster tiles.
 *
 * Each pixel encodes the loss YEAR in its blue channel — year = 2000 + blue,
 * so blue 1..25 = 2001..2025; the red channel is loss intensity and green is
 * unused. MapLibre has no `raster-color`, so the `gfwloss://` protocol
 * (see gfw-loss-protocol.ts) decodes and recolours each tile by year in a
 * canvas — the encoded tiles come straight from GFW's CDN (CORS-open). Canopy
 * density is pre-filtered server-side to >30% (the `tcd_30` path), GFW's
 * standard "tree cover" threshold.
 */
export const LOSS_ATTRIBUTION =
  "Tree cover loss: Hansen/UMD/Google/USGS/NASA, via Global Forest Watch";

/** first & last loss years the encoded raster carries (blue 1..25) */
export const LOSS_YEAR_MIN = 2001;
export const LOSS_YEAR_MAX = 2025;
export const LOSS_YEARS: number[] = Array.from(
  { length: LOSS_YEAR_MAX - LOSS_YEAR_MIN + 1 },
  (_, i) => LOSS_YEAR_MIN + i,
);
/** canopy-density threshold baked into the tile path (tcd_30) */
export const LOSS_CANOPY = 30;
/** GFW's own tree-cover-loss pink, rgb(220,102,153) */
export const LOSS_COLOR = "#dc6699";

/**
 * Density ramp for the loss raster: the encoded intensity (0..1, how much of a
 * pixel/area was lost) is mapped through these `[position, hex]` stops, so
 * sparse loss reads amber and wholesale clearing reads deep red — a heatmap
 * rather than a flat colour. Shared by the recolour protocol (LUT) and the
 * timeline legend so they never drift.
 */
export const LOSS_RAMP: [number, string][] = [
  [0.0, "#fde68a"], // amber — sparse
  [0.25, "#fdba4d"],
  [0.45, "#fb8c3a"],
  [0.65, "#f2612c"],
  [0.82, "#dc2f1f"],
  [1.0, "#7a0d15"], // deep red — wholesale clearing
];
