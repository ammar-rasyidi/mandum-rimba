/**
 * Contributors and credits. People who build the project, the organizations
 * whose data makes it possible, and the open-source tools it runs on.
 *
 * Editing: add yourself to CONTRIBUTORS when you contribute. Data sources have
 * a fuller listing on /sumber-data; here we simply acknowledge the providers.
 */
export interface Bilingual {
  id: string;
  en: string;
}

export interface Contributor {
  name: string;
  role: Bilingual;
  url?: string;
}

/** People who support the work (shown on the support page and credits). */
export interface Supporter {
  name: string;
  social?: string; // handle, e.g. "@budi"
  socialUrl?: string; // optional link to the account
}

export interface CreditItem {
  name: string;
  what: Bilingual;
  url: string;
}

export interface MediaCredit {
  author: string;
  authorUrl: string;
  source: string;
  sourceUrl: string;
  what: Bilingual;
}

/** Photos & media, with the attribution their licenses require. */
export const MEDIA_CREDITS: MediaCredit[] = [
  {
    author: "Dimitry B",
    authorUrl:
      "https://unsplash.com/@dimitry_b?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText",
    source: "Unsplash",
    sourceUrl:
      "https://unsplash.com/photos/brown-monkey-on-tree-branch-during-daytime-tRGqh8cHanA?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText",
    what: {
      id: "Foto latar beranda (orangutan)",
      en: "Homepage background photo (orangutan)",
    },
  },
];

export const CONTRIBUTORS: Contributor[] = [
  {
    name: "Tim Mandum Rimba",
    role: {
      id: "Gagasan, pengembangan & pemeliharaan",
      en: "Concept, development & maintenance",
    },
  },
];

/**
 * Supporters who help fund the work. Updated manually every Friday, with each
 * person's permission. Add { name, social?, socialUrl? }. Shared with the
 * support page (/dukung) so both stay in sync.
 */
export const SUPPORTERS: Supporter[] = [
  { name: "@arifa.ifaa", socialUrl: "https://www.threads.com/@arifa.ifaa" },
  { name: "@baizawy", socialUrl: "https://www.threads.com/@baizawy" },
];

/** Organizations whose open data powers the map (full detail on /sumber-data). */
export const DATA_ACKNOWLEDGEMENTS: CreditItem[] = [
  {
    name: "Global Forest Watch (WRI)",
    what: {
      id: "Peringatan deforestasi, kehilangan tutupan pohon, konsesi",
      en: "Deforestation alerts, tree cover loss, concessions",
    },
    url: "https://www.globalforestwatch.org",
  },
  {
    name: "GBIF",
    what: {
      id: "Catatan keberadaan satwa terancam",
      en: "Threatened-species occurrence records",
    },
    url: "https://www.gbif.org",
  },
  {
    name: "IUCN Red List of Threatened Species",
    what: {
      id: "Status terancam (CR/EN/VU) satwa unggulan",
      en: "Threatened status (CR/EN/VU) of the flagship species",
    },
    url: "https://www.iucnredlist.org",
  },
  {
    name: "BNPB DIBI · UNDRR DesInventar",
    what: {
      id: "Kejadian bencana banjir & longsor",
      en: "Flood & landslide disaster records",
    },
    url: "https://www.desinventar.net",
  },
  {
    name: "ESA WorldCover 2021",
    what: {
      id: "Tutupan lahan / pembobotan habitat alami",
      en: "Land cover / natural-habitat weighting",
    },
    url: "https://esa-worldcover.org",
  },
  {
    name: "Maus et al. 2022 (PANGAEA)",
    what: {
      id: "Jejak lahan pertambangan",
      en: "Mining land footprint",
    },
    url: "https://doi.org/10.1594/PANGAEA.942325",
  },
  {
    name: "Protected Planet (WDPA) · KLHK",
    what: {
      id: "Kawasan lindung & moratorium hutan",
      en: "Protected areas & forest moratorium",
    },
    url: "https://www.protectedplanet.net",
  },
  {
    name: "GADM",
    what: {
      id: "Batas wilayah administratif",
      en: "Administrative boundaries",
    },
    url: "https://gadm.org",
  },
];

/** Open-source software and basemaps the project is built on. */
export const OPEN_SOURCE: CreditItem[] = [
  {
    name: "MapLibre GL JS",
    what: { id: "Mesin peta", en: "Map engine" },
    url: "https://maplibre.org",
  },
  {
    name: "PMTiles (Protomaps)",
    what: { id: "Tile vektor statis", en: "Static vector tiles" },
    url: "https://protomaps.com/docs/pmtiles",
  },
  {
    name: "tippecanoe (Felt)",
    what: { id: "Pembangun tile", en: "Tile builder" },
    url: "https://github.com/felt/tippecanoe",
  },
  {
    name: "Turf.js",
    what: { id: "Analisis geospasial", en: "Geospatial analysis" },
    url: "https://turfjs.org",
  },
  {
    name: "Next.js",
    what: { id: "Kerangka web", en: "Web framework" },
    url: "https://nextjs.org",
  },
  {
    name: "NestJS",
    what: { id: "Kerangka API & cron", en: "API & cron framework" },
    url: "https://nestjs.com",
  },
  {
    name: "MongoDB",
    what: { id: "Basis data geospasial", en: "Geospatial database" },
    url: "https://www.mongodb.com",
  },
  {
    name: "Recharts",
    what: { id: "Grafik", en: "Charts" },
    url: "https://recharts.org",
  },
  {
    name: "next-intl",
    what: { id: "Dwibahasa (ID/EN)", en: "Bilingual (ID/EN)" },
    url: "https://next-intl.dev",
  },
  {
    name: "CARTO · Esri · OpenStreetMap",
    what: { id: "Peta dasar & citra satelit", en: "Basemaps & satellite imagery" },
    url: "https://www.openstreetmap.org/copyright",
  },
];
