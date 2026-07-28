import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // `s/` (share pages) are excluded so their route handler serves the raw
  // OG-meta HTML without a locale redirect
  matcher: ["/", "/(id|en)/:path*", "/((?!_next|_vercel|api|s/|.*\\..*).*)"],
};
