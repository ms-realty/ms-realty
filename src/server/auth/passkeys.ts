// WebAuthn passkeys for staff (AD7) via @simplewebauthn/server. The relying party id and the
// expected origin come from configuration; challenges are stored server-side, expire after
// five minutes and are consumed by the first verification attempt, successful or not.
import "server-only";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { passkeys, staffAccounts, webauthnChallenges } from "@/db/schema";
import { recordAudit } from "../audit";
import { getEnv } from "../config/env";
import type { Executor } from "../db";
import { AppError } from "../errors";
import {
  createSession,
  type IssuedSession,
  requireFreshAuth,
  revokeSession,
  type Session,
} from "./sessions";

export const challengeTtlMs = 5 * 60_000;

type ChallengePurpose = "registration" | "authentication";

async function storeChallenge(
  db: Executor,
  challenge: string,
  purpose: ChallengePurpose,
  now: Date,
  staffAccountId?: string,
): Promise<void> {
  await db.insert(webauthnChallenges).values({
    challenge,
    purpose,
    staffAccountId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + challengeTtlMs),
  });
}

/** Marks a live challenge consumed; true only for the first caller within its lifetime. */
async function consumeChallenge(
  db: Executor,
  challenge: string,
  purpose: ChallengePurpose,
  now: Date,
  staffAccountId?: string,
): Promise<boolean> {
  const rows = await db
    .update(webauthnChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(webauthnChallenges.challenge, challenge),
        eq(webauthnChallenges.purpose, purpose),
        isNull(webauthnChallenges.consumedAt),
        gt(webauthnChallenges.expiresAt, now),
        ...(staffAccountId ? [eq(webauthnChallenges.staffAccountId, staffAccountId)] : []),
      ),
    )
    .returning({ id: webauthnChallenges.id });
  return rows.length === 1;
}

function requireStaff(session: Session): string {
  if (session.account.kind !== "staff") throw new AppError("forbidden");
  return session.account.id;
}

/** Options for adding a passkey to the signed-in staff account (needs a fresh verification). */
export async function startPasskeyRegistration(
  db: Executor,
  session: Session,
  now: Date = new Date(),
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const staffId = requireStaff(session);
  requireFreshAuth(session, now);
  const env = getEnv();
  const [account] = await db
    .select({ email: staffAccounts.email, displayName: staffAccounts.displayName })
    .from(staffAccounts)
    .where(eq(staffAccounts.id, staffId));
  if (!account) throw new AppError("unauthenticated");
  const existing = await db
    .select({ id: passkeys.credentialId, transports: passkeys.transports })
    .from(passkeys)
    .where(and(eq(passkeys.staffAccountId, staffId), isNull(passkeys.revokedAt)));
  const options = await generateRegistrationOptions({
    rpName: env.webauthn.rpName,
    rpID: env.webauthn.rpId,
    userName: account.email,
    userDisplayName: account.displayName,
    userID: new TextEncoder().encode(staffId),
    attestationType: "none",
    excludeCredentials: existing,
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await storeChallenge(db, options.challenge, "registration", now, staffId);
  return options;
}

/** Verifies the authenticator's answer and stores the new passkey. */
export async function finishPasskeyRegistration(
  db: Executor,
  session: Session,
  response: RegistrationResponseJSON,
  options: { label?: string; now?: Date; correlationId?: string } = {},
): Promise<{ readonly passkeyId: string }> {
  const staffId = requireStaff(session);
  const now = options.now ?? new Date();
  requireFreshAuth(session, now);
  const env = getEnv();
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: (challenge) =>
        consumeChallenge(db, challenge, "registration", now, staffId),
      expectedOrigin: env.appOrigin,
      expectedRPID: env.webauthn.rpId,
      requireUserVerification: true,
    });
  } catch (error) {
    throw new AppError("passkey_failed", { cause: error });
  }
  if (!verification.verified) throw new AppError("passkey_failed");
  const info = verification.registrationInfo;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(passkeys)
      .values({
        staffAccountId: staffId,
        credentialId: info.credential.id,
        publicKey: info.credential.publicKey,
        signCount: info.credential.counter,
        transports: info.credential.transports ?? [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        label: options.label,
        createdAt: now,
      })
      .returning({ id: passkeys.id });
    if (!row) throw new Error("Passkey insert returned no row.");
    await recordAudit(tx, {
      action: "passkey.register",
      actor: session.actor,
      recordType: "staff_account",
      recordId: staffId,
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      payload: { passkeyId: row.id, deviceType: info.credentialDeviceType },
      at: now,
    });
    return { passkeyId: row.id };
  });
}

/** Options for signing in with any discoverable staff passkey. */
export async function startPasskeyAuthentication(
  db: Executor,
  now: Date = new Date(),
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: getEnv().webauthn.rpId,
    userVerification: "required",
  });
  await storeChallenge(db, options.challenge, "authentication", now);
  return options;
}

/**
 * Verifies a passkey assertion and starts a staff session. Passing the current session token
 * replaces that session, which makes this the step-up verification for high-risk actions.
 */
export async function finishPasskeyAuthentication(
  db: Executor,
  response: AuthenticationResponseJSON,
  options: { now?: Date; currentSessionToken?: string; correlationId?: string } = {},
): Promise<IssuedSession> {
  const now = options.now ?? new Date();
  const env = getEnv();
  const [passkey] = await db
    .select({
      id: passkeys.id,
      credentialId: passkeys.credentialId,
      publicKey: passkeys.publicKey,
      signCount: passkeys.signCount,
      transports: passkeys.transports,
      staffAccountId: passkeys.staffAccountId,
      status: staffAccounts.status,
    })
    .from(passkeys)
    .innerJoin(staffAccounts, eq(staffAccounts.id, passkeys.staffAccountId))
    .where(and(eq(passkeys.credentialId, response.id), isNull(passkeys.revokedAt)));
  // One answer for unknown, revoked and inactive credentials alike.
  if (!passkey?.staffAccountId || passkey.status !== "active") throw new AppError("passkey_failed");
  const staffId = passkey.staffAccountId;

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (challenge) => consumeChallenge(db, challenge, "authentication", now),
      expectedOrigin: env.appOrigin,
      expectedRPID: env.webauthn.rpId,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.signCount,
        transports: passkey.transports,
      },
      requireUserVerification: true,
    });
  } catch (error) {
    throw new AppError("passkey_failed", { cause: error });
  }
  if (!verification.verified) throw new AppError("passkey_failed");

  return db.transaction(async (tx) => {
    await tx
      .update(passkeys)
      .set({ signCount: verification.authenticationInfo.newCounter, lastUsedAt: now })
      .where(eq(passkeys.id, passkey.id));
    if (options.currentSessionToken) await revokeSession(tx, options.currentSessionToken, now);
    const issued = await createSession(tx, { kind: "staff", id: staffId }, now);
    await recordAudit(tx, {
      action: "session.sign_in",
      actor: issued.session.actor,
      recordType: "staff_account",
      recordId: staffId,
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      payload: { method: "passkey", passkeyId: passkey.id, sessionId: issued.session.id },
      at: now,
    });
    return issued;
  });
}
