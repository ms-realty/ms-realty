// Privacy work is a human-reviewed record. No transition deletes data, exports records,
// overrides legal holds or sends customer content to a provider/model.
import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { parties, principals, privacyRequests, staffMemberships } from "@/db/schema";
import {
  guardPrivacyRequestTransition,
  privacyRequestKinds,
  privacyRequestMachine,
  privacyRequestStates,
} from "@/domain/privacy";
import { recordAudit } from "../audit";
import { countActivePasskeys } from "../auth/passkeys";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import { hasPrivacyRetentionHold } from "../compliance/retention";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { nextReference } from "../references";
import { parseInput } from "../work/shared";
import { privacyClient, privacyOperator } from "./access";

const envelope = { operationId: z.uuid(), id: z.uuid(), expectedVersion: z.int().positive() };
export async function privacyOwners(db: Executor) {
  const staff = await db
    .select({ id: principals.id, name: principals.displayName })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(
      and(
        eq(principals.kind, "staff"),
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
      ),
    )
    .orderBy(asc(principals.id));
  const owners = [];
  for (const person of staff)
    if (
      (await can(db, { kind: "staff", id: person.id }, "privacy.manage")) &&
      (await countActivePasskeys(db, person.id)) >= 2
    )
      owners.push(person);
  return owners;
}

export async function submitPrivacyRequest(db: Executor, session: Session, input: unknown) {
  const value = parseInput(
    z.object({
      operationId: z.uuid(),
      kind: z.enum(privacyRequestKinds),
      description: z.string().trim().min(10).max(4000),
      confirmed: z.literal(true),
    }),
    input,
  );
  const { person } = await privacyClient(db, session);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.request",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
    },
    async ({ tx, operationId }) => {
      await privacyClient(tx, session);
      const [owner] = await privacyOwners(tx);
      if (!owner)
        throw new AppError("unavailable", {
          detail: "No accountable privacy operator is available",
        });
      const [record] = await tx
        .insert(privacyRequests)
        .values({
          reference: await nextReference(tx, "privacy_request"),
          kind: value.kind,
          partyId: person.partyId,
          responsibleId: owner.id,
          verifiedAt: new Date(),
          verificationMethod: "recent_client_session",
          scope: {
            description: value.description,
            dueCondition: "awaiting_human_assessment",
            policyReference: null,
          },
        })
        .returning();
      if (!record) throw new Error("Privacy request insert failed");
      await recordAudit(tx, {
        actor: session.actor,
        action: "privacy.request.received",
        recordType: "privacy_request",
        recordId: record.id,
        operationId,
        payload: {
          kind: record.kind,
          responsibleId: owner.id,
          dueCondition: "awaiting_human_assessment",
        },
      });
      return { id: record.id, reference: record.reference, state: record.state };
    },
  );
}

const scopeOf = (scope: unknown) =>
  z
    .object({
      description: z.string().default(""),
      dueCondition: z.string().default("awaiting_human_assessment"),
      policyReference: z.string().nullable().default(null),
    })
    .passthrough()
    .parse(scope);
export async function clientPrivacyRequests(db: Executor, session: Session) {
  const { person } = await privacyClient(db, session);
  const rows = await db
    .select({ record: privacyRequests, ownerName: principals.displayName })
    .from(privacyRequests)
    .leftJoin(principals, eq(principals.id, privacyRequests.responsibleId))
    .where(eq(privacyRequests.partyId, person.partyId))
    .orderBy(desc(privacyRequests.createdAt));
  return rows.map(({ record, ownerName }) => ({
    id: record.id,
    reference: record.reference,
    kind: record.kind,
    state: record.state,
    description: scopeOf(record.scope).description,
    dueCondition: scopeOf(record.scope).dueCondition,
    dueAt: record.dueAt,
    ownerName,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
  }));
}

export const privacyQueuePageSize = 25;
const cursorValue = z.object({ createdAt: z.iso.datetime(), id: z.uuid() }).strict();
const cursor = z
  .string()
  .min(1)
  .max(256)
  .transform((value, ctx) => {
    try {
      return cursorValue.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid privacy queue position" });
      return z.NEVER;
    }
  });
export const privacyQueueQuery = z
  .object({ after: cursor.optional(), before: cursor.optional() })
  .refine((value) => !(value.after && value.before), "Choose one queue direction");
export type PrivacyQueueQuery = { after?: string; before?: string };

/** Queue positions are navigation only; they grant no authority and never replay a review. */
export function privacyQueuePath(locale: string, query: PrivacyQueueQuery = {}) {
  privacyQueueQuery.parse(query);
  const position = new URLSearchParams();
  if (query.after) position.set("after", query.after);
  if (query.before) position.set("before", query.before);
  return `/${locale}/operations/privacy${position.size ? `?${position}` : ""}`;
}

/** A queue cursor uses immutable creation time and keeps PostgreSQL microseconds. */
const queueCursor = (row: { record: { id: string }; position: string }) =>
  Buffer.from(JSON.stringify({ createdAt: row.position, id: row.record.id })).toString("base64url");

export async function listStaffPrivacyRequests(
  db: Executor,
  session: Session,
  query: PrivacyQueueQuery = {},
) {
  // Check live authority before parsing the position or reading any page.
  await privacyOperator(db, session);
  const parsed = parseInput(privacyQueueQuery, query);
  const boundary = parsed.after ?? parsed.before;
  const backwards = Boolean(parsed.before);
  const fetched = await db
    .select({
      record: privacyRequests,
      partyName: parties.displayName,
      ownerName: principals.displayName,
      position: sql<string>`to_char(${privacyRequests.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(privacyRequests)
    .leftJoin(parties, eq(parties.id, privacyRequests.partyId))
    .leftJoin(principals, eq(principals.id, privacyRequests.responsibleId))
    .where(
      boundary
        ? backwards
          ? sql`(${privacyRequests.createdAt}, ${privacyRequests.id}) > (${boundary.createdAt}::timestamptz, ${boundary.id}::uuid)`
          : sql`(${privacyRequests.createdAt}, ${privacyRequests.id}) < (${boundary.createdAt}::timestamptz, ${boundary.id}::uuid)`
        : undefined,
    )
    .orderBy(
      backwards ? asc(privacyRequests.createdAt) : desc(privacyRequests.createdAt),
      backwards ? asc(privacyRequests.id) : desc(privacyRequests.id),
    )
    .limit(privacyQueuePageSize + 1);
  const hasMore = fetched.length > privacyQueuePageSize;
  const rows = fetched.slice(0, privacyQueuePageSize);
  if (backwards) rows.reverse();
  const first = rows[0],
    last = rows.at(-1);
  return {
    rows,
    previous: query.after
      ? first
        ? queueCursor(first)
        : query.after
      : backwards && hasMore && first
        ? queueCursor(first)
        : null,
    next: query.before
      ? last
        ? queueCursor(last)
        : query.before
      : hasMore && last
        ? queueCursor(last)
        : null,
  };
}

export async function reviewPrivacyRequest(db: Executor, session: Session, input: unknown) {
  const value = parseInput(
    z.object({
      ...envelope,
      to: z.enum(privacyRequestStates),
      responsibleId: z.uuid(),
      policyReference: z.string().trim().max(500),
      dueAt: z.iso.datetime().nullable(),
      identityReviewed: z.boolean(),
      legalHoldReason: z.string().trim().max(2000),
      legalHoldDisposition: z.string().trim().max(2000),
      holdResolved: z.boolean(),
      completionEvidence: z.string().trim().max(4000),
      rejectionReason: z.string().trim().max(2000),
      confirmed: z.literal(true),
    }),
    input,
  );
  await privacyOperator(db, session, value.id);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.review",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
    },
    async ({ tx, operationId }) => {
      await privacyOperator(tx, session, value.id);
      const [record] = await tx
        .select()
        .from(privacyRequests)
        .where(eq(privacyRequests.id, value.id))
        .for("update");
      if (!record) throw new AppError("not_found");
      if (record.version !== value.expectedVersion) throw new AppError("version_conflict");
      if (!(await privacyOwners(tx)).some((owner) => owner.id === value.responsibleId))
        throw new AppError("forbidden");
      if (privacyRequestMachine.check(record.state, value.to).outcome !== "allowed")
        throw new AppError("transition_denied");
      const verified = value.identityReviewed ? new Date() : record.verifiedAt;
      const due = value.dueAt ? new Date(value.dueAt) : record.dueAt;
      const policyReference = value.policyReference || scopeOf(record.scope).policyReference;
      if (
        ["in_progress", "on_legal_hold", "completed"].includes(value.to) &&
        (!due || !policyReference || policyReference.length < 5 || !value.identityReviewed)
      )
        throw new AppError("validation_failed");
      if (value.to === "in_progress" && due && due <= new Date())
        throw new AppError("validation_failed");
      if (
        record.state === "on_legal_hold" &&
        ["in_progress", "completed"].includes(value.to) &&
        (!value.holdResolved || value.legalHoldDisposition.length < 10)
      )
        throw new AppError("transition_denied");
      if (
        value.to === "completed" &&
        (value.completionEvidence.length < 10 || value.legalHoldDisposition.length < 10)
      )
        throw new AppError("validation_failed");
      if (value.to === "on_legal_hold" && value.legalHoldReason.length < 10)
        throw new AppError("validation_failed");
      // This boolean intentionally conceals the source of a retention obligation.
      // Human acknowledgement cannot override current server-side retention evidence.
      if (
        record.partyId &&
        ((["deletion", "restriction"].includes(record.kind) && value.to === "completed") ||
          (record.state === "on_legal_hold" && ["in_progress", "completed"].includes(value.to))) &&
        (await hasPrivacyRetentionHold(tx, record.partyId))
      )
        throw new AppError("transition_denied");
      const decision = guardPrivacyRequestTransition(
        record.state,
        value.to,
        {
          verifiedAt: verified?.toISOString(),
          responsiblePrincipalId: value.responsibleId,
          legalHoldReason: value.legalHoldReason,
          legalHoldDisposition: value.legalHoldDisposition,
          completionEvidence: value.completionEvidence,
          reason: value.rejectionReason,
        },
        session.actor,
      );
      if (decision.outcome !== "allowed") throw new AppError("transition_denied");
      await tx
        .update(privacyRequests)
        .set({
          state: value.to,
          version: record.version + 1,
          updatedAt: new Date(),
          responsibleId: value.responsibleId,
          dueAt: due,
          verifiedAt: verified,
          verificationMethod: value.identityReviewed
            ? "human_review_of_verified_client_request"
            : record.verificationMethod,
          scope: {
            ...scopeOf(record.scope),
            dueCondition: due ? "reviewed_due_date" : "awaiting_human_assessment",
            policyReference,
          },
          legalHoldReason: value.legalHoldReason || record.legalHoldReason,
          legalHoldDisposition: value.legalHoldDisposition || record.legalHoldDisposition,
          completionEvidence:
            value.to === "completed" ? value.completionEvidence : record.completionEvidence,
          completedAt: value.to === "completed" ? new Date() : null,
          rejectionReason: value.to === "rejected" ? value.rejectionReason : null,
        })
        .where(eq(privacyRequests.id, record.id));
      await recordAudit(tx, {
        actor: session.actor,
        action: "privacy.request.reviewed",
        capability: "privacy.manage",
        recordType: "privacy_request",
        recordId: record.id,
        operationId,
        payload: {
          from: record.state,
          to: value.to,
          responsibleId: value.responsibleId,
          dueAt: due?.toISOString() ?? null,
          policyReference,
          holdResolved: value.holdResolved,
          completionEvidence: value.completionEvidence || null,
        },
      });
      return { id: record.id, reference: record.reference, state: value.to };
    },
  );
}
