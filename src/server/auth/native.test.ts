import { describe, expect, it, vi } from "vitest";
import { getEnv } from "../config/env";
import { assertNativeAuthOrigin, nativeAuthRoute } from "./native";

vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
const origin = "https://my.example.test";
describe("native identity form CSRF provenance", () => {
  it.each([
    { origin },
    { origin, "sec-fetch-site": "same-origin" },
    { origin: "null", "sec-fetch-site": "same-origin" },
    { "sec-fetch-site": "same-origin" },
  ])(
    "allows an explicit matching origin or same-origin metadata with no-referrer: %j",
    (headers) => {
      expect(() =>
        assertNativeAuthOrigin(new Headers(headers as Record<string, string>), origin),
      ).not.toThrow();
    },
  );
  it.each([
    {},
    { origin: "null" },
    { origin: "https://evil.example" },
    { origin: "https://evil.example", "sec-fetch-site": "same-origin" },
    { origin, "sec-fetch-site": "same-site" },
    { origin, "sec-fetch-site": "cross-site" },
    { origin: "null", "sec-fetch-site": "same-site" },
    { origin: "null", "sec-fetch-site": "cross-site" },
    { origin: "null", "sec-fetch-site": "none" },
  ])("refuses missing or contradictory provenance: %j", (headers) => {
    expect(() =>
      assertNativeAuthOrigin(new Headers(headers as Record<string, string>), origin),
    ).toThrow(expect.objectContaining({ code: "cross_origin_request" }));
  });
  it("rejects wrong-host and cross-site native requests before invoking the domain action", async () => {
    const handler = vi.fn(async () => "/en/access");
    const post = nativeAuthRoute("client", (locale) => `/${locale}/access`, handler);
    const env = getEnv();
    const params = { params: Promise.resolve({ locale: "en" }) };
    const scanner = await post(
      new Request(`${env.hosts.client}/en/access/request`, {
        headers: { host: new URL(env.hosts.client).host },
      }),
      params,
    );
    expect(scanner.status).toBe(405);
    const wrong = await post(
      new Request(`${env.hosts.staff}/en/access/request`, {
        method: "POST",
        headers: { host: new URL(env.hosts.staff).host },
      }),
      params,
    );
    expect(wrong.status).toBe(404);
    const cross = await post(
      new Request(`${env.hosts.client}/en/access/request`, {
        method: "POST",
        headers: {
          host: new URL(env.hosts.client).host,
          origin: env.hosts.client,
          "sec-fetch-site": "cross-site",
        },
      }),
      params,
    );
    expect(cross.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});
