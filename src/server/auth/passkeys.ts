// WebAuthn passkeys (ADR 0002) via @simplewebauthn/server. Each private host is its own relying
// party: the staff host's rpID and origin are the staff origin, the client host's the client
// origin, so a credential made for one context can never answer the other (§8.1, AT36). Staff
// sign in only with a passkey and must hold two; for clients a passkey is optional. Challenges
// are stored server-side, expire after five minutes and are consumed by the first verification
// attempt, successful or not.
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
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { passkeys, principals, webauthnChallenges } from "@/db/schema";
import { recordAudit } from "../audit";
import { getEnv, type ServerEnv } from "../config/env";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { enforceRateLimit } from "../rate-limit";
import {
  type AccountKind,
  createSession,
  type IssuedSession,
  isFresh,
  revokeSession,
  type Session,
} from "./sessions";

export const challengeTtlMs = 5 * 60_000;
/** A staff member enrols a primary and a backup passkey before any staff route opens. */
export const staffPasskeyMinimum = 2;
/**
 * How long after redeeming an enrolment or recovery invitation the staff member may register
 * the missing passkeys without a further verification. Past it, a manager reissues.
 */
export const enrolmentWindowMs = 15 * 60_000;

type ChallengePurpose = "registration" | "authentication";

/** The WebAuthn relying party of a private host context. */
export function relyingParty(context: AccountKind, env: ServerEnv = getEnv()) {
  const origin = env.hosts[context];
  return { id: new URL(origin).hostname, origin, name: env.webauthn.rpName };
}

async function storeChallenge(
  db: Executor,
  challenge: string,
  purpose: ChallengePurpose,
  now: Date,
  principalId?: string,
): Promise<void> {
  await db.insert(webauthnChallenges).values({
    challenge,
    purpose,
    principalId,
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
  principalId?: string,
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
        ...(principalId ? [eq(webauthnChallenges.principalId, principalId)] : []),
      ),
    )
    .returning({ id: webauthnChallenges.id });
  return rows.length === 1;
}

/** Passkeys the principal can still sign in with. */
export async function countActivePasskeys(db: Executor, principalId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(passkeys)
    .where(and(eq(passkeys.principalId, principalId), isNull(passkeys.revokedAt)));
  return row?.n ?? 0;
}

/**
 * Adding a passkey is a sensitive action: the session must have verified within its step-up
 * window, except that a staff member still short of two passkeys may finish enrolling within
 * `enrolmentWindowMs` of redeeming the invitation.
 */
async function assertMayRegister(db: Executor, session: Session, now: Date): Promise<void> {
  if (isFresh(session, now)) return;
  if (
    session.account.kind === "staff" &&
    isFresh(session, now, enrolmentWindowMs) &&
    (await countActivePasskeys(db, session.account.id)) < staffPasskeyMinimum
  ) {
    return;
  }
  throw new AppError("step_up_required");
}

/** Options for adding a passkey to the signed-in account, in the session's own context. */
export async function startPasskeyRegistration(
  db: Executor,
  session: Session,
  now: Date = new Date(),
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  await assertMayRegister(db, session, now);
  const principalId = session.account.id;
  const rp = relyingParty(session.account.kind);
  const [account] = await db
    .select({ email: principals.email, displayName: principals.displayName })
    .from(principals)
    .where(eq(principals.id, principalId));
  if (!account) throw new AppError("unauthenticated");
  const existing = await db
    .select({ id: passkeys.credentialId, transports: passkeys.transports })
    .from(passkeys)
    .where(and(eq(passkeys.principalId, principalId), isNull(passkeys.revokedAt)));
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: account.email,
    userDisplayName: account.displayName,
    userID: new TextEncoder().encode(principalId),
    attestationType: "none",
    excludeCredentials: existing,
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await storeChallenge(db, options.challenge, "registration", now, principalId);
  return options;
}

/** Verifies the authenticator's answer and stores the new passkey. */
export async function finishPasskeyRegistration(
  db: Executor,
  session: Session,
  response: RegistrationResponseJSON,
  options: { label?: string; now?: Date; correlationId?: string } = {},
): Promise<{ readonly passkeyId: string; readonly activePasskeys: number }> {
  const now = options.now ?? new Date();
  await assertMayRegister(db, session, now);
  const principalId = session.account.id;
  const rp = relyingParty(session.account.kind);
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: (challenge) =>
        consumeChallenge(db, challenge, "registration", now, principalId),
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
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
        principalId,
        credentialId: info.credential.id,
        publicKey: info.credential.publicKey,
        signCount: info.credential.counter,
        transports: info.credential.transports ?? [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        label: options.label?.trim().slice(0, 80) || null,
        createdAt: now,
      })
      .returning({ id: passkeys.id });
    if (!row) throw new Error("Passkey insert returned no row.");
    await recordAudit(tx, {
      action: "passkey.register",
      actor: session.actor,
      recordType: "principal",
      recordId: principalId,
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      payload: { passkeyId: row.id, deviceType: info.credentialDeviceType },
      at: now,
    });
    return { passkeyId: row.id, activePasskeys: await countActivePasskeys(tx, principalId) };
  });
}

/** Options for signing in to a context with any of its discoverable passkeys. */
export async function startPasskeyAuthentication(
  db: Executor,
  context: AccountKind,
  options: { clientIp: string; now?: Date },
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const now = options.now ?? new Date();
  await enforceRateLimit(db, "passkey.ip", options.clientIp, { now });
  const authentication = await generateAuthenticationOptions({
    rpID: relyingParty(context).id,
    userVerification: "required",
  });
  await storeChallenge(db, authentication.challenge, "authentication", now);
  return authentication;
}

export interface PasskeyAuthenticationOptions {
  readonly now?: Date;
  /** The browser's current session on this host; it is ended, never carried over. */
  readonly currentSessionToken?: string;
  /** Step-up: the passkey must belong to this session's principal. */
  readonly reauthenticate?: Session;
  readonly correlationId?: string;
}

/**
 * Verifies a passkey assertion for `context` and starts a session there. With `reauthenticate`
 * it is the step-up verification: the same principal only, and the new session is fresh.
 */
export async function finishPasskeyAuthentication(
  db: Executor,
  context: AccountKind,
  response: AuthenticationResponseJSON,
  options: PasskeyAuthenticationOptions = {},
): Promise<IssuedSession> {
  const now = options.now ?? new Date();
  const rp = relyingParty(context);
  const [passkey] = await db
    .select({
      id: passkeys.id,
      credentialId: passkeys.credentialId,
      publicKey: passkeys.publicKey,
      signCount: passkeys.signCount,
      transports: passkeys.transports,
      principalId: passkeys.principalId,
      kind: principals.kind,
      status: principals.status,
    })
    .from(passkeys)
    .innerJoin(principals, eq(principals.id, passkeys.principalId))
    .where(and(eq(passkeys.credentialId, response.id), isNull(passkeys.revokedAt)));
  // One answer for unknown, revoked, other-context and inactive credentials alike.
  if (passkey?.kind !== context || passkey.status !== "active") {
    throw new AppError("passkey_failed");
  }
  if (options.reauthenticate && options.reauthenticate.account.id !== passkey.principalId) {
    throw new AppError("passkey_failed");
  }
  const principalId = passkey.principalId;

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (challenge) => consumeChallenge(db, challenge, "authentication", now),
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
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
    const issued = await createSession(tx, { kind: context, id: principalId }, now);
    await recordAudit(tx, {
      action: options.reauthenticate ? "session.reauthenticate" : "session.sign_in",
      actor: issued.session.actor,
      recordType: "principal",
      recordId: principalId,
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      payload: { method: "passkey", passkeyId: passkey.id, sessionId: issued.session.id },
      at: now,
    });
    return issued;
  });
}
