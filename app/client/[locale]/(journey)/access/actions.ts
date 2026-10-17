"use server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { isRoutableLocale } from "@/i18n/config";
import { setCeremony, takeCeremony } from "@/server/auth/ceremony";
import {
  currentClientSession,
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
import { AppError } from "@/server/errors";
import { action, setSessionCookie } from "@/server/http/next";

function clientLocale(value: unknown) {
  if (typeof value !== "string" || !isRoutableLocale(value)) throw new AppError("not_found");
  return value;
}
export async function beginClientPasskey() {
  return action(async ({ db }) => {
    await requireAuthHost("client");
    const options = await startPasskeyAuthentication(db, "client", {
      clientIp: await requestClientIp(),
    });
    await setCeremony("client", "authentication", options.challenge);
    return options;
  });
}
export async function completeClientPasskey(
  locale: string,
  returnTo: string | null,
  response: AuthenticationResponseJSON,
) {
  return action(async ({ db, correlationId }) => {
    const page = clientLocale(locale);
    const issued = await finishPasskeyAuthentication(db, "client", response, {
      expectedChallenge: await takeCeremony("client", "authentication"),
      currentSessionToken: await sessionTokenOf("client"),
      correlationId,
    });
    await setSessionCookie("client", issued.token, issued.session.expiresAt);
    return { next: localReturnPath(returnTo, "client", page) ?? `/${page}/access` };
  });
}
async function clientSession() {
  const session = await currentClientSession();
  if (!session) throw new AppError("unauthenticated");
  return session;
}
export async function beginClientRegistration() {
  return action(async ({ db }) => {
    const options = await startPasskeyRegistration(db, await clientSession());
    await setCeremony("client", "registration", options.challenge);
    return options;
  });
}
export async function completeClientRegistration(
  response: RegistrationResponseJSON,
  label: string,
) {
  return action(async ({ db, correlationId }) => {
    await finishPasskeyRegistration(db, await clientSession(), response, {
      expectedChallenge: await takeCeremony("client", "registration"),
      label,
      correlationId,
    });
    const token = await sessionTokenOf("client");
    const rotated = token ? await rotateSession(db, token) : null;
    if (!rotated) throw new AppError("unauthenticated");
    await setSessionCookie("client", rotated.token, rotated.session.expiresAt);
    return {};
  });
}
