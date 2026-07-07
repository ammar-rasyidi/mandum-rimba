import { kml } from "@tmcw/togeojson";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Coordinate string → [lng, lat]  (paste-into-search)
// ---------------------------------------------------------------------------

/** Parse a pasted coordinate string: decimal ("-6.2, 106.8" in any order) or
 *  DMS ("6°12'S 106°48'E"). Returns [lng, lat] or null. */
export function parseCoordinates(input: string): [number, number] | null {
  const s = input.trim();
  if (!s) return null;

  // DMS with hemisphere letters (order-independent; letters decide lat vs lng)
  const dmsRe =
    /(\d+(?:\.\d+)?)\s*[°:\s]\s*(?:(\d+(?:\.\d+)?)\s*['′:\s]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]?\s*)?([NSEW])/gi;
  const dms = [...s.matchAll(dmsRe)];
  if (dms.length >= 2) {
    let lat: number | undefined;
    let lng: number | undefined;
    for (const m of dms.slice(0, 2)) {
      let v =
        parseFloat(m[1]) +
        (m[2] ? parseFloat(m[2]) / 60 : 0) +
        (m[3] ? parseFloat(m[3]) / 3600 : 0);
      const h = m[4].toUpperCase();
      if (h === "S" || h === "W") v = -v;
      if (h === "N" || h === "S") lat = v;
      else lng = v;
    }
    if (lat !== undefined && lng !== undefined) return [lng, lat];
  }

  // decimal: two signed numbers separated by comma and/or whitespace
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return orderLatLng(parseFloat(m[1]), parseFloat(m[2]));
}

/** Decide which of two decimals is lat vs lng and return [lng, lat]. */
function orderLatLng(a: number, b: number): [number, number] {
  const isLngRange = (v: number) => v >= 94 && v <= 142; // Indonesia longitude band
  if (Math.abs(a) > 90 && Math.abs(b) <= 90) return [a, b]; // a can only be lng
  if (Math.abs(b) > 90 && Math.abs(a) <= 90) return [b, a];
  if (isLngRange(a) && !isLngRange(b)) return [a, b];
  if (isLngRange(b) && !isLngRange(a)) return [b, a];
  return [b, a]; // default: input was "lat, lng"
}

// ---------------------------------------------------------------------------
// File → GeoJSON  (KMZ / KML)
// ---------------------------------------------------------------------------

export interface ImportResult {
  geojson: GeoJSON.FeatureCollection;
  /** short note for the UI */
  note: string;
}

/** Parse an uploaded boundary file (KMZ or KML) into GeoJSON (WGS84). */
export async function parseBoundaryFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(file);
    const entry = Object.keys(zip.files).find((f) =>
      f.toLowerCase().endsWith(".kml"),
    );
    if (!entry) throw new Error("no .kml found inside the .kmz");
    const text = await zip.files[entry].async("text");
    return { geojson: kmlToGeojson(text), note: "KMZ" };
  }
  if (name.endsWith(".kml")) {
    return { geojson: kmlToGeojson(await file.text()), note: "KML" };
  }
  throw new Error("unsupported file (use .kmz or .kml)");
}

function kmlToGeojson(text: string): GeoJSON.FeatureCollection {
  const dom = new DOMParser().parseFromString(text, "text/xml");
  return kml(dom) as GeoJSON.FeatureCollection;
}
