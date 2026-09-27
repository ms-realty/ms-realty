// Where a staff-host request stands (F13 staff variant, O23): no staff route or staff API
// works until the session belongs to an active member holding two passkeys. Framework-neutral;
// pages.ts adapts it to Next.js pages and actions.
import "server-only";
import type { Executor } from "../db";
import { countActivePasskeys, staffPasskeyMinimum } from "./passkeys";
import { resolveSession, type Session } from "./sessions";

export type StaffAccess =
  | { readonly state: "signed_out" }
  /** Signed in, but without an active membership: the non-enumerating access-denied screen. */
  | { readonly state: "denied"; readonly session: Session }
  /** A member still short of two passkeys: only enrolment is open. */
  | { readonly state: "enrolling"; readonly session: Session; readonly passkeys: number }
  | { readonly state: "ready"; readonly session: Session; readonly passkeys: number };

export async function staffAccess(
  db: Executor,
  token: string | undefined,
  now: Date = new Date(),
): Promise<StaffAccess> {
  const resolved = token ? await resolveSession(db, token, now) : null;
  if (resolved?.session.account.kind !== "staff") return { state: "signed_out" };
  const { session } = resolved;
  if (resolved.access === "denied") return { state: "denied", session };
  const passkeys = await countActivePasskeys(db, session.account.id);
  return passkeys < staffPasskeyMinimum
    ? { state: "enrolling", session, passkeys }
    : { state: "ready", session, passkeys };
}
