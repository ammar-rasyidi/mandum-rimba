"use client";

import { useTranslations, useLocale } from "next-intl";
import type { LayerDef } from "@/lib/layers";
import speciesNamesRaw from "@/data/species-names.json";

// scientific name -> common name (Indonesian / English), from GBIF vernaculars
const SPECIES_NAMES = speciesNamesRaw as Record<
  string,
  { id?: string; en?: string }
>;

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
