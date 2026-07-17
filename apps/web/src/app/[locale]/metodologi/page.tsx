import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "methodology" });
  return { title: t("title") };
}

const SOURCES = [
  {
    name: "Global Forest Watch, RADD / GLAD alerts, UMD annual tree cover loss",
    url: "https://data-api.globalforestwatch.org",
    license: "CC BY 4.0",
  },
  {
    name: "BNPB DIBI, disaster events (floods, landslides), via the UNDRR DesInventar mirror",
    url: "https://www.desinventar.net/DesInventar/profiletab.jsp?countrycode=idn",
    license: "Public data (UNDRR DesInventar)",
  },
  {
    name: "GFW concession layers (Greenpeace-derived), oil palm (v2025), wood fiber (v2025), logging (v202106)",
    url: "https://data.globalforestwatch.org/search?q=Indonesia%20concessions",
    license: "CC BY 4.0",
  },
  {
    name: "Maus et al. 2022, global mining land use (footprint), via GFW / PANGAEA",
    url: "https://doi.org/10.1594/PANGAEA.942325",
    license: "CC BY 4.0",
  },
  {
    name: "GBIF, wildlife occurrence records (threatened & endemic species, all classes, Sumatra–Papua), contoured per island into the distribution layer",
    url: "https://www.gbif.org",
    license: "Per-dataset (CC0 / CC BY / CC BY-NC)",
  },
  {
    name: "IUCN Red List of Threatened Species, conservation status (CR/EN/VU/NT/LC) used to select and label species",
    url: "https://www.iucnredlist.org",
    license: "IUCN Red List terms (non-commercial use, attribution)",
  },
  {
    name: "Permen LHK P.106/2018, Indonesia's official list of protected animals & plants (species selection)",
    url: "https://peraturan.go.id/id/permen-lhk-no-p-106-menlhk-setjen-kum-1-12-2018-tahun-2018",
    license: "Public regulation",
  },
  {
    name: "CITES Appendices, internationally protected/traded species (species selection)",
    url: "https://cites.org/eng/app/appendices.php",
    license: "Public (CITES Secretariat)",
  },
  {
    name: "ESA WorldCover 2021 (v200), 10 m land cover / natural-habitat weighting",
    url: "https://esa-worldcover.org",
    license: "CC BY 4.0",
  },
  {
    name: "Protected Planet (WDPA), protected areas",
    url: "https://www.protectedplanet.net",
    license: "WDPA terms (no redistribution)",
  },
  {
    name: "KLHK PIPPIB, forest moratorium",
    url: "https://geoportal.menlhk.go.id",
    license: "Public data",
  },
  {
    name: "Global Mangrove Watch v3, Indonesia mangrove extent (2020) from satellite imagery",
    url: "https://www.globalmangrovewatch.org",
    license: "CC BY 4.0",
  },
  {
    name: "Global Forest Watch, Indonesia peat lands (peatland extent)",
    url: "https://data.globalforestwatch.org/datasets/d52e0e67ad21401cbf3a2c002599cf58_10",
    license: "CC BY 4.0",
  },
  {
    name: "Trase, palm exporter ↔ deforestation linkage",
    url: "https://trase.earth",
    license: "CC BY 4.0",
  },
  {
    name: "Nusantara Atlas, monthly reports (cite & link only)",
    url: "https://nusantara-atlas.org",
    license: "See source",
  },
  {
    name: "GADM 4.1, administrative boundaries",
    url: "https://gadm.org",
    license: "Academic / non-commercial use",
  },
  {
    name: "HydroBASINS, watersheds",
    url: "https://www.hydrosheds.org/products/hydrobasins",
    license: "HydroSHEDS license",
  },
];

const CHANGELOG = [
  {
    version: "2026.07.1",
    note: "Two coastal & wetland habitat layers added to the main map (/peta): Mangroves (Global Mangrove Watch v3, ~223.900 polygons, 2020 extent) and Peatlands (Global Forest Watch 'Indonesia peat lands'). Both are carbon-rich, fire-prone ecosystems and critical wildlife habitat. Default-visible layers were retuned so the map opens on the human-pressure vs. protection story: concessions, protected & moratorium areas, mangroves, and peatlands are on by default; the Wildlife Distribution layer is now off by default (opt-in) to reduce initial clutter.",
  },
  {
    version: "2026.07.0",
    note: "Biodiversity map (/biodiversitas) reworked: the endemic-fauna and iconic-flora layers changed from scattered occurrence dots into DISTRIBUTION AREAS — curated GBIF points contoured per island into smooth density areas (fauna coloured by Sundaland/Wallacea/Papua biogeographic zone), the same organic-contour treatment as the Wildlife Distribution layer. The 'Biodiversity record density (GBIF)' raster overlay was removed as unhelpful noise. Two orphaned tilesets (wildlife habitat + occurrence points) that no map layer used were retired from the pipeline and object store.",
  },
  {
    version: "2026.06.2",
    note: "Wildlife layer reworked from occurrence points into a habitat-aware Wildlife Distribution layer: GBIF occurrences of threatened + flagship/endemic species (all classes, hundreds of species) are weighted by ESA WorldCover natural-habitat cover, city points are dropped, then density is contoured per island so each species stays on its actual island (a Sumatran tiger never bleeds into Java). Cryptic species whose coordinates are withheld for protection (e.g. Sumatran rhino) are added as clearly-flagged documented-range markers (IUCN/KLHK), not field records. The standalone RESOLVE ecoregion habitat layer was retired; its role is folded into the distribution layer's habitat weighting.",
  },
  {
    version: "2026.06.1",
    note: "Wildlife coverage expanded from 10 to 30 flagship species, every biogeographic region (Sundaland, Wallacea, Papua) and ecosystem (land, sea, freshwater), not just western Indonesia. Species now selected from Indonesia's protected-species law (Permen LHK P.106/2018), KKP marine rules & CITES, with IUCN Red List status and GBIF occurrences (filtered to 1990–present, removing stale museum specimens). Every occurrence coordinate is validated against an Indonesia land mask (Natural Earth 1:50m) and the species' realm, so marine animals mis-plotted inland (or land animals offshore) are dropped as gross coordinate errors, legitimate coastal records are kept. The layer was renamed from 'threatened' to 'protected' wildlife to match.",
  },
  {
    version: "2026.06.0",
    note: "Initial data pipeline: ingest and publish deforestation alerts, concessions, protected & moratorium areas, disasters, wildlife habitat and occurrences.",
  },
];

export default async function MethodologyPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "methodology" });

  return (
    <main className="prose mx-auto max-w-[1080px] px-5">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>

      <h2>{t("sourcesTitle")}</h2>
      <ul className="[&>li]:mb-1.5">
        {SOURCES.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.name}
            </a>
            , {s.license}
          </li>
        ))}
      </ul>

      <h2>{t("limitsTitle")}</h2>
      <p>{t("limitsBody")}</p>

      <h2>{t("changelogTitle")}</h2>
      <ul>
        {CHANGELOG.map((c) => (
          <li key={c.version}>
            <strong>{c.version}</strong>, {c.note}
          </li>
        ))}
      </ul>
    </main>
  );
}
