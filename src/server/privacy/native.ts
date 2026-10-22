import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, operations, sessions } from "@/db/schema";
import type { PublicLocale } from "@/domain/ids";
import { nativeAuthRoute } from "../auth/native";
import { currentClientSession, currentStaffAccess } from "../auth/pages";
import type { Session } from "../auth/sessions";
import { getEnv } from "../config/env";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { privacyOperator } from "./access";
import {
  changeSubscription,
  editSearchSubscription,
  optIn,
  saveContactPreferences,
} from "./preferences";
import {
  privacyQueuePath,
  privacyQueueQuery,
  reviewPrivacyRequest,
  submitPrivacyRequest,
} from "./requests";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const checked = (form: FormData, key: string) => form.get(key) === "yes";

export async function privateReceipt(db: Executor, session: Session, id: unknown) {
  if (!z.uuid().safeParse(id).success) return null;
  const [receipt] = await db
    .select({ id: operations.id, type: operations.operationType })
    .from(operations)
    .where(
      and(
        eq(operations.id, id as string),
        eq(operations.actorKind, session.actor.kind),
        eq(operations.actorId, session.actor.id),
        eq(operations.status, "succeeded"),
      ),
    );
  return receipt && /^(privacy|preferences)\./.test(receipt.type) ? receipt.id : null;
}

/** Only a verified same-principal step-up may hand a tab's draft to its successor session. */
export async function privacyReviewSessionKeys(db: Executor, session: Session): Promise<string[]> {
  const live = await privacyOperator(db, session);
  const keys = [live.id];
  let childId = live.id;
  while (true) {
    const edges = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "session.reauthenticate"),
          eq(auditEvents.actorKind, live.actor.kind),
          eq(auditEvents.actorId, live.actor.id),
          eq(auditEvents.recordType, "principal"),
          eq(auditEvents.recordId, live.account.id),
          sql`${auditEvents.payload}->>'sessionId' = ${childId}`,
        ),
      )
      .limit(2);
    if (!edges.length) return keys;
    const edge = edges[0];
    const proof = z
      .object({ method: z.literal("passkey"), passkeyId: z.uuid(), previousSessionId: z.uuid() })
      .safeParse(edge?.payload);
    if (
      edges.length !== 1 ||
      !edge ||
      !proof.success ||
      keys.includes(proof.data.previousSessionId)
    )
      return [live.id];
    const [child] = await db.select().from(sessions).where(eq(sessions.id, childId));
    const [parent] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, proof.data.previousSessionId));
    const at = edge.occurredAt.getTime();
    if (
      !child ||
      !parent ||
      child.principalKind !== live.account.kind ||
      child.principalId !== live.account.id ||
      parent.principalKind !== live.account.kind ||
      parent.principalId !== live.account.id ||
      parent.revokedAt?.getTime() !== at ||
      child.createdAt.getTime() !== at ||
      child.reverifiedAt?.getTime() !== at ||
      parent.createdAt.getTime() > at ||
      parent.expiresAt.getTime() !== child.expiresAt.getTime() ||
      parent.expiresAt.getTime() <= at
    )
      return [live.id];
    keys.push(parent.id);
    childId = parent.id;
  }
}

export type PrivacyReviewStatus = "absent" | "failed" | "succeeded" | "pending" | "unknown";

/** Exact own-key reconciliation; no receipt contents leave the current read authority. */
export async function reconcilePrivacyReview(
  db: Executor,
  session: Session,
  input: { id: string; operationId: string; version?: number },
): Promise<PrivacyReviewStatus> {
  const value = z
    .object({ id: z.uuid(), operationId: z.uuid(), version: z.int().positive().optional() })
    .parse(input);
  return db.transaction(async (tx) => {
    const live = await privacyOperator(tx, session, value.id);
    // The writer holds this same lock while its receipt is uncommitted. No visible row
    // without the lock is not evidence that the operation never reached the server.
    const lockKey = JSON.stringify([
      live.actor.kind,
      live.actor.id,
      "privacy.review",
      value.operationId,
    ]);
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as locked`,
    );
    if (!lock?.locked) return "pending";
    const [receipt] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.actorKind, live.actor.kind),
          eq(operations.actorId, live.actor.id),
          eq(operations.operationType, "privacy.review"),
          eq(operations.idempotencyKey, value.operationId),
        ),
      );
    if (!receipt) return "absent";
    const bound =
      receipt.resultType === "privacy_request" &&
      receipt.resultId === value.id &&
      value.version !== undefined &&
      receipt.expectedRevision === value.version;
    // Historical successful reviews predate subject/version binding, but their stored
    // result identifies the request. A legacy failure or uncertain result stays fenced.
    const legacySuccess =
      receipt.resultType === null &&
      receipt.resultId === null &&
      receipt.expectedRevision === null &&
      receipt.status === "succeeded" &&
      z.object({ id: z.literal(value.id) }).safeParse(receipt.outcome).success;
    if (!bound && !legacySuccess) return "unknown";
    if (receipt.status === "succeeded" || receipt.status === "failed") return receipt.status;
    return receipt.status === "outcome_unknown" ? "unknown" : "pending";
  });
}

export function privacyFormRoute(area: "privacy" | "preferences" | "operations/privacy") {
  const staff = area === "operations/privacy";
  const post = nativeAuthRoute(
    staff ? "staff" : "client",
    (locale) => `/${locale}/${area}`,
    async ({ db, form, locale }) => {
      const access = staff ? await currentStaffAccess() : null;
      const session = staff
        ? access?.state === "ready"
          ? access.session
          : null
        : await currentClientSession();
      if (!session) throw new AppError("unauthenticated");
      const intent = text(form, "intent");
      const envelope = {
        operationId: text(form, "operationId"),
        id: text(form, "id"),
        expectedVersion: Number(text(form, "expectedVersion")),
      };
      let result: { operationId: string };
      try {
        if (area === "privacy" && intent === "request")
          result = await submitPrivacyRequest(db, session, {
            operationId: envelope.operationId,
            kind: text(form, "kind"),
            description: text(form, "description"),
            confirmed: checked(form, "confirmed"),
          });
        else if (staff && intent === "review")
          result = await reviewPrivacyRequest(db, session, {
            ...envelope,
            to: text(form, "to"),
            responsibleId: text(form, "responsibleId"),
            policyReference: text(form, "policyReference"),
            dueAt: text(form, "dueAt")
              ? new Date(`${text(form, "dueAt")}T12:00:00.000Z`).toISOString()
              : null,
            identityReviewed: checked(form, "identityReviewed"),
            legalHoldReason: text(form, "legalHoldReason"),
            legalHoldDisposition: text(form, "legalHoldDisposition"),
            holdResolved: checked(form, "holdResolved"),
            completionEvidence: text(form, "completionEvidence"),
            rejectionReason: text(form, "rejectionReason"),
            confirmed: checked(form, "confirmed"),
          });
        else if (area === "preferences" && intent === "contact")
          result = await saveContactPreferences(db, session, {
            ...envelope,
            locale: text(form, "preferredLocale"),
            timezone: text(form, "timezone"),
            channel: text(form, "channel"),
            contactWindow: text(form, "contactWindow"),
          });
        else if (area === "preferences" && intent === "subscription")
          result = await changeSubscription(db, session, {
            ...envelope,
            state: text(form, "state"),
          });
        else if (area === "preferences" && intent === "edit_search")
          result = await editSearchSubscription(db, session, {
            ...envelope,
            locale,
            termsVersionId: text(form, "termsVersionId"),
            confirmed: checked(form, "confirmed"),
            timezone: text(form, "timezone"),
            frequency: text(form, "frequency"),
            purpose: text(form, "searchPurpose"),
            q: text(form, "q"),
            maxPrice: text(form, "maxPrice")
              ? Math.round(Number(text(form, "maxPrice")) * 100)
              : null,
          });
        else if (area === "preferences" && intent === "opt_in")
          result = await optIn(db, session, {
            operationId: envelope.operationId,
            contactMethodId: text(form, "contactMethodId"),
            purpose: text(form, "purpose"),
            locale: locale as PublicLocale,
            termsVersionId: text(form, "termsVersionId"),
            confirmed: checked(form, "confirmed"),
            timezone: text(form, "timezone"),
            frequency: text(form, "frequency") || "daily",
            search: {
              purpose: text(form, "searchPurpose") || "sale",
              q: text(form, "q"),
              ...(text(form, "maxPrice")
                ? {
                    price: {
                      currency: "EUR",
                      max: Math.round(Number(text(form, "maxPrice")) * 100),
                    },
                  }
                : {}),
            },
          });
        else throw new AppError("validation_failed");
      } catch (error) {
        if (isAppError(error) && error.code === "step_up_required")
          return `/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/${area}`)}`;
        throw error;
      }
      return `/${locale}/${area}?receipt=${result.operationId}`;
    },
  );
  if (!staff) return post;
  return async (request: Request, context: Parameters<typeof post>[1]) => {
    const response = await post(request, context);
    const location = response.headers.get("location");
    if (response.status !== 303 || !location) return response;
    const source = new URL(request.url);
    const after = source.searchParams.getAll("after"),
      before = source.searchParams.getAll("before");
    if (after.length > 1 || before.length > 1) return response;
    const query = {
      ...(after.length ? { after: after[0] } : {}),
      ...(before.length ? { before: before[0] } : {}),
    };
    if (!privacyQueueQuery.safeParse(query).success || !(query.after || query.before))
      return response;
    const { locale = "" } = await context.params;
    const path = privacyQueuePath(locale);
    const target = new URL(location);
    const origin = new URL(getEnv().hosts.staff).origin;
    if (target.origin !== origin) return response;
    const position = new URL(privacyQueuePath(locale, query), origin).searchParams;
    if (target.pathname === path) {
      for (const [key, value] of position) target.searchParams.set(key, value);
    } else if (target.pathname === `/${locale}/access/reauth`) {
      const returnTo = target.searchParams.get("returnTo");
      if (!returnTo) return response;
      const destination = new URL(returnTo, origin);
      if (destination.origin !== origin || destination.pathname !== path) return response;
      for (const [key, value] of position) destination.searchParams.set(key, value);
      target.searchParams.set("returnTo", destination.pathname + destination.search);
    } else return response;
    const headers = new Headers(response.headers);
    headers.set("location", target.toString());
    return new Response(response.body, { status: response.status, headers });
  };
}
