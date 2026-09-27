import { type NextRequest, NextResponse } from "next/server";
import {
  appLocaleHeader,
  appSurfaceHeader,
  defaultLocale,
  defaultStaffLocale,
  isRoutableLocale,
  isStaffLocale,
  localeCookie,
  routableLocales,
  staffLocaleCookie,
} from "@/i18n/config";
import { negotiateLocale } from "@/i18n/negotiate";
import { requestHost } from "@/i18n/seo";
import {
  type HostContext,
  homePaths,
  hostContextFor,
  hostOrigins,
  isPublicWwwHost,
} from "@/server/config/hosts";

// One app, three hosts (architecture §11.1): every page request is rewritten to the route tree
// of the host it was addressed to, app/{public,client,staff}/[locale]/…. The internal prefix is
// always added, never trusted from the URL, so `/staff/bg/today` on any host resolves to
// `/<context>/staff/bg/today` and 404s: a route of one host is unreachable from another.

// Nonce-based CSP as documented for Next 16: Next reads the nonce from the request's
// Content-Security-Policy header and applies it to its own scripts. Pages must render
// dynamically for this to work (the root layouts call `connection()`).
// `upgrade-insecure-requests` is left out on purpose: HSTS covers production, and the
// directive would break plain-http local and e2e servers.
function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // React Aria and Next position elements with style attributes, which a nonce cannot cover.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
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
  return negotiateLocale(request.headers.get("accept-language"), routableLocales()) ?? defaultLocale;
}

/**
 * A same-site document navigation from one locale to another (language switcher, the
 * suggestion banner, a "read in English" link) is an explicit choice. Deep links from
 * elsewhere never are. The cookie is host-only, so each host remembers its own choice.
 */
function explicitLocaleChoice(request: NextRequest, context: HostContext): string | null {
  const target = request.nextUrl.pathname.split("/")[1] ?? "";
  if (!isContextLocale(context, target)) return null;
  if (request.headers.get("sec-fetch-site") !== "same-origin") return null;
  if (request.headers.get("sec-fetch-dest") !== "document") return null;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  // Sec-Fetch-Site already vouches for the origin; `nextUrl.origin` is not the public
  // origin behind a proxy, so it is not compared here.
  try {
    const source = new URL(referer).pathname.split("/")[1] ?? "";
    return isContextLocale(context, source) && source !== target ? target : null;
  } catch {
    return null;
  }
}

function localeRedirect(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  // Query parameters (utm_*, gclid, …) pass through untouched.
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Vary", "Accept-Language, Cookie");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function proxy(request: NextRequest) {
  const origins = hostOrigins();
  const host = requestHost(request.headers);
  const { pathname, search } = request.nextUrl;

  // ponytail: www → apex is the only host redirect; the legacy URL decisions record none for
  // www. Legacy .com/.ru path decisions are applied by the migration stage, not here.
  if (isPublicWwwHost(host, origins)) {
    return NextResponse.redirect(new URL(`${pathname}${search}`, origins.public), 301);
  }
  const context = hostContextFor(host, origins);
  // Not one of the three configured hosts: nothing of any context is served there.
  if (!context) return new NextResponse(null, { status: 404 });

  const segments = pathname.split("/");
  const first = segments[1] ?? "";
  const hasLocale = isContextLocale(context, first);

  // `/` opens the negotiated locale; a private host's bare `/{locale}` opens its home.
  if (pathname === "/") {
    return localeRedirect(request, `/${entryLocale(request, context)}${homePaths[context]}`);
  }
  if (hasLocale && segments.length === 2 && homePaths[context]) {
    return localeRedirect(request, `/${first}${homePaths[context]}`);
  }

  const chosen = explicitLocaleChoice(request, context);
  // Visible to this render too, so the page does not suggest the language just left.
  if (chosen) request.cookies.set(contextLocaleCookie(context), chosen);

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set(appLocaleHeader, hasLocale ? first : entryLocale(request, context));
  requestHeaders.set(appSurfaceHeader, context);

  const url = request.nextUrl.clone();
  // A first segment that is not a locale of this host names no page. It goes straight to
  // Next's not-found route: under /<context>/[locale] a notFound() thrown by the layout would
  // leave the server HTML an empty error document.
  url.pathname = hasLocale ? `/${context}${pathname}` : "/_not-found";
  const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
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
  // Router prefetches pass through too: without the rewrite they would address no route.
  // Next's own assets and dev endpoints (`/_next/*`, `/__nextjs*`) are host-neutral.
  matcher: ["/((?!api|_next/|__nextjs|brand/|favicon.ico|robots.txt|sitemap.xml).*)"],
};
