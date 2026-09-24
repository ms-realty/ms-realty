// Framework-neutral request helpers for route handlers and server actions: correlation ids,
// the cross-site check for cookie-authenticated mutations, the session actor and safe error
// responses.
import "server-only";
import { randomUUID } from "node:crypto";
import type { Actor } from "@/domain/capabilities";
import { readCookie, sessionCookieName } from "../auth/cookies";
import { readSession, type Session } from "../auth/sessions";
import type { ServerEnv } from "../config/env";
import type { Executor } from "../db";
import { AppError, errorStatus, isAppError, toErrorBody } from "../errors";

const correlationPattern = /^[A-Za-z0-9._:-]{8,128}$/;

/** The edge's request id when it is well-formed, otherwise a fresh one. */
export function correlationIdFrom(headers: Headers): string {
  const incoming = headers.get("x-request-id") ?? headers.get("cf-ray");
  return incoming && correlationPattern.test(incoming) ? incoming : randomUUID();
}

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function isUnsafeMethod(method: string): boolean {
  return !safeMethods.has(method.toUpperCase());
}

/**
 * Rejects a state-changing request that a browser marked as cross-site, or whose Origin is not
 * this app. Browsers send at least one of the two headers on every POST; a request with
 * neither is treated as cross-site.
 */
export function assertSameOrigin(headers: Headers, appOrigin: string): void {
  const site = headers.get("sec-fetch-site");
  const origin = headers.get("origin");
  if (site && site !== "same-origin" && site !== "none") {
    throw new AppError("cross_origin_request");
  }
  if (origin ? origin !== appOrigin : !site) throw new AppError("cross_origin_request");
}

/**
 * Client IP for rate limiting. Behind the Cloudflare edge this is `cf-connecting-ip`; the
 * origin must not be reachable directly or the header could be forged.
 */
export function clientIpFrom(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export interface RequestIdentity {
  readonly session: Session | null;
  /** Null for anonymous visitors; callers give them a submission-scoped visitor actor. */
  readonly actor: Actor | null;
  readonly sessionToken: string | undefined;
}

/** The signed-in actor behind the request's session cookie, if any. */
export async function identify(
  db: Executor,
  headers: Headers,
  env: ServerEnv,
): Promise<RequestIdentity> {
  const token = readCookie(headers.get("cookie"), sessionCookieName(env));
  const session = token ? await readSession(db, token) : null;
  return { session, actor: session?.actor ?? null, sessionToken: session ? token : undefined };
}

export function requireSession(identity: RequestIdentity): Session {
  if (!identity.session) throw new AppError("unauthenticated");
  return identity.session;
}

/** JSON error response; internals go to the server log under the correlation id only. */
export function errorResponse(error: unknown, correlationId: string): Response {
  if (!isAppError(error)) {
    console.error(`[${correlationId}] unhandled error`, error);
  }
  const body = toErrorBody(error, correlationId);
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-correlation-id": correlationId,
  });
  if (body.retryAfterSeconds !== undefined) {
    headers.set("retry-after", String(body.retryAfterSeconds));
  }
  return new Response(JSON.stringify({ error: body }), { status: errorStatus(error), headers });
}
