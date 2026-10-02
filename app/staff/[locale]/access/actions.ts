"use server";

// Staff access actions (O23 access variant, F13 staff variant). Every action re-reads the
// session from its cookie and re-checks; nothing is trusted from the page that called it.
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isStaffLocale } from "@/i18n/config";
import { staffAccess } from "@/server/auth/access";
import { setCeremony, takeCeremony } from "@/server/auth/ceremony";
import {
  localReturnPath,
  requestClientIp,
  requireAuthHost,
  sessionTokenOf,
} from "@/server/auth/pages";
import {
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
  startPasskeyAuthentication,
  startPasskeyRegistration,
} from "@/server/auth/passkeys";
import { rotateSession } from "@/server/auth/sessions";
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
  return action(async ({ db }) => {
    await requireAuthHost("staff");
    const options = await startPasskeyAuthentication(db, "staff", {
      clientIp: await requestClientIp(),
    });
    await setCeremony("staff", "authentication", options.challenge);
    return options;
  });
}

/** Sign-in; the workspace guard then sends the member to enrolment or denial if needed. */
export async function completeStaffPasskey(
  locale: string,
  response: AuthenticationResponseJSON,
): Promise<ActionResult<{ next: string }>> {
  return action(async ({ db, correlationId }) => {
    const page = staffLocale(locale);
    const issued = await finishPasskeyAuthentication(db, "staff", response, {
      expectedChallenge: await takeCeremony("staff", "authentication"),
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
      expectedChallenge: await takeCeremony("staff", "authentication"),
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
  return action(async ({ db }) => {
    const options = await startPasskeyRegistration(db, await enrollingSession(db));
    await setCeremony("staff", "registration", options.challenge);
    return options;
  });
}

export async function completeStaffPasskeyRegistration(
  response: RegistrationResponseJSON,
  label: string,
): Promise<ActionResult<Record<string, never>>> {
  return action(async ({ db, correlationId }) => {
    await finishPasskeyRegistration(db, await enrollingSession(db), response, {
      expectedChallenge: await takeCeremony("staff", "registration"),
      label,
      correlationId,
    });
    const token = await sessionTokenOf("staff");
    const rotated = token ? await rotateSession(db, token) : null;
    if (!rotated) throw new AppError("unauthenticated");
    await setSessionCookie("staff", rotated.token, rotated.session.expiresAt);
    return {};
  });
}
