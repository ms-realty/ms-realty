import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * First path segments that can name a page: the public locales (src/domain/ids.ts) and the
 * workspace. Written out because next.config cannot import app modules; a unit test keeps the
 * list in step with publicLocales.
 */
export const pageFirstSegments = ["bg", "en", "ru", "de", "nl", "el", "he", "workspace"];

// The Content-Security-Policy needs a per-request nonce, so it is set in proxy.ts.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    // Also type-checks page/layout props. With it, next-env.d.ts imports the route types
    // from whichever NEXT_DIST_DIR is active, so tsconfig.json never has to be rewritten.
    strictRouteTypes: true,
    // One root layout per surface (app/[locale], app/workspace), so URLs that match no route
    // get app/global-not-found.tsx, a full localized document.
    globalNotFound: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    // Unknown paths under a known first segment match no route and get global-not-found.tsx.
    // A first segment that names no page would instead match /[locale], and a notFound()
    // thrown while rendering leaves the server HTML an empty error document, so it goes to
    // Next's reserved not-found route directly. afterFiles: public files and static routes
    // (robots.txt, /api/health) are matched first.
    const known = pageFirstSegments.join("|");
    return {
      beforeFiles: [],
      afterFiles: [
        { source: `/:first((?!(?:${known})(?:/|$))[^/]+)/:rest*`, destination: "/_not-found" },
      ],
      fallback: [],
    };
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
