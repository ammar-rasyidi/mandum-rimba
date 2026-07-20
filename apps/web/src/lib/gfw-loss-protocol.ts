import maplibregl from "maplibre-gl";
import { LOSS_RAMP } from "./forest-loss";
import aseanBoundaryRaw from "@/data/asean-boundary.json";

/**
 * MapLibre GL JS (unlike Mapbox v3) has no `raster-color`, so we can't filter
 * GFW's encoded loss raster by year in a shader. Instead we register a custom
 * tile protocol that fetches the encoded GFW tile and recolours it in a canvas:
 * every pixel whose blue channel (loss year − 2000) falls within 2001..endYear
 * becomes GFW magenta, everything else transparent. The endYear travels in the
 * tile URL (`gfwloss://<endYear>/{z}/{x}/{y}`), so scrubbing the timeline just
 * calls `setTiles` with a new URL and the visible tiles re-render.
 */
export const GFW_LOSS_PROTOCOL = "gfwloss";
const GFW_TCD30 =
  "https://tiles.globalforestwatch.org/umd_tree_cover_loss/latest/tcd_30";

/** tile URL template for the raster source, encoding the cumulative end year */
export function gfwLossTiles(endYear: number): string {
  return `${GFW_LOSS_PROTOCOL}://${endYear}/{z}/{x}/{y}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 256-entry colour lookup table for the density ramp (intensity 0..255 → rgb),
// built once so the per-pixel recolour is a cheap array read.
const LUT: Uint8Array = (() => {
  const stops = LOSS_RAMP.map(([pos, hex]) => [pos, hexToRgb(hex)] as const);
  const lut = new Uint8Array(256 * 3);
  for (let v = 0; v < 256; v++) {
    const t = v / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        a = stops[s];
        b = stops[s + 1];
        break;
      }
    }
    const span = b[0] - a[0] || 1;
    const f = Math.min(Math.max((t - a[0]) / span, 0), 1);
    for (let c = 0; c < 3; c++) {
      lut[v * 3 + c] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * f);
    }
  }
  return lut;
})();

// ---- ASEAN boundary clip -------------------------------------------------
// Precompute each boundary polygon with its lng/lat bbox so a tile only tests
// (and draws) the polygons it actually overlaps. Web-mercator helpers project
// lng/lat into the tile's pixel space so we can rasterise the outline and keep
// only the loss pixels inside a member country (destination-in), instead of a
// crude rectangle.
interface ClipPoly {
  rings: number[][][];
  bbox: [number, number, number, number]; // [w, s, e, n]
}
const ASEAN_POLYS: ClipPoly[] = (
  aseanBoundaryRaw as { coordinates: number[][][][] }
).coordinates.map((rings) => {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const ring of rings)
    for (const [x, y] of ring) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  return { rings, bbox: [w, s, e, n] };
});

const mercY = (lat: number): number => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); // normalised 0..1
};
const mercYToLat = (my: number): number =>
  (180 / Math.PI) * Math.atan(Math.sinh(Math.PI - 2 * Math.PI * my));

let registered = false;

/** Register the `gfwloss://` protocol once (client-only). */
export function registerGfwLossProtocol(): void {
  if (registered || typeof window === "undefined") return;
  registered = true;

  maplibregl.addProtocol(GFW_LOSS_PROTOCOL, async (params) => {
    // params.url = "gfwloss://2020/5/12/8"
    const [endYearStr, zStr, x, y] = params.url
      .replace(`${GFW_LOSS_PROTOCOL}://`, "")
      .replace(/\.png$/, "")
      .split("/");
    const endOffset = Number(endYearStr) - 2000; // blue value of last visible year
    const zoom = Number(zStr);
    // GFW's own intensity power-scale: boosts faint loss so it stays crisp when
    // zoomed out, easing to linear by z13. This is what makes their map read
    // well instead of as a flat blob.
    const exponent = zoom < 13 ? 0.3 + (zoom - 3) / 20 : 1;

    const res = await fetch(`${GFW_TCD30}/${zStr}/${x}/${y}.png`);
    if (!res.ok) return { data: new Uint8Array() }; // ocean / no-data tile
    const bmp = await createImageBitmap(await res.blob());
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const intensity = d[i]; // red channel = loss intensity (0..255)
      const year = d[i + 2]; // blue channel = loss year offset (1..25)
      if (year >= 1 && year <= endOffset) {
        const li = intensity * 3;
        d[i] = LUT[li]; // density-ramp colour: amber (sparse) → deep red (dense)
        d[i + 1] = LUT[li + 1];
        d[i + 2] = LUT[li + 2];
        d[i + 3] = Math.round(Math.pow(intensity / 255, exponent) * 255);
      } else {
        d[i + 3] = 0; // hide non-loss / future-year pixels
      }
    }
    ctx.putImageData(img, 0, 0);

    // clip the recoloured loss to the actual ASEAN outline (not a rectangle):
    // draw the member-country polygons in this tile's pixel space, then keep
    // only the pixels inside them.
    const TS = canvas.width;
    const scale = Math.pow(2, zoom);
    const tx = Number(x);
    const ty = Number(y);
    const tileW = (tx / scale) * 360 - 180;
    const tileE = ((tx + 1) / scale) * 360 - 180;
    const tileN = mercYToLat(ty / scale);
    const tileS = mercYToLat((ty + 1) / scale);

    ctx.beginPath();
    let drew = false;
    for (const poly of ASEAN_POLYS) {
      const [w, s, e, n] = poly.bbox;
      if (e < tileW || w > tileE || n < tileS || s > tileN) continue; // bbox cull
      for (const ring of poly.rings) {
        for (let i = 0; i < ring.length; i++) {
          const px = (((ring[i][0] + 180) / 360) * scale - tx) * TS;
          const py = (mercY(ring[i][1]) * scale - ty) * TS;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      drew = true;
    }
    if (drew) {
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = "#000";
      ctx.fill("evenodd");
    } else {
      ctx.clearRect(0, 0, TS, canvas.height); // tile is entirely outside ASEAN
    }

    const out = await canvas.convertToBlob({ type: "image/png" });
    return { data: await out.arrayBuffer() };
  });
}
