import * as turf from "@turf/turf";
import type {
  Feature,
  Geometry,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

/** area in hectares of a (Multi)Polygon feature */
export function areaHa(geom: Polygon | MultiPolygon): number {
  return Math.round((turf.area(geom) / 10_000) * 100) / 100;
}

/** simplified copy for low zooms / API geometry payloads (~1km tolerance) */
export function simplifyGeom<G extends Geometry>(geom: G, toleranceDeg = 0.01): G {
  try {
    return turf.simplify(turf.feature(geom as Polygon), {
      tolerance: toleranceDeg,
      highQuality: false,
    }).geometry as unknown as G;
  } catch {
    return geom;
  }
}

export function isPolygonal(
  f: Feature,
): f is Feature<Polygon | MultiPolygon> {
  return (
    f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
  );
}

/**
 * Repair (Multi)Polygons that Mongo's 2dsphere index rejects with
 * "secondary loops must be holes": some sources (e.g. KLHK PIPPIB) encode
 * disjoint outer rings as extra rings of one polygon. Keep genuine holes
 * (rings contained by the exterior), promote everything else to its own
 * polygon.
 */
export function repairRings(geom: Polygon | MultiPolygon): MultiPolygon {
  const polygons =
    geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const out: Position[][][] = [];

  for (const rings of polygons) {
    const [outer, ...rest] = rings;
    if (!outer || outer.length < 4) continue;
    const kept: Position[][] = [outer];
    for (const ring of rest) {
      if (ring.length < 4) continue;
      let isHole = false;
      try {
        isHole = turf.booleanContains(
          turf.polygon([outer]),
          turf.polygon([ring]),
        );
      } catch {
        // unparseable ring: treat as standalone polygon
      }
      if (isHole) kept.push(ring);
      else out.push([ring]);
    }
    out.push(kept);
  }

  return { type: "MultiPolygon", coordinates: out };
}

/** Minimal CSV parser with quoted-field support; good enough for registry
 *  table exports (MODI, Trase). Returns array of header-keyed records. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f !== "")) rows.push(row);
  }

  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => (rec[h] = (r[idx] ?? "").trim()));
    return rec;
  });
}
