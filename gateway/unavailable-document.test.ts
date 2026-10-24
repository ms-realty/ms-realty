/// <reference path="./cloudflare-runtime.generated.d.ts" />
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
vi.mock("@cloudflare/containers", () => ({ Container: class {} }));
vi.mock("./staging-artifacts.generated", () => ({
  stagingArtifacts: { fixture: false, sourceCommit: "a".repeat(40), routes: "[]", media: "[]" },
}));
vi.mock("./access", () => ({ accessAuthorized: vi.fn(async () => true) }));

import { accessAuthorized } from "./access";
import staging from "./cloudflare";
import { withUnavailableDocument } from "./unavailable-document";

const documentRequest = (path = "/en/access", headers: Record<string, string> = {}) =>
  new Request(`https://staging-app.makler-realty.com${path}`, {
    headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", ...headers },
  });

describe("O access: readable gateway outage without reopening intake or replaying an action", () => {
  it.each(["bg", "en", "ru", "de", "nl", "el", "he"])(
    "serves the %s document without scripts, upstream assets or reflected private links",
    async (locale) => {
      const request = documentRequest(`/${locale}/access?invite=private-fixture-value`);
      const response = await withUnavailableDocument(request, new Response(null, { status: 503 }));
      const html = await response.text();
      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(html).toContain(`<html lang="${locale}" dir="${locale === "he" ? "rtl" : "ltr"}">`);
      expect(html).toContain('<main id="main-content"><h1>');
      expect(html).toContain('<a href="">');
      expect(html).not.toMatch(
        /<script|<form|<img|<link|http[s]?:|private-fixture-value|undefined/,
      );
      const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1];
      expect(css).toBeTruthy();
      const hash = createHash("sha256")
        .update(css ?? "")
        .digest("base64");
      expect(response.headers.get("content-security-policy")).toBe(
        `default-src 'none'; style-src 'sha256-${hash}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      );
      // Browser-native retry resolves to the same page and query, without storing it in HTML.
      expect(new URL("", request.url).href).toBe(request.url);
    },
  );

  it("uses the source locale for an unrecognised locale and explains uncertain action outcomes", async () => {
    const fallback = await withUnavailableDocument(
      documentRequest("/fr/access"),
      new Response(null, { status: 503 }),
    );
    expect(await fallback.text()).toContain('<html lang="bg"');
    const response = await withUnavailableDocument(
      documentRequest(),
      new Response(null, { status: 503 }),
    );
    expect(await response.text()).toContain(
      "check the same receipt before trying that action again",
    );
  });

  it.each([
    ["/api/health", "GET", {}],
    ["/en/api/session", "GET", {}],
    ["/__release/runtime", "GET", {}],
    ["/__staging/runtime", "GET", {}],
    ["/en/_next/static/fixture.js", "GET", {}],
    ["/en/access", "POST", {}],
    ["/en/access", "HEAD", {}],
    ["/en/access", "GET", { Accept: "application/json" }],
    ["/en/access", "GET", { Accept: "text/html;q=0,application/json" }],
    ["/en/access", "GET", { Accept: "text/html;q=0.0,*/*" }],
    ["/en/access", "GET", { RSC: "1" }],
    ["/en/access", "GET", { "Next-Action": "fixture" }],
    ["/en/access", "GET", { Accept: "text/html,text/x-component" }],
    ["/en/access", "GET", { "Sec-Fetch-Dest": "empty" }],
  ] as const)("preserves the %s %s protocol response (%j)", async (path, method, extra) => {
    const request = new Request(`https://staging-app.makler-realty.com${path}`, {
      method,
      headers: { Accept: "text/html", ...extra },
    });
    const original = Response.json({ code: "release_unavailable" }, { status: 503 });
    expect(await withUnavailableDocument(request, original)).toBe(original);
    expect(await original.json()).toEqual({ code: "release_unavailable" });
  });

  it("preserves rendered errors and all other statuses, including authorization denials", async () => {
    for (const status of [200, 403, 404, 500]) {
      const original = new Response("original response", { status });
      expect(await withUnavailableDocument(documentRequest(), original)).toBe(original);
    }
    const rendered = new Response("<h1>Existing recovery page</h1>", {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    expect(await withUnavailableDocument(documentRequest(), rendered)).toBe(rendered);
  });

  it("discards stale byte validators while retaining an existing cookie or retry hint", async () => {
    const original = new Response(null, {
      status: 503,
      headers: {
        "Content-Length": "0",
        "Content-Encoding": "gzip",
        ETag: '"outage"',
        "Retry-After": "30",
        "Set-Cookie": "unit=reset; Path=/; HttpOnly",
      },
    });
    const response = await withUnavailableDocument(documentRequest(), original);
    for (const name of ["content-length", "content-encoding", "etag"])
      expect(response.headers.has(name)).toBe(false);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("set-cookie")).toContain("unit=reset");
  });

  it("keeps staging connectivity-only mode closed without starting containers", async () => {
    const containers = { getByName: vi.fn() };
    const env = {
      STAGING: "true",
      BUILD_SHA: "a".repeat(40),
      STAGING_CONNECTIVITY_ONLY: "true",
      PUBLIC_ORIGIN: "https://staging.makler-realty.com",
      CLIENT_ORIGIN: "https://staging-my.makler-realty.com",
      STAFF_ORIGIN: "https://staging-app.makler-realty.com",
      MS_REALTY: containers,
      MS_REALTY_WORKER: containers,
      MS_REALTY_MIGRATOR: containers,
    };
    const response = await staging.fetch(documentRequest(), env as never);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Temporarily unavailable");
    expect(containers.getByName).not.toHaveBeenCalled();
    vi.mocked(accessAuthorized).mockResolvedValueOnce(false);
    expect((await staging.fetch(documentRequest(), env as never)).status).toBe(403);
    expect(containers.getByName).not.toHaveBeenCalled();
  });
});
