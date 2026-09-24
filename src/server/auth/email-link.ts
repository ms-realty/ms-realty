// Email-link sign-in (F13, AD7, A33, A34).
// - Requesting a link always answers the same way, whether or not an account exists, and is
//   rate-limited per client IP and per address from that IP (so nobody can lock another
//   person's address out). The request path never looks at accounts: it enqueues one job for
//   every address, and the job decides whether to issue a link, so timing cannot reveal an account.
// - A link carries a single-use 32-byte token (stored hashed) that expires after 15 minutes and
//   is bound to a same-origin relative return path.
// - Opening the link (GET) only inspects it to render a confirm page; the token is consumed
//   solely by the explicit POST from that page, so mail scanners and link previews cannot use it.
import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { clientAccounts, emailSignInTokens, staffAccounts } from "@/db/schema";
import type { PublicLocale } from "@/domain/ids";
import { recordAudit } from "../audit";
import { getEnv } from "../config/env";
import { randomToken, sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { enqueueMessage } from "../jobs/outbox";
import type { JobPayloads, JobQueue } from "../jobs/queue";
import { enforceRateLimit } from "../rate-limit";
import { type AccountKind, createSession, type IssuedSession, revokeSession } from "./sessions";

export const emailLinkTtlMs = 15 * 60_000;
/** Route that renders the confirm page (GET) and consumes the token (POST). */
export const emailLinkPath = "/sign-in/confirm";

/**
 * A same-origin path to return to after sign-in, or null. Absolute URLs, protocol-relative
 * `//host` forms, backslashes and control characters are rejected (open-redirect defence).
 */
export function safeReturnPath(value: string | null | undefined, appOrigin: string): string | null {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, appOrigin);
  } catch {
    return null;
  }
  if (url.origin !== appOrigin) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

const emailSchema = z.email().max(254);

export interface EmailLinkRequest {
  readonly email: string;
  readonly accountKind: AccountKind;
  readonly returnTo?: string | null;
  /** Client IP as seen by the edge, for the per-IP limits. */
  readonly clientIp: string;
  readonly locale?: PublicLocale;
  readonly now?: Date;
  /** Receives the `auth.email_link` job; its worker calls issueEmailLink. */
  readonly queue: Pick<JobQueue, "send">;
}

export type EmailLinkJob = JobPayloads["auth.email_link"];

/** Always resolves to `{ status: "sent" }` unless the input is malformed or rate-limited. */
export async function requestEmailLink(
  db: Executor,
  request: EmailLinkRequest,
): Promise<{ readonly status: "sent" }> {
  const parsed = emailSchema.safeParse(request.email.trim());
  if (!parsed.success) {
    throw new AppError("validation_failed", { fieldErrors: { email: ["invalid_email"] } });
  }
  const email = parsed.data.toLowerCase();
  const now = request.now ?? new Date();
  await enforceRateLimit(db, "sign_in.ip", request.clientIp, { now });
  await enforceRateLimit(db, "sign_in.email", `${email} ${request.clientIp}`, { now });
  // The same single write for every address; the account is resolved off the request path.
  await request.queue.send(
    "auth.email_link",
    {
      email,
      accountKind: request.accountKind,
      returnTo: request.returnTo ?? null,
      locale: request.locale ?? "bg",
    },
    { db },
  );
  return { status: "sent" };
}

/**
 * Job handler: issues a link and queues its email when an active account has this address;
 * otherwise nothing is stored or sent. Idempotent enough for at-least-once delivery: a
 * duplicate job issues a second, equally valid link.
 */
export async function issueEmailLink(
  db: Executor,
  job: EmailLinkJob,
  options: { queue?: JobQueue; now?: Date } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const env = getEnv();
  const { email } = job;
  await db.transaction(async (tx) => {
    const table = job.accountKind === "staff" ? staffAccounts : clientAccounts;
    const [account] = await tx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(sql`lower(${table.email})`, email), eq(table.status, "active")));
    if (!account) return;

    const token = randomToken();
    const expiresAt = new Date(now.getTime() + emailLinkTtlMs);
    const [row] = await tx
      .insert(emailSignInTokens)
      .values({
        tokenHash: sha256Hex(token),
        purpose: "sign_in",
        accountKind: job.accountKind,
        email,
        returnTo: safeReturnPath(job.returnTo, env.appOrigin),
        createdAt: now,
        expiresAt,
      })
      .returning({ id: emailSignInTokens.id });
    if (!row) throw new Error("Sign-in token insert returned no row.");
    const link = new URL(emailLinkPath, env.canonicalOrigin);
    link.searchParams.set("token", token);
    await enqueueMessage(
      tx,
      {
        idempotencyKey: `email_link:${row.id}`,
        channel: "email",
        recipient: email,
        template: "auth.email_link",
        params: { locale: job.locale, expiresAt: expiresAt.toISOString() },
        secretParams: { url: link.toString() },
      },
      options.queue,
    );
  });
}

export type EmailLinkState = "valid" | "invalid" | "expired" | "consumed" | "revoked";

export interface EmailLinkInspection {
  readonly state: EmailLinkState;
  readonly accountKind?: AccountKind;
  readonly returnTo?: string | null;
}

/** Read-only: what the confirm page should show for this token. Never consumes it. */
export async function inspectEmailLink(
  db: Executor,
  token: string,
  now: Date = new Date(),
): Promise<EmailLinkInspection> {
  const [row] = await db
    .select()
    .from(emailSignInTokens)
    .where(eq(emailSignInTokens.tokenHash, sha256Hex(token)));
  if (row?.purpose !== "sign_in") return { state: "invalid" };
  if (row.revokedAt) return { state: "revoked" };
  if (row.consumedAt) return { state: "consumed" };
  if (now >= row.expiresAt) return { state: "expired" };
  return { state: "valid", accountKind: row.accountKind, returnTo: row.returnTo };
}

const linkErrors = {
  invalid: "link_invalid",
  expired: "link_expired",
  consumed: "link_consumed",
  revoked: "link_revoked",
} as const;

export interface ConsumedEmailLink extends IssuedSession {
  readonly returnTo: string | null;
}

/**
 * Consumes the token (explicit POST from the confirm page) and starts a session. Any session
 * the browser already had is ended, so a pre-set session id cannot survive sign-in.
 */
export async function consumeEmailLink(
  db: Executor,
  token: string,
  options: { now?: Date; currentSessionToken?: string; correlationId?: string } = {},
): Promise<ConsumedEmailLink> {
  const now = options.now ?? new Date();
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(emailSignInTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(emailSignInTokens.tokenHash, sha256Hex(token)),
          eq(emailSignInTokens.purpose, "sign_in"),
          isNull(emailSignInTokens.consumedAt),
          isNull(emailSignInTokens.revokedAt),
          gt(emailSignInTokens.expiresAt, now),
        ),
      )
      .returning();
    if (!row) return null;

    const table = row.accountKind === "staff" ? staffAccounts : clientAccounts;
    const [account] = await tx
      .select({ id: table.id })
      .from(table)
      .where(
        and(eq(sql`lower(${table.email})`, row.email.toLowerCase()), eq(table.status, "active")),
      );
    if (!account) throw new AppError("link_invalid");

    if (options.currentSessionToken) await revokeSession(tx, options.currentSessionToken, now);
    const issued = await createSession(tx, { kind: row.accountKind, id: account.id }, now);
    await recordAudit(tx, {
      action: "session.sign_in",
      actor: issued.session.actor,
      recordType: `${row.accountKind}_account`,
      recordId: account.id,
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      payload: { method: "email_link", sessionId: issued.session.id },
      at: now,
    });
    return { ...issued, returnTo: row.returnTo };
  });
  if (result) return result;
  const { state } = await inspectEmailLink(db, token, now);
  throw new AppError(state === "valid" ? "link_invalid" : linkErrors[state]);
}
