import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SUPPORTERS } from "@/lib/credits";

const THREADS_URL = "https://www.threads.com/@r.rasyidi";

// The Rimba Universe white papers (Google Drive folder).
const WHITEPAPER_URL =
  "https://drive.google.com/drive/folders/1vQcc_IZNPxwFTb4ZIApFsTUoL0-XpfmX?usp=drive_link";

// Trakteer (Indonesia) handles QRIS, GoPay, OVO, DANA, ShopeePay, and cards in
// one hosted page, so no personal QR images are needed.
const TRAKTEER_URL = "https://trakteer.id/mabxx6yj8dnsbic9odnj/tip";

// PayPal.me for supporters outside Indonesia. To use an official hosted Donate
// button instead, create one in PayPal and drop in their donate-SDK snippet
// (https://www.paypalobjects.com/donate/sdk/donate-sdk.js) with the button id.
const PAYPAL_URL = "https://paypal.me/rrasyidi";

// The supporter list lives in lib/credits.ts (SUPPORTERS), shared with credits.

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "support" });
  return { title: t("title") };
}

export default async function SupportPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "support" });
  const useItems = t.raw("useItems") as { title: string; body: string }[];
  const freeHelp = t.raw("freeHelpItems") as string[];

  const payCard =
    "group not-prose flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 no-underline transition hover:border-accent hover:no-underline";
  const ghost =
    "glass inline-flex items-center justify-center rounded-xl px-5 py-3 font-medium text-foreground no-underline transition hover:brightness-[1.04] hover:no-underline";
  const cell =
    "[&_:is(th,td)]:border-b [&_:is(th,td)]:border-border [&_:is(th,td)]:px-3 [&_:is(th,td)]:py-[0.55rem] [&_:is(th,td)]:text-left";

  return (
    <main className="prose mx-auto max-w-[62rem] px-5">
      {/* hero: The Rimba Universe, the two sibling wordmarks (theme-swapped) */}
      <div className="mb-10 flex flex-col items-center text-center">
        <div className="mb-5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
          The Rimba Universe
        </div>
        <div className="flex flex-col items-center gap-3">
          {/* Mandum Rimba (the map) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/hero_dark.svg"
            alt="Mandum Rimba"
            className="hidden h-12 w-auto sm:h-14 dark:block"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/hero_light.svg"
            alt="Mandum Rimba"
            className="block h-12 w-auto sm:h-14 dark:hidden"
          />
          <span className="leading-none text-muted">+</span>
          {/* Lam Rimba (the game) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/lam_rimba_dark.svg"
            alt="Lam Rimba"
            className="hidden h-12 w-auto sm:h-14 dark:block"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/lam_rimba_light.svg"
            alt="Lam Rimba"
            className="block h-12 w-auto sm:h-14 dark:hidden"
          />
        </div>
      </div>

      <h1>{t("title")}</h1>
      <p className="mt-2">
        <a
          href={WHITEPAPER_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 font-medium text-accent no-underline transition hover:brightness-110 hover:no-underline"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M14 3v5h5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          {t("whitepaper")}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M7 17L17 7M9 7h8v8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </p>
      <p>{t("intro")}</p>

      <h2>{t("freeTitle")}</h2>
      <p>{t("freeBody")}</p>

      <h2>{t("whyTitle")}</h2>
      <p>{t("whyBody")}</p>

      <h2>{t("useTitle")}</h2>
      <ul className="[&>li]:mb-2">
        {useItems.map((it) => (
          <li key={it.title}>
            <strong>{it.title}</strong>, {it.body}
          </li>
        ))}
      </ul>

      <h2>{t("freeHelpTitle")}</h2>
      <p>{t("freeHelpBody")}</p>
      <ul className="[&>li]:mb-1.5">
        {freeHelp.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>

      <h2>{t("noteTitle")}</h2>
      <p>{t("noteBody")}</p>

      <h2>{t("ctaTitle")}</h2>
      <p>{t("ctaBody")}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {/* Trakteer, Indonesia (QRIS, GoPay, OVO, DANA, ShopeePay, cards) */}
        <a href={TRAKTEER_URL} target="_blank" rel="noreferrer" className={payCard}>
          <span className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#ff4d4d] px-4 py-2.5 font-semibold text-white transition group-hover:brightness-110">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 21s-7.4-4.5-7.4-10A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 7.4 4c0 5.5-7.4 10-7.4 10Z" />
            </svg>
            {t("trakteerCta")}
          </span>
          <span className="text-[0.85rem] text-muted">{t("trakteerNote")}</span>
        </a>

        {/* PayPal, international, official wordmark on the brand gold button */}
        <a href={PAYPAL_URL} target="_blank" rel="noreferrer" className={payCard}>
          <span className="inline-flex w-fit items-center rounded-xl bg-[#ffc439] px-5 py-2.5 text-[1.15rem] font-bold italic tracking-tight transition group-hover:brightness-[1.03]">
            <span style={{ color: "#003087" }}>Pay</span>
            <span style={{ color: "#009cde" }}>Pal</span>
          </span>
          <span className="text-[0.85rem] text-muted">{t("paypalNote")}</span>
        </a>
      </div>

      <p className="mt-4 text-[0.85rem] text-muted">{t("qrisDmNote")}</p>
      <p className="mt-2 text-[0.85rem] text-muted">{t("qrisBody")}</p>

      <div className="mt-4">
        <a href={THREADS_URL} target="_blank" rel="noreferrer" className={ghost}>
          {t("contactCta")}
        </a>
      </div>

      {/* transparency: supporter list + spending log, updated every Friday */}
      <div className="mt-8 rounded-xl border border-border bg-surface px-4 py-3 text-[0.85rem] text-muted">
        {t("transparencyNote")}
      </div>

      <h2>{t("donorsTitle")}</h2>
      <p>{t("donorsBody")}</p>
      <table className={`my-4 w-full border-collapse text-[0.92rem] ${cell}`}>
        <thead>
          <tr className="text-muted">
            <th>{t("colSocial")}</th>
          </tr>
        </thead>
        <tbody>
          {SUPPORTERS.map((d) => (
            <tr key={d.name}>
              <td>
                {d.socialUrl ? (
                  <a href={d.socialUrl} target="_blank" rel="noreferrer">
                    {d.name}
                  </a>
                ) : (
                  d.name
                )}
              </td>
            </tr>
          ))}
          {SUPPORTERS.length === 0 && (
            <tr>
              <td colSpan={1} className="text-muted">
                {t("donorsEmpty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
