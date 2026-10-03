"use server";

// Staff access actions (O23 access variant, F13 staff variant). Every action re-reads the
// session from its cookie and re-checks; nothing is trusted from the page that called it.
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { staffAccess } from "@/server/auth/access";
import { acceptStaffInvitation } from "@/server/auth/invitations";
import {
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
  startPasskeyAuthentication,
  startPasskeyRegistration,
} from "@/server/auth/passkeys";
import { localReturnPath, requestClientIp, sessionTokenOf } from "@/server/auth/pages";
import type { Executor } from "@/server/db";
import { AppError } from "@/server/errors";
import { type ActionResult, action, setSessionCookie } from "@/server/http/next";

function staffLocale(value: unknown): string {
  if (typeof value !== "string" || !isStaffLocale(value)) throw new AppError("not_found");
  return value;
}

export async function beginStaffPasskey(): Promise<
  ActionResult<PublicKeyCredentialRequestOptionsJSON>
> {
  return action(async ({ db }) =>
    startPasskeyAuthentication(db, "staff", { clientIp: await requestClientIp() }),
  );
}

/** Sign-in; the workspace guard then sends the member to enrolment or denial if needed. */
export async function completeStaffPasskey(
  locale: string,
  response: AuthenticationResponseJSON,
): Promise<ActionResult<{ next: string }>> {
  return action(async ({ db, correlationId }) => {
    const page = staffLocale(locale);
    const issued = await finishPasskeyAuthentication(db, "staff", response, {
      currentSessionToken: await sessionTokenOf("staff"),
      correlationId,
    });
    await setSessionCookie("staff", issued.token, issued.session.expiresAt);
    return { next: `/${page}/today` };
  });
}

/** Step-up for a signed-in member: the same person, then back to the page to review again. */
export async function completeStaffReauthentication(
  locale: string,
  returnTo: string | null,
  response: AuthenticationResponseJSON,
): Promise<ActionResult<{ next: string }>> {
  return action(async ({ db, correlationId }) => {
    const page = staffLocale(locale);
    const token = await sessionTokenOf("staff");
    const access = await staffAccess(db, token);
    if (access.state !== "ready") throw new AppError("unauthenticated");
    const issued = await finishPasskeyAuthentication(db, "staff", response, {
      currentSessionToken: token,
      reauthenticate: access.session,
      correlationId,
    });
    await setSessionCookie("staff", issued.token, issued.session.expiresAt);
    return { next: localReturnPath(returnTo, "staff", page) ?? `/${page}/today` };
  });
}

async function enrollingSession(db: Executor) {
  const access = await staffAccess(db, await sessionTokenOf("staff"));
  if (access.state !== "enrolling" && access.state !== "ready") {
    throw new AppError("unauthenticated");
  }
  return access.session;
}

export async function beginStaffPasskeyRegistration(): Promise<
  ActionResult<PublicKeyCredentialCreationOptionsJSON>
> {
  return action(async ({ db }) => startPasskeyRegistration(db, await enrollingSession(db)));
}

export async function completeStaffPasskeyRegistration(
  response: RegistrationResponseJSON,
  label: string,
): Promise<ActionResult<Record<string, never>>> {
  return action(async ({ db, correlationId }) => {
    await finishPasskeyRegistration(db, await enrollingSession(db), response, {
      label,
      correlationId,
    });
    return {};
  });
}

/** The explicit POST that redeems a staff enrolment or recovery invitation. */
export async function acceptStaffInvitationAction(formData: FormData): Promise<void> {
  const locale = staffLocale(formData.get("locale"));
  const token = String(formData.get("token") ?? "");
  const result = await action(async ({ db, correlationId }) => {
    const issued = await acceptStaffInvitation(db, token, {
      clientIp: await requestClientIp(),
      currentSessionToken: await sessionTokenOf("staff"),
      correlationId,
    });
    await setSessionCookie("staff", issued.token, issued.session.expiresAt);
  });
  // The token never goes back into a URL; the page shows the outcome by its code.
  if (!result.ok) redirect(`/${locale}/access/invitation?error=${result.error.code}`);
  redirect(`/${locale}/access/enrol`);
}
