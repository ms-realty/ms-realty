import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessAuthorized } from "./access";

afterEach(() => vi.unstubAllGlobals());
describe("Cloudflare Access signature boundary", () => {
  it("verifies real RS256 signatures, identity type, audience, issuer and expiry", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const issuer = "https://msr-access-fixture.cloudflareaccess.com",
      audience = "a".repeat(64);
    const jwk = { ...(await exportJWK(publicKey)), kid: "fixture", alg: "RS256" };
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe(`${issuer}/cdn-cgi/access/certs`);
      return Response.json({ keys: [jwk] });
    });
    vi.stubGlobal("fetch", fetcher);
    const config = {
      ACCESS_TEAM_DOMAIN: issuer,
      ACCESS_AUD: audience,
      ACCESS_SERVICE_CLIENT_ID: "controller.access",
    };
    const signed = async (
      claims: Record<string, unknown> = {},
      overrides: { issuer?: string; audience?: string; expiry?: number } = {},
    ) => {
      const token = await new SignJWT({ type: "app", sub: "owner", ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "fixture" })
        .setIssuer(overrides.issuer ?? issuer)
        .setAudience(overrides.audience ?? audience)
        .setIssuedAt()
        .setExpirationTime(overrides.expiry ?? Math.floor(Date.now() / 1000) + 60)
        .sign(privateKey);
      return new Request("https://staging.makler-realty.com/bg", {
        headers: { "cf-access-jwt-assertion": token },
      });
    };
    expect(await accessAuthorized(await signed(), config)).toBe(true);
    expect(
      await accessAuthorized(await signed({ sub: "", common_name: "controller.access" }), config),
    ).toBe(true);
    for (const request of [
      await signed({ type: "org" }),
      await signed({ sub: "", common_name: "foreign.access" }),
      await signed({}, { issuer: "https://foreign.cloudflareaccess.com" }),
      await signed({}, { audience: "b".repeat(64) }),
      await signed({}, { expiry: 1 }),
    ])
      expect(await accessAuthorized(request, config)).toBe(false);
    const valid = await signed();
    const forged = valid.headers.get("cf-access-jwt-assertion")?.replace(/.$/, "!") as string;
    expect(
      await accessAuthorized(
        new Request(valid.url, { headers: { "cf-access-jwt-assertion": forged } }),
        config,
      ),
    ).toBe(false);
    expect(
      await accessAuthorized(valid, { ...config, ACCESS_TEAM_DOMAIN: "https://attacker.invalid" }),
    ).toBe(false);
    expect(await accessAuthorized(new Request(valid.url), config)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
