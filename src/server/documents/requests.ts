// F15: staff request an exact client's evidence; transfer, scan and review remain separate.
import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  caseParticipants,
  cases,
  documentRequests,
  documents,
  documentVersions,
  grants,
  parties,
  principals,
  processPolicies,
  properties,
  tasks,
} from "@/db/schema";
import { documentClassifications, documentReviewTypes } from "@/domain/document";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import { caseFor, liveParticipation } from "../cases/shared";
import { activePolicy } from "../compliance/agreement-gate";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { documentAccess, fileSession } from "../files/access";
import { documentContentTypes } from "../files/inspect";
import { MAX_DOCUMENT_BYTES } from "../files/storage";
import { reserveUpload } from "../files/uploads";
import { expectVersion, type FileCommand, parseFileInput } from "../media/commands";
import { runOperation } from "../operations";
import { nextReference } from "../references";
import { reviewDocument, uploadInput } from "./commands";
import { assertRequestedDocumentAccess } from "./request-access";

const envelope = { operationId: z.string().min(16).max(160), expectedVersion: z.int().positive() };
const createSchema = z.object({
  ...envelope,
  caseId: z.uuid(),
  recipientParticipantId: z.uuid(),
  policyId: z.uuid(),
  title: z.string().trim().min(3).max(160),
  purpose: z.string().trim().min(5).max(1200),
  instructions: z.string().trim().min(5).max(4000),
  alternatives: z.string().trim().min(5).max(2000),
  classification: z.enum(documentClassifications),
  allowedContentTypes: z
    .array(z.enum(documentContentTypes))
    .min(1)
    .max(documentContentTypes.length),
  maxBytes: z.int().min(1).max(MAX_DOCUMENT_BYTES),
  expiresAt: z.iso.datetime(),
});
export type CreateDocumentRequestInput = z.input<typeof createSchema>;

async function staffCase(
  db: Executor,
  session: Session,
  caseId: string,
  grant = false,
  lock = false,
) {
  await fileSession(db, session, true);
  if (session.actor.kind !== "staff") throw new AppError("not_found");
  const { row } = await caseFor(db, session, caseId, grant ? "access.grant" : undefined, lock);
  if (
    !(await can(db, session.actor, "document.read_restricted", {
      type: "document",
      audience: "internal",
    }))
  )
    throw new AppError("not_found");
  return row;
}

export async function createDocumentRequest(
  db: Executor,
  session: Session,
  raw: CreateDocumentRequestInput,
) {
  const input = parseFileInput(createSchema, raw);
  await staffCase(db, session, input.caseId, true);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "document.request.create",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async ({ tx, operationId }) => {
      const record = await staffCase(tx, session, input.caseId, true, true);
      expectVersion(record.version, input.expectedVersion);
      if (record.disposition !== "active" || !record.ownerId)
        throw new AppError("transition_denied");
      const sensitive = ["identity", "financial", "contract", "title"].includes(
        input.classification,
      );
      if (
        sensitive &&
        ![
          "scope_authority_review",
          "assessment",
          "instructions_agreed",
          "preparing",
          "marketing",
          "proposal_preparation",
          "proposal_active",
          "proposal_coordination",
          "coordination",
          "completion_handover",
        ].includes(record.stage)
      )
        throw new AppError("transition_denied");
      if (
        sensitive &&
        !(await can(tx, session.actor, "compliance.review", {
          type: "case",
          id: record.id,
          audience: "internal",
        }))
      )
        throw new AppError("not_found");
      const now = new Date(),
        expiry = new Date(input.expiresAt);
      const policy = await activePolicy(tx, input.policyId, now);
      if (
        expiry <= now ||
        expiry > policy.validUntil ||
        expiry.getTime() - now.getTime() > 90 * 86400000 ||
        (record.kind !== "service_intake" &&
          policy.transaction !== (["tenant", "landlord"].includes(record.kind) ? "rent" : "sale"))
      )
        throw new AppError("validation_failed");
      if (record.propertyId) {
        const [property] = await tx
          .select()
          .from(properties)
          .where(eq(properties.id, record.propertyId));
        if (!property || property.country !== policy.country)
          throw new AppError("transition_denied");
      }
      const [recipient] = await tx
        .select({ participant: caseParticipants, principal: principals })
        .from(caseParticipants)
        .innerJoin(principals, eq(principals.partyId, caseParticipants.partyId))
        .where(
          and(
            eq(caseParticipants.id, input.recipientParticipantId),
            eq(caseParticipants.caseId, record.id),
            eq(principals.kind, "client"),
            eq(principals.status, "active"),
            liveParticipation(now),
          ),
        );
      if (
        !recipient ||
        (recipient.participant.role === "specialist" && !recipient.participant.expiresAt) ||
        (recipient.participant.expiresAt && expiry > recipient.participant.expiresAt) ||
        !(await can(tx, { kind: "client", id: recipient.principal.id }, "portal.document.upload", {
          type: "case",
          id: record.id,
          audience: "case_participants",
        }))
      )
        throw new AppError("not_found");
      const [document] = await tx
        .insert(documents)
        .values({
          reference: await nextReference(tx, "document"),
          caseId: record.id,
          purpose: "client_requested",
          classification: input.classification,
          audience: "case_participants",
          expiresAt: expiry,
          retentionClass: `process-policy:${policy.policyHash}`,
        })
        .returning();
      if (!document) throw new Error("Document request insert failed");
      const [grant] = await tx
        .insert(grants)
        .values({
          principalId: recipient.principal.id,
          capability: "portal.document.upload",
          recordType: "document",
          recordId: document.id,
          grantedById: session.actor.id,
          reason: input.purpose,
          expiresAt: expiry,
        })
        .returning();
      const [task] = await tx
        .insert(tasks)
        .values({
          caseId: record.id,
          ownerId: record.ownerId,
          title: input.title,
          type: "document_request",
          purpose: input.purpose,
          dueAt: expiry,
          dueTimezone: policy.timezone,
          state: "waiting",
          waitingOn: "Requested recipient evidence",
          followUpAt: expiry,
        })
        .returning();
      if (!grant || !task) throw new Error("Document request dependencies missing");
      const [request] = await tx
        .insert(documentRequests)
        .values({
          caseId: record.id,
          recipientId: recipient.principal.id,
          recipientParticipantId: recipient.participant.id,
          documentId: document.id,
          grantId: grant.id,
          taskId: task.id,
          policyId: policy.id,
          policyHash: policy.policyHash,
          title: input.title,
          purpose: input.purpose,
          instructions: input.instructions,
          alternatives: input.alternatives,
          allowedContentTypes: [...new Set(input.allowedContentTypes)],
          maxBytes: input.maxBytes,
          expiresAt: expiry,
          requestedById: session.actor.id,
        })
        .returning();
      if (!request) throw new Error("Document request insert failed");
      await tx
        .update(cases)
        .set({ version: record.version + 1 })
        .where(eq(cases.id, record.id));
      await recordAudit(tx, {
        actor: session.actor,
        action: "document.request.created",
        capability: "access.grant",
        recordType: "document_request",
        recordId: request.id,
        operationId,
        payload: {
          caseId: record.id,
          recipientId: recipient.principal.id,
          documentId: document.id,
          policyHash: policy.policyHash,
        },
      });
      return { id: request.id, documentId: document.id, version: request.version };
    },
  );
}

async function requestFor(
  db: Executor,
  session: Session,
  id: string,
  action: "read" | "upload" | "review" = "read",
  lock = false,
) {
  await fileSession(db, session, true);
  const [initial] = await db.select().from(documentRequests).where(eq(documentRequests.id, id));
  if (!initial) throw new AppError("not_found");
  if (lock)
    await db.select({ id: cases.id }).from(cases).where(eq(cases.id, initial.caseId)).for("update");
  const query = db.select().from(documentRequests).where(eq(documentRequests.id, id));
  const [request] = await (lock ? query.for("update") : query);
  if (!request) throw new AppError("not_found");
  if (session.actor.kind === "staff") await staffCase(db, session, request.caseId);
  else if (session.actor.kind !== "client") throw new AppError("not_found");
  await assertRequestedDocumentAccess(
    db,
    session,
    request.documentId,
    action === "read" && session.actor.kind === "client" ? "metadata" : action,
  );
  return request;
}

export async function startRequestedDocumentUpload(
  db: Executor,
  command: FileCommand & { requestId: string; input: unknown },
) {
  parseFileInput(
    z.object({
      operationId: z.string().min(16).max(160),
      expectedRevision: z.int().positive(),
      requestId: z.uuid(),
    }),
    command,
  );
  const input = parseFileInput(
    uploadInput.pick({ fileName: true, contentType: true, payloadIdentity: true }).extend({
      byteSize: z.int().min(1).max(MAX_DOCUMENT_BYTES),
    }),
    command.input,
  );
  if (command.session.actor.kind !== "client") throw new AppError("not_found");
  await requestFor(db, command.session, command.requestId, "upload");
  return runOperation(
    db,
    {
      actor: command.session.actor,
      type: "document.request.upload",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        requestId: command.requestId,
        expectedRevision: command.expectedRevision,
        input,
      }),
    },
    async ({ tx, operationId }) => {
      const request = await requestFor(tx, command.session, command.requestId, "upload", true);
      expectVersion(request.version, command.expectedRevision);
      if (
        input.byteSize > request.maxBytes ||
        !request.allowedContentTypes.includes(input.contentType)
      )
        throw new AppError("validation_failed");
      const [document] = await tx
        .select()
        .from(documents)
        .where(eq(documents.id, request.documentId))
        .for("update");
      if (!document) throw new AppError("not_found");
      const [current] = await tx
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentId, document.id),
            eq(documentVersions.versionNumber, document.currentVersionNumber),
          ),
        );
      if (
        current &&
        !["uploading", "selected", "needs_replacement", "rejected", "expired"].includes(
          current.state,
        )
      )
        throw new AppError("transition_denied");
      const stagingKey = `staging/${randomUUID()}`;
      const [file] = await tx
        .insert(documentVersions)
        .values({
          documentId: document.id,
          versionNumber: document.currentVersionNumber + 1,
          stagingKey,
          fileName: input.fileName,
          contentType: input.contentType,
          state: "uploading",
          uploadedByKind: "client",
          uploadedById: command.session.actor.id,
        })
        .returning();
      if (!file) throw new Error("Requested upload insert failed");
      await tx
        .update(documentVersions)
        .set({ state: "superseded", supersededByVersionId: file.id })
        .where(and(eq(documentVersions.documentId, document.id), ne(documentVersions.id, file.id)));
      await tx
        .update(documents)
        .set({ currentVersionNumber: file.versionNumber, version: document.version + 1 })
        .where(eq(documents.id, document.id));
      await tx
        .update(documentRequests)
        .set({ version: request.version + 1, reviewedVersionId: null, clientOutcome: null })
        .where(eq(documentRequests.id, request.id));
      const uploadId = await reserveUpload(
        tx,
        command.session.actor,
        "document",
        file.id,
        stagingKey,
      );
      await recordAudit(tx, {
        actor: command.session.actor,
        action: "document.request.upload.reserved",
        recordType: "document_request",
        recordId: request.id,
        operationId,
        payload: { versionId: file.id },
      });
      return {
        uploadId,
        documentId: document.id,
        versionId: file.id,
        requestVersion: request.version + 1,
      };
    },
  );
}

const reviewSchema = z.object({
  ...envelope,
  requestId: z.uuid(),
  versionId: z.uuid(),
  expectedRevision: z.int().positive(),
  reviewType: z.enum(documentReviewTypes),
  note: z.string().trim().min(5).max(4000),
  clientOutcome: z.string().trim().min(5).max(2000),
  confirmed: z.literal(true),
  expiresAt: z.iso.datetime().nullable(),
});
export async function reviewRequestedDocument(
  db: Executor,
  session: Session,
  raw: z.input<typeof reviewSchema>,
) {
  const input = parseFileInput(reviewSchema, raw);
  if (session.actor.kind !== "staff") throw new AppError("not_found");
  await requestFor(db, session, input.requestId, "review");
  await documentAccess(db, session, input.versionId, "review");
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "document.request.review",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async ({ tx, operationId }) => {
      const request = await requestFor(tx, session, input.requestId, "review", true);
      expectVersion(request.version, input.expectedVersion);
      const { document } = await documentAccess(tx, session, input.versionId, "review");
      if (document.id !== request.documentId) throw new AppError("not_found");
      if (input.expiresAt && new Date(input.expiresAt) > request.expiresAt)
        throw new AppError("validation_failed");
      await reviewDocument(tx, {
        session,
        requestId: request.id,
        versionId: input.versionId,
        operationId: `${input.operationId}:review`,
        expectedRevision: input.expectedRevision,
        input: {
          reviewType: input.reviewType,
          note: input.note,
          confirmed: true,
          expiresAt: input.expiresAt ?? request.expiresAt.toISOString(),
        },
      });
      await tx
        .update(documentRequests)
        .set({
          version: request.version + 1,
          reviewedVersionId: input.versionId,
          clientOutcome: input.clientOutcome,
        })
        .where(eq(documentRequests.id, request.id));
      const accepted = input.reviewType === "accepted_for_purpose";
      await tx
        .update(tasks)
        .set(
          accepted
            ? {
                state: "done",
                outcomeNote: input.clientOutcome,
                completedAt: new Date(),
                completedById: session.actor.id,
                version: sql`${tasks.version} + 1`,
              }
            : {
                state: "waiting",
                waitingOn: "Requested evidence needs follow-up",
                followUpAt: request.expiresAt,
                completedAt: null,
                completedById: null,
                outcomeNote: null,
                version: sql`${tasks.version} + 1`,
              },
        )
        .where(eq(tasks.id, request.taskId));
      await recordAudit(tx, {
        actor: session.actor,
        action: "document.request.reviewed",
        capability: "document.review",
        recordType: "document_request",
        recordId: request.id,
        operationId,
        payload: { versionId: input.versionId, reviewType: input.reviewType },
      });
      return { id: request.id, version: request.version + 1 };
    },
  );
}

const cancelSchema = z.object({
  ...envelope,
  requestId: z.uuid(),
  clientOutcome: z.string().trim().min(5).max(2000),
});
export async function cancelDocumentRequest(
  db: Executor,
  session: Session,
  raw: z.input<typeof cancelSchema>,
) {
  const input = parseFileInput(cancelSchema, raw);
  const current = await requestFor(db, session, input.requestId);
  await staffCase(db, session, current.caseId, true);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "document.request.cancel",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async ({ tx, operationId }) => {
      const request = await requestFor(tx, session, input.requestId, "read", true);
      await staffCase(tx, session, request.caseId, true);
      expectVersion(request.version, input.expectedVersion);
      if (request.cancelledAt) throw new AppError("transition_denied");
      const now = new Date();
      await tx
        .update(documentRequests)
        .set({
          cancelledAt: now,
          cancelledById: session.actor.id,
          clientOutcome: input.clientOutcome,
          version: request.version + 1,
        })
        .where(eq(documentRequests.id, request.id));
      await tx
        .update(grants)
        .set({ revokedAt: now, revokedById: session.actor.id })
        .where(eq(grants.id, request.grantId));
      await tx
        .update(tasks)
        .set({
          state: "cancelled",
          cancelReason: input.clientOutcome,
          version: sql`${tasks.version} + 1`,
        })
        .where(and(eq(tasks.id, request.taskId), ne(tasks.state, "done")));
      await recordAudit(tx, {
        actor: session.actor,
        action: "document.request.cancelled",
        capability: "access.grant",
        recordType: "document_request",
        recordId: request.id,
        operationId,
      });
      return { id: request.id, version: request.version + 1 };
    },
  );
}

async function projectRequest(
  db: Executor,
  session: Session,
  request: typeof documentRequests.$inferSelect,
) {
  const [document] = await db.select().from(documents).where(eq(documents.id, request.documentId));
  if (!document) throw new AppError("not_found");
  const [file] = await db
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.documentId, document.id),
        eq(documentVersions.versionNumber, document.currentVersionNumber),
      ),
    );
  const [recipient] = await db
    .select({ name: principals.displayName })
    .from(principals)
    .where(eq(principals.id, request.recipientId));
  let canUpload =
    session.actor.kind === "client" &&
    (!file ||
      ["selected", "uploading", "needs_replacement", "rejected", "expired"].includes(file.state));
  if (canUpload) {
    try {
      await assertRequestedDocumentAccess(db, session, document.id, "upload");
    } catch (error) {
      if (!isAppError(error)) throw error;
      canUpload = false;
    }
  }
  let canReview =
    session.actor.kind === "staff" &&
    !request.cancelledAt &&
    request.expiresAt > new Date() &&
    !!file &&
    ["ready_for_review", "reviewed"].includes(file.state) &&
    (await can(db, session.actor, "document.review", {
      type: "document",
      id: document.id,
      audience: document.audience,
    }));
  if (canReview) {
    try {
      await assertRequestedDocumentAccess(db, session, document.id, "review");
    } catch (error) {
      if (!isAppError(error)) throw error;
      canReview = false;
    }
  }
  const visibleFile =
    session.actor.kind === "staff" || (!request.cancelledAt && request.expiresAt > new Date());
  return {
    id: request.id,
    version: request.version,
    caseId: request.caseId,
    documentId: document.id,
    reference: document.reference,
    classification: document.classification,
    recipientName: recipient?.name ?? "",
    title: request.title,
    purpose: request.purpose,
    instructions: request.instructions,
    alternatives: request.alternatives,
    allowedContentTypes: request.allowedContentTypes,
    maxBytes: request.maxBytes,
    expiresAt: request.expiresAt,
    cancelledAt: request.cancelledAt,
    clientOutcome: request.clientOutcome,
    canUpload,
    canReview,
    file:
      file && visibleFile
        ? {
            id: file.id,
            version: file.version,
            number: file.versionNumber,
            fileName: file.fileName,
            state: file.state,
            scan: file.scan,
            byteSize: file.byteSize,
            reviewType: file.reviewType,
            professionalValidation: file.professionalValidation,
          }
        : null,
  };
}

export async function documentRequestWorkbench(
  db: Executor,
  session: Session,
  filter: { caseId?: string; id?: string } = {},
) {
  if (
    (filter.id && !z.uuid().safeParse(filter.id).success) ||
    (filter.caseId && !z.uuid().safeParse(filter.caseId).success)
  )
    throw new AppError("not_found");
  await fileSession(db, session, true);
  const isStaff = session.actor.kind === "staff";
  const record = isStaff && filter.caseId ? await staffCase(db, session, filter.caseId) : null;
  if (isStaff && !record && !filter.id) throw new AppError("not_found");
  const rows = await db
    .select()
    .from(documentRequests)
    .where(
      and(
        isStaff ? undefined : eq(documentRequests.recipientId, session.account.id),
        filter.caseId ? eq(documentRequests.caseId, filter.caseId) : undefined,
        filter.id ? eq(documentRequests.id, filter.id) : undefined,
      ),
    )
    .orderBy(desc(documentRequests.createdAt))
    .limit(100);
  const requests: Awaited<ReturnType<typeof projectRequest>>[] = [];
  for (const row of rows) {
    try {
      await requestFor(db, session, row.id);
      requests.push(await projectRequest(db, session, row));
    } catch (error) {
      if (filter.id || !isAppError(error) || error.code !== "not_found") throw error;
    }
  }
  if (filter.id && !requests.length) throw new AppError("not_found");
  const recipients = record
    ? await db
        .select({
          id: caseParticipants.id,
          name: parties.displayName,
          role: caseParticipants.role,
          expiresAt: caseParticipants.expiresAt,
        })
        .from(caseParticipants)
        .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
        .where(and(eq(caseParticipants.caseId, record.id), liveParticipation()))
    : [];
  const policies = record
    ? await db
        .select({
          id: processPolicies.id,
          title: processPolicies.title,
          country: processPolicies.country,
          transaction: processPolicies.transaction,
          validUntil: processPolicies.validUntil,
        })
        .from(processPolicies)
        .where(and(isNull(processPolicies.revokedAt), gt(processPolicies.validUntil, new Date())))
        .orderBy(desc(processPolicies.createdAt))
        .limit(100)
    : [];
  const canCreate =
    !!record &&
    record.disposition === "active" &&
    (await can(db, session.actor, "access.grant", { type: "case", id: record.id }));
  return {
    case: record ? { id: record.id, reference: record.reference, version: record.version } : null,
    requests,
    recipients,
    policies,
    canCreate,
  };
}
