import { LAYERS } from "@/lib/layers";
import { DEFAULT_HOTSPOT, DEFAULT_IMAGERY } from "@/lib/gibs";

export type Basemap = "dark" | "satellite";

// how the map is rendered: flat mercator (default analytical view), a 3D globe,
// or a globe with real elevation (3D terrain). See MapView for how each is applied.
export type ViewMode = "flat" | "globe" | "terrain";
export const VIEW_MODES: ViewMode[] = ["flat", "globe", "terrain"];

export interface MapFilters {
  basemap: Basemap;
  viewMode: ViewMode;
  layers: string[];
  days: number; // alert window, 7..90
  systems: string[]; // radd | glad_l | glad_s2
  disasterTypes: string[]; // flood | flash_flood | landslide | other
  concessionTypes: string[]; // palm_hgu | pulp_hti | logging | mining
  protectedCategories: string[]; // TN | HL | CA | SM | other | moratorium
  speciesClasses: string[]; // aves | mammalia | reptilia | amphibia
  fireConfidence: string[]; // high | nominal | low
  /** karhutla view (NASA Worldview / GIBS): the single UTC day both GIBS layers
   *  are pinned to, `yyyy-mm-dd`. Empty means "not resolved yet" — MapView fills
   *  it in on mount via gibsDefaultDate(). It is deliberately NOT defaulted at
   *  module load: DEFAULT_FILTERS is evaluated on the server too, and a
   *  clock-derived default there would differ from the browser's across UTC
   *  midnight and desync hydration. */
  karhutlaDate: string;
  /** which Worldview product each GIBS layer draws from (exact GIBS layer ids) */
  karhutlaImagery: string;
  karhutlaHotspot: string;
}

export const ALERT_SYSTEMS = ["radd", "glad_l", "glad_s2"];
export const DISASTER_TYPES = ["flood", "flash_flood", "landslide", "other"];
// "mining" here is the Maus satellite footprint (real mined land, all-mineral,
// Aceh→Papua) carried as a concession type. Official IUP permit *boundaries*
// are not openly published (MOMI login-locked), see /sumber-data.
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
// animal classes shown on the Peta Sebaran Satwa layer
export const SPECIES_CLASSES = ["aves", "mammalia", "reptilia", "amphibia"];
// NASA FIRMS detection-confidence bands (VIIRS)
export const FIRE_CONFIDENCE = ["high", "nominal", "low"];

export const DEFAULT_FILTERS: MapFilters = {
  basemap: "dark",
  viewMode: "flat",
  layers: LAYERS.filter((l) => l.defaultOn).map((l) => l.id),
  days: 90,
  systems: [...ALERT_SYSTEMS],
  disasterTypes: [...DISASTER_TYPES],
  concessionTypes: [...CONCESSION_TYPES],
  protectedCategories: [...PROTECTED_CATEGORIES],
  speciesClasses: [...SPECIES_CLASSES],
  fireConfidence: [...FIRE_CONFIDENCE],
  karhutlaDate: "",
  karhutlaImagery: DEFAULT_IMAGERY,
  karhutlaHotspot: DEFAULT_HOTSPOT,
};
