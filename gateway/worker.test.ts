import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { type GatewayEnv, gateway, type LegacyRoute } from "./worker";

const config = (rules: LegacyRoute[] = []): GatewayEnv => {
  const json = JSON.stringify(rules);
  return {
    ORIGIN_URL: "https://candidate.ondigitalocean.app",
    PUBLIC_ORIGIN: "https://makler-realty.com",
    CLIENT_ORIGIN: "https://my.makler-realty.com",
    STAFF_ORIGIN: "https://app.makler-realty.com",
    ORIGIN_VERIFY_SECRET: "test-only-origin-secret-0123456789abcdef",
    LEGACY_ROUTES_JSON: json,
    LEGACY_ROUTES_SHA256: createHash("sha256").update(json).digest("hex"),
  };
};
describe("Candidate gateway", () => {
  it("treats doubled-slash paths as paths and never sends gateway credentials to their named host", async () => {
    const fetcher = vi.fn<typeof fetch>(async (request) => {
      const r = request as Request;
      expect(new URL(r.url).origin).toBe("https://candidate.ondigitalocean.app");
      expect(await r.text()).toBe("private test payload");
      return new Response(null, { status: 404 });
    });
    for (const path of [
      "//attacker.example.test/collect?x=1",
      "/%2f%2fattacker.example.test/collect",
      "///attacker.example.test/collect",
    ]) {
      expect(
        (
          await gateway(
            new Request(`https://makler-realty.com${path}`, {
              method: "POST",
              body: "private test payload",
              headers: { cookie: "synthetic-only" },
            }),
            config(),
            fetcher,
          )
        ).status,
      ).toBe(404);
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("strips forged internal context and streams the original method/body to the fixed origin", async () => {
    const env = config(),
      fetcher = vi.fn<typeof fetch>(async (request) => {
        const r = request as Request;
        expect(r.url).toBe("https://candidate.ondigitalocean.app/en/access/confirm");
        expect(r.headers.get("x-msr-public-host")).toBe("my.makler-realty.com");
        expect(r.headers.get("x-msr-origin-token")).toBe(env.ORIGIN_VERIFY_SECRET);
        expect(r.headers.has("x-middleware-subrequest")).toBe(false);
        expect(r.headers.has("x-forwarded-for")).toBe(false);
        expect(await r.text()).toBe("intentional POST");
        expect(r.redirect).toBe("manual");
        return new Response("accepted", { status: 200 });
      });
    const response = await gateway(
      new Request("https://my.makler-realty.com/en/access/confirm", {
        method: "POST",
        headers: {
          "x-msr-public-host": "app.makler-realty.com",
          "x-msr-origin-token": "forged",
          "x-middleware-subrequest": "proxy",
          "x-forwarded-for": "fake",
        },
        body: "intentional POST",
      }),
      env,
      fetcher,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("retains exact reviewed legacy 200s, 301s and terminal outcomes without domain-wide redirect assumptions", async () => {
    const env = config([
      {
        host: "makler-realty.ru",
        path: "/",
        query: "",
        status: 200,
        targetPath: "/ru",
        targetHost: "makler-realty.com",
      },
      {
        host: "makler-realty.ru",
        path: "/old",
        query: "?id=4",
        status: 301,
        targetPath: "/bg/properties/MS-00004",
        targetHost: "makler-realty.com",
      },
      { host: "makler-realty.com", path: "/gone", query: "", status: 410 },
    ]);
    const fetcher = vi.fn<typeof fetch>(async (request) => {
      expect((request as Request).url).toBe("https://candidate.ondigitalocean.app/ru");
      return new Response("retained", { status: 200 });
    });
    expect((await gateway(new Request("https://makler-realty.ru/"), env, fetcher)).status).toBe(
      200,
    );
    expect(
      (await gateway(new Request("https://makler-realty.ru/old?id=4"), env, fetcher)).headers.get(
        "location",
      ),
    ).toBe("https://makler-realty.com/bg/properties/MS-00004");
    expect(
      (await gateway(new Request("https://makler-realty.com/gone"), env, fetcher)).status,
    ).toBe(410);
    expect(
      (await gateway(new Request("https://makler-realty.ru/unmapped"), env, fetcher)).status,
    ).toBe(404);
    expect(
      (await gateway(new Request("https://makler-realty.ru/", { method: "POST" }), env, fetcher))
        .status,
    ).toBe(405);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("fails closed on a different mapping digest, external redirect targets or provider failure", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    });
    expect(
      (
        await gateway(
          new Request("https://makler-realty.com/bg"),
          { ...config(), LEGACY_ROUTES_SHA256: "0".repeat(64) },
          fetcher,
        )
      ).status,
    ).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (await gateway(new Request("https://makler-realty.com/bg"), config(), fetcher)).status,
    ).toBe(503);
    expect(
      (
        await gateway(
          new Request("https://makler-realty.com/bg"),
          config([
            {
              host: "makler-realty.com",
              path: "/bg",
              query: "",
              status: 301,
              targetPath: "//evil.example",
              targetHost: "evil.example",
            },
          ]),
          fetcher,
        )
      ).status,
    ).toBe(503);
  });
});
