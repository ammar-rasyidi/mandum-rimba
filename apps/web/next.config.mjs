import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mandumrimba/shared"],
  images: {
    // serve modern, smaller formats from the built-in optimizer
    formats: ["image/avif", "image/webp"],
  },
  async rewrites() {
    // Same-origin proxy for the R2 bucket (pmtiles + species atlas):
    // browsers fetch /tiles/* and /species/* from OUR domain and the
    // server pulls from R2 — ISP DNS filters that block *.r2.dev never
    // see the bucket host. Leave NEXT_PUBLIC_TILES_BASE_URL unset so
    // consumers use relative URLs.
    const r2 =
      process.env.TILES_ORIGIN ??
      "https://pub-e71bae449b864ca78974083cc5663453.r2.dev";
    return [
      { source: "/tiles/:path*", destination: `${r2}/tiles/:path*` },
      { source: "/species/:path*", destination: `${r2}/species/:path*` },
    ];
  },
};

export default withNextIntl(nextConfig);
