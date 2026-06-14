import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const btn =
  "inline-block rounded-full border border-border bg-surface px-[1.2rem] py-[0.6rem] text-foreground transition-[transform,filter,border-color] hover:-translate-y-px hover:brightness-110 hover:no-underline";
const btnPrimary = `${btn} border-accent bg-accent-dim`;
const card =
  "rounded-2xl border border-border bg-surface px-5 py-[1.1rem] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow)] [&_h3]:mt-0 [&_p]:mb-0 [&_p]:text-muted";
const cardsGrid =
  "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]";

export default function HomePage() {
  const t = useTranslations("home");
  const tSite = useTranslations("site");

  return (
    <>
      {/* homepage background photo — fades down into the page (mask) and toward
          the page colour on the left (scrim) so the hero text stays legible.
          color-mix gives the scrim real alpha over the theme variable; dimmer
          in light mode, bolder in dark. If the image is missing, only the
          background colour shows. */}
      {/* <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[720px] overflow-hidden"
      >
        <Image
          src="/images/dimitry-b-tRGqh8cHanA-unsplash.jpg"
          alt=""
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,color-mix(in_srgb,var(--bg)_55%,transparent)_0%,color-mix(in_srgb,var(--bg)_18%,transparent)_58%,transparent_100%)]" />
      </div> 
      */
      }

      <main className="relative z-10 mx-auto max-w-[1080px] px-5">
        <section className="pb-10 pt-16 [&_h1]:[text-shadow:0_2px_18px_var(--bg),0_1px_3px_var(--bg)] [&_p]:[text-shadow:0_1px_10px_var(--bg),0_1px_2px_var(--bg)]">
        <h1 className="mb-3 mt-0 text-[2.4rem]">{t("heroTitle")}</h1>
        <p className="max-w-[42rem] text-[1.1rem] text-muted">
          {tSite("description")}
        </p>
        <p className="max-w-[42rem] text-[1.1rem] text-muted">
          {t("heroBody")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className={btnPrimary} href="/peta">
            {t("openMap")}
          </Link>
          <Link className={btn} href="/metodologi">
            {t("readMethodology")}
          </Link>
        </div>
      </section>

      <section className="my-10 rounded-[20px] border border-border bg-surface px-[2.2rem] py-8 [&_p]:max-w-[44rem] [&_p]:text-muted">
        <h2 className="mt-0">{t("aboutTitle")}</h2>
        <div className="mb-6 mt-5 flex flex-wrap items-stretch gap-4">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1 rounded-xl border border-l-[3px] border-border border-l-accent bg-background px-[1.1rem] py-[0.85rem]">
            <span className="text-[1.25rem] font-bold text-accent">Mandum</span>
            <span className="text-[0.9rem] leading-[1.45] text-muted">
              {t("nameMandum")}
            </span>
          </div>
          <span className="self-center text-[1.3rem] font-light text-muted">
            +
          </span>
          <div className="flex min-w-[220px] flex-1 flex-col gap-1 rounded-xl border border-l-[3px] border-border border-l-accent bg-background px-[1.1rem] py-[0.85rem]">
            <span className="text-[1.25rem] font-bold text-accent">Rimba</span>
            <span className="text-[0.9rem] leading-[1.45] text-muted">
              {t("nameRimba")}
            </span>
          </div>
        </div>
        <p>{t("nameMeaning")}</p>
        <p>{t("publicInterest")}</p>
        <div className="mt-[1.4rem] flex flex-wrap gap-2">
          {[
            t("badgeIndependent"),
            t("badgeNonprofit"),
            t("badgeOpenSource"),
            t("badgeEvidence"),
          ].map((b) => (
            <span
              key={b}
              className="rounded-full border border-border bg-background px-[0.8rem] py-[0.3rem] text-[0.8rem] text-muted"
            >
              {b}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2>{t("missionTitle")}</h2>
        <div className={`${cardsGrid} mb-16 mt-8`}>
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

      <section className={`${cardsGrid} mb-16 mt-8`}>
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

      <section className="mb-16 rounded-[20px] border border-border bg-surface px-8 py-9 text-center">
        <h2 className="mt-0">{t("ctaTitle")}</h2>
        <p className="mx-auto mb-[1.4rem] mt-2 max-w-[34rem] text-muted">
          {t("ctaBody")}
        </p>
        <Link className={btnPrimary} href="/peta">
          {t("openMap")}
        </Link>
      </section>
      </main>
    </>
  );
}
