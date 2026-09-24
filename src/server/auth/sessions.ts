// Server-side sessions (AD7): the browser holds an opaque 32-byte token; the database holds only
// its SHA-256. Sessions end on idle timeout, absolute lifetime, revocation or a deactivated
// account, and are rotated whenever the holder's privileges change.
import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { clientAccounts, sessions, staffAccounts } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { randomToken, sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";

export type AccountKind = "staff" | "client";

export interface AccountRef {
  readonly kind: AccountKind;
  readonly id: string;
}

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

export const sessionPolicy = {
  staff: { idleMs: 2 * hour, absoluteMs: 12 * hour },
  client: { idleMs: 7 * day, absoluteMs: 30 * day },
  /** High-risk actions need a verification (sign-in or step-up) at most this old. */
  stepUpMaxAgeMs: 10 * minute,
  /** last_seen_at is refreshed at most this often, to keep reads cheap. */
  touchIntervalMs: minute,
} as const;

export interface Session {
  readonly id: string;
  readonly account: AccountRef;
  readonly actor: Actor;
  readonly createdAt: Date;
  /** Absolute end of the session. */
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly reverifiedAt: Date | null;
}

export interface IssuedSession {
  /** The cookie value. Shown once; only its hash is stored. */
  readonly token: string;
  readonly session: Session;
}

type SessionRow = typeof sessions.$inferSelect;

function toSession(row: SessionRow): Session {
  const kind = row.accountKind;
  const id = (kind === "staff" ? row.staffAccountId : row.clientAccountId) as string;
  return {
    id: row.id,
    account: { kind, id },
    actor: { kind, id },
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastSeenAt: row.lastSeenAt,
    reverifiedAt: row.reverifiedAt,
  };
}

async function insertSession(
  db: Executor,
  account: AccountRef,
  now: Date,
  expiresAt: Date,
  reverifiedAt: Date | null,
): Promise<IssuedSession> {
  const token = randomToken();
  const [row] = await db
    .insert(sessions)
    .values({
      tokenHash: sha256Hex(token),
      accountKind: account.kind,
      staffAccountId: account.kind === "staff" ? account.id : null,
      clientAccountId: account.kind === "client" ? account.id : null,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      reverifiedAt,
    })
    .returning();
  if (!row) throw new Error("Session insert returned no row.");
  return { token, session: toSession(row) };
}

/** Starts a session after a completed verification (email link or passkey). */
export function createSession(
  db: Executor,
  account: AccountRef,
  now: Date = new Date(),
): Promise<IssuedSession> {
  const expiresAt = new Date(now.getTime() + sessionPolicy[account.kind].absoluteMs);
  return insertSession(db, account, now, expiresAt, now);
}

async function accountIsActive(db: Executor, account: AccountRef): Promise<boolean> {
  const table = account.kind === "staff" ? staffAccounts : clientAccounts;
  const [row] = await db
    .select({ status: table.status })
    .from(table)
    .where(eq(table.id, account.id));
  return row?.status === "active";
}

async function findLiveRow(db: Executor, token: string, now: Date): Promise<SessionRow | null> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, sha256Hex(token)), isNull(sessions.revokedAt)));
  if (!row) return null;
  const idleMs = sessionPolicy[row.accountKind].idleMs;
  if (now >= row.expiresAt || now.getTime() - row.lastSeenAt.getTime() >= idleMs) return null;
  return row;
}

/** The session for a cookie token, or null when unknown, ended or the account is inactive. */
export async function readSession(
  db: Executor,
  token: string,
  now: Date = new Date(),
): Promise<Session | null> {
  const row = await findLiveRow(db, token, now);
  if (!row) return null;
  const session = toSession(row);
  if (!(await accountIsActive(db, session.account))) return null;
  if (now.getTime() - row.lastSeenAt.getTime() >= sessionPolicy.touchIntervalMs) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
    return { ...session, lastSeenAt: now };
  }
  return session;
}

/**
 * Replaces the session behind `token` with a new token, keeping its absolute expiry. Call it
 * whenever the holder's privileges change; pass `reverified` after a step-up verification.
 * Returns null when the old session is no longer live.
 */
export async function rotateSession(
  db: Executor,
  token: string,
  options: { now?: Date; reverified?: boolean } = {},
): Promise<IssuedSession | null> {
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const row = await findLiveRow(tx, token, now);
    if (!row) return null;
    const revoked = await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.id, row.id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    // A concurrent rotation already replaced it; the loser gets nothing.
    if (revoked.length !== 1) return null;
    const { account } = toSession(row);
    return insertSession(
      tx,
      account,
      now,
      row.expiresAt,
      options.reverified ? now : row.reverifiedAt,
    );
  });
}

/** Ends one session (sign-out). */
export async function revokeSession(
  db: Executor,
  token: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.tokenHash, sha256Hex(token)), isNull(sessions.revokedAt)));
}

/** Ends every session of an account, optionally keeping the caller's own. */
export async function revokeAllSessions(
  db: Executor,
  account: AccountRef,
  options: { exceptSessionId?: string; now?: Date } = {},
): Promise<number> {
  const accountColumn =
    account.kind === "staff" ? sessions.staffAccountId : sessions.clientAccountId;
  const rows = await db
    .update(sessions)
    .set({ revokedAt: options.now ?? new Date() })
    .where(
      and(
        eq(accountColumn, account.id),
        isNull(sessions.revokedAt),
        ...(options.exceptSessionId ? [ne(sessions.id, options.exceptSessionId)] : []),
      ),
    )
    .returning({ id: sessions.id });
  return rows.length;
}

/** Throws `step_up_required` unless the session verified recently enough for a risky action. */
export function requireFreshAuth(
  session: Session,
  now: Date = new Date(),
  maxAgeMs: number = sessionPolicy.stepUpMaxAgeMs,
): void {
  if (!session.reverifiedAt || now.getTime() - session.reverifiedAt.getTime() > maxAgeMs) {
    throw new AppError("step_up_required");
  }
}
