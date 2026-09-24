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

// Locale negotiation SUGGESTS and never forces (F01, A02). Only the bare `/` is sent to a
// negotiated locale: the visitor's explicit earlier choice, else Accept-Language, else bg.
// A URL that names a locale, and any other path, is served as requested; the page itself
// offers a dismissible suggestion when the browser prefers another routable language.
function negotiatedLocale(request: NextRequest): string {
  const locales = routableLocales();
  const chosen = request.cookies.get(localeCookie)?.value;
  if (chosen && (locales as string[]).includes(chosen)) return chosen;
  return negotiateLocale(request.headers.get("accept-language"), locales) ?? defaultLocale;
}

/** The locale this request renders in: URL segment, staff preference, or negotiated. */
function renderLocale(request: NextRequest): string {
  const first = request.nextUrl.pathname.split("/")[1] ?? "";
  if (isRoutableLocale(first)) return first;
  if (first === "workspace") {
    const staff = request.cookies.get(staffLocaleCookie)?.value;
    return staff && isStaffLocale(staff) ? staff : defaultStaffLocale;
  }
  return negotiatedLocale(request);
}

/**
 * A same-site document navigation from one locale to another (language switcher, the
 * suggestion banner, a "read in English" link) is an explicit choice. Deep links from
 * elsewhere never are. The cookie only ever affects the requesting browser.
 */
function explicitLocaleChoice(request: NextRequest): string | null {
  const target = request.nextUrl.pathname.split("/")[1] ?? "";
  if (!isRoutableLocale(target)) return null;
  if (request.headers.get("sec-fetch-site") !== "same-origin") return null;
  if (request.headers.get("sec-fetch-dest") !== "document") return null;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  // Sec-Fetch-Site already vouches for the origin; `nextUrl.origin` is not the public
  // origin behind a proxy, so it is not compared here.
  try {
    const source = new URL(referer).pathname.split("/")[1] ?? "";
    return isRoutableLocale(source) && source !== target ? target : null;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = `/${negotiatedLocale(request)}`;
    // Query parameters (utm_*, gclid, …) pass through untouched.
    const response = NextResponse.redirect(url, 307);
    response.headers.set("Vary", "Accept-Language, Cookie");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const chosen = explicitLocaleChoice(request);
  // Visible to this render too, so the page does not suggest the language just left.
  if (chosen) request.cookies.set(localeCookie, chosen);

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set(appLocaleHeader, renderLocale(request));
  const first = request.nextUrl.pathname.split("/")[1] ?? "";
  requestHeaders.set(appSurfaceHeader, first === "workspace" ? "workspace" : "public");

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (chosen) {
    response.cookies.set(localeCookie, chosen, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
    });
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|brand/|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
