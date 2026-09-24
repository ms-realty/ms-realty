// Session cookie: HttpOnly, Secure, SameSite=Lax, host-only. In production the `__Host-`
// prefix makes the browser enforce Secure, Path=/ and no Domain attribute.
import "server-only";
import type { ServerEnv } from "../config/env";

export interface CookieOptions {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly expires: Date;
}

export function sessionCookieName(env: ServerEnv): string {
  return env.production ? "__Host-msr_session" : "msr_session";
}

export function sessionCookieOptions(env: ServerEnv, expires: Date): CookieOptions {
  return {
    httpOnly: true,
    // Plain-http local development cannot hold a Secure cookie in every browser.
    secure: env.production || env.appOrigin.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires,
  };
}

function serialize(name: string, value: string, options: CookieOptions): string {
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
export function sessionSetCookie(env: ServerEnv, token: string, expires: Date): string {
  return serialize(sessionCookieName(env), token, sessionCookieOptions(env, expires));
}

/** Set-Cookie value that removes the session cookie. */
export function sessionClearCookie(env: ServerEnv): string {
  return serialize(sessionCookieName(env), "", sessionCookieOptions(env, new Date(0)));
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
