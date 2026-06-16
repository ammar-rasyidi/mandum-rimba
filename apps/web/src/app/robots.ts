import type { MetadataRoute } from "next";

/**
 * Robots policy — Mandum Rimba is a fully public observatory, so everything is
 * crawlable. The sitemap reference is what crawlers read first to discover
 * pages fastest.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://mandumrimba.org";

  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
