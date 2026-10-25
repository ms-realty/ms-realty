// C18/O26 · AT43/AT45/UX23. Only allowlisted person data; never a raw relational dump.
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import {
  consentEvents,
  contactMethods,
  inquiries,
  interestFeedback,
  messages,
  operations,
  parties,
  principals,
  privacyExports,
  privacyRequests,
  subscriptions,
} from "@/db/schema";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { getEnv } from "../config/env";
import { hashRequest, sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { fileServices } from "../files/config";
import type { FileDownload } from "../files/download";
import type { FileStorage } from "../files/storage";
import { runOperation } from "../operations";
import { parseInput } from "../work/shared";
import { privacyClient, privacyOperator } from "./access";
import {
  collectDisclosureSupplement,
  type DisclosureSupplement,
  verifyDeliveredSupplement,
} from "./export-supplements";

export const exportSections = ["requests", "inquiries", "messages", "feedback"] as const;
const redaction = z.object({ section: z.enum(exportSections), id: z.uuid() }).strict();
const envelope = {
  operationId: z.uuid(),
  requestId: z.uuid(),
  expectedVersion: z.int().positive(),
};
const maxRows = 2000;
const maxBytes = 1024 * 1024;
const key = () => createHash("sha256").update(`privacy-export:v1:${getEnv().authSecret}`).digest();
type Binding = { id: string; requestId: string; partyId: string; recipientId: string };
const aad = (b: Binding) => Buffer.from(`C18:${b.id}:${b.requestId}:${b.partyId}:${b.recipientId}`);

// Same authenticated-encryption contract as retained private filters, purpose-separated and
// bound to this subject/recipient/request. No key, plaintext or bearer download token is stored.
export function sealPrivacyExport(binding: Binding, text: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(binding));
  const bytes = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url");
}
export function openPrivacyExport(binding: Binding, encrypted: string): string {
  try {
    const bytes = Buffer.from(encrypted, "base64url");
    const cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    cipher.setAAD(aad(binding));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
  } catch {
    throw new AppError("not_found");
  }
}
function bounded<T>(rows: T[]): T[] {
  if (rows.length > maxRows) throw new AppError("validation_failed");
  return rows;
}
function ownPreferences(value: unknown) {
  const parsed = z
    .object({
      timezone: z.string().optional(),
      channel: z.string().optional(),
      contactWindow: z.string().optional(),
    })
    .safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** Restricted compliance, staff notes, recipient lists, credentials and raw join payloads are
 * deliberately never read. Joint records/files stay pending separate disclosure review. */
async function collectPersonDossier(db: Executor, partyId: string) {
  const [party] = await db
    .select({
      displayName: parties.displayName,
      givenName: parties.givenName,
      familyName: parties.familyName,
      country: parties.country,
      preferredLocale: parties.preferredLocale,
      contactPreferences: parties.contactPreferences,
    })
    .from(parties)
    .where(and(eq(parties.id, partyId), eq(parties.kind, "person")));
  if (!party) throw new AppError("not_found");
  const accounts = bounded(
    await db
      .select({
        id: principals.id,
        email: principals.email,
        displayName: principals.displayName,
        preferredLocale: principals.preferredLocale,
      })
      .from(principals)
      .where(and(eq(principals.partyId, partyId), eq(principals.kind, "client")))
      .orderBy(asc(principals.id))
      .limit(maxRows + 1),
  );
  if (!accounts.length) throw new AppError("not_found");
  const accountIds = accounts.map((a) => a.id);
  const contacts = bounded(
    await db
      .select({
        id: contactMethods.id,
        kind: contactMethods.kind,
        value: contactMethods.value,
        verification: contactMethods.verification,
        verifiedAt: contactMethods.verifiedAt,
      })
      .from(contactMethods)
      .where(eq(contactMethods.partyId, partyId))
      .orderBy(asc(contactMethods.id))
      .limit(maxRows + 1),
  );
  const choices = bounded(
    await db
      .select({
        id: subscriptions.id,
        purpose: subscriptions.purpose,
        state: subscriptions.state,
        frequency: subscriptions.frequency,
        timezone: subscriptions.timezone,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .innerJoin(contactMethods, eq(contactMethods.id, subscriptions.contactMethodId))
      .where(eq(contactMethods.partyId, partyId))
      .orderBy(asc(subscriptions.id))
      .limit(maxRows + 1),
  );
  const consent = choices.length
    ? bounded(
        await db
          .select({
            kind: consentEvents.kind,
            policyVersion: consentEvents.policyVersion,
            templateVersion: consentEvents.templateVersion,
            recordedAt: consentEvents.recordedAt,
          })
          .from(consentEvents)
          .where(
            inArray(
              consentEvents.subscriptionId,
              choices.map((c) => c.id),
            ),
          )
          .orderBy(asc(consentEvents.id))
          .limit(maxRows + 1),
      )
    : [];
  const requestRows = bounded(
    await db
      .select({
        id: privacyRequests.id,
        reference: privacyRequests.reference,
        kind: privacyRequests.kind,
        state: privacyRequests.state,
        scope: privacyRequests.scope,
        createdAt: privacyRequests.createdAt,
      })
      .from(privacyRequests)
      .where(eq(privacyRequests.partyId, partyId))
      .orderBy(asc(privacyRequests.id))
      .limit(maxRows + 1),
  );
  const ownInquiries = bounded(
    await db
      .select({
        id: inquiries.id,
        reference: inquiries.reference,
        purpose: inquiries.purpose,
        state: inquiries.state,
        text: inquiries.message,
        createdAt: inquiries.createdAt,
      })
      .from(inquiries)
      .where(eq(inquiries.partyId, partyId))
      .orderBy(asc(inquiries.id))
      .limit(maxRows + 1),
  );
  const ownMessages = bounded(
    await db
      .select({
        id: messages.id,
        channel: messages.channel,
        text: messages.body,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.authorKind, "client"),
          inArray(messages.authorId, accountIds),
          ne(messages.kind, "internal_note"),
          ne(messages.audience, "internal"),
        ),
      )
      .orderBy(asc(messages.id))
      .limit(maxRows + 1),
  );
  const ownFeedback = bounded(
    await db
      .select({
        id: interestFeedback.id,
        text: interestFeedback.feedback,
        createdAt: interestFeedback.createdAt,
      })
      .from(interestFeedback)
      .where(
        and(
          eq(interestFeedback.authorKind, "client"),
          inArray(interestFeedback.authorId, accountIds),
        ),
      )
      .orderBy(asc(interestFeedback.id))
      .limit(maxRows + 1),
  );
  return {
    person: { ...party, contactPreferences: ownPreferences(party.contactPreferences) },
    accounts: accounts.map(({ id: _id, ...account }) => account),
    contacts,
    preferences: choices,
    consent,
    requests: requestRows.map(({ scope, ...request }) => ({
      ...request,
      text: z.object({ description: z.string().default("") }).parse(scope).description,
    })),
    inquiries: ownInquiries,
    messages: ownMessages,
    feedback: ownFeedback,
  };
}
type PersonDossier = Awaited<ReturnType<typeof collectPersonDossier>>;
export interface PrivacyDossier {
  format: "ms-realty-person-export-v1";
  requestReference: string;
  asOf: string;
  sourceDigest: string;
  fulfilment: "partial";
  data: PersonDossier;
  redactedText: { section: (typeof exportSections)[number]; id: string }[];
  supplements: DisclosureSupplement[];
  omissions: { category: string; disposition: string }[];
}
function encode(dossier: PrivacyDossier) {
  const text = `${JSON.stringify(dossier, null, 2)}\n`;
  const byteSize = Buffer.byteLength(text);
  if (byteSize > maxBytes) throw new AppError("validation_failed");
  return { text, byteSize, sha256: sha256Hex(text) };
}
async function eligibleRequest(
  db: Executor,
  session: Session,
  requestId: string,
  version?: number,
) {
  await privacyOperator(db, session, requestId);
  const [request] = await db
    .select()
    .from(privacyRequests)
    .where(eq(privacyRequests.id, requestId))
    .for("update");
  if (!request?.partyId || request.kind !== "export" || request.state !== "in_progress")
    throw new AppError("not_found");
  if (version !== undefined && request.version !== version) throw new AppError("version_conflict");
  if (
    !request.verifiedAt ||
    !request.responsibleId ||
    !request.dueAt ||
    !z.object({ policyReference: z.string().min(5) }).safeParse(request.scope).success
  )
    throw new AppError("validation_failed");
  return request;
}
async function recipient(db: Executor, id: string, partyId: string) {
  const [person] = await db
    .select({ id: principals.id })
    .from(principals)
    .where(
      and(
        eq(principals.id, id),
        eq(principals.partyId, partyId),
        eq(principals.kind, "client"),
        eq(principals.status, "active"),
      ),
    );
  if (!person) throw new AppError("not_found");
}
function payload(row: typeof privacyExports.$inferSelect): PrivacyDossier {
  const text = openPrivacyExport(row, row.encryptedPayload);
  if (sha256Hex(text) !== row.sha256 || Buffer.byteLength(text) !== row.byteSize)
    throw new AppError("not_found");
  return JSON.parse(text) as PrivacyDossier;
}

export async function preparePrivacyExport(db: Executor, session: Session, input: unknown) {
  const value = parseInput(
    z.object({ ...envelope, recipientId: z.uuid(), confirmed: z.literal(true) }),
    input,
  );
  await privacyOperator(db, session, value.requestId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.export.prepare",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
      expectedVersion: value.expectedVersion,
      subject: { type: "privacy_request", id: value.requestId },
    },
    async ({ tx, operationId }) => {
      const request = await eligibleRequest(tx, session, value.requestId, value.expectedVersion);
      const partyId = request.partyId as string;
      await recipient(tx, value.recipientId, partyId);
      const data = await collectPersonDossier(tx, partyId);
      const dossier: PrivacyDossier = {
        format: "ms-realty-person-export-v1",
        requestReference: request.reference,
        asOf: new Date().toISOString(),
        sourceDigest: hashRequest(JSON.parse(JSON.stringify(data))),
        fulfilment: "partial",
        data,
        redactedText: [],
        supplements: [],
        omissions: [
          {
            category: "joint_records_and_received_communications",
            disposition: "pending_separate_person_and_disclosure_review",
          },
          {
            category: "private_files",
            disposition: "pending_file_selection_and_other_party_redaction",
          },
          {
            category: "restricted_material_and_security_credentials",
            disposition: "excluded_no_record_identities_or_counts_disclosed",
          },
        ],
      };
      const encoded = encode(dossier),
        id = randomUUID(),
        binding = { id, requestId: request.id, partyId, recipientId: value.recipientId };
      await tx.insert(privacyExports).values({
        ...binding,
        requestVersion: request.version,
        encryptedPayload: sealPrivacyExport(binding, encoded.text),
        sha256: encoded.sha256,
        byteSize: encoded.byteSize,
        preparedById: session.actor.id,
      });
      await recordAudit(tx, {
        actor: session.actor,
        action: "privacy.export.prepared",
        capability: "privacy.manage",
        recordType: "privacy_request",
        recordId: request.id,
        operationId,
        payload: { exportId: id, sha256: encoded.sha256, coverage: "partial" },
      });
      return { id, sha256: encoded.sha256, fulfilment: "partial" as const };
    },
  );
}

export async function redactPrivacyExport(db: Executor, session: Session, input: unknown) {
  const value = parseInput(
    z.object({
      ...envelope,
      exportId: z.uuid(),
      exportVersion: z.int().positive(),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      omitTexts: z.array(redaction).min(1).max(maxRows),
    }),
    input,
  );
  await privacyOperator(db, session, value.requestId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.export.redact",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
      expectedVersion: value.expectedVersion,
      subject: { type: "privacy_request", id: value.requestId },
    },
    async ({ tx, operationId }) => {
      const request = await eligibleRequest(tx, session, value.requestId, value.expectedVersion);
      const [row] = await tx
        .select()
        .from(privacyExports)
        .where(and(eq(privacyExports.id, value.exportId), eq(privacyExports.requestId, request.id)))
        .for("update");
      if (row?.state !== "draft" || row.partyId !== request.partyId)
        throw new AppError("not_found");
      if (
        row.version !== value.exportVersion ||
        row.sha256 !== value.digest ||
        row.requestVersion !== request.version
      )
        throw new AppError("version_conflict");
      await recipient(tx, row.recipientId, row.partyId);
      const dossier = payload(row);
      // Save removals before final review. The issue command must deliver the digest that
      // was actually displayed, including removals retained after an invalid submission.
      for (const omit of value.omitTexts) {
        const item = dossier.data[omit.section].find((item) => item.id === omit.id);
        if (!item) throw new AppError("validation_failed");
        item.text = "[redacted during privacy disclosure review]";
        if (
          !dossier.redactedText.some(
            (entry) => entry.section === omit.section && entry.id === omit.id,
          )
        )
          dossier.redactedText.push(omit);
      }
      const encoded = encode(dossier);
      await tx
        .update(privacyExports)
        .set({
          version: row.version + 1,
          encryptedPayload: sealPrivacyExport(row, encoded.text),
          sha256: encoded.sha256,
          byteSize: encoded.byteSize,
        })
        .where(eq(privacyExports.id, row.id));
      await recordAudit(tx, {
        actor: session.actor,
        action: "privacy.export.redacted",
        capability: "privacy.manage",
        recordType: "privacy_request",
        recordId: request.id,
        operationId,
        payload: {
          exportId: row.id,
          sha256: encoded.sha256,
          redactedTextCount: dossier.redactedText.length,
        },
      });
      return { id: row.id, sha256: encoded.sha256, fulfilment: "partial" as const };
    },
  );
}

export async function issuePrivacyExport(
  db: Executor,
  session: Session,
  input: unknown,
  storage?: FileStorage,
) {
  const value = parseInput(
    z.object({
      ...envelope,
      exportId: z.uuid(),
      exportVersion: z.int().positive(),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      expiresMinutes: z.int().min(1).max(1440),
      omitTexts: z.array(redaction).max(0).default([]),
      reviewed: z.literal(true),
      partialAcknowledged: z.literal(true),
    }),
    input,
  );
  await privacyOperator(db, session, value.requestId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.export.issue",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
      expectedVersion: value.expectedVersion,
      subject: { type: "privacy_request", id: value.requestId },
    },
    async ({ tx, operationId }) => {
      const request = await eligibleRequest(tx, session, value.requestId, value.expectedVersion);
      const [row] = await tx
        .select()
        .from(privacyExports)
        .where(and(eq(privacyExports.id, value.exportId), eq(privacyExports.requestId, request.id)))
        .for("update");
      if (row?.state !== "draft" || row.partyId !== request.partyId)
        throw new AppError("not_found");
      if (
        row.version !== value.exportVersion ||
        row.sha256 !== value.digest ||
        row.requestVersion !== request.version
      )
        throw new AppError("version_conflict");
      await recipient(tx, row.recipientId, row.partyId);
      const dossier = payload(row);
      for (const supplement of dossier.supplements) {
        const current = await collectDisclosureSupplement(
          tx,
          storage ?? fileServices().storage,
          session,
          row,
          supplement.source.versionId,
        );
        if (
          hashRequest(current.source) !== hashRequest(supplement.source) ||
          current.bytesBase64 !== supplement.bytesBase64
        )
          throw new AppError("version_conflict");
      }
      if (
        hashRequest(JSON.parse(JSON.stringify(await collectPersonDossier(tx, row.partyId)))) !==
        dossier.sourceDigest
      )
        throw new AppError("version_conflict");
      const expiresAt = new Date(Date.now() + value.expiresMinutes * 60000);
      await tx
        .update(privacyExports)
        .set({
          state: "issued",
          version: row.version + 1,
          reviewedById: session.actor.id,
          reviewedAt: new Date(),
          expiresAt,
          issuedOperationId: operationId,
        })
        .where(eq(privacyExports.id, row.id));
      await recordAudit(tx, {
        actor: session.actor,
        action: "privacy.export.issued",
        capability: "privacy.manage",
        recordType: "privacy_request",
        recordId: request.id,
        operationId,
        payload: {
          exportId: row.id,
          sha256: row.sha256,
          redactedTextCount: dossier.redactedText.length,
          coverage: "partial",
          expiresAt: expiresAt.toISOString(),
        },
      });
      // Delivery has happened; the privacy request is still in progress because joint records
      // and files remain pending. Never turn a partial dossier into full completion.
      return {
        id: row.id,
        sha256: row.sha256,
        expiresAt: expiresAt.toISOString(),
        fulfilment: "partial" as const,
      };
    },
  );
}

export async function revokePrivacyExport(db: Executor, session: Session, input: unknown) {
  const value = parseInput(
    z.object({
      operationId: z.uuid(),
      requestId: z.uuid(),
      exportId: z.uuid(),
      exportVersion: z.int().positive(),
      confirmed: z.literal(true),
    }),
    input,
  );
  await privacyOperator(db, session, value.requestId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.export.revoke",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
      subject: { type: "privacy_request", id: value.requestId },
    },
    async ({ tx, operationId }) => {
      await privacyOperator(tx, session, value.requestId);
      const [row] = await tx
        .select()
        .from(privacyExports)
        .where(
          and(eq(privacyExports.id, value.exportId), eq(privacyExports.requestId, value.requestId)),
        )
        .for("update");
      if (!row) throw new AppError("not_found");
      if (row.version !== value.exportVersion) throw new AppError("version_conflict");
      await tx
        .update(privacyExports)
        .set({
          state: "revoked",
          version: row.version + 1,
          revokedAt: new Date(),
          encryptedPayload: "",
        })
        .where(eq(privacyExports.id, row.id));
      await recordAudit(tx, {
        actor: session.actor,
        action: "privacy.export.revoked",
        capability: "privacy.manage",
        recordType: "privacy_request",
        recordId: value.requestId,
        operationId,
        payload: { exportId: row.id, sha256: row.sha256 },
      });
      return { id: row.id, state: "revoked" as const };
    },
  );
}

export async function staffPrivacyExports(db: Executor, session: Session, requestId: string) {
  await privacyOperator(db, session, requestId);
  const [request] = await db
    .select()
    .from(privacyRequests)
    .where(eq(privacyRequests.id, requestId));
  if (!request?.partyId || request.kind !== "export") throw new AppError("not_found");
  const recipients = await db
    .select({ id: principals.id, email: principals.email })
    .from(principals)
    .where(
      and(
        eq(principals.partyId, request.partyId),
        eq(principals.kind, "client"),
        eq(principals.status, "active"),
      ),
    )
    .orderBy(asc(principals.id));
  const rows = await db
    .select()
    .from(privacyExports)
    .where(eq(privacyExports.requestId, requestId))
    .orderBy(desc(privacyExports.createdAt));
  return {
    request,
    recipients,
    exports: rows.map((row) => ({
      id: row.id,
      version: row.version,
      state: row.state,
      sha256: row.sha256,
      recipientId: row.recipientId,
      expiresAt: row.expiresAt,
      dossier: row.state === "draft" && request.state === "in_progress" ? payload(row) : null,
    })),
  };
}
export async function clientPrivacyExports(db: Executor, session: Session, requestId: string) {
  const { person } = await privacyClient(db, session);
  const [request] = await db
    .select()
    .from(privacyRequests)
    .where(and(eq(privacyRequests.id, requestId), eq(privacyRequests.partyId, person.partyId)));
  if (request?.kind !== "export") throw new AppError("not_found");
  if (request.state !== "in_progress" && request.state !== "completed") return [];
  const rows = await db
    .select({
      id: privacyExports.id,
      expiresAt: privacyExports.expiresAt,
      state: privacyExports.state,
    })
    .from(privacyExports)
    .where(
      and(
        eq(privacyExports.requestId, requestId),
        eq(privacyExports.requestVersion, request.version),
        eq(privacyExports.recipientId, person.id),
        eq(privacyExports.partyId, person.partyId),
      ),
    )
    .orderBy(desc(privacyExports.createdAt));
  return rows.filter(
    (row) => row.state === "issued" && row.expiresAt && row.expiresAt > new Date(),
  );
}

/** Called before downloadResponse for every full/range read. Encrypted payload stays inside
 * the private database and is never addressable through public storage/CDN/signed URLs. */
export async function privacyExportDownload(
  db: Executor,
  session: Session,
  exportId: string,
): Promise<FileDownload> {
  if (!z.uuid().safeParse(exportId).success) throw new AppError("not_found");
  return db.transaction(async (tx) => {
    const { person } = await privacyClient(tx, session);
    const [row] = await tx
      .select()
      .from(privacyExports)
      .where(
        and(
          eq(privacyExports.id, exportId),
          eq(privacyExports.partyId, person.partyId),
          eq(privacyExports.recipientId, person.id),
        ),
      );
    if (row?.state !== "issued" || row.revokedAt || !row.expiresAt || row.expiresAt <= new Date())
      throw new AppError("not_found");
    const [request] = await tx
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.id, row.requestId))
      .for("share");
    if (
      !request ||
      request.partyId !== person.partyId ||
      request.version !== row.requestVersion ||
      request.kind !== "export" ||
      !["in_progress", "completed"].includes(request.state)
    )
      throw new AppError("not_found");
    await recipient(tx, row.recipientId, row.partyId);
    const dossier = payload(row),
      encoded = encode(dossier);
    for (const supplement of dossier.supplements)
      await verifyDeliveredSupplement(tx, session, request.id, supplement.source);
    await privacyClient(tx, session);
    // Re-read the row under a shared lock, fencing concurrent revocation before serving.
    const [current] = await tx
      .select()
      .from(privacyExports)
      .where(eq(privacyExports.id, row.id))
      .for("share");
    if (
      current?.state !== "issued" ||
      current.revokedAt ||
      !current.expiresAt ||
      current.expiresAt <= new Date() ||
      current.sha256 !== row.sha256
    )
      throw new AppError("not_found");
    await recordAudit(tx, {
      actor: session.actor,
      action: "privacy.export.downloaded",
      recordType: "privacy_request",
      recordId: request.id,
      payload: { exportId: row.id, sha256: row.sha256, coverage: "partial" },
    });
    return {
      bytes: Buffer.from(encoded.text),
      contentType: "application/json; charset=utf-8",
      fileName: "my-data.json",
      inline: false,
    };
  });
}

export async function attachPrivacyExportSupplement(
  db: Executor,
  storage: FileStorage,
  session: Session,
  input: unknown,
) {
  const value = parseInput(
    z.object({
      ...envelope,
      exportId: z.uuid(),
      exportVersion: z.int().positive(),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      documentVersionId: z.uuid(),
      category: z.enum(["private_files", "joint_records_and_received_communications"]),
      reviewedRedaction: z.literal(true),
    }),
    input,
  );
  await privacyOperator(db, session, value.requestId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.export.supplement",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
      expectedVersion: value.expectedVersion,
      subject: { type: "privacy_request", id: value.requestId },
    },
    async ({ tx, operationId }) => {
      const request = await eligibleRequest(tx, session, value.requestId, value.expectedVersion);
      const [row] = await tx
        .select()
        .from(privacyExports)
        .where(and(eq(privacyExports.id, value.exportId), eq(privacyExports.requestId, request.id)))
        .for("update");
      if (row?.state !== "draft" || row.partyId !== request.partyId)
        throw new AppError("not_found");
      if (
        row.version !== value.exportVersion ||
        row.sha256 !== value.digest ||
        row.requestVersion !== request.version
      )
        throw new AppError("version_conflict");
      const dossier = payload(row);
      if (
        dossier.supplements.length >= 10 ||
        dossier.supplements.some((s) => s.source.versionId === value.documentVersionId)
      )
        throw new AppError("validation_failed");
      const supplement = await collectDisclosureSupplement(
        tx,
        storage,
        session,
        row,
        value.documentVersionId,
      );
      dossier.supplements.push({ category: value.category, ...supplement });
      const encoded = encode(dossier);
      await tx
        .update(privacyExports)
        .set({
          version: row.version + 1,
          encryptedPayload: sealPrivacyExport(row, encoded.text),
          sha256: encoded.sha256,
          byteSize: encoded.byteSize,
        })
        .where(eq(privacyExports.id, row.id));
      await recordAudit(tx, {
        actor: session.actor,
        action: "privacy.export.supplemented",
        capability: "privacy.manage",
        recordType: "privacy_request",
        recordId: request.id,
        operationId,
        payload: {
          exportId: row.id,
          sha256: encoded.sha256,
          category: value.category,
          coverage: "partial",
        },
      });
      return { id: row.id, sha256: encoded.sha256, fulfilment: "partial" as const };
    },
  );
}

export async function privacyExportOperationStatus(
  db: Executor,
  session: Session,
  requestId: string,
  operationKey: string,
) {
  await privacyOperator(db, session, requestId);
  if (!z.uuid().safeParse(operationKey).success) return "unknown";
  const [row] = await db
    .select({ status: operations.status })
    .from(operations)
    .where(
      and(
        eq(operations.actorKind, session.actor.kind),
        eq(operations.actorId, session.actor.id),
        eq(operations.idempotencyKey, operationKey),
        eq(operations.resultType, "privacy_request"),
        eq(operations.resultId, requestId),
        inArray(operations.operationType, [
          "privacy.export.prepare",
          "privacy.export.redact",
          "privacy.export.issue",
          "privacy.export.revoke",
          "privacy.export.supplement",
        ]),
      ),
    );
  return row?.status ?? "absent";
}
