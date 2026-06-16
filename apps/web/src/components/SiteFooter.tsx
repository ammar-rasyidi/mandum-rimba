import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Static (param-free) routes — the only ones usable as a plain Link href. */
type StaticPath =
  | "/tentang"
  | "/peta"
  | "/metodologi"
  | "/data"
  | "/sumber-data"
  | "/status"
  | "/apresiasi";

const REPO_URL = "https://github.com";

const colTitle =
  "mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted";
const footLink =
  "text-[0.9rem] text-muted transition-colors hover:text-foreground hover:no-underline";

export default async function SiteFooter({ locale }: { locale: string }) {
  const [t, tNav, tSite] = await Promise.all([
    getTranslations({ locale, namespace: "footer" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "site" }),
  ]);

  const explore: { href: StaticPath; label: string }[] = [
    { href: "/tentang", label: tNav("about") },
    { href: "/peta", label: tNav("map") },
    { href: "/metodologi", label: tNav("methodology") },
    { href: "/data", label: tNav("data") },
  ];
  const transparency: { href: StaticPath; label: string }[] = [
    { href: "/sumber-data", label: tNav("sources") },
    { href: "/status", label: tNav("status") },
    { href: "/apresiasi", label: tNav("credits") },
  ];

  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 border-t border-border">
      <div className="mx-auto max-w-[1080px] px-5 py-12">
        <div className="grid gap-10 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] md:[grid-template-columns:1.6fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="max-w-[22rem]">
            <Link
              href="/"
              className="inline-flex hover:no-underline"
              aria-label={tSite("name")}
            >
              <img
                src="/images/mandum_rimba_dark.svg"
                alt={tSite("name")}
                className="hidden h-10 w-auto dark:block"
              />
              <img
                src="/images/mandum_rimba_light.svg"
                alt={tSite("name")}
                className="block h-10 w-auto dark:hidden"
              />
            </Link>
            <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">
              {tSite("tagline")}
            </p>
          </div>

          {/* Explore */}
          <nav aria-label={t("exploreTitle")}>
            <h3 className={colTitle}>{t("exploreTitle")}</h3>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {explore.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={footLink}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Transparency */}
          <nav aria-label={t("transparencyTitle")}>
            <h3 className={colTitle}>{t("transparencyTitle")}</h3>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {transparency.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={footLink}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Project */}
          <nav aria-label={t("projectTitle")}>
            <h3 className={colTitle}>{t("projectTitle")}</h3>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              <li>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={footLink}
                >
                  {t("sourceCode")}
                </a>
              </li>
              <li>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={footLink}
                >
                  {t("contribute")}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-[0.82rem] text-muted md:flex-row md:items-center md:justify-between">
          <p className="m-0">
            © {year} {tSite("name")}. {t("rights")}
          </p>
          <p className="m-0 max-w-[42rem] md:text-right">{t("disclaimer")}</p>
        </div>
      </div>
    </footer>
  );
}
