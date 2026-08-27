/**
 * The street basemaps, and which provider serves them.
 *
 * CARTO's basemap tiles stopped being usable anonymously: they still answer
 * 200 with a real PNG, but the image now has "API KEY REQUIRED" and a link
 * printed across it. Nothing about the response says so — the status, the
 * content type and the size are all ordinary — which is why this can go
 * unnoticed by anything watching the network rather than the map.
 *
 * So the tiles carry a key when one is configured, and fall back to Esri's
 * Canvas basemaps when it is not. The fallback matters more than it looks:
 * without it a fresh checkout, a fork, or a deploy whose env var was missed
 * renders a watermarked map, and the failure announces itself only to whoever
 * happens to look at the map. Esri is already this project's imagery provider
 * and is served keyless, so the fallback adds no new dependency.
 *
 * CARTO's free tier is 5 million tile requests a month for non-commercial use,
 * which is what Mandum Rimba is; the key is requested per domain at
 * carto.com/basemaps/apikey. Being a NEXT_PUBLIC_ var it ships to the browser,
 * as any basemap key must — it is domain-scoped at the provider, not secret.
 */
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim();

/** true when tiles come from CARTO; false when the Esri fallback is in use */
export const usingCarto = Boolean(CARTO_KEY);

const CARTO_ATTRIBUTION =
  "© OpenStreetMap contributors © CARTO | Mandum Rimba";
const ESRI_ATTRIBUTION =
  "Esri, HERE, Garmin, © OpenStreetMap contributors | Mandum Rimba";

const carto = (style: string) =>
  `https://basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png?key=${CARTO_KEY}`;
const esriCanvas = (service: string) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${service}/MapServer/tile/{z}/{y}/{x}`;

export interface BasemapDef {
  tiles: string;
  attribution: string;
}

/** the dark street basemap (the default "Peta" view in dark theme) */
export const BASEMAP_DARK: BasemapDef = CARTO_KEY
  ? { tiles: carto("dark_all"), attribution: CARTO_ATTRIBUTION }
  : { tiles: esriCanvas("World_Dark_Gray_Base"), attribution: ESRI_ATTRIBUTION };

/** the light street basemap, used when the site theme is light */
export const BASEMAP_LIGHT: BasemapDef = CARTO_KEY
  ? { tiles: carto("light_all"), attribution: CARTO_ATTRIBUTION }
  : {
      tiles: esriCanvas("World_Light_Gray_Base"),
      attribution: ESRI_ATTRIBUTION,
    };

/**
 * Esri's Canvas bases carry no place names — the labels are a separate
 * "Reference" service — while CARTO's `*_all` styles already include them. So
 * the reference overlay is drawn only when the fallback is in use, which keeps
 * both providers looking like a labelled street map rather than leaving the
 * fallback as an unnamed grey landmass.
 */
export const BASEMAP_LABELS: Record<"dark" | "light", string | null> = {
  dark: CARTO_KEY ? null : esriCanvas("World_Dark_Gray_Reference"),
  light: CARTO_KEY ? null : esriCanvas("World_Light_Gray_Reference"),
};
