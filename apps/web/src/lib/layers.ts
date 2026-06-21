/**
 * Map layer registry. Every layer carries its citation (editorial principle:
 * every visible layer has a working source link). Geometry comes exclusively
 * from PMTiles on R2.
 *
 * Order matters: fills are listed before circles so points draw on top.
 * Colours are bright Material hues chosen to read on the dark/light street
 * basemap AND satellite imagery, deliberately NO green/teal (those vanish into
 * vegetation). The SAME colour is used on every basemap. Layers with sub-filters
 * are coloured per category (see LAYER_SUBCOLORS), so e.g. each protected-area
 * type or each IUCN status has its own swatch in both the map and the legend.
 */
export interface LayerDef {
  id: string;
  /** pmtiles file name under {TILES_BASE}/tiles/ and source-layer name */
  tile: string;
  kind: "fill" | "circle" | "line";
  /** the layer's representative colour (legend header + fallback for any
   *  feature whose category isn't in LAYER_SUBCOLORS) */
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
    color: "#ffca28", // amber 400, recessive backdrop (drawn at low opacity)
    defaultOn: false,
    sourceName: "RESOLVE Ecoregions 2017 (UNEP-WCMC)",
    sourceUrl:
      "https://data-gis.unep-wcmc.org/server/rest/services/Bio-geographicalRegions/Resolve_Ecoregions/FeatureServer/0",
  },
  {
    id: "concessions",
    tile: "concessions",
    kind: "fill",
    color: "#fb8c00", // orange 600, extractive (coloured by type below)
    defaultOn: false,
    sourceName: "GFW concession layers (Greenpeace-derived)",
    sourceUrl:
      "https://data.globalforestwatch.org/search?q=Indonesia%20concessions",
  },
  {
    id: "protected",
    tile: "protected",
    kind: "fill",
    color: "#3949ab", // indigo 600, conservation (coloured by category below)
    defaultOn: true,
    sourceName: "Protected Planet (WDPA) + KLHK PIPPIB",
    sourceUrl: "https://www.protectedplanet.net",
  },
  // ---- circles (drawn on top) ----
  {
    id: "alerts",
    tile: "alerts",
    kind: "circle",
    color: "#ffee58", // yellow 400
    strokeColor: "#263238",
    defaultOn: false,
    sourceName: "GFW, RADD / GLAD (UMD, WUR)",
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
    color: "#ec407a", // pink 400 (coloured by IUCN status below)
    strokeColor: "#ffffff",
    defaultOn: false,
    sourceName: "GBIF occurrence records (per dataset license)",
    sourceUrl: "https://www.gbif.org",
  },
];

/**
 * Per-category colours for layers whose features carry a sub-type. `prop` is the
 * tile feature property to switch on; each value maps to a bright, basemap-stable
 * colour. Hue encodes the LAYER (orange/red = extractive concessions, indigo =
 * protected areas, pink = wildlife), so a glance tells you which layer a feature
 * belongs to; the shade tells you the category. Used by both the map paint and
 * the legend, so they never drift.
 */
export const LAYER_SUBCOLORS: Record<
  string,
  { prop: string; colors: Record<string, string> }
> = {
  concessions: {
    prop: "type",
    colors: {
      palm_hgu: "#fb8c00", // orange 600
      pulp_hti: "#f4511e", // deep-orange 600
      logging: "#ffb300", // amber 600
      mining: "#e53935", // red 600, most intensive
    },
  },
  protected: {
    prop: "cat",
    colors: {
      TN: "#283593", // indigo 800, Taman Nasional
      CA: "#3949ab", // indigo 600, Cagar Alam
      SM: "#3f51b5", // indigo 500, Suaka Margasatwa
      HL: "#5c6bc0", // indigo 400, Hutan Lindung
      KK: "#7986cb", // indigo 300, Kawasan Konservasi lain
      moratorium: "#9fa8da", // indigo 200, moratorium (softest)
    },
  },
  species: {
    prop: "status",
    colors: {
      CR: "#c2185b", // pink 700, most critical
      EN: "#e91e63", // pink 500
      VU: "#ec407a", // pink 400
      NT: "#f06292", // pink 300
      LC: "#f48fb1", // pink 200, least concern
    },
  },
};

/** MapLibre paint value: a `match` expression colouring each feature by its
 *  category, or the flat fallback colour when the layer has no sub-colours. */
export function colorExpression(
  layerId: string,
  fallback: string,
): string | unknown[] {
  const sub = LAYER_SUBCOLORS[layerId];
  if (!sub) return fallback;
  const pairs: string[] = [];
  for (const [value, color] of Object.entries(sub.colors)) {
    pairs.push(value, color);
  }
  return ["match", ["get", sub.prop], ...pairs, fallback];
}

/** Legend swatch colour for a layer + (optional) sub-filter value. */
export function swatchColor(layerId: string, value?: string): string {
  const sub = LAYER_SUBCOLORS[layerId];
  if (value && sub?.colors[value]) return sub.colors[value];
  return LAYERS.find((l) => l.id === layerId)?.color ?? "#9e9e9e";
}
