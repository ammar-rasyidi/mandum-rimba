"use client";

import { useTranslations } from "next-intl";
import type { LayerDef } from "@/lib/layers";

export interface SelectedFeature {
  layer: LayerDef;
  properties: Record<string, unknown>;
}

/** keys we render with friendlier ordering; everything else follows */
const PRIORITY_KEYS = [
  "name",
  "nameEn",
  "company",
  "type",
  "commodity",
  "date",
  "system",
  "confidence",
  "areaHa",
  "kind",
  "deaths",
  "affected",
];

export default function DetailDrawer({
  feature,
  onClose,
}: {
  feature: SelectedFeature;
  onClose: () => void;
}) {
  const t = useTranslations("map");
  const { layer, properties } = feature;

  const keys = [
    ...PRIORITY_KEYS.filter((k) => properties[k] !== undefined),
    ...Object.keys(properties).filter(
      (k) => !PRIORITY_KEYS.includes(k) && k !== "id",
    ),
  ];

  return (
    <aside
      className="glass absolute left-3 top-[4.6rem] z-[5] max-h-[calc(100%-5.4rem)] w-[320px] animate-[panel-in_0.22s_ease] overflow-y-auto rounded-[18px] p-4 text-[0.88rem] max-[720px]:inset-x-2 max-[720px]:top-[4.2rem] max-[720px]:max-h-[50%] max-[720px]:w-auto"
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
            <dt>{k}</dt>
            <dd>{String(properties[k])}</dd>
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
