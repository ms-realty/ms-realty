import { createHash } from "node:crypto";
import maplibrePackage from "maplibre-gl/package.json" with { type: "json" };
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { type GatewayEnv, gateway } from "./worker";

const immutable = "public, max-age=31536000, immutable";
const media = "public, max-age=300, s-maxage=3600";
const mediaPath = `/api/media/00000000-0000-4000-8000-000000000001/${"a".repeat(64)}`;
const fontPath = "/fonts/noto-sans-latin.afc7a910f4ff.woff2";
const config: GatewayEnv = {
  STAGING: "false",
  ORIGIN_URL: "https://origin.invalid",
  PUBLIC_ORIGIN: "https://makler-realty.com",
  CLIENT_ORIGIN: "https://my.makler-realty.com",
  STAFF_ORIGIN: "https://app.makler-realty.com",
  ORIGIN_VERIFY_SECRET: "synthetic".repeat(4),
  LEGACY_ROUTES_JSON: "[]",
  LEGACY_ROUTES_SHA256: createHash("sha256").update("[]").digest("hex"),
};

describe("§7.5 public immutable cache allowlist", () => {
  it.each([
    "/_next/static/chunks/example-a1b2c3.js",
    fontPath,
    `/map-runtime/v${maplibrePackage.version}/maplibre-gl-worker.mjs`,
  ])("preserves the explicit origin policy for %s", async (path) => {
    const response = await gateway(
      new Request(`${config.PUBLIC_ORIGIN}${path}`),
      config,
      async () => new Response("bytes", { headers: { "cache-control": immutable } }),
    );
    expect(response.headers.get("cache-control")).toBe(immutable);
  });

  it("declares immutable origin caching only for hashed fonts and the pinned map runtime", async () => {
    const rules = await nextConfig.headers?.();
    const cached = rules?.filter((rule) =>
      rule.headers.some((header) => header.key === "Cache-Control"),
    );
    expect(cached).toHaveLength(2);
    expect(
      cached?.every((rule) => rule.headers.every((header) => header.value === immutable)),
    ).toBe(true);
    expect(cached?.map((rule) => rule.source)).toEqual([
      "/fonts/:file([a-z0-9-]+\\.[a-f0-9]{12}\\.woff2)",
      `/map-runtime/v${maplibrePackage.version}/:file(maplibre-gl-worker\\.mjs|maplibre-gl-shared\\.mjs)`,
    ]);
  });

  it.each(["GET", "HEAD"])("keeps eligible public media bounded for %s", async (method) => {
    const upstream = vi.fn<typeof fetch>(
      async () =>
        new Response(method === "HEAD" ? null : "image", {
          headers: { "cache-control": media, vary: "RSC, Next-Router-State-Tree, Accept-Encoding" },
        }),
    );
    const response = await gateway(
      new Request(`${config.PUBLIC_ORIGIN}${mediaPath}`, { method }),
      config,
      upstream,
    );
    expect(upstream).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe(media);
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
  });

  it.each(["https://my.makler-realty.com", "https://app.makler-realty.com"])(
    "keeps %s assets browser-private and media unstored",
    async (host) => {
      const asset = await gateway(
        new Request(`${host}${fontPath}`),
        config,
        async () => new Response("font", { headers: { "cache-control": immutable } }),
      );
      expect(asset.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
      const photo = await gateway(
        new Request(`${host}${mediaPath}`),
        config,
        async () => new Response("image", { headers: { "cache-control": media } }),
      );
      expect(photo.headers.get("cache-control")).toBe("private, no-store");
    },
  );

  it.each([
    ["/bg/properties/approved", immutable, 200, "GET", {}],
    ["/api/documents/id", media, 200, "GET", {}],
    ["/brand/logo-ms-realty.png", immutable, 200, "GET", {}],
    ["/fonts/noto-sans-latin.woff2", immutable, 200, "GET", {}],
    [fontPath, "public, max-age=0", 200, "GET", {}],
    [fontPath, immutable, 404, "GET", {}],
    [fontPath, immutable, 500, "GET", {}],
    [fontPath, immutable, 200, "POST", {}],
    [fontPath, immutable, 200, "GET", { "set-cookie": "session=synthetic" }],
    [mediaPath, media, 404, "GET", {}],
    [mediaPath, media, 416, "GET", {}],
    [mediaPath, media, 200, "GET", { "set-cookie": "session=synthetic" }],
  ] as const)("keeps %s (%s, %i, %s) unstored", async (path, policy, status, method, extra) => {
    const response = await gateway(
      new Request(`${config.PUBLIC_ORIGIN}${path}`, { method }),
      config,
      async () =>
        new Response("bytes", {
          status,
          headers: {
            "cache-control": policy,
            "cdn-cache-control": immutable,
            "cloudflare-cdn-cache-control": immutable,
            ...extra,
          },
        }),
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("cdn-cache-control")).toBe(false);
    expect(response.headers.has("cloudflare-cdn-cache-control")).toBe(false);
  });

  it("keeps protected staging uncached and checks Access even for immutable assets", async () => {
    const upstream = vi.fn<typeof fetch>(
      async () => new Response("font", { headers: { "cache-control": immutable } }),
    );
    const request = new Request(`${config.PUBLIC_ORIGIN}${fontPath}`);
    const env = { ...config, STAGING: "true" as const };
    const denied = await gateway(request, env, upstream, async () => false);
    expect(denied.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    const allowed = await gateway(request, env, upstream, async () => true);
    expect(allowed.headers.get("cache-control")).toBe("private, no-store");
    expect(allowed.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
