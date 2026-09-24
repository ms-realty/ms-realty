// Next.js adapters over the request helpers: a wrapper for route handlers, one for server
// actions, and session-cookie writes. Each resolves the correlation id and the session actor,
// enforces the same-origin rule on cookie-authenticated mutations and maps errors safely.
import "server-only";
import { cookies, headers } from "next/headers";
import { getDb } from "@/db/client";
import type { Actor } from "@/domain/capabilities";
import { sessionCookieName, sessionCookieOptions } from "../auth/cookies";
import type { Session } from "../auth/sessions";
import { getEnv } from "../config/env";
import type { Database } from "../db";
import { AppError, type ErrorBody, isAppError, toErrorBody } from "../errors";
import {
  assertSameOrigin,
  correlationIdFrom,
  errorResponse,
  identify,
  isUnsafeMethod,
  type RequestIdentity,
} from "./request";

export interface HandlerContext {
  readonly db: Database;
  readonly correlationId: string;
  readonly session: Session | null;
  readonly actor: Actor | null;
  readonly sessionToken: string | undefined;
}

export interface RouteOptions {
  /** Answer 401 before the handler runs when there is no session. */
  readonly requireSession?: boolean;
}

async function context(
  requestHeaders: Headers,
  method: string,
  correlationId: string,
  options: RouteOptions,
): Promise<HandlerContext> {
  const env = getEnv();
  const db = getDb();
  const identity: RequestIdentity = await identify(db, requestHeaders, env);
  // Cookie-authenticated mutations must come from this site (CSRF defence in depth).
  if (isUnsafeMethod(method) && (identity.sessionToken || options.requireSession)) {
    assertSameOrigin(requestHeaders, env.appOrigin);
  }
  if (options.requireSession && !identity.session) {
    throw new AppError("unauthenticated");
  }
  return { db, correlationId, ...identity };
}

/** Wraps an App Router route handler. */
export function route<P>(
  handler: (request: Request, ctx: HandlerContext, params: P) => Promise<Response>,
  options: RouteOptions = {},
): (request: Request, params: P) => Promise<Response> {
  return async (request, params) => {
    const correlationId = correlationIdFrom(request.headers);
    try {
      const ctx = await context(request.headers, request.method, correlationId, options);
      const response = await handler(request, ctx, params);
      response.headers.set("x-correlation-id", correlationId);
      return response;
    } catch (error) {
      return errorResponse(error, correlationId);
    }
  };
}

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ErrorBody };

/** Runs a server action body; server actions are always mutations, so origin is checked. */
export async function action<T>(
  fn: (ctx: HandlerContext) => Promise<T>,
  options: RouteOptions = {},
): Promise<ActionResult<T>> {
  const requestHeaders = await headers();
  const correlationId = correlationIdFrom(requestHeaders);
  try {
    assertSameOrigin(requestHeaders, getEnv().appOrigin);
    const ctx = await context(requestHeaders, "POST", correlationId, options);
    return { ok: true, data: await fn(ctx) };
  } catch (error) {
    if (!isAppError(error)) console.error(`[${correlationId}] unhandled error`, error);
    return { ok: false, error: toErrorBody(error, correlationId) };
  }
}

/** Stores a newly issued session token (server actions and route handlers). */
export async function setSessionCookie(token: string, expires: Date): Promise<void> {
  const env = getEnv();
  (await cookies()).set(sessionCookieName(env), token, sessionCookieOptions(env, expires));
}

export async function clearSessionCookie(): Promise<void> {
  const env = getEnv();
  (await cookies()).set(sessionCookieName(env), "", sessionCookieOptions(env, new Date(0)));
}
