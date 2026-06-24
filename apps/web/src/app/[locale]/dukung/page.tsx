import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SUPPORTERS } from "@/lib/credits";

// The donation link is config, not hard-coded. Until a platform is set up, the
// link lives on the maintainer's Threads (NEXT_PUBLIC_DONATE_URL to override).
const THREADS_URL = "https://www.threads.com/@r.rasyidi";
const DONATE_URL = process.env.NEXT_PUBLIC_DONATE_URL?.trim();

// The Rimba Universe white papers (Google Drive folder).
const WHITEPAPER_URL =
  "https://drive.google.com/drive/folders/1vQcc_IZNPxwFTb4ZIApFsTUoL0-XpfmX?usp=drive_link";

// Personal payment QRs (under the developer's own name) for support toward
// building the game. Images live in public/images/.
const QRIS_NAME = "Ammar Rizal Rasyidi";
const PAYMENTS = [
  { id: "qris", label: "QRIS", img: "/images/qris_ammar.png", w: 1240, h: 1748 },
];

// PayPal.me link for supporters outside Indonesia (QRIS is Indonesia-only).
// Set to your link, e.g. "https://paypal.me/ammarrasyidi". Empty = button hidden.
const PAYPAL_URL: string = "https://paypal.me/rrasyidi";

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

  const donateUrl = DONATE_URL || THREADS_URL;
  const viaThreads = !DONATE_URL;

  const primary =
    "inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 font-medium text-background no-underline transition hover:brightness-110 hover:no-underline";
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
      <div className="mt-5 flex flex-wrap gap-3">
        <a href={donateUrl} target="_blank" rel="noreferrer" className={primary}>
          {viaThreads ? t("donateViaThreads") : t("donate")}
        </a>
        {!viaThreads && (
          <a
            href={THREADS_URL}
            target="_blank"
            rel="noreferrer"
            className={ghost}
          >
            {t("contactCta")}
          </a>
        )}
      </div>

      {/* QRIS / GoPay, revealed on tap (native <details>, no JS) */}
      <div className="mt-5 text-[0.85rem] font-medium text-muted">
        {t("qrisTitle")}
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {PAYMENTS.map((p, i) => (
          <details
            key={p.id}
            open={i === 0}
            className="group glass overflow-hidden rounded-xl"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-medium text-foreground [&::-webkit-details-marker]:hidden">
              <span>{p.label}</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                className="text-muted transition-transform group-open:rotate-180"
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <div className="flex flex-col items-center gap-3 px-4 pb-5 pt-1">
              <div className="w-full max-w-[280px] overflow-hidden rounded-2xl bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.img}
                  alt={`${p.label} ${QRIS_NAME}`}
                  width={p.w}
                  height={p.h}
                  className="block h-auto w-full"
                />
              </div>
              <div className="w-full rounded-xl border border-border bg-[var(--accent-dim)] px-4 py-3 text-[0.85rem] text-foreground">
                {t("qrisDmNote")}
              </div>
            </div>
          </details>
        ))}
      </div>
      <p className="mt-3 text-[0.85rem] text-muted">{t("qrisBody")}</p>
      <p className="mt-1 text-[0.8rem] text-muted">{QRIS_NAME}</p>

      {/* PayPal, for supporters outside Indonesia */}
      {PAYPAL_URL && (
        <div className="mt-4">
          <a
            href={PAYPAL_URL}
            target="_blank"
            rel="noreferrer"
            className={ghost}
          >
            {t("paypalCta")}
          </a>
        </div>
      )}

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
