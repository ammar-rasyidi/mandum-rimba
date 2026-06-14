import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["id", "en"],
  defaultLocale: "id",
  pathnames: {
    "/": "/",
    "/peta": { id: "/peta", en: "/map" },
    "/wilayah/[slug]": { id: "/wilayah/[slug]", en: "/regions/[slug]" },
    "/cerita/[slug]": { id: "/cerita/[slug]", en: "/stories/[slug]" },
    "/metodologi": { id: "/metodologi", en: "/methodology" },
    "/data": "/data",
    "/sumber-data": { id: "/sumber-data", en: "/data-sources" },
    "/apresiasi": { id: "/apresiasi", en: "/credits" },
    "/status": "/status",
  },
});

export type AppPathname = keyof typeof routing.pathnames;
