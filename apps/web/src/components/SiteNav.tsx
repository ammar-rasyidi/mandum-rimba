import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import ThemeToggle from "./ThemeToggle";

const navLink =
  "text-muted text-[0.92rem] px-[0.45rem] py-1 rounded-full transition-colors hover:text-foreground hover:bg-[var(--glass-highlight)] hover:no-underline";

export default function SiteNav() {
  const t = useTranslations("nav");
  const tSite = useTranslations("site");
  const locale = useLocale();

  return (
    <nav className="glass scrollbar-hide fixed left-1/2 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-[1.1rem] overflow-x-auto whitespace-nowrap rounded-full px-[1.35rem] py-[0.55rem] max-[720px]:gap-[0.7rem] max-[720px]:px-[0.9rem] max-[720px]:py-[0.45rem]">
      <Link href="/" className="mr-1 text-base font-bold text-accent">
        {tSite("name")}
      </Link>
      <Link href="/peta" className={navLink}>
        {t("map")}
      </Link>
      <Link href="/metodologi" className={navLink}>
        {t("methodology")}
      </Link>
      <Link href="/sumber-data" className={navLink}>
        {t("sources")}
      </Link>
      <Link href="/data" className={navLink}>
        {t("data")}
      </Link>
      <Link href="/status" className={navLink}>
        {t("status")}
      </Link>
      <Link href="/apresiasi" className={navLink}>
        {t("credits")}
      </Link>
      <span className="ml-auto flex items-center gap-2 text-[0.85rem]">
        <Link
          href="/"
          locale="id"
          aria-current={locale === "id"}
          className={navLink}
        >
          ID
        </Link>
        <span className="text-muted">/</span>
        <Link
          href="/"
          locale="en"
          aria-current={locale === "en"}
          className={navLink}
        >
          EN
        </Link>
        <ThemeToggle />
      </span>
    </nav>
  );
}
