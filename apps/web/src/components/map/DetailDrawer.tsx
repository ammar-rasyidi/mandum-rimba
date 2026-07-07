"use client";

import { useTranslations, useLocale } from "next-intl";
import type { LayerDef } from "@/lib/layers";
import speciesNamesRaw from "@/data/species-names.json";
import floraSpeciesRaw from "@/data/flora-species.json";
import faunaSpeciesRaw from "@/data/fauna-species.json";

// scientific name -> common name (Indonesian / English), from GBIF vernaculars
const SPECIES_NAMES = speciesNamesRaw as Record<
  string,
  { id?: string; en?: string }
>;

// curated, sourced profiles for the iconic flora taxa (POWO/IUCN/CITES). Keyed
// by the `taxon` label the flora-distribution polygons carry.
type Bi = { id: string; en: string };
interface SpeciesProfile {
  sci: string;
  en: string;
  id: string;
  type: Bi;
  endemic: Bi;
  range: Bi;
  habitat: Bi;
  iucn: string;
  iucnNote: Bi;
  cites: string;
  protected: Bi;
  desc: Bi;
  ref: { name: string; url: string };
}
// (each JSON carries a leading `_note` string key for maintainers; it is never
// looked up, so cast through unknown). Same profile shape is used for the flora
// (/biodiversitas flora layer) and fauna (endemic-wildlife layer) catalogs.
const FLORA_SPECIES = floraSpeciesRaw as unknown as Record<string, SpeciesProfile>;
const FAUNA_SPECIES = faunaSpeciesRaw as unknown as Record<string, SpeciesProfile>;

export interface SelectedFeature {
  layer: LayerDef;
  properties: Record<string, unknown>;
}

/** keys we render with friendlier ordering; everything else follows */
const PRIORITY_KEYS = [
  "name",
  "nameEn",
  "nameAlt",
  "sci",
  "cat",
  "desig",
  "status",
  "company",
  "type",
  "commodity",
  "areaHa",
  "year",
  "iucn",
  "basis",
  "date",
  "system",
  "confidence",
  "deaths",
  "affected",
];

// internal/duplicate fields never shown in the popup
const HIDDEN_KEYS = new Set(["id", "kind", "companySlug", "source", "species"]);

// friendly labels for the keys that have a translation; others show raw
const FIELD_LABELS: Record<string, string> = {
  name: "fieldName",
  nameEn: "fieldName",
  nameAlt: "fieldNameAlt",
  sci: "fieldSci",
  status: "fieldStatus",
  cat: "fieldCategory",
  desig: "fieldDesignation",
  areaHa: "fieldArea",
  year: "fieldYear",
  iucn: "fieldIucn",
  basis: "fieldBasis",
};

export default function DetailDrawer({
  feature,
  onClose,
}: {
  feature: SelectedFeature;
  onClose: () => void;
}) {
  const t = useTranslations("map");
  const locale = useLocale();
  const { layer, properties } = feature;

  // small ghost chip, matching the layer panel's control buttons
  const closeBtn =
    "float-right cursor-pointer rounded-full border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-[0.7rem] py-[0.2rem] text-[0.78rem] text-muted transition-[color,border-color] hover:border-[var(--text-dim)] hover:text-foreground hover:no-underline";

  // Peta Sebaran Satwa: the click handler aggregates every class-area under the
  // point into { byClass, date }. Render the recorded species grouped by class
  // ("what birds / mammals / reptiles / amphibians are here").
  if (layer.id === "species-dist") {
    const byClass = (properties.byClass ?? {}) as Record<
      string,
      { sci: string; cat: string; doc: boolean }[]
    >;
    const ORDER = ["aves", "mammalia", "reptilia", "amphibia"];
    const present = ORDER.filter((c) => (byClass[c]?.length ?? 0) > 0);
    // the period the SOURCE records span (e.g. "1990-2026"), shown verbatim,
    // not the date this app processed them
    const dataPeriod = properties.date ? String(properties.date) : "";
    return (
      <aside
        className="glass absolute left-3 top-[5.75rem] z-[5] max-h-[calc(100%-8rem)] w-[320px] animate-[panel-in_0.22s_ease] overflow-y-auto rounded-[18px] p-4 text-[0.88rem] max-[720px]:inset-x-2 max-[720px]:top-[5.25rem] max-[720px]:max-h-[50%] max-[720px]:w-auto"
        aria-label={t("detail")}
      >
        <button className={closeBtn} onClick={onClose}>
          {t("close")}
        </button>
        <h2 className="m-0 mb-1 text-base">{t("layerNames.species-dist")}</h2>
        {present.length === 0 ? (
          <p className="m-0 mt-2 text-muted">{t("speciesNone")}</p>
        ) : (
          <>
            <p className="m-0 mb-1 text-[0.78rem] text-muted">
              {t("speciesHere")}
            </p>
            <dl className="m-0 [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dt]:mt-[0.6rem] [&_dt]:text-[0.78rem] [&_dt]:font-semibold [&_dt]:text-accent">
              {present.map((c) => (
                <div key={c}>
                  <dt>{t(`filterValues.${c}`)}</dt>
                  <dd>
                    {byClass[c].map(({ sci, cat, doc }, i) => {
                      const cn = SPECIES_NAMES[sci];
                      const common =
                        locale === "en"
                          ? (cn?.en ?? cn?.id)
                          : (cn?.id ?? cn?.en);
                      return (
                        <span key={sci}>
                          {i > 0 ? ", " : ""}
                          {common ? `${common} ` : ""}
                          <i className="text-muted">
                            {common ? `(${sci})` : sci}
                          </i>
                          {["NT", "VU", "EN", "CR", "EW", "EX"].includes(
                            cat,
                          ) ? (
                            <span
                              className="ml-1 rounded-[4px] bg-[var(--glass-highlight)] px-1 py-px text-[0.62rem] font-semibold tracking-[0.04em] text-accent"
                              title={t(`iucn.${cat}`)}
                            >
                              {cat}
                            </span>
                          ) : null}
                          {doc ? (
                            <span
                              className="ml-0.5 cursor-help font-semibold text-accent"
                              title={t("docRange")}
                            >
                              *
                            </span>
                          ) : null}
                        </span>
                      );
                    })}
                  </dd>
                </div>
              ))}
            </dl>
            {present.some((c) => byClass[c].some((s) => s.doc)) && (
              <p className="m-0 mt-2 text-[0.72rem] italic text-muted">
                {t("docFootnote")}
              </p>
            )}
          </>
        )}
        <dl className="m-0 [&_dd]:m-0 [&_dt]:mt-[0.6rem] [&_dt]:text-[0.75rem] [&_dt]:uppercase [&_dt]:tracking-[0.04em] [&_dt]:text-muted">
          {dataPeriod && (
            <div>
              <dt>{t("fieldDataPeriod")}</dt>
              <dd>{dataPeriod}</dd>
            </div>
          )}
          <div>
            <dt>{t("source")}</dt>
            <dd>
              <a href={layer.sourceUrl} target="_blank" rel="noreferrer">
                {layer.sourceName}, {t("viewEvidence")}
              </a>
            </dd>
          </div>
        </dl>
      </aside>
    );
  }

  // Endemic-fauna / flora DISTRIBUTION AREAS: each polygon carries the taxa
  // recorded inside it + the biogeographic zone (fauna). For flora, each taxon
  // has a curated, sourced profile (FLORA_SPECIES) rendered as a rich card;
  // fauna (no catalog yet) falls back to a plain name list.
  if (layer.id === "endemic" || layer.id === "flora") {
    const L = locale === "en" ? "en" : "id";
    // MapLibre serialises array/object feature properties to JSON strings, so
    // `taxa` arrives as a string (e.g. '["Rafflesia","Meranti"]'), not an array.
    let taxa: string[] = [];
    if (Array.isArray(properties.taxa)) {
      taxa = properties.taxa as string[];
    } else if (typeof properties.taxa === "string" && properties.taxa) {
      try {
        const parsed = JSON.parse(properties.taxa);
        if (Array.isArray(parsed)) taxa = parsed as string[];
      } catch {
        /* ignore malformed */
      }
    }
    const zone =
      typeof properties.grp === "string" && properties.grp
        ? properties.grp.charAt(0).toUpperCase() + properties.grp.slice(1)
        : "";
    const iucnBadge = (code: string) =>
      ["NT", "VU", "EN", "CR", "EW", "EX"].includes(code) ? (
        <span
          className="rounded-[4px] bg-[var(--glass-highlight)] px-1 py-px text-[0.62rem] font-semibold tracking-[0.04em] text-accent"
          title={t.has(`iucn.${code}`) ? t(`iucn.${code}`) : code}
        >
          {code}
        </span>
      ) : null;
    const catalog = layer.id === "flora" ? FLORA_SPECIES : FAUNA_SPECIES;
    const profiles = taxa
      .map((name) => [name, catalog[name]] as const)
      .filter(([, p]) => p);
    return (
      <aside
        className="glass absolute left-3 top-[5.75rem] z-[5] max-h-[calc(100%-8rem)] w-[340px] animate-[panel-in_0.22s_ease] overflow-y-auto rounded-[18px] p-4 text-[0.88rem] max-[720px]:inset-x-2 max-[720px]:top-[5.25rem] max-[720px]:max-h-[55%] max-[720px]:w-auto"
        aria-label={t("detail")}
      >
        <button className={closeBtn} onClick={onClose}>
          {t("close")}
        </button>
        <h2 className="m-0 mb-1 text-base">{t(`layerNames.${layer.id}`)}</h2>
        {zone && <p className="m-0 mb-1 text-[0.78rem] text-accent">{zone}</p>}
        {taxa.length === 0 ? (
          <p className="m-0 mt-2 text-muted">{t("speciesNone")}</p>
        ) : profiles.length > 0 ? (
          <>
            <p className="m-0 mb-2 text-[0.78rem] text-muted">{t("taxaHere")}</p>
            <div className="flex flex-col gap-3">
              {profiles.map(([name, p]) => (
                <div
                  key={name}
                  className="rounded-[12px] border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <strong className="text-[0.92rem]">{p[L]}</strong>
                    {iucnBadge(p.iucn)}
                    {p.cites && (
                      <span
                        className="rounded-[4px] bg-[var(--glass-highlight)] px-1 py-px text-[0.62rem] font-semibold tracking-[0.04em] text-accent"
                        title={t("citesTitle")}
                      >
                        CITES {p.cites}
                      </span>
                    )}
                  </div>
                  <p className="m-0 text-[0.74rem] italic text-muted">{p.sci}</p>
                  <p className="m-0 mt-1 text-[0.8rem]">{p.desc[L]}</p>
                  <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-[0.2rem] text-[0.76rem] [&_dt]:text-muted">
                    <dt>{t("floraType")}</dt>
                    <dd className="m-0">{p.type[L]}</dd>
                    <dt>{t("floraEndemic")}</dt>
                    <dd className="m-0">{p.endemic[L]}</dd>
                    <dt>{t("floraRange")}</dt>
                    <dd className="m-0">{p.range[L]}</dd>
                    <dt>{t("floraHabitat")}</dt>
                    <dd className="m-0">{p.habitat[L]}</dd>
                    {p.iucnNote[L] && (
                      <>
                        <dt>{t("floraStatus")}</dt>
                        <dd className="m-0">{p.iucnNote[L]}</dd>
                      </>
                    )}
                    {p.protected[L] && p.protected[L] !== "-" && (
                      <>
                        <dt>{t("floraProtected")}</dt>
                        <dd className="m-0">{p.protected[L]}</dd>
                      </>
                    )}
                  </dl>
                  <a
                    className="mt-2 inline-block text-[0.74rem]"
                    href={p.ref.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("source")}: {p.ref.name}
                  </a>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="m-0 mb-1 text-[0.78rem] text-muted">{t("taxaHere")}</p>
            <p className="m-0">{taxa.join(", ")}</p>
            <dl className="m-0 [&_dd]:m-0 [&_dt]:mt-[0.6rem] [&_dt]:text-[0.75rem] [&_dt]:uppercase [&_dt]:tracking-[0.04em] [&_dt]:text-muted">
              <div>
                <dt>{t("source")}</dt>
                <dd>
                  <a href={layer.sourceUrl} target="_blank" rel="noreferrer">
                    {layer.sourceName}, {t("viewEvidence")}
                  </a>
                </dd>
              </div>
            </dl>
          </>
        )}
      </aside>
    );
  }

  // for bilingual common-name pairs (species), keep only the active locale's
  const hidden = new Set(HIDDEN_KEYS);
  if (properties.name !== undefined && properties.nameEn !== undefined) {
    hidden.add(locale === "en" ? "name" : "nameEn");
  }

  // drop hidden keys and "empty" optional fields (0 year, blank desig/iucn)
  const isEmpty = (k: string, v: unknown) =>
    v === undefined ||
    v === "" ||
    ((k === "year" || k === "areaHa") && Number(v) === 0);

  const visible = (k: string) => !hidden.has(k) && !isEmpty(k, properties[k]);

  const keys = [
    ...PRIORITY_KEYS.filter((k) => properties[k] !== undefined && visible(k)),
    ...Object.keys(properties).filter(
      (k) => !PRIORITY_KEYS.includes(k) && visible(k),
    ),
  ];

  const labelFor = (k: string): string => {
    // "year" means different things per layer (designated vs recorded)
    if (k === "year")
      return t(layer.id === "species" ? "fieldYearRecorded" : "fieldYear");
    return FIELD_LABELS[k] ? t(FIELD_LABELS[k]) : k;
  };

  const valueFor = (k: string): string => {
    const v = properties[k];
    if (k === "cat" || k === "status") return t(`filterValues.${String(v)}`);
    if (k === "areaHa") return `${Number(v).toLocaleString("id-ID")} ha`;
    if (k === "basis") {
      const key = `basisValues.${String(v)}`;
      return t.has(key) ? t(key) : String(v);
    }
    return String(v);
  };

  return (
    <aside
      className="glass absolute left-3 top-[5.75rem] z-[5] max-h-[calc(100%-8rem)] w-[320px] animate-[panel-in_0.22s_ease] overflow-y-auto rounded-[18px] p-4 text-[0.88rem] max-[720px]:inset-x-2 max-[720px]:top-[5.25rem] max-[720px]:max-h-[50%] max-[720px]:w-auto"
      aria-label={t("detail")}
    >
      <button
        className="float-right cursor-pointer rounded border border-border bg-transparent text-muted"
        onClick={onClose}
      >
        {t("close")}
      </button>
      <h2 className="m-0 mb-2 text-base">{t(`layerNames.${layer.id}`)}</h2>
      <dl className="m-0 [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dt]:mt-[0.6rem] [&_dt]:text-[0.75rem] [&_dt]:uppercase [&_dt]:tracking-[0.04em] [&_dt]:text-muted">
        {keys.map((k) => (
          <div key={k}>
            <dt>{labelFor(k)}</dt>
            <dd>{valueFor(k)}</dd>
          </div>
        ))}
        <div>
          <dt>{t("source")}</dt>
          <dd>
            <a href={layer.sourceUrl} target="_blank" rel="noreferrer">
              {layer.sourceName}, {t("viewEvidence")}
            </a>
          </dd>
        </div>
      </dl>
    </aside>
  );
}
