import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import SiteNav from "@/components/SiteNav";
import "../globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "site" });
  return {
    title: { default: t("name"), template: `%s — ${t("name")}` },
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!routing.locales.includes(locale as "id" | "en")) {
    notFound();
  }
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* set theme before paint to avoid a flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("fw-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}`,
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <SiteNav />
          <div className="pt-20">{children}</div>
          <footer className="border-t border-border px-5 pb-10 pt-6 text-[0.85rem] text-muted">
            <FooterContent locale={locale} />
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

async function FooterContent({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "footer" });
  return (
    <div className="mx-auto max-w-[1080px] px-5">
      <p>{t("disclaimer")}</p>
      <p>{t("license")}</p>
    </div>
  );
}
