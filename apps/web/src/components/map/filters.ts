import { LAYERS } from "@/lib/layers";

export type Basemap = "dark" | "satellite";

export interface MapFilters {
  basemap: Basemap;
  layers: string[];
  days: number; // alert window, 7..90
  systems: string[]; // radd | glad_l | glad_s2
  disasterTypes: string[]; // flood | flash_flood | landslide | other
  concessionTypes: string[]; // palm_hgu | pulp_hti | logging | mining
  protectedCategories: string[]; // TN | HL | CA | SM | other | moratorium
  speciesStatus: string[]; // CR | EN | VU
}

export const ALERT_SYSTEMS = ["radd", "glad_l", "glad_s2"];
export const DISASTER_TYPES = ["flood", "flash_flood", "landslide", "other"];
// "mining" here is the Maus satellite footprint (real mined land, all-mineral,
// Aceh→Papua) carried as a concession type. Official IUP permit *boundaries*
// are not openly published (MOMI login-locked) — see /sumber-data.
export const CONCESSION_TYPES = ["palm_hgu", "pulp_hti", "logging", "mining"];
// WDPA conservation categories (mapped from desig) + KLHK PIPPIB moratorium
export const PROTECTED_CATEGORIES = [
  "TN",
  "HL",
  "CA",
  "SM",
  "KK",
  "moratorium",
];
// CR/EN/VU = terancam (IUCN); NT/LC = dilindungi UU/CITES walau belum terancam
export const SPECIES_STATUS = ["CR", "EN", "VU", "NT", "LC"];

export const DEFAULT_FILTERS: MapFilters = {
  basemap: "dark",
  layers: LAYERS.filter((l) => l.defaultOn).map((l) => l.id),
  days: 90,
  systems: [...ALERT_SYSTEMS],
  disasterTypes: [...DISASTER_TYPES],
  concessionTypes: [...CONCESSION_TYPES],
  protectedCategories: [...PROTECTED_CATEGORIES],
  speciesStatus: [...SPECIES_STATUS],
};
