import { beforeAll, describe, expect, it, vi } from "vitest";
import { isStagingHost, stagingResponse, verifyAccess } from "./staging";

const team = "msr-fixture.cloudflareaccess.com";
const audience = "b".repeat(64);
const now = Date.now();
let keys: CryptoKeyPair;
let jwk: JsonWebKey;
const encode = (value: string | Uint8Array) => Buffer.from(value).toString("base64url");
async function token(overrides: Record<string, unknown> = {}) {
  const head = encode(JSON.stringify({ alg: "RS256", kid: "fixture" }));
  const body = encode(
    JSON.stringify({
      iss: `https://${team}`,
      aud: [audience],
      iat: Math.floor(now / 1000) - 5,
      exp: Math.floor(now / 1000) + 300,
      ...overrides,
    }),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keys.privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${encode(new Uint8Array(signature))}`;
}
beforeAll(async () => {
  keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
});

describe("isolated staging boundary", () => {
  it("admits only the three staging hosts, including no workers.dev or production host", () => {
    expect(isStagingHost("staging.makler-realty.com")).toBe(true);
    expect(isStagingHost("app.staging.makler-realty.com")).toBe(true);
    expect(isStagingHost("my.staging.makler-realty.com")).toBe(true);
    for (const value of [
      "makler-realty.com",
      "makler-realty.ru",
      "www.makler-realty.com",
      "ms-realty.ms-realty-bg.workers.dev",
      "staging.makler-realty.com.attacker.invalid",
    ])
      expect(isStagingHost(value)).toBe(false);
  });
  it("keeps noindex/no-store on error, redirects and streaming responses", async () => {
    for (const status of [200, 301, 403, 503]) {
      const response = stagingResponse(new Response("private fixture", { status }));
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.status).toBe(status);
      expect(await response.text()).toBe("private fixture");
    }
  });
  it("validates a real signature against the configured Access issuer and audience", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      expect(url).toBe(`https://${team}/cdn-cgi/access/certs`);
      return Response.json({ keys: [{ ...jwk, kid: "fixture" }] });
    });
    expect(await verifyAccess(await token(), team, audience, fetcher, now)).toBe(true);
    expect(
      await verifyAccess(
        await token({ iss: "https://attacker.invalid" }),
        team,
        audience,
        fetcher,
        now,
      ),
    ).toBe(false);
    expect(
      await verifyAccess(await token({ aud: ["c".repeat(64)] }), team, audience, fetcher, now),
    ).toBe(false);
    expect(
      await verifyAccess(await token({ exp: now / 1000 - 1 }), team, audience, fetcher, now),
    ).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a forged header or an unconfigured issuer without sending any request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await verifyAccess(null, team, audience, fetcher, now)).toBe(false);
    expect(await verifyAccess("forged", team, audience, fetcher, now)).toBe(false);
    expect(await verifyAccess(await token(), "attacker.invalid", audience, fetcher, now)).toBe(
      false,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects tampered signatures and bounds certificate response memory", async () => {
    const value = await token();
    const signature = value.split(".")[2] ?? "";
    const changed = `${value.slice(0, value.lastIndexOf(".") + 1)}${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    expect(
      await verifyAccess(
        changed,
        team,
        audience,
        async () => Response.json({ keys: [{ ...jwk, kid: "fixture" }] }),
        now,
      ),
    ).toBe(false);
    expect(
      await verifyAccess(value, team, audience, async () => new Response("x".repeat(65537)), now),
    ).toBe(false);
  });
});
