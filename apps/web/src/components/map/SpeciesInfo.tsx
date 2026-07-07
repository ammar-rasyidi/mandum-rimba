"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { matchFloraProfile } from "@/lib/species-catalog";
import {
  enrichSpecies,
  type SpeciesProfileData,
  type SpeciesEnrichment,
} from "@/lib/species";

/** Profile panel for the selected species: a curated, hand-sourced card when the
 *  species maps to our catalog (by genus), otherwise an auto profile built from
 *  the self-hosted GBIF-derived data. The map alongside shows WHERE it lives. */
export default function SpeciesInfo({
  data,
  onClose,
}: {
  data: SpeciesProfileData;
  onClose: () => void;
}) {
  const t = useTranslations("map");
  const locale = useLocale();
  const L = locale === "en" ? "en" : "id";
  const { species, points } = data;
  const curated = matchFloraProfile(species.genus, species.canonical);
  const nRecords = points.features.length;

  // photo + description + IUCN aren't baked into R2 (keeps the build light) —
  // fetch them client-side from GBIF + Wikipedia when a species is opened.
  const [enrich, setEnrich] = useState<SpeciesEnrichment | null>(null);
  useEffect(() => {
    let active = true;
    setEnrich(null);
    enrichSpecies(species.key, species.canonical, species.genus).then((e) => {
      if (active) setEnrich(e);
    });
    return () => {
      active = false;
    };
  }, [species.key, species.canonical, species.genus]);
  const image = enrich?.image ?? species.image;
  const autoIucn = enrich?.iucn ?? species.iucn ?? "";

  const closeBtn =
    "absolute right-3 top-3 z-10 cursor-pointer rounded-full border border-[var(--glass-border)] bg-[var(--overlay)] px-[0.75rem] py-[0.28rem] text-[0.75rem] leading-none text-muted shadow-[var(--shadow)] backdrop-blur transition-[color,border-color] hover:border-[var(--text-dim)] hover:text-foreground hover:no-underline";
  const iucnBadge = (code: string) =>
    ["NT", "VU", "EN", "CR", "EW", "EX"].includes(code) ? (
      <span
        className="rounded-[4px] bg-[var(--glass-highlight)] px-1 py-px text-[0.62rem] font-semibold tracking-[0.04em] text-accent"
        title={t.has(`iucn.${code}`) ? t(`iucn.${code}`) : code}
      >
        {code}
      </span>
    ) : null;

  return (
    <aside
      className="glass absolute left-3 top-[5.75rem] z-[5] max-h-[calc(100%-8rem)] w-[340px] animate-[panel-in_0.22s_ease] overflow-y-auto rounded-[18px] p-4 text-[0.88rem] max-[720px]:inset-x-2 max-[720px]:top-[5.25rem] max-[720px]:max-h-[55%] max-[720px]:w-auto"
      aria-label={t("detail")}
    >
      <button className={closeBtn} onClick={onClose}>
        {t("close")}
      </button>

      {/* representative photo (GBIF occurrence media / Wikimedia, CC-licensed).
          Sources have varied aspect ratios, so we fix a 4:3 frame and let the
          image fit inside it (object-contain) — never cropped, just letterboxed. */}
      {image?.url && (
        <figure className="m-0 mb-2 mt-1">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-[12px] border border-[var(--glass-border)] bg-[var(--glass-highlight)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={species.canonical}
              loading="lazy"
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.currentTarget.closest("figure") as HTMLElement).style.display =
                  "none";
              }}
            />
          </div>
          <figcaption className="mt-1 text-[0.68rem] text-muted">
            📷 {image.creator || "—"} · {image.license}
          </figcaption>
        </figure>
      )}
      {/* photo still loading (client-side fetch from GBIF/Wikipedia) */}
      {!image?.url && enrich === null && (
        <div className="mb-2 mt-1 flex aspect-[4/3] w-full animate-pulse items-center justify-center rounded-[12px] border border-[var(--glass-border)] bg-[var(--glass-highlight)] text-[0.72rem] text-muted">
          {t("loadingPhoto")}
        </div>
      )}

      {/* header — reserve space on the right for the close button when there's
          no photo above it to sit over */}
      <div
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${
          image?.url || enrich === null ? "" : "pr-16"
        }`}
      >
        <strong className="text-[0.98rem]">
          {curated ? curated[L] : species.vernacularId || species.vernacularEn || species.canonical}
        </strong>
        {iucnBadge(curated ? curated.iucn : autoIucn)}
        {curated?.cites && (
          <span
            className="rounded-[4px] bg-[var(--glass-highlight)] px-1 py-px text-[0.62rem] font-semibold tracking-[0.04em] text-accent"
            title={t("citesTitle")}
          >
            CITES {curated.cites}
          </span>
        )}
      </div>
      <p className="m-0 text-[0.75rem] italic text-muted">
        {curated?.sci || species.sci || species.canonical}
      </p>
      <p className="m-0 mt-1 text-[0.72rem] text-muted">
        {species.family}
        {" · "}
        {t("recordsCount", { n: nRecords })}
      </p>
      {species.sensitive && (
        <p className="m-0 mt-2 rounded-[8px] bg-[var(--glass-highlight)] px-2 py-1 text-[0.72rem] text-accent">
          🔒 {t("sensitiveNote")}
        </p>
      )}

      {/* curated rich profile */}
      {curated ? (
        <>
          <p className="m-0 mt-2 text-[0.82rem]">{curated.desc[L]}</p>
          <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-[0.2rem] text-[0.76rem] [&_dt]:text-muted">
            <dt>{t("floraType")}</dt>
            <dd className="m-0">{curated.type[L]}</dd>
            <dt>{t("floraEndemic")}</dt>
            <dd className="m-0">{curated.endemic[L]}</dd>
            <dt>{t("floraRange")}</dt>
            <dd className="m-0">{curated.range[L]}</dd>
            <dt>{t("floraHabitat")}</dt>
            <dd className="m-0">{curated.habitat[L]}</dd>
            {curated.iucnNote[L] && (
              <>
                <dt>{t("floraStatus")}</dt>
                <dd className="m-0">{curated.iucnNote[L]}</dd>
              </>
            )}
            {curated.protected[L] && curated.protected[L] !== "-" && (
              <>
                <dt>{t("floraProtected")}</dt>
                <dd className="m-0">{curated.protected[L]}</dd>
              </>
            )}
          </dl>
          <a
            className="mt-2 inline-block text-[0.74rem]"
            href={curated.ref.url}
            target="_blank"
            rel="noreferrer"
          >
            {t("source")}: {curated.ref.name}
          </a>
        </>
      ) : (
        /* auto profile (GBIF-derived) */
        <>
          {/* description still loading (client-side fetch from Wikipedia) */}
          {enrich === null && (
            <p className="m-0 mt-2 animate-pulse text-[0.82rem] text-muted">
              {t("loadingInfo")}
            </p>
          )}
          {/* "what is this plant" — from Wikipedia (fetched client-side) */}
          {enrich?.description?.text && (
            <>
              <p className="m-0 mt-2 text-[0.82rem]">
                {enrich.description.text}
              </p>
              {enrich.description.url && (
                <a
                  className="mt-1 inline-block text-[0.72rem] text-muted"
                  href={enrich.description.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {enrich.description.source} ↗
                </a>
              )}
            </>
          )}
          <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-[0.2rem] text-[0.78rem] [&_dt]:text-muted">
            {(species.vernacularId || species.vernacularEn) && (
              <>
                <dt>{t("floraName")}</dt>
                <dd className="m-0">
                  {[species.vernacularId, species.vernacularEn]
                    .filter(Boolean)
                    .join(" / ")}
                </dd>
              </>
            )}
            <dt>{t("floraFamily")}</dt>
            <dd className="m-0">{species.family || "—"}</dd>
            {autoIucn && (
              <>
                <dt>{t("floraStatus")}</dt>
                <dd className="m-0">
                  {t.has(`iucn.${autoIucn}`)
                    ? t(`iucn.${autoIucn}`)
                    : autoIucn}
                </dd>
              </>
            )}
          </dl>
        </>
      )}

      {/* provenance — always honest about the derived range */}
      <p className="m-0 mt-3 text-[0.7rem] italic text-muted">
        {t("rangeDerivedNote")}
      </p>
      <a
        className="mt-1 inline-block text-[0.74rem]"
        href={`https://www.gbif.org/species/${species.key}`}
        target="_blank"
        rel="noreferrer"
      >
        {t("viewOnGbif")}
      </a>
    </aside>
  );
}
