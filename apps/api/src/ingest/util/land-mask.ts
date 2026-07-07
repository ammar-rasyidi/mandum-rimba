import { INDONESIA_LAND } from "../data/indonesia-land";

/**
 * Fast point-in-Indonesia-land test, to drop corrupt occurrence points that fall
 * in the open sea (a land plant plotted offshore is a georeferencing error). The
 * polygon carries a ~4 km coastal buffer, so legitimate shore / small-island /
 * mangrove records are kept. Each ring is bbox-culled first, so most points only
 * ray-cast against one or two rings.
 */
interface Ring {
  pts: number[][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const RINGS: Ring[] = INDONESIA_LAND.map((pts) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { pts, minX, minY, maxX, maxY };
});

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/** True if (lon, lat) is on Indonesian land (within the coastal buffer). */
export function onLand(lon: number, lat: number): boolean {
  for (const r of RINGS) {
    if (lon < r.minX || lon > r.maxX || lat < r.minY || lat > r.maxY) continue;
    if (inRing(lon, lat, r.pts)) return true;
  }
  return false;
}
