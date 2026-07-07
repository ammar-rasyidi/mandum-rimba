import { TILES_BASE } from "./api";

/** Static species atlas served from R2 (no live DB). Files under `species/`. */
const R2 = TILES_BASE;
export const FLORA_POINTS_URL = `${R2}/species/points.geojson`;

/** Compact index row (keys kept short to shrink species/index.json). */
interface IndexRow {
  k: number; // speciesKey
  c: string; // canonical
  s: string; // scientific name
  v: string; // vernacular (id/en)
  f: string; // family
  i: string; // iucn
  n: number; // recordCount
}

export interface SpeciesHit {
  key: number;
  sci: string;
  canonical: string;
  family: string;
  kingdom: string;
  recordCount: number;
  iucn: string;
  vernacular: string;
}

export interface FamilyStat {
  family: string;
  species: number;
  records: number;
}

export interface SpeciesMedia {
  url: string;
  license: string;
  creator: string;
}

export interface SpeciesProfileData {
  species: {
    key: number;
    sci: string;
    canonical: string;
    family: string;
    genus: string;
    kingdom: string;
    recordCount: number;
    bbox: [number, number, number, number] | null;
    iucn: string;
    vernacularId: string;
    vernacularEn: string;
    image: SpeciesMedia | null;
    description: { text: string; url: string; source: string } | null;
    sensitive?: boolean; // collection/poaching-target → coordinates coarsened
  };
  range: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  points: GeoJSON.FeatureCollection;
}

// ---- the search index: loaded once from R2, then searched in the browser ----
let _index: IndexRow[] | null = null;
let _indexPromise: Promise<IndexRow[]> | null = null;

export function loadIndex(): Promise<IndexRow[]> {
  if (_index) return Promise.resolve(_index);
  if (!_indexPromise) {
    _indexPromise = fetch(`${R2}/species/index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        _index = (d as IndexRow[]) ?? [];
        return _index;
      })
      .catch(() => {
        _index = [];
        return _index;
      });
  }
  return _indexPromise;
}

/** Client-side species search over the loaded index (scientific OR common name). */
export async function searchSpecies(
  q: string,
  _kingdom = "Plantae",
): Promise<SpeciesHit[]> {
  const term = q.trim().toLowerCase();
  if (term.length < 2) return [];
  const idx = await loadIndex();
  const hits = idx.filter(
    (r) =>
      r.c.toLowerCase().includes(term) ||
      r.s.toLowerCase().includes(term) ||
      (r.v && r.v.toLowerCase().includes(term)),
  );
  hits.sort((a, b) => b.n - a.n);
  return hits.slice(0, 25).map((r) => ({
    key: r.k,
    sci: r.s,
    canonical: r.c,
    family: r.f,
    kingdom: "Plantae",
    recordCount: r.n,
    iucn: r.i,
    vernacular: r.v,
  }));
}

/** Top plant families (from the index) for the diversity legend + filter. */
export async function getFamilies(): Promise<FamilyStat[]> {
  const idx = await loadIndex();
  const m = new Map<string, { s: number; r: number }>();
  for (const row of idx) {
    if (!row.f) continue;
    const e = m.get(row.f) ?? { s: 0, r: 0 };
    e.s += 1;
    e.r += row.n;
    m.set(row.f, e);
  }
  return [...m.entries()]
    .map(([family, v]) => ({ family, species: v.s, records: v.r }))
    .sort((a, b) => b.records - a.records)
    .slice(0, 40);
}

/** Photo + description + IUCN, fetched CLIENT-SIDE on species open (GBIF +
 *  Wikipedia allow browser CORS) — kept out of the R2 build so it stays light. */
export interface SpeciesEnrichment {
  image: SpeciesMedia | null;
  iucn: string;
  description: { text: string; url: string; source: string } | null;
}

function ccLicense(l: string): string | null {
  l = (l || "").toLowerCase();
  if (l.includes("publicdomain") || l.includes("cc0")) return "CC0";
  if (l.includes("by-nc-sa")) return "CC BY-NC-SA";
  if (l.includes("by-nc")) return "CC BY-NC";
  if (l.includes("by-sa")) return "CC BY-SA";
  if (l.includes("by-nd")) return "CC BY-ND";
  if (l.includes("cc-by") || (l.includes("creativecommons") && l.includes("/by")))
    return "CC BY";
  return null;
}

async function fetchImage(key: number): Promise<SpeciesMedia | null> {
  try {
    const r = await fetch(
      `https://api.gbif.org/v1/occurrence/search?taxonKey=${key}&mediaType=StillImage&limit=20&license=CC0_1_0&license=CC_BY_4_0&license=CC_BY_NC_4_0`,
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      results?: { media?: { identifier?: string; license?: string; creator?: string; rightsHolder?: string }[] }[];
    };
    for (const res of j.results ?? [])
      for (const m of res.media ?? []) {
        const lic = ccLicense(m.license ?? "");
        if (m.identifier && lic) {
          const url = m.identifier.includes("inaturalist") && m.identifier.includes("/original.")
            ? m.identifier.replace("/original.", "/medium.")
            : m.identifier;
          return { url, license: lic, creator: (m.creator ?? m.rightsHolder ?? "").trim() };
        }
      }
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchWiki(
  canonical: string,
  genus: string,
): Promise<{ text: string; url: string; source: string; thumb: string } | null> {
  const titles = [canonical];
  if (genus && genus !== canonical) titles.push(genus);
  for (const title of titles)
    for (const lang of ["id", "en"]) {
      try {
        const r = await fetch(
          `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        );
        if (!r.ok) continue;
        const j = (await r.json()) as {
          type?: string;
          extract?: string;
          content_urls?: { desktop?: { page?: string } };
          thumbnail?: { source?: string };
        };
        if (j.type === "disambiguation" || !j.extract || j.extract.length < 40) continue;
        return {
          text: j.extract,
          url: j.content_urls?.desktop?.page ?? "",
          source: title === genus ? `Wikipedia (${lang}) — ${genus}` : `Wikipedia (${lang})`,
          thumb: j.thumbnail?.source ?? "",
        };
      } catch {
        /* try next */
      }
    }
  return null;
}

async function fetchIucn(key: number): Promise<string> {
  try {
    const r = await fetch(`https://api.gbif.org/v1/species/${key}/iucnRedListCategory`);
    if (!r.ok) return "";
    const j = (await r.json()) as { code?: string };
    return j.code && j.code !== "NE" ? j.code : "";
  } catch {
    return "";
  }
}

/** Fetch photo + IUCN + description in parallel for the profile panel. */
export async function enrichSpecies(
  key: number,
  canonical: string,
  genus: string,
): Promise<SpeciesEnrichment> {
  const [image, iucn, wiki] = await Promise.all([
    fetchImage(key),
    fetchIucn(key),
    fetchWiki(canonical, genus),
  ]);
  return {
    image: image ?? (wiki?.thumb ? { url: wiki.thumb, license: "Wikimedia", creator: wiki.source } : null),
    iucn,
    description: wiki ? { text: wiki.text, url: wiki.url, source: wiki.source } : null,
  };
}

/** Load one species' profile + occurrence records from R2 (lazy, on click). */
export async function getSpecies(
  key: number,
): Promise<SpeciesProfileData | null> {
  try {
    const res = await fetch(`${R2}/species/sp/${key}.json`);
    if (!res.ok) return null;
    return (await res.json()) as SpeciesProfileData;
  } catch {
    return null;
  }
}

// ---- family colours (unchanged) ----
export const FAMILY_PALETTE = [
  "#ef5350",
  "#ffca28",
  "#26c6da",
  "#ab47bc",
  "#ff7043",
  "#66bb6a",
  "#42a5f5",
  "#ec407a",
  "#d4e157",
  "#8d6e63",
  "#26a69a",
  "#7e57c2",
];
export const FAMILY_OTHER_COLOR = "#90a4ae";

export function familyColorMap(
  families: FamilyStat[],
  topN = FAMILY_PALETTE.length,
): Record<string, string> {
  const m: Record<string, string> = {};
  families.slice(0, topN).forEach((f, i) => {
    m[f.family] = FAMILY_PALETTE[i % FAMILY_PALETTE.length];
  });
  return m;
}
