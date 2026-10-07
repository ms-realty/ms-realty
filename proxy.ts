import { type NextRequest, NextResponse } from "next/server";
import {
  appLocaleHeader,
  appSurfaceHeader,
  defaultLocale,
  defaultStaffLocale,
  isRoutableLocale,
  isStaffLocale,
  localeCookie,
  requestPathHeader,
  routableLocales,
  staffLocaleCookie,
} from "@/i18n/config";
import { explicitLocaleChoice } from "@/i18n/locale-choice";
import { negotiateLocale } from "@/i18n/negotiate";
import { requestHost, stagingEnabled } from "@/i18n/seo";
import { analyticsConsent, validGtmContainerId } from "@/i18n/tracking";
import {
  type HostContext,
  homePaths,
  hostContextFor,
  hostOrigins,
  isPublicWwwHost,
  servesApi,
} from "@/server/config/hosts";
import { originHeaders } from "@/server/config/origin";

// One app, three hosts (architecture §11.1): every page request is rewritten to the route tree
// of the host it was addressed to, app/{public,client,staff}/[locale]/…. The internal prefix is
// always added, never trusted from the URL, so `/staff/bg/today` on any host resolves to
// `/<context>/staff/bg/today` and 404s: a route of one host is unreachable from another.
//
// Do not bind the server to a loopback IP (`next start --hostname 127.0.0.1`): Next keeps a
// proxy rewrite internal, and a redirect relative to the browser's host, only when its URL has
// the server's own origin, and `nextUrl` renames every loopback host to `localhost`. Bind to
// `localhost`, a real interface or all interfaces.

// Nonce-based CSP as documented for Next 16: Next reads the nonce from the request's
// Content-Security-Policy header and applies it to its own scripts. Pages must render
// dynamically for this to work (the root layouts call `connection()`).
// `upgrade-insecure-requests` is left out on purpose: HSTS covers production, and the
// directive would break plain-http local and e2e servers.
function contentSecurityPolicy(
  nonce: string,
  analytics: boolean,
  legacyPreparation: boolean,
): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}${analytics ? " https://www.googletagmanager.com" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // React Aria and Next position elements with style attributes, which a nonce cannot cover.
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' blob: data:${legacyPreparation ? " https://makler-realty.com/wp-content/uploads/ https://makler-realty.ru/wp-content/uploads/" : ""}${analytics ? " https://www.google-analytics.com https://region1.google-analytics.com" : ""}`,
    "font-src 'self'",
    `connect-src 'self'${analytics ? " https://www.google-analytics.com https://region1.google-analytics.com" : ""}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Public and client routes start with a public locale; staff routes with bg/en/ru (§03.1). */
function isContextLocale(context: HostContext, value: string): boolean {
  return context === "staff" ? isStaffLocale(value) : isRoutableLocale(value);
}

function contextLocaleCookie(context: HostContext): string {
  return context === "staff" ? staffLocaleCookie : localeCookie;
}

// Locale negotiation SUGGESTS and never forces (F01, AT01). Only a URL without a locale is
// sent to one: the visitor's explicit earlier choice, else Accept-Language, else the default.
// A URL that names a locale is served as requested; public pages offer a dismissible
// suggestion when the browser prefers another routable language.
function entryLocale(request: NextRequest, context: HostContext): string {
  const chosen = request.cookies.get(contextLocaleCookie(context))?.value;
  if (chosen && isContextLocale(context, chosen)) return chosen;
  if (context === "staff") return defaultStaffLocale;
  return (
    negotiateLocale(request.headers.get("accept-language"), routableLocales()) ?? defaultLocale
  );
}

/**
 * A same-site document navigation from one locale to another (language switcher, the
 * suggestion banner, a "read in English" link) is an explicit choice. Deep links from
 * elsewhere never are. The cookie is host-only, so each host remembers its own choice.
 */
function localeRedirect(request: NextRequest, pathname: string, origin: string): NextResponse {
  const url = new URL(pathname, origin);
  url.search = request.nextUrl.search;
  // Query parameters (utm_*, gclid, …) pass through untouched.
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Vary", "Accept-Language, Cookie");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function route(request: NextRequest) {
  const origins = hostOrigins();
  const trustedHeaders = originHeaders(request.headers, origins);
  if (!trustedHeaders)
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  const host = requestHost(trustedHeaders);
  const { pathname, search } = request.nextUrl;
  if (pathname === "/api/health")
    return NextResponse.next({ request: { headers: trustedHeaders } });

  // ponytail: www → apex is the only host redirect; the legacy URL decisions record none for
  // www. Legacy .com/.ru path decisions are applied by the migration stage, not here.
  if (isPublicWwwHost(host, origins)) {
    const canonical = new URL(origins.public);
    canonical.pathname = pathname;
    canonical.search = search;
    return NextResponse.redirect(canonical, 301);
  }
  const context = hostContextFor(host, origins);
  // Not one of the three configured hosts: nothing of any context is served there.
  if (!context) return new NextResponse(null, { status: 404 });

  if (pathname.startsWith("/maps/") || pathname.startsWith("/map-runtime/")) {
    const release = process.env.MAP_RELEASE_ID;
    const allowed =
      pathname.startsWith("/map-runtime/v6.11.2/") ||
      (release && /^[a-f0-9]{64}$/.test(release) && pathname.startsWith(`/maps/${release}/`));
    return context === "public" && allowed
      ? NextResponse.next({ request: { headers: trustedHeaders } })
      : new NextResponse(null, { status: 404 });
  }

  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/__nextjs") ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/fonts/") ||
    ["/favicon.ico", "/robots.txt", "/sitemap.xml", "/llms.txt"].includes(pathname)
  )
    return NextResponse.next({ request: { headers: trustedHeaders } });

  const segments = pathname.split("/");
  const first = segments[1] ?? "";
  if (first === "api") {
    const response = servesApi(context, pathname)
      ? NextResponse.next({ request: { headers: trustedHeaders } })
      : new NextResponse(null, { status: 404 });
    if (context === "public" && segments[2] === "public-shares") {
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
    }
    return response;
  }
  const hasLocale = isContextLocale(context, first);

  // `/` opens the negotiated locale; a private host's bare `/{locale}` opens its home.
  if (pathname === "/") {
    return localeRedirect(
      request,
      `/${entryLocale(request, context)}${homePaths[context]}`,
      origins[context],
    );
  }
  if (hasLocale && segments.length === 2 && homePaths[context]) {
    return localeRedirect(request, `/${first}${homePaths[context]}`, origins[context]);
  }

  const chosen = explicitLocaleChoice(request.headers, pathname, context);
  // Visible to this render too, so the page does not suggest the language just left.
  if (chosen) request.cookies.set(contextLocaleCookie(context), chosen);

  const privateShareRoute = context === "public" && hasLocale && segments[2] === "share";
  const nonce = btoa(crypto.randomUUID());
  const analytics =
    context === "public" &&
    !privateShareRoute &&
    Boolean(validGtmContainerId(process.env.GTM_CONTAINER_ID)) &&
    analyticsConsent(request.headers.get("cookie"));
  const localOrigins = Object.values(origins).every((value) => {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname.endsWith(".localhost");
  });
  const legacyPreparation =
    context === "public" &&
    !stagingEnabled() &&
    (process.env.NODE_ENV === "development" || localOrigins);
  const csp = contentSecurityPolicy(nonce, analytics, legacyPreparation);
  const requestHeaders = new Headers(trustedHeaders);
  requestHeaders.set("x-forwarded-host", host ?? "");
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set(appLocaleHeader, hasLocale ? first : entryLocale(request, context));
  requestHeaders.set(appSurfaceHeader, context);
  // Overwrite any caller-supplied value so the public layout can omit GTM on token routes.
  requestHeaders.set("x-msr-share-token-route", privateShareRoute ? "1" : "0");
  // The external path, for a signed-out layout guard to name a validated place to return to.
  // Overwritten here, never trusted from the caller.
  requestHeaders.set(requestPathHeader, `${pathname}${search}`);

  // A first segment that is not a locale of this host names no page. It goes straight to
  // Next's not-found route: under /<context>/[locale] a notFound() thrown by the layout would
  // leave the server HTML an empty error document.
  const url = request.nextUrl.clone();
  url.pathname = hasLocale ? `/${context}${pathname}` : "/_not-found";
  const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  // Mutable public truth and every private document must be re-read on the next request.
  response.headers.set("Cache-Control", "private, no-store");
  if (privateShareRoute) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  if (context !== "public") response.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (chosen) {
    response.cookies.set(contextLocaleCookie(context), chosen, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
    });
  }
  return response;
}

export const config = {
  // Every response authenticates origin transport and receives the staging crawl policy.
  matcher: ["/:path*"],
};

export function proxy(request: NextRequest) {
  let staging: boolean;
  try {
    staging = stagingEnabled();
  } catch {
    return new NextResponse(null, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  const response = route(request);
  if (staging) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}
