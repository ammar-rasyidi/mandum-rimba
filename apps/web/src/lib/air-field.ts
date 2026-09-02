/**
 * The maths behind the animated air map: turning the PM2.5 grid into a smooth
 * colour field, and the wind grid into something a particle can be advected
 * through. Both are bilinear between nodes, on their own resolutions.
 *
 * Kept out of the component so both halves are testable, and so the honest part
 * stays visible: every value between nodes is interpolated, not measured.
 */

/**
 * US EPA AQI colours, with a blue tail below the scale.
 *
 * This is the one place a red/green ramp is allowed despite the palette rule:
 * it is not encoding two categories by hue alone, it is a monotonic severity
 * ramp that also rises in saturation and falls in luminance, so it survives
 * colour-blind viewing and greyscale. It is the ramp people already recognise
 * from every air-quality app, and inventing our own would cost comprehension
 * for no gain.
 *
 * Each colour sits at the TOP of its EPA category, so the gradient crosses
 * into the next hue exactly where the category does: still green at 50, yellow
 * at 100, red at 200. Putting yellow at 50 instead — the obvious first guess —
 * paints the whole of "Sedang" and half of "Baik" yellow, which reads as an
 * alarm over air that is merely ordinary.
 *
 * EPA paints all of 0–50 one green, which flattens genuinely clean air and
 * merely acceptable air into one colour. Open ocean here sits at 7–11 µg/m³
 * (AQI 41–54), so the whole "Baik" band runs blue → green instead, the way the
 * wind maps this is compared against do it. That is a purely cosmetic choice
 * inside a single category — the hues from 100 up still sit exactly on the EPA
 * boundaries (yellow at 100, orange at 150, red at 200), so the legend's ticks
 * remain literally readable off the map.
 */
export const AQI_RAMP: { aqi: number; rgb: [number, number, number] }[] = [
  { aqi: 0, rgb: [38, 74, 178] }, // deep blue — genuinely clean air
  { aqi: 45, rgb: [40, 130, 190] }, // still blue through most of "Baik"
  { aqi: 60, rgb: [0, 158, 110] }, // green
  { aqi: 100, rgb: [255, 222, 51] }, // top of Sedang: yellow
  { aqi: 150, rgb: [255, 150, 40] }, // top of Tidak Sehat bagi kel. sensitif
  { aqi: 200, rgb: [204, 0, 51] }, // top of Tidak Sehat: red
  { aqi: 300, rgb: [102, 0, 153] }, // top of Sangat Tidak Sehat: purple
  { aqi: 500, rgb: [110, 0, 30] }, // Berbahaya, to the end of the scale
  { aqi: 900, rgb: [55, 0, 15] }, // extrapolated, past anything EPA defines
];

export function aqiColor(aqi: number): [number, number, number] {
  if (aqi <= AQI_RAMP[0].aqi) return AQI_RAMP[0].rgb;
  for (let i = 1; i < AQI_RAMP.length; i++) {
    const hi = AQI_RAMP[i];
    if (aqi <= hi.aqi) {
      const lo = AQI_RAMP[i - 1];
      const t = (aqi - lo.aqi) / (hi.aqi - lo.aqi);
      return [
        Math.round(lo.rgb[0] + t * (hi.rgb[0] - lo.rgb[0])),
        Math.round(lo.rgb[1] + t * (hi.rgb[1] - lo.rgb[1])),
        Math.round(lo.rgb[2] + t * (hi.rgb[2] - lo.rgb[2])),
      ];
    }
  }
  return AQI_RAMP[AQI_RAMP.length - 1].rgb;
}

export interface FieldBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Output pixels per grid cell, chosen from the grid's size rather than fixed.
 *
 * Rasterising is bicubic — 16 lookups per output pixel, single-threaded — so
 * cost is (cells x subsample^2). A constant that is comfortable for a regional
 * box becomes seconds of frozen main thread when the box grows: at 10 px/cell
 * an Asia-wide grid is 8.2 Mpx and ~132 million operations, and the canvas also
 * approaches the 4096 px WebGL texture limit.
 *
 * Holding the CANVAS roughly constant instead keeps the work flat whatever the
 * extent. Nothing is lost from the data: the grid stays at CAMS's own 0.4°, and
 * the bicubic curve between nodes is simply sampled less densely before the GPU
 * scales it up — which it does smoothly anyway.
 */
const TARGET_CANVAS_PX = 1_400_000;
const SUBSAMPLE_MIN = 2;
const SUBSAMPLE_MAX = 10;

function subsampleFor(nx: number, ny: number): number {
  const cells = Math.max(1, (nx - 1) * (ny - 1));
  const ideal = Math.round(Math.sqrt(TARGET_CANVAS_PX / cells));
  return Math.min(SUBSAMPLE_MAX, Math.max(SUBSAMPLE_MIN, ideal));
}
/**
 * Opacity: rich, the way the reference wind maps render this, and it can be
 * rich *because* the field now sits beneath `basemap-labels` (see
 * AirField.tsx). Place names and administrative boundaries are drawn over it,
 * so colour strength and map legibility no longer compete — which is what made
 * an earlier, much fainter version necessary.
 *
 * It still rises with concentration rather than being flat: ordinary air reads
 * as a calm wash, a plume as something dense. The gamma below 1 brings the
 * middle of the range up quickly, so haze is visible well before it is
 * hazardous.
 */
/** AQI at which opacity reaches its ceiling — the top of "Tidak Sehat". */
const SEVERITY_FULL_AQI = 200;
/** clean air still carries its colour; the basemap reads through it */
const MIN_ALPHA = 0.7;
/** never quite 1: the terrain under the worst plume stays faintly present */
const MAX_ALPHA = 0.95;
/** <1 so the mid range comes up fast, matching the reference's saturation */
const SEVERITY_GAMMA = 0.7;
/** grid cells of fade at the field's border */
const EDGE_FADE_CELLS = 2;

export interface RasterResult {
  canvas: HTMLCanvasElement;
  /** the box the canvas covers, for an ImageSource's corner coordinates */
  box: FieldBox;
}

export interface GridLayer {
  nx: number;
  ny: number;
  step: number;
  /** scaled integers: µg/m³ × 10 or m/s × 10; null where unknown */
  values: (number | null)[];
}

export interface AirGridData {
  bbox: [number, number, number, number];
  pm25: GridLayer;
  u: GridLayer;
  v: GridLayer;
  maxSpeed: number;
  validAt: string | null;
  attribution: string;
}

/**
 * Rasterise the PM2.5 grid straight into an RGBA image, bicubically between
 * nodes. No scattered-point interpolation any more: the grid IS the field, and
 * treating it as a cloud of points was what produced circular blobs.
 *
 * Alpha is severity, not confidence — the grid covers the whole box, so there
 * is a modelled value everywhere in it. Clean air paints a little lighter than
 * a plume: enough that labels and coastlines read through, not so little that
 * the field breaks into disconnected islands. It fades at the box edge so the
 * layer does not end on a hard rectangle.
 *
 * Longitude convergence is ignored. The box reaches 22° N where the cosine
 * factor is 0.93, shifting apparent width by well under one 1° cell.
 */
/** Catmull-Rom through four samples; t is the position between p1 and p2. */
function cubic(p0: number, p1: number, p2: number, p3: number, t: number) {
  const a = 2 * p1;
  const b = p2 - p0;
  const c = 2 * p0 - 5 * p1 + 4 * p2 - p3;
  const d = -p0 + 3 * p1 - 3 * p2 + p3;
  return 0.5 * (a + b * t + c * t * t + d * t * t * t);
}

/**
 * Bicubic sample of the grid.
 *
 * Bilinear was the obvious choice and it is the wrong one here: it is
 * continuous but its SLOPE jumps at every cell boundary, so a steep colour ramp
 * turns those joins into visible facets — the stair-stepped plume edges this
 * replaced. Catmull-Rom is smooth across boundaries, which costs 16 lookups
 * instead of 4 and buys an organic edge.
 *
 * It overshoots either side of a sharp gradient, so the result is bounded by
 * the samples that bracket it. Clamping at zero instead — the obvious first
 * guess — leaves the overshoot above and turns the undershoot into a hard
 * straight edge where it crosses zero, drawing a moat of clean air around
 * every fire cell.
 *
 * Falls back to bilinear when the 4×4 neighbourhood has a gap, and to
 * transparent when even the inner 2×2 does — a hole in the model is not clean air.
 */
function sampleBicubic(
  at: (x: number, y: number) => number | null,
  x0: number,
  y0: number,
  tx: number,
  ty: number,
): number | null {
  const rows: number[] = [];
  let complete = true;
  for (let j = -1; j <= 2 && complete; j++) {
    const p: number[] = [];
    for (let i = -1; i <= 2; i++) {
      const v = at(x0 + i, y0 + j);
      if (v == null) {
        complete = false;
        break;
      }
      p.push(v);
    }
    if (complete) {
      // same bracket in the x direction, before the rows are combined
      const v = cubic(p[0], p[1], p[2], p[3], tx);
      rows.push(
        Math.min(Math.max(p[1], p[2]), Math.max(Math.min(p[1], p[2]), v)),
      );
    }
  }
  if (complete && rows.length === 4) {
    const v = cubic(rows[0], rows[1], rows[2], rows[3], ty);
    // Clamp to the four samples that bracket this point, not to zero.
    //
    // Catmull-Rom overshoots either side of a steep step, and CAMS produces
    // very steep ones — a fire cell at 380 ug/m3 beside neighbours under 10.
    // The undershoot went negative, `Math.max(0, ...)` flattened it, and the
    // contour where it crossed zero rendered as a hard straight edge cutting
    // across the plume: a moat of clean air that does not exist.
    //
    // Bounding by the surrounding values removes overshoot in both directions
    // while leaving the curve untouched wherever it stays between them, which
    // is everywhere the field is smooth.
    const lo = Math.min(rows[1], rows[2]);
    const hi = Math.max(rows[1], rows[2]);
    return Math.min(hi, Math.max(lo, v));
  }

  const c00 = at(x0, y0);
  const c10 = at(x0 + 1, y0);
  const c01 = at(x0, y0 + 1);
  const c11 = at(x0 + 1, y0 + 1);
  if (c00 == null || c10 == null || c01 == null || c11 == null) return null;
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  return lerp(lerp(c00, c10, tx), lerp(c01, c11, tx), ty);
}

/**
 * Web Mercator vertical coordinate. MapLibre stretches an ImageSource linearly
 * in THIS, not in latitude — so a raster whose rows are evenly spaced in
 * latitude lands in the wrong place, by more the taller the box is.
 *
 * Over the old Southeast Asia box (13S-22N) the error peaked at 0.3 deg and was
 * invisible. Over Asia and Australasia (50S-60N) it reaches 3.5 deg at Borneo
 * and 6.2 deg at 22N — the whole field drawn several hundred kilometres north
 * of where its values belong. Rows are therefore spaced in Mercator and the
 * latitude for each row is recovered by inverting it.
 */
function mercY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

function invMercY(y: number): number {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}

export function rasteriseGrid(
  pm: GridLayer,
  box: FieldBox,
  aqiOf: (pm25: number) => number,
): RasterResult | null {
  if (pm.values.length === 0 || pm.nx < 2 || pm.ny < 2) return null;

  const sub = subsampleFor(pm.nx, pm.ny);
  const w = (pm.nx - 1) * sub;
  const h = (pm.ny - 1) * sub;
  if (w <= 0 || h <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);

  /** grid value, clamped at the edges so the cubic kernel always has 4 samples */
  const at = (x: number, y: number): number | null => {
    const cx = Math.min(pm.nx - 1, Math.max(0, x));
    const cy = Math.min(pm.ny - 1, Math.max(0, y));
    const v = pm.values[cy * pm.nx + cx];
    return v == null ? null : v / 10;
  };

  // rows are laid out in Mercator so the image lands where its values belong
  const yTop = mercY(box.north);
  const yBot = mercY(box.south);
  const latStep = (box.north - box.south) / (pm.ny - 1);

  for (let py = 0; py < h; py++) {
    // canvas rows run top-down (north first); the grid runs south-up
    const lat = invMercY(yTop + (py / (h - 1)) * (yBot - yTop));
    const gy = Math.min(pm.ny - 1, Math.max(0, (lat - box.south) / latStep));
    const y0 = Math.min(pm.ny - 2, Math.floor(gy));
    const ty = gy - y0;
    for (let px = 0; px < w; px++) {
      const gx = (px / (w - 1)) * (pm.nx - 1);
      const x0 = Math.min(pm.nx - 2, Math.floor(gx));
      const tx = gx - x0;

      const o = (py * w + px) * 4;
      const value = sampleBicubic(at, x0, y0, tx, ty);
      if (value == null) {
        img.data[o + 3] = 0;
        continue;
      }

      const aqi = aqiOf(value);
      const [r, g, bl] = aqiColor(aqi);
      const sev = Math.min(1, Math.max(0, aqi / SEVERITY_FULL_AQI));
      // soften the rectangle the model's own box ends on
      const edgeCells = Math.min(px, w - 1 - px, py, h - 1 - py) / sub;
      const edge = Math.max(0, Math.min(1, edgeCells / EDGE_FADE_CELLS));
      const a =
        (MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * Math.pow(sev, SEVERITY_GAMMA)) *
        edge;

      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = bl;
      img.data[o + 3] = Math.round(255 * a);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, box };
}

/**
 * Bilinear sample of any GridLayer at a lon/lat, in the layer's own units
 * (µg/m³ or m/s). Returns null outside the box or over a gap — a hole in the
 * model is not a zero.
 */
export function sampleLayer(
  layer: GridLayer,
  bbox: [number, number, number, number],
  lon: number,
  lat: number,
): number | null {
  const fx = (lon - bbox[0]) / layer.step;
  const fy = (lat - bbox[1]) / layer.step;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number): number | null => {
    if (x < 0 || y < 0 || x >= layer.nx || y >= layer.ny) return null;
    const v = layer.values[y * layer.nx + x];
    return v == null ? null : v / 10;
  };
  const c00 = at(x0, y0);
  const c10 = at(x0 + 1, y0);
  const c01 = at(x0, y0 + 1);
  const c11 = at(x0 + 1, y0 + 1);
  if (c00 == null || c10 == null || c01 == null || c11 == null) return null;
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  return lerp(lerp(c00, c10, tx), lerp(c01, c11, tx), ty);
}

/**
 * Bilinear sampling of the wind grid. Returns metres per second in the
 * direction the wind blows, or null outside the grid / over a gap — the caller
 * must respawn a particle rather than treat null as calm, or particles pile up
 * in the holes.
 */
export class WindSampler {
  private readonly west: number;
  private readonly south: number;
  private readonly nx: number;
  private readonly ny: number;
  private readonly step: number;

  constructor(private readonly data: AirGridData) {
    this.west = data.bbox[0];
    this.south = data.bbox[1];
    this.nx = data.u.nx;
    this.ny = data.u.ny;
    this.step = data.u.step;
  }

  get maxSpeed(): number {
    return this.data.maxSpeed || 1;
  }

  private at(x: number, y: number): [number, number] | null {
    if (x < 0 || y < 0 || x >= this.nx || y >= this.ny) return null;
    const i = y * this.nx + x;
    const uu = this.data.u.values[i];
    const vv = this.data.v.values[i];
    if (uu == null || vv == null) return null;
    return [uu / 10, vv / 10];
  }

  sample(lon: number, lat: number): [number, number] | null {
    const fx = (lon - this.west) / this.step;
    const fy = (lat - this.south) / this.step;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;

    const c00 = this.at(x0, y0);
    const c10 = this.at(x0 + 1, y0);
    const c01 = this.at(x0, y0 + 1);
    const c11 = this.at(x0 + 1, y0 + 1);
    if (!c00 || !c10 || !c01 || !c11) return null;

    const lerp = (a: number, b: number, t: number) => a + t * (b - a);
    return [
      lerp(lerp(c00[0], c10[0], tx), lerp(c01[0], c11[0], tx), ty),
      lerp(lerp(c00[1], c10[1], tx), lerp(c01[1], c11[1], tx), ty),
    ];
  }

  /** true when the point is inside the field's box at all */
  contains(lon: number, lat: number): boolean {
    const [w, s, e, n] = this.data.bbox;
    return lon >= w && lon <= e && lat >= s && lat <= n;
  }
}
