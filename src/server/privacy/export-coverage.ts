// C18/O26 · AT43/AT45. Private, bounded source manifests; no raw case or legal dossier.
import "server-only";
import { and, asc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import {
  appointments,
  briefRevisions,
  caseParticipants,
  caseProcessItems,
  caseProcessReviews,
  caseStageHistory,
  cases,
  documentRequests,
  documents,
  documentVersions,
  inquiries,
  interestFeedback,
  interests,
  messages,
  principals,
  propertyRelationships,
  proposals,
  sellerInstructions,
  serviceAgreements,
  suspicionReports,
  tasks,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import {
  type PrivacyExportCategory,
  type PrivacyExportDecision,
  type PrivacyExportInventory,
  type PrivacyExportReview,
  type PrivacyExportSource,
  privacyExportCategories,
} from "@/domain/privacy-export";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { can } from "../authz";
import { hasPrivacyRetentionHold } from "../compliance/retention";
import { getEnv } from "../config/env";
import { hashRequest, keyedHash } from "../crypto";
import type { Executor } from "../db";
import { caseDocumentPurposes } from "../documents/purposes";
import { AppError } from "../errors";
import type { DisclosureSupplement } from "./export-supplements";

const digest = (value: unknown) => hashRequest(JSON.parse(JSON.stringify(value)));
const bounded = <T>(rows: T[], max = 1000): T[] => {
  if (rows.length > max) throw new AppError("validation_failed");
  return rows;
};
export const inventoryDigest = (inventory: PrivacyExportInventory) => digest(inventory);

// Ignore only this request's workflow state. Controlled completion changes that state
// atomically; all other collected fields and every other request remain part of the binding.
export function ownExportSourceDigest<T extends { requests: { id: string; state: string }[] }>(
  data: T,
  requestId: string,
) {
  return digest({
    ...data,
    requests: data.requests.map((row) =>
      row.id === requestId ? { ...row, state: "this_export_request" } : row,
    ),
  });
}

async function caseBundle(db: Executor, id: string) {
  const [record] = await db
    .select({ id: cases.id, version: cases.version })
    .from(cases)
    .where(eq(cases.id, id));
  if (!record) throw new AppError("not_found");
  // Explicit revision metadata only. No titles, bodies, recipient rosters or compliance rows.
  const parts = await Promise.all([
    db
      .select({ id: caseStageHistory.id, at: caseStageHistory.occurredAt })
      .from(caseStageHistory)
      .where(eq(caseStageHistory.caseId, id))
      .orderBy(asc(caseStageHistory.id))
      .limit(1001),
    db
      .select({
        id: briefRevisions.id,
        revision: briefRevisions.revisionNumber,
        client: briefRevisions.clientAcknowledgedAt,
        broker: briefRevisions.brokerAcknowledgedAt,
      })
      .from(briefRevisions)
      .where(eq(briefRevisions.caseId, id))
      .orderBy(asc(briefRevisions.id))
      .limit(1001),
    db
      .select({ id: interests.id, version: interests.version })
      .from(interests)
      .where(eq(interests.caseId, id))
      .orderBy(asc(interests.id))
      .limit(1001),
    db
      .select({ id: interestFeedback.id, revision: interestFeedback.revisionNumber })
      .from(interestFeedback)
      .innerJoin(interests, eq(interests.id, interestFeedback.interestId))
      .where(eq(interests.caseId, id))
      .orderBy(asc(interestFeedback.id))
      .limit(1001),
    db
      .select({ id: tasks.id, version: tasks.version })
      .from(tasks)
      .where(eq(tasks.caseId, id))
      .orderBy(asc(tasks.id))
      .limit(1001),
    db
      .select({ id: appointments.id, version: appointments.version })
      .from(appointments)
      .where(eq(appointments.caseId, id))
      .orderBy(asc(appointments.id))
      .limit(1001),
    db
      .select({
        id: proposals.id,
        version: proposals.version,
        revision: proposals.activeRevisionNumber,
      })
      .from(proposals)
      .where(eq(proposals.caseId, id))
      .orderBy(asc(proposals.id))
      .limit(1001),
    db
      .select({ id: messages.id, version: messages.version, digest: messages.payloadDigest })
      .from(messages)
      .where(eq(messages.caseId, id))
      .orderBy(asc(messages.id))
      .limit(1001),
    db
      .select({ id: sellerInstructions.id, version: sellerInstructions.version })
      .from(sellerInstructions)
      .where(eq(sellerInstructions.caseId, id))
      .orderBy(asc(sellerInstructions.id))
      .limit(1001),
  ]);
  for (const part of parts) if (part.length > 1000) throw new AppError("validation_failed");
  return {
    key: `case:${id}`,
    kind: "case_bundle" as const,
    id,
    revision: record.version,
    digest: digest({ record, parts }),
  };
}

async function restrictedRevisionFingerprint(
  db: Executor,
  partyId: string,
  caseIds: string[],
  hold: boolean,
) {
  // This is an opaque revision fence, not a record inventory available to a privacy operator.
  // No note, filename, report content, identity or count leaves this function or enters audit.
  const reports = await db
    .select({
      id: suspicionReports.id,
      createdAt: suspicionReports.createdAt,
      retainUntil: suspicionReports.retainUntil,
    })
    .from(suspicionReports)
    .where(eq(suspicionReports.partyId, partyId))
    .orderBy(asc(suspicionReports.id))
    .limit(1001);
  const agreements = await db
    .select({
      id: serviceAgreements.id,
      digest: serviceAgreements.documentDigest,
      createdAt: serviceAgreements.createdAt,
    })
    .from(serviceAgreements)
    .where(
      or(
        eq(serviceAgreements.partyId, partyId),
        eq(serviceAgreements.commissionPayerPartyId, partyId),
      ),
    )
    .orderBy(asc(serviceAgreements.id))
    .limit(1001);
  const reviews = caseIds.length
    ? await db
        .select({ id: caseProcessReviews.id, version: caseProcessReviews.version })
        .from(caseProcessReviews)
        .where(inArray(caseProcessReviews.caseId, caseIds))
        .orderBy(asc(caseProcessReviews.id))
        .limit(1001)
    : [];
  const items = await db
    .select({ id: caseProcessItems.id, version: caseProcessItems.version })
    .from(caseProcessItems)
    .innerJoin(caseProcessReviews, eq(caseProcessReviews.id, caseProcessItems.reviewId))
    .where(
      or(
        eq(caseProcessItems.partyScope, partyId),
        caseIds.length
          ? and(eq(caseProcessItems.partyScope, ""), inArray(caseProcessReviews.caseId, caseIds))
          : undefined,
      ),
    )
    .orderBy(asc(caseProcessItems.id))
    .limit(1001);
  const files = caseIds.length
    ? await db
        .select({
          id: documents.id,
          version: documents.version,
          revision: documentVersions.id,
          fileVersion: documentVersions.version,
          digest: documentVersions.sha256,
        })
        .from(documents)
        .leftJoin(documentVersions, eq(documentVersions.documentId, documents.id))
        .where(
          and(
            inArray(documents.caseId, caseIds),
            inArray(documents.purpose, [...caseDocumentPurposes]),
          ),
        )
        .orderBy(asc(documents.id), asc(documentVersions.id))
        .limit(1001)
    : [];
  for (const rows of [reports, agreements, reviews, items, files])
    if (rows.length > 1000) throw new AppError("validation_failed");
  return keyedHash(
    getEnv().authSecret,
    `privacy-restricted-revision:v1:${JSON.stringify({ hold, reports, agreements, reviews, items, files })}`,
  );
}

export async function collectExportInventory(
  db: Executor,
  actor: Actor,
  subject: {
    partyId: string;
    recipientId: string;
    requestId: string;
    requestVersion: number;
    scope: unknown;
  },
  ownSourceDigest: string,
): Promise<PrivacyExportInventory> {
  if (
    actor.kind !== "staff" ||
    !(await can(db, actor, "privacy.manage", { type: "privacy_request", id: subject.requestId })) ||
    (await countActivePasskeys(db, actor.id)) < staffPasskeyMinimum
  )
    throw new AppError("not_found");
  const accounts = bounded(
    await db
      .select({ id: principals.id })
      .from(principals)
      .where(and(eq(principals.partyId, subject.partyId), eq(principals.kind, "client")))
      .orderBy(asc(principals.id))
      .limit(101),
    100,
  );
  const ids = accounts.map((row) => row.id);
  if (!ids.includes(subject.recipientId)) throw new AppError("not_found");
  const links = bounded(
    await db
      .select({
        id: caseParticipants.id,
        version: caseParticipants.version,
        caseId: caseParticipants.caseId,
      })
      .from(caseParticipants)
      .where(eq(caseParticipants.partyId, subject.partyId))
      .orderBy(asc(caseParticipants.id))
      .limit(101),
    100,
  );
  const caseIds = [...new Set(links.map((row) => row.caseId))];
  const joint: PrivacyExportSource[] = [];
  let jointBlocked = false;
  for (const id of caseIds) {
    if (
      !(await can(db, actor, "case.read", { type: "case", id })) ||
      !(await can(db, actor, "case.read_internal", { type: "case", id, audience: "internal" }))
    ) {
      jointBlocked = true;
      continue;
    }
    const bundle = await caseBundle(db, id);
    joint.push({
      ...bundle,
      digest: digest({ bundle: bundle.digest, links: links.filter((row) => row.caseId === id) }),
    });
  }
  // Property-only evidence has no complete disclosure collector in this slice. It cannot be
  // declared absent or turned into an all-records claim by a checkbox.
  const [propertyLink] = await db
    .select({ exists: sql<boolean>`true` })
    .from(propertyRelationships)
    .where(eq(propertyRelationships.partyId, subject.partyId))
    .limit(1);
  if (propertyLink) jointBlocked = true;
  const ownInquiries = bounded(
    await db
      .select({ id: inquiries.id, version: inquiries.version, caseId: inquiries.caseId })
      .from(inquiries)
      .where(eq(inquiries.partyId, subject.partyId))
      .orderBy(asc(inquiries.id))
      .limit(101),
    100,
  );
  for (const inquiry of ownInquiries.filter(
    (row) => !row.caseId || !caseIds.includes(row.caseId),
  )) {
    if (inquiry.caseId) jointBlocked = true;
    if (!(await can(db, actor, "inquiry.read", { type: "inquiry", id: inquiry.id }))) {
      // Only an actually present, received communication creates this unknown source.
      const [received] = await db
        .select({ exists: sql<boolean>`true` })
        .from(messages)
        .where(and(eq(messages.inquiryId, inquiry.id), notInArray(messages.authorId, ids)))
        .limit(1);
      if (received) jointBlocked = true;
      continue;
    }
    const received = bounded(
      await db
        .select({ id: messages.id, version: messages.version, digest: messages.payloadDigest })
        .from(messages)
        .where(and(eq(messages.inquiryId, inquiry.id), notInArray(messages.authorId, ids)))
        .orderBy(asc(messages.id))
        .limit(1001),
    );
    if (received.length)
      joint.push({
        key: `inquiry:${inquiry.id}`,
        kind: "case_bundle",
        id: inquiry.id,
        revision: inquiry.version,
        digest: digest({ inquiry, received }),
      });
  }
  const files: PrivacyExportSource[] = [];
  let filesBlocked = false;
  const related = or(
    caseIds.length ? inArray(documents.caseId, caseIds) : undefined,
    inArray(
      documents.id,
      db
        .select({ id: documentRequests.documentId })
        .from(documentRequests)
        .where(inArray(documentRequests.recipientId, ids)),
    ),
    inArray(
      documents.id,
      db
        .select({ id: documentVersions.documentId })
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.uploadedByKind, "client"),
            inArray(documentVersions.uploadedById, ids),
          ),
        ),
    ),
  );
  const sourceFiles = bounded(
    await db
      .select({
        id: documents.id,
        version: documents.version,
        purpose: documents.purpose,
        audience: documents.audience,
        revision: documents.currentVersionNumber,
        expiresAt: documents.expiresAt,
      })
      .from(documents)
      .where(related)
      .orderBy(asc(documents.id))
      .limit(101),
    100,
  );
  for (const doc of sourceFiles) {
    // Restricted compliance is represented only by the opaque boundary below. No record
    // identities or counts cross this boundary into review data, delivery, UI or audit.
    if ((caseDocumentPurposes as readonly string[]).includes(doc.purpose)) continue;
    if (
      !(await can(db, actor, "document.read_restricted", {
        type: "document",
        id: doc.id,
        audience: doc.audience,
      }))
    ) {
      filesBlocked = true;
      continue;
    }
    const revisions = bounded(
      await db
        .select({
          id: documentVersions.id,
          version: documentVersions.version,
          sha256: documentVersions.sha256,
          state: documentVersions.state,
          scan: documentVersions.scan,
          review: documentVersions.reviewType,
        })
        .from(documentVersions)
        .where(eq(documentVersions.documentId, doc.id))
        .orderBy(asc(documentVersions.id))
        .limit(101),
      100,
    );
    files.push({
      key: `document:${doc.id}`,
      kind: "document",
      id: doc.id,
      revision: doc.version,
      digest: digest({ doc, revisions }),
    });
  }
  const hold = await hasPrivacyRetentionHold(db, subject.partyId);
  const scope = subject.scope as { exportScope?: unknown };
  return {
    version: 1,
    requestVersion: subject.requestVersion,
    recipientId: subject.recipientId,
    scopeDigest: digest(subject.scope),
    ownSourceDigest,
    categories: [
      {
        category: "personal_activity",
        blocked: false,
        sources: [{ key: "own_activity", kind: "own_activity", digest: ownSourceDigest }],
      },
      {
        category: "joint_records_and_received_communications",
        blocked: jointBlocked,
        sources: jointBlocked ? [] : bounded(joint, 100),
      },
      { category: "private_files", blocked: filesBlocked, sources: filesBlocked ? [] : files },
      {
        category: "restricted_material_and_security_credentials",
        blocked: false,
        sources: [
          {
            key: "security_boundary",
            kind: "security_boundary",
            digest: await restrictedRevisionFingerprint(db, subject.partyId, caseIds, hold),
          },
        ],
      },
      {
        category: "additional_requested_material",
        blocked: scope.exportScope !== "listed_categories",
        sources: [],
      },
    ],
  };
}

export function resolvedReview(review: PrivacyExportReview): boolean {
  return privacyExportCategories.every((category) => {
    const bucket = review.inventory.categories.find((row) => row.category === category);
    const decision = review.decisions.find((row) => row.category === category);
    return (
      bucket &&
      !bucket.blocked &&
      decision &&
      ["disclosed", "none", "withheld"].includes(decision.disposition)
    );
  });
}
export function assertCoverageDecision(
  review: PrivacyExportReview,
  decision: PrivacyExportDecision,
  supplements: DisclosureSupplement[],
  policyReference: string,
) {
  const bucket = review.inventory.categories.find((row) => row.category === decision.category);
  if (
    !bucket ||
    digest([...decision.sourceKeys].sort()) !==
      digest(bucket.sources.map((row) => row.key).sort()) ||
    decision.policyReference !== policyReference
  )
    throw new AppError("version_conflict");
  const resolved = ["disclosed", "none", "withheld"].includes(decision.disposition);
  if (bucket.blocked && resolved) throw new AppError("transition_denied");
  if (!resolved) return;
  if (decision.disposition === "none") {
    if (bucket.sources.length || decision.evidence.length || decision.basis !== "no_sources")
      throw new AppError("transition_denied");
    return;
  }
  if (!bucket.sources.length) throw new AppError("transition_denied");
  if (decision.category === "personal_activity") {
    if (
      decision.disposition !== "disclosed" ||
      decision.basis !== "reviewed_disclosure" ||
      decision.evidence.length
    )
      throw new AppError("transition_denied");
    return;
  }
  if (decision.category === "restricted_material_and_security_credentials") {
    if (decision.disposition !== "withheld" || decision.basis !== "security_boundary")
      throw new AppError("transition_denied");
  } else if (
    decision.disposition === "withheld" &&
    !["other_party_confidentiality", "outside_person_scope"].includes(decision.basis)
  )
    throw new AppError("validation_failed");
  else if (decision.disposition === "disclosed" && decision.basis !== "reviewed_disclosure")
    throw new AppError("validation_failed");
  // Every source is covered by a concrete reviewed redacted copy or withholding notice.
  // No arbitrary free text or confirmation can stand in for that evidence.
  if (
    decision.evidence.length !== bucket.sources.length ||
    new Set(decision.evidence.map((row) => row.sourceKey)).size !== bucket.sources.length
  )
    throw new AppError("validation_failed");
  for (const source of bucket.sources) {
    const proof = decision.evidence.find((row) => row.sourceKey === source.key);
    if (
      !proof ||
      !supplements.some(
        (row) =>
          row.category === decision.category && row.source.versionId === proof.documentVersionId,
      )
    )
      throw new AppError("validation_failed");
  }
}

export function safeCoverage(
  review: PrivacyExportReview,
): { category: PrivacyExportCategory; disposition: string }[] {
  return privacyExportCategories.map((category) => ({
    category,
    disposition:
      review.decisions.find((row) => row.category === category)?.disposition ?? "unsupported",
  }));
}
