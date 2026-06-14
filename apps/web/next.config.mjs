import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mandumrimba/shared"],
  images: {
    // serve modern, smaller formats from the built-in optimizer
    formats: ["image/avif", "image/webp"],
  },
};

export default withNextIntl(nextConfig);
