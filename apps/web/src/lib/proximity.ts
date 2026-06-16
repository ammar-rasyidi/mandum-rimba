import data from "@/data/wildlife-points.json";
import conservationData from "@/data/conservation-areas.json";

export interface WildlifeSpecies {
  slug: string;
  id: string; // Indonesian common name
  en: string; // English common name
  sci: string; // scientific name
  iucn: "CR" | "EN" | "VU";
}

interface Bundle {
  species: WildlifeSpecies[];
  points: [number, number, number][]; // [speciesIndex, lng, lat]
}

const bundle = data as unknown as Bundle;

const R_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(
  aLng: number,
  aLat: number,
  bLng: number,
  bLat: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

export interface NearestResult {
  species: WildlifeSpecies;
  distanceKm: number;
  at: [number, number]; // [lng, lat] of the nearest recorded sighting
}

/** Nearest recorded flagship-species sighting to a [lng, lat]. */
export function nearestWildlife(lng: number, lat: number): NearestResult {
  let best = 0;
  let bestD = Infinity;
  let bestPt: [number, number] = [0, 0];
  for (const [si, plng, plat] of bundle.points) {
    const d = haversineKm(lng, lat, plng, plat);
    if (d < bestD) {
      bestD = d;
      best = si;
      bestPt = [plng, plat];
    }
  }
  return { species: bundle.species[best], distanceKm: bestD, at: bestPt };
}

// ── nearest conservation area (Taman Nasional / Cagar Alam / …) ──
interface ConsBundle {
  areas: { n: string; cat: string; ha: number; c: [number, number] }[];
}
const cons = conservationData as unknown as ConsBundle;

export interface NearestConservation {
  name: string;
  category: string; // TN | HL | CA | SM | KK
  areaHa: number;
  distanceKm: number;
}

/** Nearest WDPA conservation area to a [lng, lat]. */
export function nearestConservation(lng: number, lat: number): NearestConservation {
  let best = cons.areas[0];
  let bestD = Infinity;
  for (const a of cons.areas) {
    const d = haversineKm(lng, lat, a.c[0], a.c[1]);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return { name: best.n, category: best.cat, areaHa: best.ha, distanceKm: bestD };
}

// Familiar Indonesian cities, for the "closer than your trip to ___" framing.
export const REFERENCE_CITIES: { name: string; lng: number; lat: number }[] = [
  { name: "Jakarta", lng: 106.8456, lat: -6.2088 },
  { name: "Surabaya", lng: 112.7508, lat: -7.2575 },
  { name: "Bandung", lng: 107.6098, lat: -6.9175 },
  { name: "Medan", lng: 98.6722, lat: 3.5952 },
  { name: "Semarang", lng: 110.4203, lat: -6.9667 },
  { name: "Makassar", lng: 119.4221, lat: -5.1477 },
  { name: "Palembang", lng: 104.7458, lat: -2.9761 },
  { name: "Denpasar", lng: 115.2126, lat: -8.6705 },
  { name: "Balikpapan", lng: 116.8289, lat: -1.2379 },
  { name: "Pontianak", lng: 109.3333, lat: -0.0263 },
  { name: "Manado", lng: 124.8455, lat: 1.4748 },
  { name: "Padang", lng: 100.3543, lat: -0.9471 },
  { name: "Pekanbaru", lng: 101.4478, lat: 0.5071 },
  { name: "Banjarmasin", lng: 114.5908, lat: -3.3194 },
  { name: "Yogyakarta", lng: 110.3695, lat: -7.7956 },
  { name: "Banda Aceh", lng: 95.3222, lat: 5.5483 },
  { name: "Jayapura", lng: 140.7181, lat: -2.5337 },
  { name: "Kupang", lng: 123.5777, lat: -10.1772 },
  { name: "Mataram", lng: 116.1167, lat: -8.5833 },
  { name: "Ambon", lng: 128.1907, lat: -3.6954 },
];

export interface CityComparison {
  name: string;
  km: number;
}

/**
 * The closest familiar city that is *farther* from the user than the animal —
 * so the card can say "closer than your trip to {city}". Returns null when the
 * animal is farther than every reference city (rare, very remote user).
 */
export function comparisonCity(
  lng: number,
  lat: number,
  animalKm: number,
): CityComparison | null {
  let best: CityComparison | null = null;
  for (const c of REFERENCE_CITIES) {
    const d = haversineKm(lng, lat, c.lng, c.lat);
    if (d > animalKm && (!best || d < best.km)) {
      best = { name: c.name, km: d };
    }
  }
  return best;
}

/** Friendly km string: "23 km", "<1 km", "1.240 km" (id grouping). */
export function fmtKm(km: number): string {
  if (km < 1) return "<1 km";
  return `${Math.round(km).toLocaleString("id-ID")} km`;
}
