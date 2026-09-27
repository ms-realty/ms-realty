// Transport trust only. User sessions, record authorization and CSRF remain separate checks.
import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { HostOrigins } from "./hosts";

export const originTokenHeader = "x-msr-origin-token";
export const originHostHeader = "x-msr-public-host";
const local = (origin: string) => {
  const h = new URL(origin).hostname;
  return h === "localhost" || h.endsWith(".localhost");
};
const equal = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Real production hosts only accept a validated gateway host plus the rotating shared
 * secret. Loopback production builds used by browser qualification remain directly usable. */
export function originHeaders(
  headers: Headers,
  origins: HostOrigins,
  env: Record<string, string | undefined> = process.env,
): Headers | null {
  const required = env.NODE_ENV === "production" && !Object.values(origins).every(local);
  const host = required ? headers.get(originHostHeader) : headers.get("host");
  const allowed = [
    ...Object.values(origins).map((value) => new URL(value).host.toLowerCase()),
    `www.${new URL(origins.public).host.toLowerCase()}`,
  ];
  if (!host || !allowed.includes(host.toLowerCase())) return null;
  if (required) {
    const presented = headers.get(originTokenHeader) ?? "";
    const active = env.ORIGIN_VERIFY_SECRET,
      previous = env.ORIGIN_VERIFY_PREVIOUS_SECRET;
    if (
      ![active, previous].some(
        (secret) => secret && secret.length >= 32 && equal(presented, secret),
      )
    )
      return null;
  }
  const result = new Headers(headers);
  for (const name of [...result.keys()])
    if (
      name.startsWith("x-middleware-") ||
      name.startsWith("x-nextjs-") ||
      name.startsWith("x-internal-") ||
      name === "x-nonce" ||
      name === "x-app-surface" ||
      name === "x-app-locale" ||
      name === "content-security-policy"
    )
      result.delete(name);
  result.set("host", host.toLowerCase());
  result.set("x-forwarded-host", host.toLowerCase());
  if (required) {
    result.set("x-forwarded-proto", "https");
    const ip = headers.get("x-msr-client-ip") ?? "";
    result.delete("x-forwarded-for");
    result.delete("cf-connecting-ip");
    if (isIP(ip)) {
      result.set("cf-connecting-ip", ip);
      result.set("x-forwarded-for", ip);
    }
  }
  return result;
}
