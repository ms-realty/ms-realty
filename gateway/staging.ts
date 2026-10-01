const stageHosts = new Set([
  "staging.makler-realty.com",
  "my.staging.makler-realty.com",
  "app.staging.makler-realty.com",
]);

export function isStagingHost(value: string): boolean {
  return stageHosts.has(value);
}

export function stagingResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const decode = (value: string) =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
const object = (value: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(decode(value)));

/** Verify the Access assertion; the presence of a forged header is never authentication. */
export async function verifyAccess(
  assertion: string | null,
  teamDomain: string,
  audience: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<boolean> {
  if (
    !assertion ||
    assertion.length > 16384 ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(teamDomain) ||
    !/^[a-f0-9]{64}$/.test(audience)
  )
    return false;
  try {
    const parts = assertion.split(".");
    if (parts.length !== 3) return false;
    const [head, body, signature] = parts;
    if (!head || !body || !signature) return false;
    const header = object(head),
      claims = object(body),
      issuer = `https://${teamDomain}`;
    if (
      header.alg !== "RS256" ||
      typeof header.kid !== "string" ||
      claims.iss !== issuer ||
      !Array.isArray(claims.aud) ||
      !claims.aud.includes(audience) ||
      typeof claims.exp !== "number" ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now / 1000 ||
      typeof claims.iat !== "number" ||
      claims.iat > now / 1000 + 60 ||
      (typeof claims.nbf === "number" && claims.nbf > now / 1000 + 60)
    )
      return false;
    const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || !response.body) return false;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        size += chunk.value.length;
        if (size > 65536) {
          await reader.cancel();
          return false;
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const keys = JSON.parse(new TextDecoder().decode(bytes)).keys as (JsonWebKey & {
      kid?: string;
    })[];
    const jwk = keys.find((k) => k.kid === header.kid && k.kty === "RSA");
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decode(signature),
      new TextEncoder().encode(`${head}.${body}`),
    );
  } catch {
    return false;
  }
}
