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

const GITHUB = "https://github.com/ammar-rasyidi/mandum-rimba";
const doc = (file: string) => `${GITHUB}/blob/main/${file}`;

/** Live star / fork counts from the GitHub API (cached 1h; null if unreachable
 * or the repo is still private). */
async function githubStats(): Promise<{ stars: number; forks: number } | null> {
  try {
    const r = await fetch(
      "https://api.github.com/repos/ammar-rasyidi/mandum-rimba",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "mandumrimba.org",
        },
        next: { revalidate: 3600 },
      },
    );
    if (!r.ok) return null;
    const d = (await r.json()) as {
      stargazers_count: number;
      forks_count: number;
    };
    return { stars: d.stargazers_count, forks: d.forks_count };
  } catch {
    return null;
  }
}

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
  const gh = await githubStats();
  const nf = new Intl.NumberFormat(loc === "en" ? "en" : "id-ID");

  return (
    <main className="prose mx-auto max-w-[1080px] px-5">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>

      {/* GitHub repo button with live star / fork counts */}
      <a
        href={GITHUB}
        target="_blank"
        rel="noreferrer"
        className="not-prose my-5 inline-flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 no-underline transition-[transform,border-color] hover:-translate-y-0.5 hover:border-accent hover:no-underline"
      >
        <svg viewBox="0 0 16 16" className="h-5 w-5 fill-foreground" aria-hidden>
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        <span className="font-semibold text-foreground">{t("github")}</span>
        {gh && (
          <span className="flex items-center gap-3 text-[0.85rem] text-muted">
            <span
              className="inline-flex items-center gap-1"
              aria-label={t("stars")}
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden>
                <path d="M8 .25l2.06 4.18 4.61.67-3.34 3.25.79 4.6L8 10.98l-4.12 2.17.79-4.6L1.33 5.1l4.61-.67L8 .25z" />
              </svg>
              {nf.format(gh.stars)}
            </span>
            <span
              className="inline-flex items-center gap-1"
              aria-label={t("forks")}
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden>
                <path d="M5 3.5a1.5 1.5 0 10-2 1.415V6.5A2.5 2.5 0 005.5 9h1.75v1.585a1.5 1.5 0 101.5 0V9h1.75A2.5 2.5 0 0013 6.5V4.915a1.5 1.5 0 10-1.5 0V6.5a1 1 0 01-1 1H5.5a1 1 0 01-1-1V4.915A1.5 1.5 0 005 3.5z" />
              </svg>
              {nf.format(gh.forks)}
            </span>
          </span>
        )}
      </a>

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
      <p>{t("licenseIntro")}</p>
      <ul className="[&>li]:mb-2">
        <li>
          <strong>{t("licenseCode")}</strong>,{" "}
          <a href={doc("LICENSE")} target="_blank" rel="noreferrer">
            GNU AGPL-3.0-or-later
          </a>
          . {t("licenseCodeDesc")}
        </li>
        <li>
          <strong>{t("licenseBrand")}</strong>,{" "}
          <a href={doc("TRADEMARK.md")} target="_blank" rel="noreferrer">
            {t("licenseBrandLink")}
          </a>
          . {t("licenseBrandDesc")}
        </li>
        <li>
          <strong>{t("licenseData")}</strong>, {t("licenseDataDesc")}{" "}
          <Link href="/sumber-data">{t("dataLink")}</Link>.
        </li>
        <li>
          <strong>{t("licenseGovernance")}</strong>,{" "}
          <a href={doc("GOVERNANCE.md")} target="_blank" rel="noreferrer">
            GOVERNANCE
          </a>{" "}
          ·{" "}
          <a href={doc("CLA.md")} target="_blank" rel="noreferrer">
            CLA
          </a>
          . {t("licenseGovernanceDesc")}
        </li>
      </ul>
    </main>
  );
}
