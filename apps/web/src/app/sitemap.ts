import type { MetadataRoute } from "next";

/**
 * Sitemap, every page exists in both locales (id default, en), and both
 * locale URLs are always prefixed (localePrefix: "always"). Each entry carries
 * `alternates.languages` so crawlers get correct hreflang pairing between the
 * Indonesian and English versions. Dynamic region/story pages are omitted (no
 * static list); add them here once a public index endpoint exists.
 */

// internal route → localized path per locale (without the locale prefix)
const ROUTES: { paths: { id: string; en: string }; priority: number }[] = [
  { paths: { id: "", en: "" }, priority: 1.0 }, // home
  { paths: { id: "/peta", en: "/map" }, priority: 0.9 },
  { paths: { id: "/sumber-data", en: "/data-sources" }, priority: 0.8 },
  { paths: { id: "/metodologi", en: "/methodology" }, priority: 0.7 },
  { paths: { id: "/data", en: "/data" }, priority: 0.6 },
  { paths: { id: "/status", en: "/status" }, priority: 0.5 },
  { paths: { id: "/apresiasi", en: "/credits" }, priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://mandumrimba.org";
  const now = new Date();

  const url = (locale: "id" | "en", path: string) =>
    `${baseUrl}/${locale}${path}`;

  return ROUTES.flatMap(({ paths, priority }) => {
    const languages = {
      id: url("id", paths.id),
      en: url("en", paths.en),
    };
    return (["id", "en"] as const).map((locale) => ({
      url: url(locale, paths[locale]),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority,
      alternates: { languages },
    }));
  });
}
