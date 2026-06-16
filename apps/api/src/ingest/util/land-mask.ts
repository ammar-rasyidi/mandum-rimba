import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { INDONESIA_LAND } from "../data/indonesia-land";

/**
 * Land / sea validation for occurrence points. GBIF coordinates are noisy —
 * marine animals get plotted inland, land animals get plotted offshore. We test
 * each point against the Indonesian land mask (Natural Earth 1:50m) and keep
 * only points consistent with the species' realm.
 *
 * A ~25 km tolerance absorbs coastline coarseness and small unmapped islets, so
 * only GROSS errors are dropped (a bear in the open ocean, a turtle deep
 * inland) — never legitimate coastal records.
 */
export type Realm = "land" | "sea" | "coastal" | "any";

const TOL_KM = 25;

interface Cell {
  bbox: [number, number, number, number];
  feature: Feature<Polygon>;
}

const CELLS: Cell[] = (() => {
  const rings =
    INDONESIA_LAND.type === "MultiPolygon"
      ? INDONESIA_LAND.coordinates
      : [INDONESIA_LAND.coordinates];
  const cells: Cell[] = [];
  for (const ring of rings) {
    try {
      const feature = turf.polygon(ring as number[][][]);
      cells.push({
        bbox: turf.bbox(feature) as [number, number, number, number],
        feature,
      });
    } catch {
      /* skip */
    }
  }
  return cells;
})();

export function onLand(lng: number, lat: number): boolean {
  for (const c of CELLS) {
    const [minX, minY, maxX, maxY] = c.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    if (turf.booleanPointInPolygon([lng, lat], c.feature)) return true;
  }
  return false;
}

/** probe 8 directions at `km`; `want` = the onLand value we're looking for */
function probe(lng: number, lat: number, km: number, want: boolean): boolean {
  const dLat = km / 111;
  const dLng = km / 111 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const dirs: [number, number][] = [
    [dLng, 0],
    [-dLng, 0],
    [0, dLat],
    [0, -dLat],
    [dLng, dLat],
    [-dLng, dLat],
    [dLng, -dLat],
    [-dLng, -dLat],
  ];
  for (const [ox, oy] of dirs) {
    if (onLand(lng + ox, lat + oy) === want) return true;
  }
  return false;
}

/** keep this point for a species of the given realm? */
export function keepByRealm(lng: number, lat: number, realm: Realm): boolean {
  if (realm === "any") return true;
  const land = onLand(lng, lat);
  if (realm === "land") {
    // on land, or within ~25 km of it (coastal / small island) — drop open ocean
    return land || probe(lng, lat, TOL_KM, true);
  }
  // sea / coastal: must be in the water. Marine animals plotted on land (even on
  // a coastal road or beach) are almost always imprecise coordinates — drop them
  // so a turtle never appears inland.
  return !land;
}
