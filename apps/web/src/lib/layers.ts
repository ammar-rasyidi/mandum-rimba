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
  /** local GeoJSON URL, when set, the layer loads from here instead of R2
   *  PMTiles (used by the species-distribution richness grid) */
  geojson?: string;
  defaultOn: boolean;
  sourceName: string;
  sourceUrl: string;
  /** which map this layer belongs to; omitted = the main deforestation map,
   *  "biodiversity" = the separate /biodiversitas map */
  group?: "biodiversity";
  /** for fills: colour each feature by this GeoJSON property (a hex string),
   *  e.g. ecoregions carry RESOLVE's official per-ecoregion COLOR */
  colorProp?: string;
}

export const LAYERS: LayerDef[] = [
  // ---- fills (drawn first, under the points) ----
  {
    // Peta Sebaran Satwa: threatened wildlife (all classes) occurrence density,
    // smoothed into organic contour bands (not dots, not a grid). Loaded from a
    // local GeoJSON, not R2 PMTiles. Coloured by density band.
    id: "species-dist",
    tile: "species-dist",
    kind: "fill",
    geojson: "/data/species-distribution.geojson",
    color: "#8e24aa", // top density band (legend swatch)
    defaultOn: false,
    sourceName: "GBIF occurrences (IUCN threatened, all classes)",
    sourceUrl: "https://www.gbif.org",
  },
  {
    id: "concessions",
    tile: "concessions",
    kind: "fill",
    color: "#fb8c00", // orange 600, extractive (coloured by type below)
    defaultOn: true,
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
  {
    // Mangrove extent, critical coastal habitat (proboscis monkey, birds, fish
    // nurseries). Light-blue (coastal), not green — green vanishes into the
    // vegetated basemap. PMTiles built from GMW; shown once the tiles land on R2.
    id: "mangrove",
    tile: "mangrove",
    kind: "fill",
    color: "#00b0ff", // light-blue A400
    defaultOn: true,
    sourceName: "Global Mangrove Watch v3 (CC BY 4.0)",
    sourceUrl: "https://www.globalmangrovewatch.org/",
  },
  {
    // Peatland extent, carbon-rich, fire-prone wetland habitat. Brown = peat
    // soil. PMTiles built from the "Indonesia peat lands" vector hosted on GFW.
    id: "peatland",
    tile: "peatland",
    kind: "fill",
    color: "#6d4c41", // brown 600
    defaultOn: true,
    sourceName: "Indonesia peat lands (Global Forest Watch)",
    sourceUrl:
      "https://data.globalforestwatch.org/datasets/d52e0e67ad21401cbf3a2c002599cf58_10",
  },
  {
    // Forest loss over time: an animated choropleth. Each province shades by the
    // hectares of tree-cover loss in the year the timeline slider is on. Unlike
    // every other layer it isn't its own geometry, it paints the shared `regions`
    // tiles by feature-state from the ForestLossAnnual aggregate (Hansen/UMD via
    // GFW). Rendered + driven specially in MapView (see ForestLossTimeline).
    id: "forestloss",
    tile: "regions",
    kind: "fill",
    color: "#ff5722", // deep-orange 500, "loss" — matches LossChart
    defaultOn: false,
    sourceName: "Hansen/UMD tree cover loss (via Global Forest Watch)",
    sourceUrl: "https://www.globalforestwatch.org/",
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

  // ================= biodiversity map (/biodiversitas) =================
  {
    // Terrestrial ecoregions (RESOLVE 2017): the ecological "rooms" of the
    // archipelago. Coloured by RESOLVE's official per-ecoregion palette (COLOR),
    // so Sundaland, Wallacea, and Papua read as distinct worlds at a glance.
    id: "ecoregions",
    tile: "ecoregions",
    kind: "fill",
    geojson: "/data/ecoregions-id.geojson",
    colorProp: "COLOR",
    color: "#66bb6a", // legend swatch (representative)
    defaultOn: true,
    group: "biodiversity",
    sourceName: "RESOLVE Ecoregions 2017 (CC BY 4.0)",
    sourceUrl: "https://ecoregions.appspot.com/",
  },
  {
    // Biogeographic transition lines (Wallace 1863, Weber, Lydekker): the faunal
    // divides between Sundaland, Wallacea, and Sahul. Conceptual and approximate,
    // as these lines are always depicted. Coloured per line (see LAYER_SUBCOLORS).
    id: "biogeo",
    tile: "biogeo",
    kind: "line",
    geojson: "/data/biogeo-lines.geojson",
    color: "#ff5252",
    defaultOn: true,
    group: "biodiversity",
    sourceName: "Garis biogeografi (Wallace 1863, Weber, Lydekker)",
    sourceUrl: "https://en.wikipedia.org/wiki/Wallace_Line",
  },
  // NOTE: the old merged flora/fauna "distribution blob" layers were removed.
  // The biodiversity map is now a per-species atlas: a search box (SpeciesSearch)
  // loads ONE species' real occurrence records + a derived range outline from the
  // self-hosted /species API. ecoregions + biogeo above stay as the backdrop.
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
  // Peta Sebaran Satwa, coloured by animal class (density shown via opacity)
  "species-dist": {
    prop: "class",
    colors: {
      aves: "#ec407a", // pink, burung
      mammalia: "#8e24aa", // purple, mamalia
      reptilia: "#00acc1", // cyan, reptil
      amphibia: "#fdd835", // yellow, amfibi
    },
  },
  concessions: {
    prop: "type",
    colors: {
      palm_hgu: "#fb8c00", // orange 600
      pulp_hti: "#f4511e", // deep-orange 600
      logging: "#ffb300", // amber 600
      mining: "#e53935", // red 600, most intensive
    },
  },
  biogeo: {
    prop: "name_en",
    colors: {
      "Wallace's Line": "#ff5252", // red
      "Weber's Line": "#ffd740", // amber
      "Lydekker's Line": "#40c4ff", // blue
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
