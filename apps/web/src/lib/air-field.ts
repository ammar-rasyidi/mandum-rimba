/**
 * The maths behind the animated air map: turning a coarse regional grid plus
 * 502 irregular district readings into one smooth colour field, and the wind
 * nodes into something a particle can be advected through.
 *
 * Kept out of the component so both halves are testable, and so the honest
 * parts stay visible: which readings are sharp and local, which are a broad
 * modelled backdrop, and where a wind vector is interpolated rather than known.
 */

export interface AirPoint {
  lon: number;
  lat: number;
  pm25: number;
  /**
   * Gaussian half-width in degrees. Two populations share one raster: district
   * readings are local and sharp (small sigma), the regional CAMS grid nodes
   * are a broad backdrop (large sigma). Weighting them by their own scale lets
   * a district override the backdrop near itself without punching a hole in it.
   */
  sigma: number;
}

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
 * EPA paints all of 0–50 one green. Over an ocean that flattens genuinely
 * clean air and merely acceptable air together, so the bottom of the range runs
 * blue → green, the way the wind maps people compare this to do it. Category
 * boundaries above 50 match PM25_BREAKPOINTS in @mandumrimba/shared exactly.
 */
export const AQI_RAMP: { aqi: number; rgb: [number, number, number] }[] = [
  { aqi: 0, rgb: [45, 90, 190] }, // blue — cleaner than the EPA scale bothers to
  { aqi: 25, rgb: [0, 153, 102] }, // green, well inside "Baik"
  { aqi: 50, rgb: [128, 190, 70] }, // top of Baik, still green
  { aqi: 100, rgb: [255, 222, 51] }, // top of Sedang: yellow
  { aqi: 150, rgb: [255, 140, 40] }, // top of Tidak Sehat bagi kel. sensitif
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

/** ~0.25° cells: fine enough that a plume has shape, coarse enough that the
 *  whole raster is built in one frame. The canvas is upscaled with smoothing
 *  afterwards, so this is not the visible resolution. */
const CELL = 0.25;
/** Beyond this many sigmas a point contributes nothing, which bounds the
 *  neighbour search. */
const REACH_SIGMAS = 2.2;
/** AQI at which the field reaches full strength. Clean air still paints (at
 *  MIN_ALPHA) because a continuous field is the whole point — a plume reads as
 *  a plume only against air you can also see. */
const SEVERITY_FULL_AQI = 110;
/** clean air is tinted, not erased: the basemap shows through it */
const MIN_ALPHA = 0.55;
/** Degrees of fade at the field's border, so the raster does not end on a
 *  hard rectangle where the model's box happens to stop. */
const EDGE_FADE_DEG = 2;

export interface RasterResult {
  canvas: HTMLCanvasElement;
  /** the box the canvas covers, for an ImageSource's corner coordinates */
  box: FieldBox;
}

/**
 * Gaussian inverse-distance interpolation of both point populations into one
 * RGBA raster. Each point carries its own sigma, so the sharp district
 * readings win near themselves while the broad regional grid fills everywhere
 * else — including across the border, which is the point: haze does not stop
 * at a coastline.
 *
 * Alpha is severity, not confidence: the regional grid covers the whole box, so
 * there IS a modelled value everywhere in it. Clean air is painted only a
 * little lighter than a plume — enough that labels and coastlines read through
 * it, not so little that the field breaks into disconnected blobs. It fades
 * out again at the box's own edge so the layer does not end on a rectangle.
 *
 * Longitude convergence is ignored. The box reaches 25° N where the cosine
 * factor is 0.91, which shifts a blob's apparent width by under half a cell —
 * below the resolution of a 2.5° model.
 */
export function rasterisePm25(
  points: AirPoint[],
  box: FieldBox,
  aqiOf: (pm25: number) => number,
): RasterResult | null {
  if (points.length === 0) return null;

  const w = Math.round((box.east - box.west) / CELL);
  const h = Math.round((box.north - box.south) / CELL);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);

  // bucket by whole degree so each cell only weighs plausible neighbours
  const buckets = new Map<string, AirPoint[]>();
  const key = (lon: number, lat: number) =>
    `${Math.floor(lon)}|${Math.floor(lat)}`;
  let maxSigma = 0;
  for (const p of points) {
    const k = key(p.lon, p.lat);
    const b = buckets.get(k);
    if (b) b.push(p);
    else buckets.set(k, [p]);
    if (p.sigma > maxSigma) maxSigma = p.sigma;
  }
  const reach = Math.ceil(maxSigma * REACH_SIGMAS);

  for (let y = 0; y < h; y++) {
    // canvas rows run top-down (north first); the box runs south-up
    const lat = box.north - (y + 0.5) * CELL;
    for (let x = 0; x < w; x++) {
      const lon = box.west + (x + 0.5) * CELL;

      let wsum = 0;
      let vsum = 0;
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dy = -reach; dy <= reach; dy++) {
          const b = buckets.get(key(lon + dx, lat + dy));
          if (!b) continue;
          for (const p of b) {
            const ddx = p.lon - lon;
            const ddy = p.lat - lat;
            const d2 = ddx * ddx + ddy * ddy;
            const cut = p.sigma * REACH_SIGMAS;
            if (d2 > cut * cut) continue;
            // 1/sigma keeps a sharp local point from being drowned out by the
            // many broad grid nodes around it
            const wt = Math.exp(-d2 / (2 * p.sigma * p.sigma)) / p.sigma;
            wsum += wt;
            vsum += wt * p.pm25;
          }
        }
      }

      const o = (y * w + x) * 4;
      if (wsum === 0) {
        img.data[o + 3] = 0;
        continue;
      }
      const aqi = aqiOf(vsum / wsum);
      const [r, g, bl] = aqiColor(aqi);
      // Opacity rises with severity. Clean air is the normal state over most of
      // the region, and painting it in solid colour makes an ordinary day look
      // like an emergency; letting the basemap through where there is nothing
      // to report is both easier to read and more honest about what matters.
      const sev = Math.min(1, Math.max(0, aqi / SEVERITY_FULL_AQI));
      // soften the rectangle the model's own box ends on
      const edge = Math.min(
        lon - box.west,
        box.east - lon,
        lat - box.south,
        box.north - lat,
      );
      const a =
        (MIN_ALPHA + (1 - MIN_ALPHA) * Math.pow(sev, 0.75)) *
        Math.max(0, Math.min(1, edge / EDGE_FADE_DEG));
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = bl;
      img.data[o + 3] = Math.round(255 * a);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, box };
}

// ---------------------------------------------------------------------------

export interface AirGridData {
  bbox: [number, number, number, number];
  nx: number;
  ny: number;
  step: number;
  u: (number | null)[];
  v: (number | null)[];
  pm25: (number | null)[];
  maxSpeed: number;
  validAt: string | null;
  attribution: string;
}

/** The grid's PM2.5 nodes as interpolation points, forming the regional
 *  backdrop under the finer district readings. */
export function gridPoints(data: AirGridData, sigma: number): AirPoint[] {
  const out: AirPoint[] = [];
  for (let y = 0; y < data.ny; y++) {
    for (let x = 0; x < data.nx; x++) {
      const p = data.pm25[y * data.nx + x];
      if (p == null) continue;
      out.push({
        lon: data.bbox[0] + x * data.step,
        lat: data.bbox[1] + y * data.step,
        pm25: p / 10,
        sigma,
      });
    }
  }
  return out;
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

  constructor(private readonly data: AirGridData) {
    this.west = data.bbox[0];
    this.south = data.bbox[1];
  }

  get maxSpeed(): number {
    return this.data.maxSpeed || 1;
  }

  private at(x: number, y: number): [number, number] | null {
    const { nx, ny, u, v } = this.data;
    if (x < 0 || y < 0 || x >= nx || y >= ny) return null;
    const i = y * nx + x;
    const uu = u[i];
    const vv = v[i];
    if (uu == null || vv == null) return null;
    return [uu / 10, vv / 10];
  }

  sample(lon: number, lat: number): [number, number] | null {
    const { step } = this.data;
    const fx = (lon - this.west) / step;
    const fy = (lat - this.south) / step;
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
