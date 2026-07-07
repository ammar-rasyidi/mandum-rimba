import floraRaw from "@/data/flora-species.json";

/** A curated, hand-sourced profile (from flora-species.json / fauna-species.json). */
export interface CuratedProfile {
  sci: string;
  en: string;
  id: string;
  type: { id: string; en: string };
  endemic: { id: string; en: string };
  range: { id: string; en: string };
  habitat: { id: string; en: string };
  iucn: string;
  iucnNote: { id: string; en: string };
  cites: string;
  protected: { id: string; en: string };
  desc: { id: string; en: string };
  ref: { name: string; url: string };
}

const FLORA = floraRaw as unknown as Record<string, CuratedProfile>;

/** genus (lowercased) → curated entry, derived from each entry's `sci` field.
 *  Lets a searched species (e.g. "Shorea johorensis") map to the curated
 *  genus-level card ("Meranti"). */
const FLORA_BY_GENUS: Record<string, CuratedProfile> = {};
for (const [name, p] of Object.entries(FLORA)) {
  if (name.startsWith("_")) continue;
  const genus = (p.sci || "").trim().split(/\s+/)[0]?.toLowerCase();
  if (genus && !FLORA_BY_GENUS[genus]) FLORA_BY_GENUS[genus] = p;
}

/** Find a curated flora profile for a searched species, matched by genus. */
export function matchFloraProfile(
  genus?: string,
  canonical?: string,
): CuratedProfile | null {
  const g = (genus || canonical || "").trim().split(/\s+/)[0]?.toLowerCase();
  if (!g) return null;
  return FLORA_BY_GENUS[g] ?? null;
}
