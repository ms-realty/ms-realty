// Host routing and cross-host isolation (architecture §11.1, §8.1; ux-spec §03.1).
// The proxy docs call the matcher helper unstable_doesProxyMatch; 16.3 ships the middleware name.
import {
  getRedirectUrl,
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

const hosts = {
  public: "makler-realty.com",
  client: "my.makler-realty.com",
  staff: "app.makler-realty.com",
} as const;
type Context = keyof typeof hosts;
afterEach(() => {
  vi.stubEnv("STAGING", "false");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("GTM_CONTAINER_ID", "");
});

beforeAll(() => {
  // Read once on the proxy's first request.
  vi.stubEnv("PUBLIC_ORIGIN", `https://${hosts.public}`);
  vi.stubEnv("CLIENT_ORIGIN", `https://${hosts.client}`);
  vi.stubEnv("STAFF_ORIGIN", `https://${hosts.staff}`);
});

function run(host: string, path: string, headers: Record<string, string> = {}) {
  return proxy(new NextRequest(`https://${host}${path}`, { headers: { host, ...headers } }));
}

/** The internal route path a request was rewritten to. */
function target(host: string, path: string): string | null {
  const response = run(host, path);
  if (!isRewrite(response)) return null;
  return new URL(getRewrittenUrl(response) ?? "").pathname;
}

describe("host routing (§11.1)", () => {
  it("serves only the configured public map release and isolates private hosts", () => {
    const release = "a".repeat(64);
    vi.stubEnv("MAP_RELEASE_ID", release);
    for (const path of [
      `/maps/${release}/basemap.pmtiles`,
      "/map-runtime/v6.11.2/maplibre-gl-worker.mjs",
    ]) {
      expect(run(hosts.public, path).headers.get("x-middleware-next")).toBe("1");
      expect(run(hosts.client, path).status).toBe(404);
      expect(run(hosts.staff, path).status).toBe(404);
    }
    expect(run(hosts.public, `/maps/${"b".repeat(64)}/basemap.pmtiles`).status).toBe(404);
    vi.stubEnv("MAP_RELEASE_ID", "");
    expect(run(hosts.public, `/maps/${release}/basemap.pmtiles`).status).toBe(404);
  });
  it("rewrites each host's locale routes into its own route tree", () => {
    expect(target(hosts.public, "/bg")).toBe("/public/bg");
    expect(target(hosts.public, "/he/properties")).toBe("/public/he/properties");
    expect(target(hosts.client, "/he/access")).toBe("/client/he/access");
    expect(target(hosts.staff, "/ru/today")).toBe("/staff/ru/today");
  });

  it("gives staff routes the staff locales only", () => {
    expect(target(hosts.staff, "/en/today")).toBe("/staff/en/today");
    for (const locale of ["de", "nl", "el", "he"]) {
      expect(target(hosts.staff, `/${locale}/today`)).toBe("/_not-found");
    }
    expect(target(hosts.client, "/nl/access")).toBe("/client/nl/access");
  });

  it("never reaches another host's tree, including through internal paths", () => {
    const internal = ["/public/bg", "/client/bg/access", "/staff/bg/today", "/_not-found/x"];
    for (const context of Object.keys(hosts) as Context[]) {
      for (const path of internal) {
        expect(target(hosts[context], path), `${context} ${path}`).toBe("/_not-found");
      }
      // A route of another host keeps this host's prefix and matches nothing there.
      expect(target(hosts[context], "/bg/today")).toBe(`/${context}/bg/today`);
    }
  });

  it("opens the negotiated locale and each private host's home", () => {
    const home = (host: string, path: string, headers: Record<string, string> = {}) =>
      getRedirectUrl(run(host, path, headers));
    expect(home(hosts.public, "/", { "accept-language": "nl-BE,nl;q=0.9" })).toBe(
      `https://${hosts.public}/nl`,
    );
    expect(home(hosts.client, "/", { "accept-language": "he" })).toBe(
      `https://${hosts.client}/he/overview`,
    );
    expect(home(hosts.client, "/de")).toBe(`https://${hosts.client}/de/overview`);
    expect(home(hosts.staff, "/", { "accept-language": "de" })).toBe(
      `https://${hosts.staff}/bg/today`,
    );
    expect(home(hosts.staff, "/", { cookie: "staff_locale=ru" })).toBe(
      `https://${hosts.staff}/ru/today`,
    );
    expect(home(hosts.staff, "/en")).toBe(`https://${hosts.staff}/en/today`);
  });

  it("keeps query parameters on redirects and rewrites", () => {
    expect(getRedirectUrl(run(hosts.public, "/?utm_source=x&unknown=1"))).toMatch(
      /\/bg\?utm_source=x&unknown=1$/,
    );
    const response = run(hosts.public, "/bg?gclid=abc&x=%ZZ");
    expect(new URL(getRewrittenUrl(response) ?? "").search).toBe("?gclid=abc&x=%ZZ");
  });

  it("redirects www to the public apex permanently and ignores other hosts", () => {
    const www = run(`www.${hosts.public}`, "/en?a=1");
    expect(www.status).toBe(301);
    expect(getRedirectUrl(www)).toBe(`https://${hosts.public}/en?a=1`);
    expect(getRedirectUrl(run(`www.${hosts.public}`, "//foreign.example/collect?x=1"))).toBe(
      `https://${hosts.public}//foreign.example/collect?x=1`,
    );
    for (const host of ["makler-realty.ru", "evil.example", "127.0.0.1:3000"]) {
      expect(run(host, "/bg").status, host).toBe(404);
    }
  });

  it("serves each API family only on its own host", () => {
    expect(run(hosts.public, "/api/inquiries").headers.get("x-middleware-next")).toBe("1");
    expect(run(hosts.client, "/api/inquiries").status).toBe(404);
    expect(run(hosts.staff, "/api/inquiries/abc").status).toBe(404);
    expect(run(hosts.public, "/api/unknown").status).toBe(404);
  });

  it("AT41 rejects forwarded-host substitution into a private API", () => {
    expect(
      run(hosts.public, "/api/ops/readiness", {
        "x-forwarded-host": hosts.staff,
      }).status,
    ).toBe(404);
    expect(
      run("untrusted.example", "/bg", {
        "x-forwarded-host": hosts.public,
      }).status,
    ).toBe(404);
  });

  it("sets the host context and a nonce CSP on rendered requests", () => {
    const response = run(hosts.staff, "/bg/today");
    expect(response.headers.get("content-security-policy")).toMatch(/'nonce-[^']+'/);
    expect(response.headers.get("x-middleware-request-x-app-surface")).toBe("staff");
    expect(response.headers.get("x-middleware-request-x-app-locale")).toBe("bg");
  });

  it("checks origin transport on every route including health", () => {
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
    expect(matches("/bg")).toBe(true);
    expect(matches("/api/inquiries")).toBe(true);
    expect(matches("/api/healthz")).toBe(true);
    expect(matches("/api/health")).toBe(true);
    expect(matches("/_next/static/chunk.js")).toBe(true);
    expect(matches("/brand/favicon.svg")).toBe(true);
    expect(matches("/robots.txt")).toBe(true);
  });
});

describe("staging and direct-origin boundary", () => {
  it("allows exact public upload paths for local preparation while staging requires its isolated media", () => {
    vi.stubEnv("NODE_ENV", "development");
    const policy = () => run(hosts.public, "/bg").headers.get("content-security-policy") ?? "";
    expect(policy()).toContain(
      "https://makler-realty.com/wp-content/uploads/ https://makler-realty.ru/wp-content/uploads/",
    );
    vi.stubEnv("STAGING", "true");
    expect(policy()).not.toContain("/wp-content/uploads/");
  });
  it("permits Google origins only with valid configuration and explicit public analytics consent", () => {
    vi.stubEnv("GTM_CONTAINER_ID", "GTM-TEST1");
    const policy = (host: string, cookie: string) =>
      run(host, "/bg", { cookie }).headers.get("content-security-policy") ?? "";
    for (const cookie of [
      "",
      "msr_analytics_consent=v1.denied",
      "msr_analytics_consent=v1.granted; msr_analytics_consent=v1.denied",
    ])
      expect(policy(hosts.public, cookie)).not.toContain("https://www.googletagmanager.com");
    const allowed = policy(hosts.public, "msr_analytics_consent=v1.granted");
    expect(allowed).toContain("https://www.googletagmanager.com");
    expect(allowed).toContain(
      "https://www.google-analytics.com https://region1.google-analytics.com",
    );
    expect(policy(hosts.staff, "msr_analytics_consent=v1.granted")).not.toContain("google");
    vi.stubEnv("GTM_CONTAINER_ID", "GTM-invalid/script");
    expect(policy(hosts.public, "msr_analytics_consent=v1.granted")).not.toContain("google");
  });
  it("marks redirects, rewrites, static/crawl/API and denied responses noindex", () => {
    vi.stubEnv("STAGING", "true");
    for (const [host, path] of [
      [hosts.public, "/bg"],
      [hosts.public, "/"],
      [hosts.public, "/robots.txt"],
      [hosts.public, "/sitemap.xml"],
      [hosts.public, "/llms.txt"],
      [hosts.public, "/_next/static/a.js"],
      [hosts.public, "/api/health"],
      [hosts.public, "/api/auth"],
      [hosts.client, "/en/access"],
      ["unknown.invalid", "/bg"],
    ] as const) {
      expect(run(host, path).headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  });
  it("fails closed on a misspelled staging flag and rejects direct health access on real hosts", () => {
    vi.stubEnv("STAGING", "TRUE");
    expect(run(hosts.public, "/bg").status).toBe(503);
    vi.stubEnv("STAGING", "true");
    vi.stubEnv("NODE_ENV", "production");
    const transportProof = crypto.randomUUID() + crypto.randomUUID();
    vi.stubEnv("ORIGIN_VERIFY_SECRET", transportProof);
    expect(run(hosts.public, "/api/health").status).toBe(404);
    expect(
      run("origin.invalid", "/api/health", {
        "x-msr-public-host": hosts.public,
        "x-msr-origin-token": transportProof,
      }).headers.get("x-middleware-next"),
    ).toBe("1");
  });
});
