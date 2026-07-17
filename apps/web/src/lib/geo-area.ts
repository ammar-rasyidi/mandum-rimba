/**
 * Geodesic area of a GeoJSON Polygon / MultiPolygon, in hectares.
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
