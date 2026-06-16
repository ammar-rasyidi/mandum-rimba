"use client";

import { useTranslations, useLocale } from "next-intl";
import type { LayerDef } from "@/lib/layers";

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
              {layer.sourceName} — {t("viewEvidence")}
            </a>
          </dd>
        </div>
      </dl>
    </aside>
  );
}
