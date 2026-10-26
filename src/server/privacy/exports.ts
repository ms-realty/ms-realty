// C18/O26 · AT43/AT45/UX23. Only allowlisted person data; never a raw relational dump.
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
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
import { guardPrivacyRequestTransition } from "@/domain/privacy";
import {
  type PrivacyExportReview,
  privacyExportBasis,
  privacyExportCategories,
  privacyExportDecision,
  privacyExportDispositions,
  privacyExportReview,
} from "@/domain/privacy-export";
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
  assertCoverageDecision,
  collectExportInventory,
  inventoryDigest,
  ownExportSourceDigest,
  resolvedReview,
  safeCoverage,
} from "./export-coverage";
import {
  collectDisclosureSupplement,
  type DisclosureSupplement,
  verifyDeliveredSupplement,
} from "./export-supplements";
import { privacyProcessingRestricted } from "./restrictions";

export const exportSections = ["requests", "inquiries", "messages", "feedback"] as const;
const redaction = z.object({ section: z.enum(exportSections), id: z.uuid() }).strict();
const envelope = {
  operationId: z.uuid(),
  requestId: z.uuid(),
  expectedVersion: z.int().positive(),
};
const maxRows = 2000;
const maxBytes = 1024 * 1024;
const exportOperationTypes = [
  "privacy.export.prepare",
  "privacy.export.inventory",
  "privacy.export.disposition",
  "privacy.export.complete",
  "privacy.export.redact",
  "privacy.export.issue",
  "privacy.export.revoke",
  "privacy.export.supplement",
] as const;
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
  fulfilment: "partial" | "reviewed_scope";
  coverage?: { category: string; disposition: string }[];
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
  if (await privacyProcessingRestricted(db, partyId, "client_access"))
    throw new AppError("not_found");
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

function coveragePayload(row: typeof privacyExports.$inferSelect): PrivacyExportReview | null {
  if (!row.encryptedReview || !row.reviewSha256) return null;
  const text = openPrivacyExport({ ...row, id: `review:${row.id}` }, row.encryptedReview);
  if (sha256Hex(text) !== row.reviewSha256) throw new AppError("not_found");
  return privacyExportReview.parse(JSON.parse(text));
}
function coverageFields(row: typeof privacyExports.$inferSelect, review: PrivacyExportReview) {
  const text = JSON.stringify(review);
  if (Buffer.byteLength(text) > maxBytes) throw new AppError("validation_failed");
  return {
    encryptedReview: sealPrivacyExport({ ...row, id: `review:${row.id}` }, text),
    reviewSha256: sha256Hex(text),
  };
}
function resetCoverage(row: typeof privacyExports.$inferSelect, dossier: PrivacyDossier) {
  const review = coveragePayload(row);
  if (!review) return {};
  review.decisions = [];
  applyCoverage(dossier, review);
  return { ...coverageFields(row, review), coverageComplete: false };
}
function applyCoverage(dossier: PrivacyDossier, review: PrivacyExportReview) {
  dossier.coverage = safeCoverage(review);
  dossier.fulfilment = resolvedReview(review) ? "reviewed_scope" : "partial";
  dossier.omissions = dossier.coverage.filter(
    (row) => !["disclosed", "none"].includes(row.disposition),
  );
}
const requestPolicy = (request: typeof privacyRequests.$inferSelect) =>
  z.object({ policyReference: z.string().min(5) }).parse(request.scope).policyReference;

async function currentCoverage(
  db: Executor,
  row: typeof privacyExports.$inferSelect,
  request: typeof privacyRequests.$inferSelect,
  dossier: PrivacyDossier,
): Promise<PrivacyExportReview | null> {
  const review = coveragePayload(row);
  if (!review) return null;
  if (
    review.inventory.recipientId !== row.recipientId ||
    request.version !== review.inventory.requestVersion + (row.completedOperationId ? 1 : 0)
  )
    throw new AppError("version_conflict");
  const ownDigest = ownExportSourceDigest(await collectPersonDossier(db, row.partyId), request.id);
  if (ownDigest !== dossier.sourceDigest) throw new AppError("version_conflict");
  // Recheck every reviewer's ordinary dependencies. An operator changing grants cannot
  // leave a previously readable source silently eligible for download or completion.
  for (const id of new Set([
    review.inventoriedById,
    ...review.decisions.map((decision) => decision.reviewedById),
  ])) {
    const current = await collectExportInventory(
      db,
      { kind: "staff", id },
      {
        partyId: row.partyId,
        recipientId: row.recipientId,
        requestId: request.id,
        requestVersion: review.inventory.requestVersion,
        scope: request.scope,
      },
      ownDigest,
    );
    if (inventoryDigest(current) !== inventoryDigest(review.inventory))
      throw new AppError("version_conflict");
  }
  for (const decision of review.decisions)
    assertCoverageDecision(review, decision, dossier.supplements, requestPolicy(request));
  if (
    hashRequest(dossier.coverage) !== hashRequest(safeCoverage(review)) ||
    dossier.fulfilment !== (resolvedReview(review) ? "reviewed_scope" : "partial")
  )
    throw new AppError("version_conflict");
  return review;
}

const reviewEnvelope = {
  ...envelope,
  exportId: z.uuid(),
  exportVersion: z.int().positive(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
};
async function draftForReview(
  db: Executor,
  request: typeof privacyRequests.$inferSelect,
  value: { exportId: string; exportVersion: number; digest: string },
) {
  const [row] = await db
    .select()
    .from(privacyExports)
    .where(and(eq(privacyExports.id, value.exportId), eq(privacyExports.requestId, request.id)))
    .for("update");
  if (row?.state !== "draft" || row.partyId !== request.partyId) throw new AppError("not_found");
  if (
    row.version !== value.exportVersion ||
    row.sha256 !== value.digest ||
    row.requestVersion !== request.version
  )
    throw new AppError("version_conflict");
  await recipient(db, row.recipientId, row.partyId);
  return row;
}
export async function capturePrivacyExportManifest(db: Executor, session: Session, input: unknown) {
  const value = parseInput(z.object(reviewEnvelope).strict(), input);
  await privacyOperator(db, session, value.requestId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.export.inventory",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
      expectedVersion: value.expectedVersion,
      subject: { type: "privacy_request", id: value.requestId },
    },
    async ({ tx, operationId }) => {
      const request = await eligibleRequest(tx, session, value.requestId, value.expectedVersion);
      const row = await draftForReview(tx, request, value),
        dossier = payload(row);
      const ownDigest = ownExportSourceDigest(
        await collectPersonDossier(tx, row.partyId),
        request.id,
      );
      if (ownDigest !== dossier.sourceDigest) throw new AppError("version_conflict");
      const review: PrivacyExportReview = {
        inventory: await collectExportInventory(
          tx,
          session.actor,
          {
            requestId: request.id,
            requestVersion: request.version,
            recipientId: row.recipientId,
            partyId: row.partyId,
            scope: request.scope,
          },
          ownDigest,
        ),
        inventoriedById: session.actor.id,
        decisions: [],
      };
      applyCoverage(dossier, review);
      const encoded = encode(dossier),
        fields = coverageFields(row, review);
      await tx
        .update(privacyExports)
        .set({
          ...fields,
          version: row.version + 1,
          encryptedPayload: sealPrivacyExport(row, encoded.text),
          sha256: encoded.sha256,
          byteSize: encoded.byteSize,
          coverageComplete: false,
        })
        .where(eq(privacyExports.id, row.id));
      await recordAudit(tx, {
        actor: session.actor,
        action: "privacy.export.inventoried",
        capability: "privacy.manage",
        recordType: "privacy_request",
        recordId: request.id,
        operationId,
        payload: { exportId: row.id, reviewSha256: fields.reviewSha256, sha256: encoded.sha256 },
      });
      return { id: row.id, sha256: encoded.sha256, reviewSha256: fields.reviewSha256 };
    },
  );
}

export async function reviewPrivacyExportCategory(db: Executor, session: Session, input: unknown) {
  const value = parseInput(
    z
      .object({
        ...reviewEnvelope,
        reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
        category: z.enum(privacyExportCategories),
        disposition: z.enum(privacyExportDispositions),
        sourceKeys: z.array(z.string().min(1).max(100)).max(100),
        evidence: z
          .array(
            z
              .object({ sourceKey: z.string().min(1).max(100), documentVersionId: z.uuid() })
              .strict(),
          )
          .max(100),
        basis: privacyExportBasis,
        policyReference: z.string().trim().min(5).max(500),
        evidenceReference: z.string().trim().min(10).max(1000),
        confirmed: z.literal(true),
      })
      .strict(),
    input,
  );
  await privacyOperator(db, session, value.requestId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.export.disposition",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
      expectedVersion: value.expectedVersion,
      subject: { type: "privacy_request", id: value.requestId },
    },
    async ({ tx, operationId }) => {
      const request = await eligibleRequest(tx, session, value.requestId, value.expectedVersion);
      const row = await draftForReview(tx, request, value),
        dossier = payload(row);
      if (row.reviewSha256 !== value.reviewDigest) throw new AppError("version_conflict");
      const review = await currentCoverage(tx, row, request, dossier);
      if (!review) throw new AppError("transition_denied");
      // A different reviewer must have all ordinary source rights too, before receiving or
      // making a decision over the manifest. This grants no new access to the client.
      const ownDigest = ownExportSourceDigest(
        await collectPersonDossier(tx, row.partyId),
        request.id,
      );
      const inventory = await collectExportInventory(
        tx,
        session.actor,
        {
          partyId: row.partyId,
          recipientId: row.recipientId,
          requestId: request.id,
          requestVersion: request.version,
          scope: request.scope,
        },
        ownDigest,
      );
      if (inventoryDigest(inventory) !== inventoryDigest(review.inventory))
        throw new AppError("version_conflict");
      const decision = privacyExportDecision.parse({
        category: value.category,
        disposition: value.disposition,
        sourceKeys: value.sourceKeys,
        evidence: value.evidence,
        basis: value.basis,
        policyReference: value.policyReference,
        evidenceReference: value.evidenceReference,
        reviewedById: session.actor.id,
        reviewedAt: new Date().toISOString(),
      });
      assertCoverageDecision(review, decision, dossier.supplements, requestPolicy(request));
      review.decisions = [
        ...review.decisions.filter((row) => row.category !== value.category),
        decision,
      ];
      applyCoverage(dossier, review);
      const encoded = encode(dossier),
        fields = coverageFields(row, review);
      await tx
        .update(privacyExports)
        .set({
          ...fields,
          version: row.version + 1,
          encryptedPayload: sealPrivacyExport(row, encoded.text),
          sha256: encoded.sha256,
          byteSize: encoded.byteSize,
          coverageComplete: false,
        })
        .where(eq(privacyExports.id, row.id));
      await recordAudit(tx, {
        actor: session.actor,
        action: "privacy.export.category_reviewed",
        capability: "privacy.manage",
        recordType: "privacy_request",
        recordId: request.id,
        operationId,
        payload: {
          exportId: row.id,
          category: value.category,
          disposition: value.disposition,
          reviewSha256: fields.reviewSha256,
          sha256: encoded.sha256,
        },
      });
      return {
        id: row.id,
        sha256: encoded.sha256,
        reviewSha256: fields.reviewSha256,
        fulfilment: dossier.fulfilment,
      };
    },
  );
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
        sourceDigest: ownExportSourceDigest(data, request.id),
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
      const reviewReset = resetCoverage(row, dossier);
      const encoded = encode(dossier);
      await tx
        .update(privacyExports)
        .set({
          version: row.version + 1,
          encryptedPayload: sealPrivacyExport(row, encoded.text),
          sha256: encoded.sha256,
          byteSize: encoded.byteSize,
          ...reviewReset,
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
        ownExportSourceDigest(await collectPersonDossier(tx, row.partyId), request.id) !==
        dossier.sourceDigest
      )
        throw new AppError("version_conflict");
      const reviewed = await currentCoverage(tx, row, request, dossier);
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
          coverageComplete: reviewed ? resolvedReview(reviewed) : false,
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
          coverage: dossier.fulfilment,
          expiresAt: expiresAt.toISOString(),
        },
      });
      // Availability is separate from request completion, even for a fully reviewed set.
      return {
        id: row.id,
        sha256: row.sha256,
        expiresAt: expiresAt.toISOString(),
        fulfilment: dossier.fulfilment,
      };
    },
  );
}

export async function completePrivacyExport(
  db: Executor,
  session: Session,
  input: unknown,
  storage?: FileStorage,
) {
  const value = parseInput(
    z
      .object({
        ...reviewEnvelope,
        reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
        confirmed: z.literal(true),
      })
      .strict(),
    input,
  );
  await privacyOperator(db, session, value.requestId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "privacy.export.complete",
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
      if (
        row?.state !== "issued" ||
        row.partyId !== request.partyId ||
        row.revokedAt ||
        !row.expiresAt ||
        row.expiresAt <= new Date()
      )
        throw new AppError("not_found");
      if (
        row.version !== value.exportVersion ||
        row.sha256 !== value.digest ||
        row.reviewSha256 !== value.reviewDigest ||
        row.requestVersion !== request.version
      )
        throw new AppError("version_conflict");
      await recipient(tx, row.recipientId, row.partyId);
      const dossier = payload(row),
        review = await currentCoverage(tx, row, request, dossier);
      if (!review || !resolvedReview(review) || !row.coverageComplete)
        throw new AppError("transition_denied");
      const current = await collectExportInventory(
        tx,
        session.actor,
        {
          partyId: row.partyId,
          recipientId: row.recipientId,
          requestId: request.id,
          requestVersion: request.version,
          scope: request.scope,
        },
        ownExportSourceDigest(await collectPersonDossier(tx, row.partyId), request.id),
      );
      if (inventoryDigest(current) !== inventoryDigest(review.inventory))
        throw new AppError("version_conflict");
      for (const supplement of dossier.supplements) {
        const proof = await collectDisclosureSupplement(
          tx,
          storage ?? fileServices().storage,
          session,
          row,
          supplement.source.versionId,
        );
        if (
          hashRequest(proof.source) !== hashRequest(supplement.source) ||
          proof.bytesBase64 !== supplement.bytesBase64
        )
          throw new AppError("version_conflict");
      }
      const evidence = `privacy_export:${row.id}:${row.sha256}:${row.reviewSha256}`;
      const disposition = review.decisions.find(
        (row) => row.category === "restricted_material_and_security_credentials",
      );
      const decision = guardPrivacyRequestTransition(
        request.state,
        "completed",
        {
          verifiedAt: request.verifiedAt?.toISOString(),
          responsiblePrincipalId: request.responsibleId ?? undefined,
          completionEvidence: evidence,
          legalHoldDisposition: disposition?.evidenceReference,
        },
        session.actor,
      );
      if (decision.outcome !== "allowed") throw new AppError("transition_denied");
      await tx
        .update(privacyRequests)
        .set({
          state: "completed",
          version: request.version + 1,
          updatedAt: new Date(),
          completedAt: new Date(),
          completionEvidence: evidence,
          legalHoldDisposition: disposition?.evidenceReference,
        })
        .where(eq(privacyRequests.id, request.id));
      await tx
        .update(privacyExports)
        .set({
          version: row.version + 1,
          requestVersion: request.version + 1,
          completedOperationId: operationId,
        })
        .where(eq(privacyExports.id, row.id));
      await recordAudit(tx, {
        actor: session.actor,
        action: "privacy.export.completed",
        capability: "privacy.manage",
        recordType: "privacy_request",
        recordId: request.id,
        operationId,
        payload: {
          exportId: row.id,
          sha256: row.sha256,
          reviewSha256: row.reviewSha256,
          issuedOperationId: row.issuedOperationId,
          scope: "reviewed_declared_categories",
        },
      });
      return { id: row.id, state: "completed" as const, requestVersion: request.version + 1 };
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

export async function staffPrivacyExports(
  db: Executor,
  session: Session,
  requestId: string,
  storage?: FileStorage,
) {
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
    exports: await Promise.all(
      rows.map(async (row) => {
        let dossier: PrivacyDossier | null =
          row.state === "draft" && request.state === "in_progress" ? payload(row) : null;
        let review: PrivacyExportReview | null = null;
        let reviewStale = false;
        try {
          const frozen = dossier ?? (row.state === "issued" ? payload(row) : null);
          if (frozen) {
            for (const supplement of frozen.supplements)
              await collectDisclosureSupplement(
                db,
                storage ?? fileServices().storage,
                session,
                row,
                supplement.source.versionId,
              );
            review = await currentCoverage(db, row, request, frozen);
            if (review) {
              const inventory = await collectExportInventory(
                db,
                session.actor,
                {
                  partyId: row.partyId,
                  recipientId: row.recipientId,
                  requestId: request.id,
                  requestVersion: review.inventory.requestVersion,
                  scope: request.scope,
                },
                ownExportSourceDigest(await collectPersonDossier(db, row.partyId), request.id),
              );
              if (inventoryDigest(inventory) !== inventoryDigest(review.inventory))
                throw new AppError("not_found");
            }
          }
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          dossier = null;
          review = null;
          reviewStale = true;
        }
        return {
          id: row.id,
          version: row.version,
          state: row.state,
          sha256: row.sha256,
          recipientId: row.recipientId,
          expiresAt: row.expiresAt,
          dossier,
          review,
          reviewStale,
          reviewSha256: row.reviewSha256,
          coverageComplete: row.coverageComplete,
        };
      }),
    ),
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
    .select()
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
  const eligible = [];
  for (const row of rows) {
    if (row.state !== "issued" || !row.expiresAt || row.expiresAt <= new Date() || row.revokedAt)
      continue;
    try {
      const dossier = payload(row);
      await currentCoverage(db, row, request, dossier);
      for (const supplement of dossier.supplements)
        await verifyDeliveredSupplement(db, session, request.id, supplement.source);
      eligible.push({
        id: row.id,
        expiresAt: row.expiresAt,
        state: row.state,
        coverageComplete: row.coverageComplete,
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  return eligible;
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
    try {
      await currentCoverage(tx, row, request, dossier);
    } catch (error) {
      if (error instanceof AppError) throw new AppError("not_found");
      throw error;
    }
    if (
      row.completedOperationId &&
      (request.state !== "completed" ||
        request.completionEvidence !== `privacy_export:${row.id}:${row.sha256}:${row.reviewSha256}`)
    )
      throw new AppError("not_found");
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
      payload: { exportId: row.id, sha256: row.sha256, coverage: dossier.fulfilment },
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
      category: z.enum([
        "private_files",
        "joint_records_and_received_communications",
        "restricted_material_and_security_credentials",
      ]),
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
        dossier.supplements.some(
          (s) => s.source.versionId === value.documentVersionId && s.category === value.category,
        )
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
      const reviewReset = resetCoverage(row, dossier);
      const encoded = encode(dossier);
      await tx
        .update(privacyExports)
        .set({
          version: row.version + 1,
          encryptedPayload: sealPrivacyExport(row, encoded.text),
          sha256: encoded.sha256,
          byteSize: encoded.byteSize,
          ...reviewReset,
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
  return db.transaction(async (tx) => {
    // The command's receipt is invisible until commit. Fence every allowed command type
    // for this exact actor/key before treating a missing row as a confirmed absence.
    for (const type of exportOperationTypes) {
      const lockKey = JSON.stringify([session.actor.kind, session.actor.id, type, operationKey]);
      const [lock] = await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as locked`,
      );
      if (!lock?.locked) return "unknown";
    }
    await privacyOperator(tx, session, requestId);
    const [row] = await tx
      .select({ status: operations.status })
      .from(operations)
      .where(
        and(
          eq(operations.actorKind, session.actor.kind),
          eq(operations.actorId, session.actor.id),
          eq(operations.idempotencyKey, operationKey),
          eq(operations.resultType, "privacy_request"),
          eq(operations.resultId, requestId),
          inArray(operations.operationType, exportOperationTypes),
        ),
      );
    return row?.status ?? "absent";
  });
}

export async function privacyExportReceipt(
  db: Executor,
  session: Session,
  requestId: string,
  id: string,
) {
  await privacyOperator(db, session, requestId);
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db
    .select({ id: operations.id })
    .from(operations)
    .where(
      and(
        eq(operations.id, id),
        eq(operations.actorKind, session.actor.kind),
        eq(operations.actorId, session.actor.id),
        eq(operations.resultType, "privacy_request"),
        eq(operations.resultId, requestId),
        eq(operations.status, "succeeded"),
        inArray(operations.operationType, exportOperationTypes),
      ),
    );
  return row?.id ?? null;
}
