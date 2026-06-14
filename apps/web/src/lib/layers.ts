/**
 * Map layer registry. Every layer carries its citation (editorial principle:
 * every visible layer has a working source link). Geometry comes exclusively
 * from PMTiles on R2.
 *
 * Order matters: fills are listed before circles so points draw on top.
 * Colors are Material Design, chosen to stay legible on the dark/light basemap
 * AND satellite imagery (each point layer gets a contrasting halo stroke), and
 * to avoid red/green-only contrasts (color-blind safety).
 */
export interface LayerDef {
  id: string;
  /** pmtiles file name under {TILES_BASE}/tiles/ and source-layer name */
  tile: string;
  kind: "fill" | "circle" | "line";
  color: string;
  /** halo for circle layers: keeps points visible over satellite imagery */
  strokeColor?: string;
  defaultOn: boolean;
  sourceName: string;
  sourceUrl: string;
}

export const LAYERS: LayerDef[] = [
  // ---- fills (drawn first, under the points) ----
  {
    id: "habitat",
    tile: "habitat",
    kind: "fill",
    color: "#66bb6a", // green 400 — habitat / forest
    defaultOn: false,
    sourceName: "RESOLVE Ecoregions 2017 (UNEP-WCMC)",
    sourceUrl:
      "https://data-gis.unep-wcmc.org/server/rest/services/Bio-geographicalRegions/Resolve_Ecoregions/FeatureServer/0",
  },
  {
    id: "concessions",
    tile: "concessions",
    kind: "fill",
    color: "#42a5f5", // blue 400 (primary family)
    defaultOn: false,
    sourceName: "GFW concession layers (Greenpeace-derived)",
    sourceUrl:
      "https://data.globalforestwatch.org/search?q=Indonesia%20concessions",
  },
  {
    id: "protected",
    tile: "protected",
    kind: "fill",
    color: "#26a69a", // teal 400
    defaultOn: false,
    sourceName: "Protected Planet (WDPA) + KLHK PIPPIB",
    sourceUrl: "https://www.protectedplanet.net",
  },
  // ---- circles (drawn on top) ----
  {
    id: "alerts",
    tile: "alerts",
    kind: "circle",
    color: "#ffc107", // amber 500
    strokeColor: "#263238",
    defaultOn: true,
    sourceName: "GFW — RADD / GLAD (UMD, WUR)",
    sourceUrl: "https://www.globalforestwatch.org/map/",
  },
  {
    id: "disasters",
    tile: "disasters",
    kind: "circle",
    color: "#7e57c2", // deep-purple 400
    strokeColor: "#ffffff",
    defaultOn: false,
    sourceName: "BNPB DIBI (via UNDRR DesInventar)",
    sourceUrl:
      "https://www.desinventar.net/DesInventar/profiletab.jsp?countrycode=idn",
  },
  {
    id: "species",
    tile: "species",
    kind: "circle",
    color: "#ec407a", // pink 400 — threatened wildlife occurrences
    strokeColor: "#ffffff",
    defaultOn: false,
    sourceName: "GBIF occurrence records (per dataset license)",
    sourceUrl: "https://www.gbif.org",
  },
  {
    id: "discrepancies",
    tile: "alerts", // same tileset, filtered on the precomputed discrepancy flag
    kind: "circle",
    color: "#ff5722", // deep-orange 500
    strokeColor: "#ffffff",
    defaultOn: false,
    sourceName: "Mandum Rimba derive pipeline (see methodology)",
    sourceUrl: "/metodologi",
  },
];
