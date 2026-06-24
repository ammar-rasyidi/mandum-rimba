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
    name: "GBIF, protected-wildlife occurrence records (30 flagship species, Sumatra–Papua; land, sea & freshwater)",
    url: "https://www.gbif.org",
    license: "Per-dataset (CC0 / CC BY / CC BY-NC)",
  },
  {
    name: "IUCN Red List of Threatened Species, conservation status (CR/EN/VU/NT/LC) of each flagship species",
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
