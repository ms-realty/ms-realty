import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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
  // No typedRoutes: proxy.ts rewrites each host's URLs to app/{public,client,staff}, so the
  // generated route types would describe internal paths, not the hrefs pages link to.
  experimental: {
    // Also type-checks page/layout props. With it, next-env.d.ts imports the route types
    // from whichever NEXT_DIST_DIR is active, so tsconfig.json never has to be rewritten.
    strictRouteTypes: true,
    // One root layout per host (app/{public,client,staff}/[locale]), so URLs that match no
    // route get app/global-not-found.tsx, a full localized document.
    globalNotFound: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
