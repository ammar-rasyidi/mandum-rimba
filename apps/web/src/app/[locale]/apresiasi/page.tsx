import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  CONTRIBUTORS,
  DATA_ACKNOWLEDGEMENTS,
  MEDIA_CREDITS,
  OPEN_SOURCE,
  type CreditItem,
} from "@/lib/credits";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "credits" });
  return { title: t("title") };
}

function CreditList({
  items,
  loc,
}: {
  items: CreditItem[];
  loc: "id" | "en";
}) {
  return (
    <ul className="m-0 mb-6 mt-[0.8rem] grid list-none gap-x-[1.2rem] gap-y-[0.4rem] p-0 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
      {items.map((c) => (
        <li key={c.name} className="border-b border-border py-[0.35rem]">
          <a href={c.url} target="_blank" rel="noreferrer">
            {c.name}
          </a>
          <span className="text-[0.85rem] text-muted"> — {c.what[loc]}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function CreditsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "credits" });
  const loc = locale === "en" ? "en" : "id";

  return (
    <main className="prose mx-auto max-w-[1080px] px-5">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>

      <h2>{t("partnersTitle")}</h2>
      <div className="my-4">
        <a
          href="https://dahono.com/"
          target="_blank"
          rel="noreferrer"
          aria-label="Dahono Labs"
          className="inline-flex items-center rounded-xl border border-border bg-surface px-6 py-5 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-accent hover:no-underline"
        >
          {/* logo swaps with the theme: white on dark, black on light */}
          <img
            src="/images/dahono-labs-logo-white.svg"
            alt="Dahono Labs"
            className="hidden h-9 w-auto dark:block"
          />
          <img
            src="/images/dahono-labs-logo-black.svg"
            alt="Dahono Labs"
            className="block h-9 w-auto dark:hidden"
          />
        </a>
      </div>

      <h2>{t("contributorsTitle")}</h2>
      <div className="my-4 grid gap-[0.8rem] [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {CONTRIBUTORS.map((c) => (
          <div
            className="flex flex-col gap-[0.15rem] rounded-xl border border-border bg-surface px-[1.1rem] py-[0.9rem]"
            key={c.name}
          >
            <strong className="text-foreground">{c.name}</strong>
            <span className="text-[0.85rem] text-muted">{c.role[loc]}</span>
          </div>
        ))}
      </div>
      <p className="text-[0.9rem]">
        {t("openContribution")}{" "}
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
        >
          {t("openContributionLink")}
        </a>
        .
      </p>

      <h2>{t("dataTitle")}</h2>
      <p>
        {t("dataIntro")}{" "}
        <Link href="/sumber-data">{t("dataLink")}</Link>.
      </p>
      <CreditList items={DATA_ACKNOWLEDGEMENTS} loc={loc} />

      <h2>{t("toolsTitle")}</h2>
      <p>{t("toolsIntro")}</p>
      <CreditList items={OPEN_SOURCE} loc={loc} />

      <h2>{t("mediaTitle")}</h2>
      <ul className="m-0 mb-6 mt-[0.8rem] list-none p-0">
        {/* {MEDIA_CREDITS.map((m) => (
          <li
            key={m.sourceUrl}
            className="border-b border-border py-[0.35rem]"
          >
            {t("photoBy")}{" "}
            <a href={m.authorUrl} target="_blank" rel="noreferrer">
              {m.author}
            </a>{" "}
            {t("photoOn")}{" "}
            <a href={m.sourceUrl} target="_blank" rel="noreferrer">
              {m.source}
            </a>
            <span className="text-[0.85rem] text-muted"> — {m.what[loc]}</span>
          </li>
        ))} */}
      </ul>

      <h2>{t("licenseTitle")}</h2>
      <p>{t("licenseBody")}</p>
    </main>
  );
}
