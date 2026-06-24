import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import ThreadsEmbed from "@/components/ThreadsEmbed";

// Curated Threads posts on how Mandum Rimba began (order matters; share tokens
// stripped). Update these to feature different posts.
const THREADS_POSTS = [
  "https://www.threads.com/@r.rasyidi/post/DZcrtJYm5Z5",
  "https://www.threads.com/@r.rasyidi/post/DZexry8EgGa",
  "https://www.threads.com/@r.rasyidi/post/DZpvpajkvNt",
];

const btnBase =
  "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[0.95rem] font-medium transition-[transform,filter,background-color] hover:-translate-y-px hover:no-underline";
const btnPrimary = `${btnBase} bg-accent text-background hover:brightness-110`;
const btnGhost = `${btnBase} glass text-foreground hover:brightness-[1.04]`;

const card =
  "glass rounded-2xl px-6 py-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 [&_h3]:mb-1.5 [&_h3]:mt-0 [&_h3]:text-[1.05rem] [&_h3]:font-semibold [&_p]:mb-0 [&_p]:text-[0.95rem] [&_p]:leading-relaxed [&_p]:text-muted";
const cardsGrid =
  "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]";

export default function HomePage() {
  const t = useTranslations("home");
  const tSite = useTranslations("site");

  return (
    <>
      {/* Soft accent glow, gives the frosted-glass surfaces something to
          refract against on an otherwise plain background. Pure decoration. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[620px] overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent opacity-[0.12] blur-[120px]" />
        <div className="absolute -top-24 right-[8%] h-[320px] w-[320px] rounded-full bg-accent opacity-[0.08] blur-[110px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-[1080px] px-5">
        {/* ---- Campaign hero: artwork + caption + share CTA ---- */}
        <section className="flex flex-col items-center pt-16 text-center">
          {/* theme-aware artwork: dark variant on dark, light on light */}
          <img
            src="/images/hero_url_dark.svg"
            alt={tSite("name")}
            className="hidden h-auto w-full max-w-[440px] dark:block"
          />
          <img
            src="/images/hero_url_light.svg"
            alt={tSite("name")}
            className="block h-auto w-full max-w-[440px] dark:hidden"
          />
          <p className="mt-5 max-w-[34rem] text-[1.02rem] leading-relaxed text-muted">
            {t("campaignCaption")}
          </p>
          <div className="mt-7 grid w-full max-w-[660px] gap-3 sm:grid-cols-3">
            <Link
              href="/kampanye"
              className="group glass flex flex-col items-center gap-2 rounded-2xl border border-[var(--glass-border)] p-4 text-center transition-[transform,border-color] hover:-translate-y-0.5 hover:border-accent hover:no-underline"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-dim)] text-accent transition-transform group-hover:scale-105">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </span>
              <span className="text-[0.95rem] font-semibold leading-tight text-foreground">
                {t("campaignCta")}
              </span>
              <span className="text-[0.76rem] leading-snug text-muted">
                {t("campaignCtaSub")}
              </span>
            </Link>

            <Link
              href="/kartu"
              className="group glass flex flex-col items-center gap-2 rounded-2xl border border-[var(--glass-border)] p-4 text-center transition-[transform,border-color] hover:-translate-y-0.5 hover:border-accent hover:no-underline"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-dim)] text-accent transition-transform group-hover:scale-105">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="8.5" cy="11" r="2" />
                  <path d="M13 9.5h5M13 13h5M6 15.5h7" />
                </svg>
              </span>
              <span className="text-[0.95rem] font-semibold leading-tight text-foreground">
                {t("ktpCta")}
              </span>
              <span className="text-[0.76rem] leading-snug text-muted">
                {t("ktpCtaSub")}
              </span>
            </Link>

            <Link
              href="/dukung"
              className="group glass flex flex-col items-center gap-2 rounded-2xl border border-[var(--glass-border)] p-4 text-center transition-[transform,border-color] hover:-translate-y-0.5 hover:border-accent hover:no-underline"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-dim)] text-accent transition-transform group-hover:scale-105">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 22V11" />
                  <path d="M12 12C12 8 9 4 4 4c0 5 3 8 8 8Z" />
                  <path d="M12 14c0-3 3-6 8-6 0 4-3 6-8 6Z" />
                </svg>
              </span>
              <span className="text-[0.95rem] font-semibold leading-tight text-foreground">
                {t("supportCta")}
              </span>
              <span className="text-[0.76rem] leading-snug text-muted">
                {t("supportCtaSub")}
              </span>
            </Link>
          </div>
        </section>

        {/* ---- Hero ---- */}
        <section className="flex flex-col items-center pb-12 pt-16 text-center">
          {/* <span className="mb-5 inline-block max-w-full rounded-full border border-border bg-surface px-3.5 py-1.5 text-[0.8rem] text-muted">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
            {tSite("tagline")}
          </span> */}
          <h1 className="mb-4 mt-0 max-w-[18ch] text-[2.6rem] font-bold leading-[1.1] tracking-tight">
            {t("heroTitle")}
          </h1>
          <p className="max-w-[44rem] text-[1.12rem] leading-relaxed text-muted">
            {t("heroBody")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link className={btnPrimary} href="/peta">
              {t("openMap")}
            </Link>
            <Link className={btnGhost} href="/metodologi">
              {t("readMethodology")}
            </Link>
          </div>
        </section>

        {/* ---- About the name ---- */}
        <section className="glass my-12 rounded-3xl px-8 py-9 [&_p]:max-w-[44rem] [&_p]:text-muted">
          <h2 className="mt-0 text-[1.5rem] font-bold tracking-tight">
            {t("aboutTitle")}
          </h2>
          <div className="mb-7 mt-6 flex flex-wrap items-stretch gap-3">
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 rounded-2xl border border-border bg-background px-5 py-4">
              <span className="text-[1.2rem] font-bold text-accent">
                Mandum
              </span>
              <span className="text-[0.88rem] leading-snug text-muted">
                {t("nameMandum")}
              </span>
            </div>
            <span className="select-none self-center text-[1.4rem] font-light text-muted">
              +
            </span>
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 rounded-2xl border border-border bg-background px-5 py-4">
              <span className="text-[1.2rem] font-bold text-accent">Rimba</span>
              <span className="text-[0.88rem] leading-snug text-muted">
                {t("nameRimba")}
              </span>
            </div>
          </div>
          <p className="leading-relaxed">{t("nameMeaning")}</p>
          <p className="mt-3 leading-relaxed">{t("publicInterest")}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              t("badgeIndependent"),
              t("badgeNonprofit"),
              t("badgeOpenSource"),
              t("badgeEvidence"),
            ].map((b) => (
              <span
                key={b}
                className="rounded-full border border-border px-3 py-1 text-[0.78rem] text-muted"
              >
                {b}
              </span>
            ))}
          </div>
        </section>

        {/* ---- Why this matters ---- */}
        <section className="mt-14">
          <h2 className="text-[1.5rem] font-bold tracking-tight">
            {t("missionTitle")}
          </h2>
          <div className={`${cardsGrid} mt-6`}>
            <div className={card}>
              <h3>{t("mission1Title")}</h3>
              <p>{t("mission1Body")}</p>
            </div>
            <div className={card}>
              <h3>{t("mission2Title")}</h3>
              <p>{t("mission2Body")}</p>
            </div>
            <div className={card}>
              <h3>{t("mission3Title")}</h3>
              <p>{t("mission3Body")}</p>
            </div>
          </div>
        </section>

        {/* ---- Principles ---- */}
        <section className={`${cardsGrid} mt-4`}>
          <div className={card}>
            <h3>{t("principle1Title")}</h3>
            <p>{t("principle1Body")}</p>
          </div>
          <div className={card}>
            <h3>{t("principle2Title")}</h3>
            <p>{t("principle2Body")}</p>
          </div>
          <div className={card}>
            <h3>{t("principle3Title")}</h3>
            <p>{t("principle3Body")}</p>
          </div>
        </section>

        {/* ---- CTA ---- */}
        <section className="glass my-16 rounded-3xl px-8 py-11 text-center">
          <h2 className="mt-0 text-[1.5rem] font-bold tracking-tight">
            {t("ctaTitle")}
          </h2>
          <p className="mx-auto mb-7 mt-3 max-w-[34rem] leading-relaxed text-muted">
            {t("ctaBody")}
          </p>
          <Link className={btnPrimary} href="/peta">
            {t("openMap")}
          </Link>
        </section>

        {/* ---- How it began: curated Threads posts ---- */}
        <section className="mb-16 mt-4">
          <h2 className="text-[1.5rem] font-bold tracking-tight">
            {t("threadsTitle")}
          </h2>
          <p className="mt-3 max-w-[44rem] leading-relaxed text-muted">
            {t("threadsBody")}
          </p>
          <ThreadsEmbed urls={THREADS_POSTS} />
        </section>
      </main>
    </>
  );
}
