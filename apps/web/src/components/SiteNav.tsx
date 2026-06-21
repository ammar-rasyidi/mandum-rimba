"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/** Static (param-free) routes usable as a plain Link href. */
type StaticPath =
  | "/peta"
  | "/metodologi"
  | "/sumber-data"
  | "/data"
  | "/status"
  | "/apresiasi"
  | "/dukung";

type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/* ── tiny inline icons (no icon dependency) ── */
const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M4 7h16M4 12h16M4 17h16"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M6 6l12 12M18 6L6 18"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);
const SunIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
    <path
      d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);
const MoonIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
);

const navLink =
  "rounded-lg px-3.5 py-2 text-[0.95rem] text-muted transition-colors hover:bg-[var(--accent-dim)] hover:text-foreground hover:no-underline";
const navLinkActive = "bg-[var(--accent-dim)] !text-accent";
// highlighted support link, stands out from the muted nav items
const navLinkHighlight =
  "rounded-lg bg-[var(--accent-dim)] px-3.5 py-2 text-[0.95rem] font-semibold text-accent transition-[filter] hover:brightness-110 hover:no-underline";
// bordered glass chip, matches the button language used across the app
const iconBtn =
  "glass flex items-center justify-center rounded-xl text-muted transition-[color,border-color,transform] hover:border-accent hover:text-foreground active:scale-90";

export default function SiteNav() {
  const t = useTranslations("nav");
  const tSite = useTranslations("site");
  const locale = useLocale();
  const pathname = usePathname();

  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(readTheme());
  }, []);

  // lock body scroll while the mobile sheet is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // close the sheet when resizing up to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768 && open) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    // cookie so the server renders the right theme on the next navigation;
    // localStorage as a belt-and-braces fallback for the pre-paint script
    document.cookie = `fw-theme=${next};path=/;max-age=31536000;samesite=lax`;
    try {
      localStorage.setItem("fw-theme", next);
    } catch {
      /* private mode: theme just won't persist */
    }
    setTheme(next);
  };

  const links: { href: StaticPath; label: string }[] = [
    { href: "/peta", label: t("map") },
    { href: "/metodologi", label: t("methodology") },
    { href: "/sumber-data", label: t("sources") },
    { href: "/data", label: t("data") },
    { href: "/status", label: t("status") },
    { href: "/apresiasi", label: t("credits") },
  ];

  const Logo = ({ h }: { h: number }) => (
    <Link
      href="/"
      onClick={() => setOpen(false)}
      className="flex shrink-0 items-center hover:no-underline"
      aria-label={tSite("name")}
    >
      <img
        src="/images/mandum_rimba_dark.svg"
        alt={tSite("name")}
        className="hidden w-auto dark:block"
        style={{ height: h }}
      />
      <img
        src="/images/mandum_rimba_light.svg"
        alt={tSite("name")}
        className="block w-auto dark:hidden"
        style={{ height: h }}
      />
    </Link>
  );

  const ThemeBtn = ({ className = "h-9 w-9" }: { className?: string }) => (
    <button
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className={`${iconBtn} ${className}`}
    >
      {mounted && theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );

  const LocaleSwitch = ({ large = false }: { large?: boolean }) => (
    <span
      className={`flex items-center gap-1.5 ${large ? "text-base" : "text-[0.9rem]"}`}
    >
      {(["id", "en"] as const).map((l, i) => (
        <span key={l} className="flex items-center gap-1.5">
          {i === 1 && <span className="text-border">/</span>}
          <Link
            href="/"
            locale={l}
            onClick={() => setOpen(false)}
            aria-current={locale === l}
            className={`rounded-md px-1.5 py-0.5 uppercase transition-colors hover:no-underline ${
              locale === l
                ? "font-semibold text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {l}
          </Link>
        </span>
      ))}
    </span>
  );

  return (
    <>
      {/* ── Desktop island ── */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 hidden justify-center pt-4 md:flex">
        <nav
          aria-label={tSite("name")}
          className="glass pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-2xl px-4 py-2.5"
        >
          <Logo h={28} />
          <span className="mx-2 h-5 w-px bg-border" />
          <div className="flex items-center gap-0.5">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`${navLink} ${pathname === href ? navLinkActive : ""}`}
              >
                {label}
              </Link>
            ))}
            <Link href="/dukung" className={navLinkHighlight}>
              {t("support")}
            </Link>
          </div>
          <span className="mx-2 h-5 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <LocaleSwitch />
            <ThemeBtn />
          </div>
        </nav>
      </div>

      {/* ── Mobile: two pills ── */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between px-4 pt-4 md:hidden">
        <div className="glass pointer-events-auto flex items-center rounded-2xl px-4 py-2.5">
          <Logo h={26} />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <ThemeBtn className="h-11 w-11" />
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className={`${iconBtn} h-11 w-11`}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* ── Mobile full-screen sheet ── */}
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[var(--overlay)] backdrop-blur-xl animate-[panel-in_0.2s_ease] md:hidden">
          <div className="h-20 shrink-0" onClick={() => setOpen(false)} />
          <div className="flex flex-1 flex-col px-6 pb-12 pt-4">
            <div className="flex flex-col">
              {links.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between border-b border-border py-4 text-2xl font-semibold transition-colors hover:text-accent hover:no-underline ${
                    pathname === href ? "text-accent" : "text-foreground"
                  }`}
                >
                  {label}
                  <span className="text-muted">→</span>
                </Link>
              ))}
              <Link
                href="/dukung"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between border-b border-border py-4 text-2xl font-semibold text-accent transition-colors hover:no-underline"
              >
                {t("support")}
                <span>→</span>
              </Link>
            </div>
            <div className="mt-8 flex items-center justify-between">
              <LocaleSwitch large />
              <ThemeBtn className="h-11 w-11" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
