import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  CONTRIBUTORS,
  DATA_ACKNOWLEDGEMENTS,
  MEDIA_CREDITS,
  OPEN_SOURCE,
  SUPPORTERS,
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
          <span className="text-[0.85rem] text-muted">, {c.what[loc]}</span>
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
      <div className="my-4 flex flex-wrap items-center gap-3">
        {/* each logo swaps with the theme: the _dark variant (white art) shows
            on the dark theme, the _light variant (dark art) on the light theme */}
        <a
          href="https://dahono.com/"
          target="_blank"
          rel="noreferrer"
          aria-label="Dahono Labs"
          className="inline-flex items-center rounded-xl border border-border bg-surface px-6 py-5 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-accent hover:no-underline"
        >
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
        <a
          href="https://suaraai.id"
          target="_blank"
          rel="noreferrer"
          aria-label="Suara AI"
          className="inline-flex items-center rounded-xl border border-border bg-surface px-6 py-5 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-accent hover:no-underline"
        >
          <img
            src="/images/suaraai_logo_dark.svg"
            alt="Suara AI"
            className="hidden h-9 w-auto dark:block"
          />
          <img
            src="/images/suaraai_logo_light.svg"
            alt="Suara AI"
            className="block h-9 w-auto dark:hidden"
          />
        </a>
        <a
          href="https://voicelyf.com"
          target="_blank"
          rel="noreferrer"
          aria-label="Voicelyf"
          className="inline-flex items-center rounded-xl border border-border bg-surface px-6 py-5 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-accent hover:no-underline"
        >
          <img
            src="/images/voicelyf_logo_dark.svg"
            alt="Voicelyf"
            className="hidden h-9 w-auto dark:block"
          />
          <img
            src="/images/voicelyf_logo_light.svg"
            alt="Voicelyf"
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
        <Link href="/proyek">{t("openContributionLink")}</Link>.
      </p>

      <h2>{t("supportersTitle")}</h2>
      <p>{t("supportersIntro")}</p>
      {SUPPORTERS.length === 0 ? (
        <p className="text-[0.9rem] text-muted">{t("supportersEmpty")}</p>
      ) : (
        <div className="my-4 flex flex-wrap gap-2">
          {SUPPORTERS.map((s) => {
            const label = s.social ? `${s.name} (${s.social})` : s.name;
            const chip =
              "rounded-full border border-border bg-surface px-3 py-1 text-[0.85rem]";
            return s.socialUrl ? (
              <a
                key={s.name + (s.social ?? "")}
                href={s.socialUrl}
                target="_blank"
                rel="noreferrer"
                className={`${chip} text-foreground no-underline transition-colors hover:border-accent hover:text-accent hover:no-underline`}
              >
                {label}
              </a>
            ) : (
              <span
                key={s.name + (s.social ?? "")}
                className={`${chip} text-muted`}
              >
                {label}
              </span>
            );
          })}
        </div>
      )}
      <p className="text-[0.9rem]">
        {t("supportersCta")}{" "}
        <Link href="/dukung">{t("supportersCtaLink")}</Link>.
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
            <span className="text-[0.85rem] text-muted">, {m.what[loc]}</span>
          </li>
        ))} */}
      </ul>

      <h2>{t("licenseTitle")}</h2>
      <p>{t("licenseBody")}</p>
    </main>
  );
}
