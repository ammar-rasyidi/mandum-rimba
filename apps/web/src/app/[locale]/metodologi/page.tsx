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
    name: "Global Forest Watch — RADD / GLAD alerts, UMD annual tree cover loss",
    url: "https://data-api.globalforestwatch.org",
    license: "CC BY 4.0",
  },
  {
    name: "BNPB DIBI — disaster events (floods, landslides), via the UNDRR DesInventar mirror",
    url: "https://www.desinventar.net/DesInventar/profiletab.jsp?countrycode=idn",
    license: "Public data (UNDRR DesInventar)",
  },
  {
    name: "GFW concession layers (Greenpeace-derived) — oil palm (v2025), wood fiber (v2025), logging (v202106)",
    url: "https://data.globalforestwatch.org/search?q=Indonesia%20concessions",
    license: "CC BY 4.0",
  },
  {
    name: "Maus et al. 2022 — global mining land use (footprint), via GFW / PANGAEA",
    url: "https://doi.org/10.1594/PANGAEA.942325",
    license: "CC BY 4.0",
  },
  {
    name: "GBIF — threatened-species occurrence records (flagship species)",
    url: "https://www.gbif.org",
    license: "Per-dataset (CC0 / CC BY / CC BY-NC)",
  },
  {
    name: "RESOLVE Ecoregions 2017 — wildlife habitat units, via UNEP-WCMC",
    url: "https://data-gis.unep-wcmc.org/server/rest/services/Bio-geographicalRegions/Resolve_Ecoregions/FeatureServer/0",
    license: "CC BY 4.0",
  },
  {
    name: "Protected Planet (WDPA) — protected areas",
    url: "https://www.protectedplanet.net",
    license: "WDPA terms (no redistribution)",
  },
  {
    name: "KLHK PIPPIB — forest moratorium",
    url: "https://geoportal.menlhk.go.id",
    license: "Public data",
  },
  {
    name: "Trase — palm exporter ↔ deforestation linkage",
    url: "https://trase.earth",
    license: "CC BY 4.0",
  },
  {
    name: "Nusantara Atlas — monthly reports (cite & link only)",
    url: "https://nusantara-atlas.org",
    license: "See source",
  },
  {
    name: "GADM 4.1 — administrative boundaries",
    url: "https://gadm.org",
    license: "Academic / non-commercial use",
  },
  {
    name: "HydroBASINS — watersheds",
    url: "https://www.hydrosheds.org/products/hydrobasins",
    license: "HydroSHEDS license",
  },
];

const CHANGELOG = [
  {
    version: "2026.06.0",
    note: "Initial derive pipeline: spatial flags (alerts × concessions/protected/moratorium), 90-day + calendar-year discrepancy aggregation, watershed flood↔loss linkage.",
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
            </a>{" "}
            — {s.license}
          </li>
        ))}
      </ul>

      <h2>{t("deriveTitle")}</h2>
      <p>{t("deriveBody")}</p>

      <h2>{t("limitsTitle")}</h2>
      <p>{t("limitsBody")}</p>

      <h2>{t("changelogTitle")}</h2>
      <ul>
        {CHANGELOG.map((c) => (
          <li key={c.version}>
            <strong>{c.version}</strong> — {c.note}
          </li>
        ))}
      </ul>
    </main>
  );
}
