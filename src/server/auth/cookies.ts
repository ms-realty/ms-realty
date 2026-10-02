// Session cookies: HttpOnly, Secure, SameSite=Lax, host-only, one name per private host
// context (§8.1): the staff host and the client host each hold their own, and the public host
// receives neither. In production the `__Host-` prefix makes the browser enforce Secure,
// Path=/ and no Domain attribute.
import "server-only";
import type { ServerEnv } from "../config/env";
import type { PrivateHostContext } from "../config/hosts";

export interface CookieOptions {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly expires: Date;
}

export function sessionCookieName(env: ServerEnv, context: PrivateHostContext): string {
  return env.hosts[context].startsWith("https://")
    ? `__Host-msr_${context}_session`
    : `msr_${context}_session`;
}

export function sessionCookieOptions(
  env: ServerEnv,
  context: PrivateHostContext,
  expires: Date,
): CookieOptions {
  return {
    httpOnly: true,
    // Plain-http local development cannot hold a Secure cookie in every browser.
    secure: env.hosts[context].startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires,
  };
}

/** A Set-Cookie value with these attributes; no Domain, so the cookie stays host-only. */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  return [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Expires=${options.expires.toUTCString()}`,
    "HttpOnly",
    ...(options.secure ? ["Secure"] : []),
    "SameSite=Lax",
  ].join("; ");
}

/** Set-Cookie value that stores a session token until the session's absolute expiry. */
export function sessionSetCookie(
  env: ServerEnv,
  context: PrivateHostContext,
  token: string,
  expires: Date,
): string {
  return serializeCookie(
    sessionCookieName(env, context),
    token,
    sessionCookieOptions(env, context, expires),
  );
}

/** Set-Cookie value that removes the session cookie. */
export function sessionClearCookie(env: ServerEnv, context: PrivateHostContext): string {
  return serializeCookie(
    sessionCookieName(env, context),
    "",
    sessionCookieOptions(env, context, new Date(0)),
  );
}

/** Reads one cookie from a Cookie header. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}
