import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  DATA_CATALOG,
  DATA_GAPS,
  type DatasetEntry,
} from "@/lib/data-catalog";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "sources" });
  return { title: t("title") };
}

function DatasetRow({
  entry,
  loc,
  labels,
}: {
  entry: DatasetEntry;
  loc: "id" | "en";
  labels: Record<string, string>;
}) {
  const isGap = entry.status === "gap";
  const dt = "m-0 text-[0.68rem] uppercase tracking-[0.04em] text-muted";
  const dd = "m-0 mb-1 [overflow-wrap:anywhere]";
  return (
    <div
      className={`flex gap-6 rounded-2xl border bg-surface p-5 max-[760px]:flex-col max-[760px]:gap-4 ${
        isGap ? "border-dashed border-border" : "border-border"
      }`}
    >
      {/* left: name + description */}
      <div className="min-w-0 flex-[2]">
        <div className="flex items-start justify-between gap-3">
          <h3 className="m-0 text-[1.05rem] font-semibold text-foreground">
            {entry.name[loc]}
          </h3>
          {isGap && (
            <span className="shrink-0 whitespace-nowrap rounded-full border border-danger px-[0.55rem] py-[0.12rem] text-[0.7rem] text-danger">
              {labels.unavailable}
            </span>
          )}
        </div>
        <p className="mb-0 mt-2 text-[0.92rem] leading-relaxed text-muted">
          {entry.description[loc]}
        </p>
      </div>

      {/* right: metadata sidebar */}
      <dl className="m-0 min-w-[220px] flex-1 border-l border-border pl-6 text-[0.82rem] max-[760px]:border-l-0 max-[760px]:border-t max-[760px]:pl-0 max-[760px]:pt-4">
        <dt className={dt}>{labels.org}</dt>
        <dd className={dd}>{entry.org}</dd>
        <dt className={dt}>{labels.coverage}</dt>
        <dd className={dd}>{entry.coverage[loc]}</dd>
        <div className="mb-1 flex flex-wrap gap-x-6 gap-y-1">
          <div>
            <dt className={dt}>{labels.license}</dt>
            <dd className="m-0">{entry.license}</dd>
          </div>
          <div>
            <dt className={dt}>{labels.updated}</dt>
            <dd className="m-0">{entry.updated}</dd>
          </div>
        </div>
        <dt className={dt}>{labels.url}</dt>
        <dd className="m-0 [overflow-wrap:anywhere]">
          <a href={entry.url} target="_blank" rel="noreferrer">
            {entry.url.replace(/^https?:\/\//, "")}
          </a>
        </dd>
      </dl>
    </div>
  );
}

const sourceList = "mt-5 mb-10 flex flex-col gap-3";

export default async function DataSourcesPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "sources" });
  const loc = locale === "en" ? "en" : "id";
  const labels = {
    org: t("org"),
    license: t("license"),
    updated: t("updated"),
    coverage: t("coverage"),
    url: t("url"),
    unavailable: t("unavailable"),
  };

  return (
    <main className="prose mx-auto max-w-[62rem] px-5">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>

      <h2>{t("activeTitle")}</h2>
      <div className={sourceList}>
        {DATA_CATALOG.map((entry, i) => (
          <DatasetRow key={i} entry={entry} loc={loc} labels={labels} />
        ))}
      </div>

      <h2>{t("gapsTitle")}</h2>
      <p>{t("gapsIntro")}</p>
      <div className={sourceList}>
        {DATA_GAPS.map((entry, i) => (
          <DatasetRow key={i} entry={entry} loc={loc} labels={labels} />
        ))}
      </div>
    </main>
  );
}
