/**
 * Geodesic measurement helpers: area of a GeoJSON Polygon / MultiPolygon in
 * hectares, and great-circle distance along a path in metres (the ruler tool).
 *
 * Uses the spherical-excess ring formula (the same one @turf/area and
 * @mapbox/geojson-area use) on the WGS84 sphere, so there's no dependency and
 * it's accurate to well under 1% for the polygon sizes on this map. Used to
 * label wetland-habitat features (mangrove) whose tiles carry no area attribute;
 * peatland tiles ship an exact source `shape_Area`, so prefer that when present.
 */
const R = 6_378_137; // WGS84 equatorial radius (m)
const RAD = Math.PI / 180;

function ringArea(ring: number[][]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % n];
    total +=
      (lon2 - lon1) * RAD * (2 + Math.sin(lat1 * RAD) + Math.sin(lat2 * RAD));
  }
  return (total * R * R) / 2;
}

function polygonArea(rings: number[][][]): number {
  if (!rings?.length) return 0;
  let area = Math.abs(ringArea(rings[0])); // outer ring
  for (let i = 1; i < rings.length; i++) area -= Math.abs(ringArea(rings[i])); // holes
  return Math.max(area, 0);
}

/** Area in hectares of a GeoJSON Polygon or MultiPolygon geometry. */
export function geodesicAreaHa(geom: unknown): number {
  const g = geom as { type?: string; coordinates?: unknown };
  if (!g?.type) return 0;
  let m2 = 0;
  if (g.type === "Polygon") {
    m2 = polygonArea(g.coordinates as number[][][]);
  } else if (g.type === "MultiPolygon") {
    for (const poly of (g.coordinates as number[][][][]) ?? [])
      m2 += polygonArea(poly);
  }
  return m2 / 10_000;
}


/**
 * Great-circle distance between two [lon, lat] points, in metres (haversine on
 * the WGS84 sphere). Good to ~0.3% against the ellipsoid, far tighter than the
 * precision anyone reads off a map ruler.
 */
export function haversineM(
  a: [number, number],
  b: [number, number],
): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const lat1 = a[1] * RAD;
  const lat2 = b[1] * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length of a [lon, lat] path, in metres (0 for fewer than 2 points). */
export function pathLengthM(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += haversineM(points[i - 1], points[i]);
  return total;
}

/** Ruler readout: metres under 1 km, otherwise kilometres, localised. */
export function formatDistance(metres: number, locale: string): string {
  if (metres < 1000)
    return `${metres.toLocaleString(locale, { maximumFractionDigits: 0 })} m`;
  return `${(metres / 1000).toLocaleString(locale, {
    maximumFractionDigits: metres < 10_000 ? 2 : 1,
  })} km`;
}
