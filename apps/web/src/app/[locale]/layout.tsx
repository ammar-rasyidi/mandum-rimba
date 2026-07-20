import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import { routing } from "@/i18n/routing";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import DisclaimerGate from "@/components/DisclaimerGate";
import "../globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

// No trailing slash. Used for canonical/OG URLs and JSON-LD ids.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mandumrimba.org";
// GA only injects when configured, so local/dev builds never report into prod.
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "site" });
  const name = t("name");
  const description = t("description");

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${name}, ${t("tagline")}`, template: `%s, ${name}` },
    description,
    applicationName: name,
    icons: {
      // SVG first (scalable, theme-crisp); PNG as the broad fallback. These
      // live at the public root, so the browser's default /favicon request and
      // the declared links both resolve.
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon.png", type: "image/png" },
      ],
      shortcut: "/favicon.png",
      apple: "/favicon.png",
    },
    keywords: [
      "deforestasi",
      "deforestation",
      "Indonesia",
      "hutan",
      "rainforest",
      "kelapa sawit",
      "palm oil",
      "tambang",
      "mining",
      "satwa terancam",
      "wildlife",
      "orangutan",
      "peta",
      "Global Forest Watch",
      "Mandum Rimba",
    ],
    authors: [{ name }],
    creator: name,
    publisher: name,
    alternates: {
      languages: {
        "id-ID": `${SITE_URL}/id`,
        "en-US": `${SITE_URL}/en`,
        "x-default": `${SITE_URL}/id`,
      },
    },
    openGraph: {
      type: "website",
      siteName: name,
      title: `${name}, ${t("tagline")}`,
      description,
      url: `${SITE_URL}/${locale}`,
      locale: locale === "en" ? "en_US" : "id_ID",
      alternateLocale: locale === "en" ? "id_ID" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: `${name}, ${t("tagline")}`,
      description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
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
  const t = await getTranslations({ locale, namespace: "site" });

  // Theme is persisted in a cookie so it survives every navigation, including
  // a locale switch, which re-renders the document from the server. Rendering
  // data-theme here (not just client-side) means the server always emits the
  // chosen theme, so it never flips or flashes. First visit (no cookie) renders
  // "dark"; the pre-paint script below refines it to the OS preference and
  // seeds the cookie, so the next render is already correct.
  const theme =
    cookies().get("fw-theme")?.value === "light" ? "light" : "dark";

  // Structured data, Organization + WebSite so Google can identify the brand
  // and make the site eligible for rich results / sitelinks.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: t("name"),
        url: SITE_URL,
        logo: `${SITE_URL}/images/mandum_rimba_light.png`,
        description: t("description"),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: t("name"),
        description: t("description"),
        inLanguage: ["id", "en"],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <html lang={locale} data-theme={theme} suppressHydrationWarning>
      <head>
        {/* Swallow unhandled errors that originate in browser extensions (e.g.
            MetaMask's "Failed to connect to MetaMask" from its injected
            inpage.js) so Next's dev error overlay doesn't surface them. Runs in
            the head, before Next's runtime registers its own handlers, and
            matches ONLY extension/MetaMask sources — our own errors pass through. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function ext(x){try{return /metamask|chrome-extension:\\/\\//i.test((x&&(x.stack||x.message||x))+"")}catch(e){return false}}window.addEventListener("unhandledrejection",function(e){if(ext(e.reason)){e.preventDefault();e.stopImmediatePropagation()}},true);window.addEventListener("error",function(e){if(ext(e.error)||(e.filename&&e.filename.indexOf("chrome-extension://")===0)){e.stopImmediatePropagation()}},true)})();`,
          }}
        />
        {/* Pre-paint: prefer the cookie, else a stored choice, else the OS
            preference on first visit, and seed the cookie so the server gets
            it right on the next render. Avoids any flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var c=document.cookie.match(/(?:^|; )fw-theme=(light|dark)/);var t=c?c[1]:(localStorage.getItem("fw-theme")||(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"));document.documentElement.dataset.theme=t;if(!c){document.cookie="fw-theme="+t+";path=/;max-age=31536000;samesite=lax"}}catch(e){}`,
          }}
        />
        {/* JSON-LD via raw <script> so embedded URLs survive serialisation */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <SiteNav />
          <div className="pt-20">{children}</div>
          <SiteFooter locale={locale} />
          {/* first-visit UU ITE disclaimer, acknowledged once */}
          <DisclaimerGate />
        </NextIntlClientProvider>
        {/* GA only when configured, so dev builds never report into prod */}
        {GA_ID && <GoogleAnalytics gaId={GA_ID} />}
        {/* Vercel Web Analytics, privacy-friendly, no cookies, inert off-Vercel */}
        <Analytics />
      </body>
    </html>
  );
}
