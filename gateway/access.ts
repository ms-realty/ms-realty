import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_SERVICE_CLIENT_ID?: string;
}

const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Access headers are untrusted until their signature, issuer, audience and dates verify. */
export async function accessAuthorized(request: Request, env: AccessEnv): Promise<boolean> {
  try {
    const issuer = new URL(env.ACCESS_TEAM_DOMAIN ?? "");
    if (
      issuer.protocol !== "https:" ||
      !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer.hostname) ||
      issuer.port ||
      issuer.username ||
      issuer.password ||
      issuer.search ||
      issuer.hash ||
      issuer.pathname !== "/" ||
      !/^[a-f0-9]{64}$/.test(env.ACCESS_AUD ?? "")
    )
      return false;
    const token = request.headers.get("cf-access-jwt-assertion");
    if (!token || token.length > 16384) return false;
    const team = issuer.origin;
    let jwks = keys.get(team);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", team), {
        timeoutDuration: 5000,
        cacheMaxAge: 300000,
      });
      keys.set(team, jwks);
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer: team,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "iss", "aud"],
    });
    return (
      payload.type === "app" &&
      ((typeof payload.sub === "string" && payload.sub.length > 0) ||
        (typeof payload.common_name === "string" &&
          payload.common_name === env.ACCESS_SERVICE_CLIENT_ID))
    );
  } catch {
    return false;
  }
}
