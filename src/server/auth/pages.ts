// Next.js adapters for the identity pages and every private page: read the host's session
// cookie, resolve where the request stands and redirect. Each private page calls its guard
// itself (layouts do not re-run on client navigation), and every action re-checks.
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getEnv } from "../config/env";
import type { PrivateHostContext } from "../config/hosts";
import { AppError } from "../errors";
import { clientIpFrom, hostContextOf } from "../http/request";
import { type StaffAccess, staffAccess } from "./access";
import { sessionCookieName } from "./cookies";
import { safeReturnPath } from "./email-link";
import { readSession, type Session } from "./sessions";

export async function sessionTokenOf(context: PrivateHostContext): Promise<string | undefined> {
  await requireAuthHost(context);
  return (await cookies()).get(sessionCookieName(getEnv(), context))?.value || undefined;
}

/** Action IDs are not an authorization boundary: recheck the addressed host on every call. */
export async function requireAuthHost(context: PrivateHostContext): Promise<void> {
  if (hostContextOf(await headers(), getEnv()) !== context) throw new AppError("not_found");
}

export async function requestClientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

/** Where the staff request stands. No cookie means no database round trip. */
export async function currentStaffAccess(): Promise<StaffAccess> {
  const token = await sessionTokenOf("staff");
  return token ? staffAccess(getDb(), token) : { state: "signed_out" };
}

/** The staff-host page for each state that is not `ready`. */
export function staffAccessPath(locale: string, state: StaffAccess["state"]): string {
  switch (state) {
    case "signed_out":
      return `/${locale}/access`;
    case "denied":
      return `/${locale}/access/denied`;
    case "enrolling":
      return `/${locale}/access/enrol`;
    case "ready":
      return `/${locale}/today`;
  }
}

/** Guard for every staff workspace page: an active member with two passkeys, or a redirect. */
export async function requireStaffPage(locale: string): Promise<Session> {
  const access = await currentStaffAccess();
  if (access.state !== "ready") redirect(staffAccessPath(locale, access.state));
  return access.session;
}

/** The signed-in client, or null. */
export async function currentClientSession(): Promise<Session | null> {
  const token = await sessionTokenOf("client");
  if (!token) return null;
  const session = await readSession(getDb(), token);
  return session?.account.kind === "client" ? session : null;
}

/**
 * A same-host return path inside the page's locale, or null. It is only where to go next:
 * the destination re-authorizes and never replays the action that needed sign-in.
 */
export function localReturnPath(
  value: string | null | undefined,
  context: PrivateHostContext,
  locale: string,
): string | null {
  const path = safeReturnPath(value, getEnv().hosts[context]);
  return path?.startsWith(`/${locale}/`) ? path : null;
}
