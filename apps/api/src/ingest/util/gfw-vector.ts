import type { Geometry } from "geojson";
import { HttpService } from "../../common/http.service";

const GFW_BASE = "https://data-api.globalforestwatch.org";

export interface GfwVectorRow {
  gfw_fid: number;
  geometry: string; // ST_AsGeoJSON output, parse with parseGeometry()
  [key: string]: unknown;
}

export interface GfwVectorSource {
  dataset: string;
  /** pin versions for reproducibility (methodology principle #3) */
  version: string;
  fields: string[];
  where?: string;
  pageSize?: number;
}

/**
 * Page through a GFW Data API *vector* dataset, yielding rows with geometry
 * as a GeoJSON string (`SELECT ..., ST_AsGeoJSON(geom) AS geometry`).
 * Ordered by gfw_fid with LIMIT/OFFSET — verified supported by the API.
 */
export async function* fetchGfwVector(
  http: HttpService,
  apiKey: string,
  src: GfwVectorSource,
): AsyncGenerator<GfwVectorRow[]> {
  const pageSize = src.pageSize ?? 300;
  const where = src.where ? `WHERE ${src.where} ` : "";
  let offset = 0;

  for (;;) {
    const sql =
      `SELECT ${src.fields.join(", ")}, ST_AsGeoJSON(geom) AS geometry ` +
      `FROM data ${where}ORDER BY gfw_fid LIMIT ${pageSize} OFFSET ${offset}`;
    const res = await http.get<{ data: GfwVectorRow[] }>(
      `${GFW_BASE}/dataset/${src.dataset}/${src.version}/query/json`,
      { params: { sql }, headers: { "x-api-key": apiKey } },
    );
    const rows = res.data ?? [];
    if (rows.length > 0) yield rows;
    if (rows.length < pageSize) return;
    offset += pageSize;
  }
}

export function parseGeometry(row: GfwVectorRow): Geometry | null {
  try {
    return JSON.parse(row.geometry) as Geometry;
  } catch {
    return null;
  }
}

export function gfwDatasetUrl(src: GfwVectorSource): string {
  return `${GFW_BASE}/dataset/${src.dataset}/${src.version}`;
}
