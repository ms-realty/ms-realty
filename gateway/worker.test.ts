import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { type GatewayEnv, gateway, type LegacyRoute } from "./worker";

const config = (rules: LegacyRoute[] = []): GatewayEnv => {
  const json = JSON.stringify(rules);
  return {
    STAGING: "false",
    ORIGIN_URL: "https://origin.invalid",
    PUBLIC_ORIGIN: "https://makler-realty.com",
    CLIENT_ORIGIN: "https://my.makler-realty.com",
    STAFF_ORIGIN: "https://app.makler-realty.com",
    ORIGIN_VERIFY_SECRET: "test-only-origin-secret-0123456789abcdef",
    LEGACY_ROUTES_JSON: json,
    LEGACY_ROUTES_SHA256: createHash("sha256").update(json).digest("hex"),
  };
};

describe("page-thrown 404 documents without JavaScript", () => {
  const emptyDocument =
    '<!DOCTYPE html><html id="__next_error__"><head><meta name="robots" content="noindex"/></head><body><div hidden=""><!--$--><!--/$--></div><script>self.__next_f=[]</script></body></html>';

  for (const [host, path, locale, home] of [
    ["makler-realty.com", "/he/properties/MS-99999/missing", "he", "/he"],
    ["my.makler-realty.com", "/en/overview/missing", "en", "/en/overview"],
    ["app.makler-realty.com", "/ru/cases/missing", "ru", "/ru/today"],
  ]) {
    it(`${host} preserves 404 and supplies localized recovery HTML`, async () => {
      const upstream = vi.fn<typeof fetch>(
        async () =>
          new Response(emptyDocument, {
            status: 404,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy": "default-src 'self'; style-src 'nonce-testnonce'",
              "Content-Length": String(emptyDocument.length),
              ETag: '"origin-document"',
              "Set-Cookie": "synthetic=reset; Path=/; HttpOnly",
            },
          }),
      );
      const response = await gateway(new Request(`https://${host}${path}`), config(), upstream);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-robots-tag")).toMatch(/noindex/);
      expect(response.headers.get("content-length")).toBeNull();
      expect(response.headers.get("etag")).toBeNull();
      expect(response.headers.get("set-cookie")).toContain("synthetic=reset");
      const html = await response.text();
      expect(html).toContain(`<html lang="${locale}"`);
      expect(html).toContain(`<a href="${home}">`);
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html).toContain('<main id="main-content">');
      expect(html).not.toContain("__next_error__");
      expect(html).not.toContain("<script");
      expect(upstream).toHaveBeenCalledTimes(1);
    });
  }

  for (const [name, document, status, requestHeaders, contentType] of [
    [
      "rendered 404",
      '<html lang="bg"><body><h1>Existing fallback</h1></body></html>',
      404,
      {},
      "text/html",
    ],
    [
      "error shell with real content",
      '<html id="__next_error__"><body><h1>Future fallback</h1></body></html>',
      404,
      {},
      "text/html",
    ],
    ["500 document", emptyDocument, 500, {}, "text/html"],
    ["RSC response", emptyDocument, 404, { RSC: "1" }, "text/html"],
    ["JSON response", emptyDocument, 404, {}, "application/json"],
  ] as const) {
    it(`leaves ${name} intact`, async () => {
      const response = await gateway(
        new Request("https://makler-realty.com/en/missing", { headers: requestHeaders }),
        config(),
        async () => new Response(document, { status, headers: { "Content-Type": contentType } }),
      );
      expect(response.status).toBe(status);
      expect(await response.text()).toBe(document);
    });
  }

  it("resumes a large 404 document intact rather than buffering it without a bound", async () => {
    const before = '<html id="__next_error__"><body><script>';
    const middle = "x".repeat(256 * 1024);
    const after = "</script></body></html>";
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of [before, middle, after]) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    const response = await gateway(
      new Request("https://makler-realty.com/en/missing"),
      config(),
      async () => new Response(stream, { status: 404, headers: { "Content-Type": "text/html" } }),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(before + middle + after);
  });

  it("preserves server-action and HEAD response semantics", async () => {
    for (const request of [
      new Request("https://makler-realty.com/en/missing", { method: "POST" }),
      new Request("https://makler-realty.com/en/missing", { headers: { "Next-Action": "opaque" } }),
      new Request("https://makler-realty.com/en/missing", { method: "HEAD" }),
    ]) {
      const response = await gateway(
        request,
        config(),
        async () =>
          new Response(request.method === "HEAD" ? null : emptyDocument, {
            status: 404,
            headers: { "Content-Type": "text/html" },
          }),
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(request.method === "HEAD" ? "" : emptyDocument);
    }
  });
});

describe("Candidate gateway", () => {
  it("matches decoded legacy Unicode identity without changing the original public spelling or query", async () => {
    const env = config([
      {
        host: "makler-realty.ru",
        path: "/покупка",
        query: "?x=%2F",
        status: 200,
        targetHost: "makler-realty.com",
        targetPath: "/ru/legacy/content",
      },
    ]);
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      expect((input as Request).headers.get("x-msr-rendered-path")).toBe(
        "/%D0%BF%D0%BE%D0%BA%D1%83%D0%BF%D0%BA%D0%B0?x=%2F",
      );
      return new Response("retained");
    });
    const path = `/${encodeURIComponent("покупка")}?x=%2F`;
    expect(
      (await gateway(new Request(`https://makler-realty.ru${path}`), env, fetcher)).status,
    ).toBe(200);
    expect(
      (await gateway(new Request("https://makler-realty.ru/%2Fпокупка?x=%2F"), env, fetcher))
        .status,
    ).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("computes one final 301 for http/www before mapping and preserves exact query bytes", async () => {
    const env = config([
      {
        host: "makler-realty.ru",
        path: "/old",
        query: "?a=1&a=2&x=%2F",
        status: 301,
        targetHost: "makler-realty.com",
        targetPath: "/bg/equivalent?x=%2F&a=1&a=2",
      },
      {
        host: "makler-realty.ru",
        path: "/retained",
        query: "?a=1&a=2",
        status: 200,
        targetHost: "makler-realty.com",
        targetPath: "/ru/legacy/content",
      },
    ]);
    const fetcher = vi.fn<typeof fetch>(async () => new Response("retained"));
    for (const scheme of ["http", "https"])
      for (const alias of ["", "www."]) {
        const redirect = await gateway(
          new Request(`${scheme}://${alias}makler-realty.ru/old?a=1&a=2&x=%2F`),
          env,
          fetcher,
        );
        expect(redirect.status).toBe(301);
        expect(redirect.headers.get("location")).toBe(
          "https://makler-realty.com/bg/equivalent?x=%2F&a=1&a=2",
        );
      }
    expect(fetcher).not.toHaveBeenCalled();
    const retained = await gateway(
      new Request("http://www.makler-realty.ru/retained?a=1&a=2"),
      env,
      fetcher,
    );
    expect(retained.headers.get("location")).toBe("https://makler-realty.ru/retained?a=1&a=2");
    expect(
      (await gateway(new Request("https://makler-realty.ru/old?a=2&a=1&x=%2F"), env, fetcher))
        .status,
    ).toBe(404);
    expect(
      (await gateway(new Request(retained.headers.get("location") as string), env, fetcher)).status,
    ).toBe(200);
  });
  it("refuses historical terminal removals and redirect chains", async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const rows of [
      [{ host: "makler-realty.ru", path: "/old", query: "", status: 410 as const }],
      [
        {
          host: "makler-realty.ru",
          path: "/old",
          query: "",
          status: 301 as const,
          targetHost: "makler-realty.com",
          targetPath: "/chain",
        },
        {
          host: "makler-realty.com",
          path: "/chain",
          query: "",
          status: 301 as const,
          targetHost: "makler-realty.com",
          targetPath: "/bg/end",
        },
      ],
    ])
      expect(
        (await gateway(new Request("https://makler-realty.ru/old"), config(rows), fetcher)).status,
      ).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires Access before the staging source adapter and strips the verified transport identity", async () => {
    const env = {
      ...config([
        {
          host: "makler-realty.ru",
          path: "/original",
          query: "?cursor=a%2Bb",
          status: 200,
          targetHost: "makler-realty.com",
          targetPath: "/ru/legacy/content",
        },
      ]),
      STAGING: "true" as const,
      PUBLIC_ORIGIN: "https://staging.makler-realty.com",
      CLIENT_ORIGIN: "https://staging-my.makler-realty.com",
      STAFF_ORIGIN: "https://staging-app.makler-realty.com",
      LEGACY_TARGET_HOST: "makler-realty.com",
    };
    const request = new Request(`${env.PUBLIC_ORIGIN}/original?cursor=a%2Bb`, {
      headers: {
        "x-msr-legacy-host": "makler-realty.ru",
        "cf-access-jwt-assertion": "fixture",
        "cf-access-client-secret": "fixture",
        "x-msr-rendered-path": "/forged",
      },
    });
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const outbound = input as Request;
      expect(outbound.url).toBe("https://origin.invalid/ru/legacy/content");
      expect(outbound.headers.get("x-msr-rendered-path")).toBe("/original?cursor=a%2Bb");
      for (const header of [
        "x-msr-legacy-host",
        "cf-access-jwt-assertion",
        "cf-access-client-secret",
      ])
        expect(outbound.headers.has(header)).toBe(false);
      return new Response("page");
    });
    const rejected = await gateway(request, env, fetcher, async () => false);
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(fetcher).not.toHaveBeenCalled();
    const accepted = await gateway(request, env, fetcher, async () => true);
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const www = await gateway(
      new Request(request.url, { headers: { "x-msr-legacy-host": "www.makler-realty.ru" } }),
      env,
      fetcher,
      async () => true,
    );
    expect(www.status).toBe(301);
    expect(www.headers.get("location")).toBe(`${env.PUBLIC_ORIGIN}/original?cursor=a%2Bb`);
    expect(www.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const redirect = await gateway(
      new Request(`${env.PUBLIC_ORIGIN}/original?cursor=a%2Bb`, {
        headers: {
          "x-msr-legacy-host": "attacker.invalid",
        },
      }),
      env,
      fetcher,
      async () => true,
    );
    expect(redirect.status).toBe(400);
    expect((await gateway(request, { ...env, STAGING: "false" }, fetcher)).status).toBe(400);
  });
  it("treats doubled-slash paths as paths and never sends gateway credentials to their named host", async () => {
    const fetcher = vi.fn<typeof fetch>(async (request) => {
      const r = request as Request;
      expect(new URL(r.url).origin).toBe("https://origin.invalid");
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
        expect(r.url).toBe("https://origin.invalid/en/access/confirm");
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
  it("retains exact reviewed legacy 200s and 301s without domain-wide redirect assumptions", async () => {
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
    ]);
    const fetcher = vi.fn<typeof fetch>(async (request) => {
      expect((request as Request).url).toBe("https://origin.invalid/ru");
      expect((request as Request).headers.get("x-msr-rendered-path")).toBe("/");
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
