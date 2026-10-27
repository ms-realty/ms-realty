// AT45/UX23: actual local application decisions. There is no independent archive adapter here.
import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  consentEvents,
  contactMethods,
  emailSignInTokens,
  externalActions,
  grants,
  invitations,
  parties,
  passkeys,
  personalSavedListings,
  principals,
  privacyExports,
  privacyProcessingRestrictions,
  privacyPropagationEvents,
  privacySafetyDecisions,
  savedSelectionTransfers,
  sessions,
  subscriptions,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import {
  emptySafetyDigest,
  type PrivacyPropagationBoundary,
  type PrivacyPropagationState,
  type PrivacySafetyEffect,
  type SafetyTailEntry,
} from "@/domain/privacy-erasure";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";

/** Globally ordered append; allocation rolls back with the decision, so there are no gaps. */
export async function lockPrivacySafetyLedger(db: Executor) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('privacy-safety-ledger-v1',0))`,
  );
}
export async function privacySafetyHead(db: Executor) {
  const [row] = await db
    .select()
    .from(privacySafetyDecisions)
    .orderBy(desc(privacySafetyDecisions.sequence))
    .limit(1);
  return { sequence: row?.sequence ?? 0, digest: row?.digest ?? emptySafetyDigest };
}
export function safetyEntryDigest(entry: Omit<SafetyTailEntry, "digest">) {
  return hashRequest(entry);
}
export async function appendPrivacySafetyDecision(
  db: Executor,
  input: {
    operationId: string;
    partyId: string;
    requestId: string | null;
    requestHash: string;
    review: unknown;
    effect: PrivacySafetyEffect;
  },
) {
  await lockPrivacySafetyLedger(db);
  const head = await privacySafetyHead(db);
  const fields = {
    ...input,
    sequence: head.sequence + 1,
    id: randomUUID(),
    previousDigest: head.digest,
    recordedAt: new Date().toISOString(),
  };
  if (fields.sequence > Number.MAX_SAFE_INTEGER) throw new AppError("unavailable");
  const entry: SafetyTailEntry = { ...fields, digest: safetyEntryDigest(fields) };
  await db
    .insert(privacySafetyDecisions)
    .values({ ...entry, recordedAt: new Date(entry.recordedAt) });
  return entry;
}

export async function recordPrivacyPropagation(
  db: Executor,
  sequence: number,
  boundary: PrivacyPropagationBoundary,
  state: PrivacyPropagationState,
  evidence: unknown,
) {
  await db
    .insert(privacyPropagationEvents)
    .values({ decisionSequence: sequence, boundary, state, evidence });
}

/** No provider call, file delete, business-row deletion, Case cancellation or automatic regrant. */
export async function applyPrivacySafetyEffect(
  db: Executor,
  effect: PrivacySafetyEffect,
  sequence: number,
  actor: Actor,
) {
  const now = new Date();
  const selectedSubscriptions =
    effect.kind === "subscription_withdrawal_v1"
      ? and(
          eq(subscriptions.partyId, effect.partyId),
          inArray(subscriptions.id, effect.subscriptionIds),
        )
      : and(
          eq(subscriptions.partyId, effect.partyId),
          inArray(subscriptions.purpose, effect.purposes),
        );
  const withdrawn = await db
    .update(subscriptions)
    .set({ state: "withdrawn", version: sql`${subscriptions.version} + 1`, updatedAt: now })
    .where(and(selectedSubscriptions, ne(subscriptions.state, "withdrawn")))
    .returning({ id: subscriptions.id, policyVersion: subscriptions.policyVersion });
  if (withdrawn.length)
    await db.insert(consentEvents).values(
      withdrawn.map((row) => ({
        subscriptionId: row.id,
        kind: "withdrawn" as const,
        policyVersion: row.policyVersion,
        source: `privacy_safety:${sequence}`,
        actorKind: actor.kind,
        actorId: actor.id,
      })),
    );
  if (effect.kind === "subscription_withdrawal_v1") return { withdrawn: withdrawn.length };

  await db
    .insert(privacyProcessingRestrictions)
    .values(
      [...effect.purposes, "client_access"].map((purpose) => ({
        partyId: effect.partyId,
        purpose,
        decisionSequence: sequence,
      })),
    )
    .onConflictDoNothing();
  // Re-resolve every identity by immutable ID AND party AND client kind. A linked staff
  // identity or another party is never an applicable client credential.
  const clients = effect.clientIds.length
    ? await db
        .select({ id: principals.id })
        .from(principals)
        .where(
          and(
            inArray(principals.id, effect.clientIds),
            eq(principals.partyId, effect.partyId),
            eq(principals.kind, "client"),
          ),
        )
    : [];
  const ids = clients.map((row) => row.id);
  let revokedSessions = 0;
  let authEmailsCancelled = 0;
  if (ids.length) {
    await db
      .update(principals)
      .set({ status: "suspended", version: sql`${principals.version} + 1`, updatedAt: now })
      .where(and(inArray(principals.id, ids), eq(principals.status, "active")));
    const ended = await db
      .update(sessions)
      .set({ revokedAt: now })
      .where(
        and(
          inArray(sessions.principalId, ids),
          eq(sessions.principalKind, "client"),
          isNull(sessions.revokedAt),
        ),
      )
      .returning({ id: sessions.id });
    revokedSessions = ended.length;
    await db
      .update(emailSignInTokens)
      .set({ revokedAt: now })
      .where(
        and(
          inArray(emailSignInTokens.principalId, ids),
          eq(emailSignInTokens.principalKind, "client"),
          isNull(emailSignInTokens.revokedAt),
          isNull(emailSignInTokens.consumedAt),
        ),
      );
    const credentials = await db
      .select({ id: emailSignInTokens.id })
      .from(emailSignInTokens)
      .where(
        and(
          inArray(emailSignInTokens.principalId, ids),
          eq(emailSignInTokens.principalKind, "client"),
        ),
      );
    if (credentials.length) {
      const cancelled = await db
        .update(externalActions)
        .set({
          state: "cancelled",
          secretPayload: null,
          lastErrorCode: "auth_email_link_ineligible",
          updatedAt: now,
          version: sql`${externalActions.version} + 1`,
        })
        .where(
          and(
            eq(externalActions.kind, "email_send"),
            eq(externalActions.state, "queued"),
            sql`(${externalActions.effectKey} in (${sql.join(
              credentials.map((credential) => sql`${`email_link:${credential.id}`}`),
              sql`,`,
            )} )
            or (${externalActions.subjectType} = 'email_sign_in_token' and ${externalActions.subjectId} in (${sql.join(
              credentials.map((credential) => sql`${credential.id}::uuid`),
              sql`,`,
            )})))`,
          ),
        )
        .returning({ id: externalActions.id });
      authEmailsCancelled = cancelled.length;
    }
    await db
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          inArray(invitations.principalId, ids),
          eq(invitations.kind, "client_access"),
          isNull(invitations.revokedAt),
          isNull(invitations.acceptedAt),
          isNull(invitations.declinedAt),
        ),
      );
    await db
      .update(passkeys)
      .set({ revokedAt: now })
      .where(and(inArray(passkeys.principalId, ids), isNull(passkeys.revokedAt)));
    await db
      .update(grants)
      .set({ revokedAt: now, version: sql`${grants.version} + 1`, updatedAt: now })
      .where(and(inArray(grants.principalId, ids), isNull(grants.revokedAt)));
  }
  const exports = await db
    .update(privacyExports)
    .set({
      state: "revoked",
      revokedAt: now,
      version: sql`${privacyExports.version} + 1`,
      updatedAt: now,
    })
    .where(and(eq(privacyExports.partyId, effect.partyId), ne(privacyExports.state, "revoked")))
    .returning({ id: privacyExports.id });
  if (effect.erasePreferences || effect.eraseAliases)
    await db
      .update(parties)
      .set({
        ...(effect.erasePreferences ? { contactPreferences: {} } : {}),
        ...(effect.eraseAliases ? { matchingAliases: [] } : {}),
        version: sql`${parties.version} + 1`,
        updatedAt: now,
      })
      .where(eq(parties.id, effect.partyId));
  for (const id of effect.contactIds)
    await db
      .update(contactMethods)
      .set({
        value: `${id}@erased.invalid`,
        normalizedValue: `erased:${id}`,
        verification: "unverified",
        verifiedAt: null,
        lastFailureAt: null,
        version: sql`${contactMethods.version} + 1`,
        updatedAt: now,
      })
      .where(and(eq(contactMethods.id, id), eq(contactMethods.partyId, effect.partyId)));
  for (const id of effect.clientProfileIds.filter((id) => ids.includes(id)))
    await db
      .update(principals)
      .set({
        email: `${id}@erased.invalid`,
        displayName: "[restricted client]",
        version: sql`${principals.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(principals.id, id),
          eq(principals.partyId, effect.partyId),
          eq(principals.kind, "client"),
        ),
      );
  if (ids.length && effect.personalSavedIds?.length)
    await db
      .delete(personalSavedListings)
      .where(
        and(
          inArray(personalSavedListings.id, effect.personalSavedIds),
          inArray(personalSavedListings.principalId, ids),
        ),
      );
  if (ids.length && effect.savedTransferIds?.length)
    await db
      .delete(savedSelectionTransfers)
      .where(
        and(
          inArray(savedSelectionTransfers.id, effect.savedTransferIds),
          inArray(savedSelectionTransfers.consumedById, ids),
        ),
      );
  if (effect.searchSubscriptionIds.length)
    await db
      .update(subscriptions)
      .set({
        criteria: {},
        criteriaSummary: null,
        version: sql`${subscriptions.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(subscriptions.partyId, effect.partyId),
          eq(subscriptions.purpose, "search_alerts"),
          inArray(subscriptions.id, effect.searchSubscriptionIds),
          eq(subscriptions.state, "withdrawn"),
        ),
      );
  return {
    withdrawn: withdrawn.length,
    clientCredentialsRestricted: ids.length,
    revokedSessions,
    authEmailsCancelled,
    exportsRevoked: exports.length,
    physicalFileDeletion: false,
    providerDeletion: false,
  };
}

/** A purpose withdrawal is itself a safety decision, even while archival custody is pending. */
export async function recordSubscriptionWithdrawal(
  db: Executor,
  input: {
    operationId: string;
    partyId: string;
    subscriptionId: string;
    actor: Actor;
  },
) {
  const effect: PrivacySafetyEffect = {
    kind: "subscription_withdrawal_v1",
    partyId: input.partyId,
    subscriptionIds: [input.subscriptionId],
  };
  const entry = await appendPrivacySafetyDecision(db, {
    operationId: input.operationId,
    partyId: input.partyId,
    requestId: null,
    requestHash: hashRequest(effect),
    review: { kind: "own_purpose_withdrawal_v1" },
    effect,
  });
  await recordPrivacyPropagation(db, entry.sequence, "application", "applied", {
    subscriptionId: input.subscriptionId,
  });
  await recordPrivacyPropagation(db, entry.sequence, "independent_archive", "held", {
    reason: "independent_archive_not_implemented",
  });
  return entry;
}
