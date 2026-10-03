// Server-side sessions (AD7): the browser holds an opaque 32-byte token; the database holds only
// its SHA-256. Sessions end on idle timeout, absolute lifetime, revocation or a deactivated
// account, and are rotated whenever the holder's privileges change.
import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { principals, sessions, staffMemberships } from "@/db/schema";
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

/**
 * Session limits (§8.1), enforced locally on every request: staff 12 h absolute / 30 min idle,
 * clients 7 d absolute / 24 h idle. Step-up: sensitive staff actions (access grants, exports,
 * production controls) need a verification at most 5 minutes old, client document actions at
 * most 15 minutes.
 */
export const sessionPolicy = {
  staff: { idleMs: 30 * minute, absoluteMs: 12 * hour, stepUpMs: 5 * minute },
  client: { idleMs: 24 * hour, absoluteMs: 7 * day, stepUpMs: 15 * minute },
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
  const kind = row.principalKind;
  const id = row.principalId;
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
      principalKind: account.kind,
      principalId: account.id,
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

/**
 * Whether the principal may use its context now: an active principal of that kind, and for
 * staff an active membership (§8.1). Checked on every request, so a local suspension or an
 * ended membership applies to the next one.
 */
async function accountIsActive(db: Executor, account: AccountRef): Promise<boolean> {
  const [row] = await db
    .select({
      kind: principals.kind,
      status: principals.status,
      membership: staffMemberships.state,
    })
    .from(principals)
    .leftJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(eq(principals.id, account.id));
  if (row?.status !== "active" || row.kind !== account.kind) return false;
  return account.kind === "client" || row.membership === "active";
}

async function findLiveRow(db: Executor, token: string, now: Date): Promise<SessionRow | null> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, sha256Hex(token)), isNull(sessions.revokedAt)));
  if (!row) return null;
  const idleMs = sessionPolicy[row.principalKind].idleMs;
  if (now >= row.expiresAt || now.getTime() - row.lastSeenAt.getTime() >= idleMs) return null;
  return row;
}

export interface ResolvedSession {
  readonly session: Session;
  /** `denied`: signed in, but the principal is inactive or (staff) has no active membership. */
  readonly access: "active" | "denied";
}

/**
 * The live session behind a cookie token, whether or not its principal may use the context.
 * Only an `active` one is ever touched (idle timer) or used as an actor; a `denied` one exists
 * so the staff host can show the access-denied screen instead of a sign-in loop.
 */
export async function resolveSession(
  db: Executor,
  token: string,
  now: Date = new Date(),
): Promise<ResolvedSession | null> {
  const row = await findLiveRow(db, token, now);
  if (!row) return null;
  const session = toSession(row);
  if (!(await accountIsActive(db, session.account))) return { session, access: "denied" };
  if (now.getTime() - row.lastSeenAt.getTime() >= sessionPolicy.touchIntervalMs) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
    return { session: { ...session, lastSeenAt: now }, access: "active" };
  }
  return { session, access: "active" };
}

/** The session for a cookie token, or null when unknown, ended or the account is inactive. */
export async function readSession(
  db: Executor,
  token: string,
  now: Date = new Date(),
): Promise<Session | null> {
  const resolved = await resolveSession(db, token, now);
  return resolved?.access === "active" ? resolved.session : null;
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
  const rows = await db
    .update(sessions)
    .set({ revokedAt: options.now ?? new Date() })
    .where(
      and(
        eq(sessions.principalId, account.id),
        isNull(sessions.revokedAt),
        ...(options.exceptSessionId ? [ne(sessions.id, options.exceptSessionId)] : []),
      ),
    )
    .returning({ id: sessions.id });
  return rows.length;
}

/** Whether the session's last verification is recent enough for a sensitive action. */
export function isFresh(
  session: Session,
  now: Date = new Date(),
  maxAgeMs: number = sessionPolicy[session.account.kind].stepUpMs,
): boolean {
  return Boolean(
    session.reverifiedAt && now.getTime() - session.reverifiedAt.getTime() <= maxAgeMs,
  );
}

/**
 * Throws `step_up_required` unless the session verified within its context's step-up window
 * (staff 5 min, client 15 min). After reauthentication the caller shows the action again; it
 * is never replayed automatically (§11.4).
 */
export function requireFreshAuth(
  session: Session,
  now: Date = new Date(),
  maxAgeMs: number = sessionPolicy[session.account.kind].stepUpMs,
): void {
  if (!isFresh(session, now, maxAgeMs)) throw new AppError("step_up_required");
}
