// B10/O26/O27 · AT45/AT56: exact original agency evidence, never a raw disclosure dump.
import "server-only";
import { and, asc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import {
  caseParticipants,
  cases,
  contentPageVersions,
  documents,
  documentVersions,
  agencyEvidenceHistory as history,
  inquiries,
  parties,
  agencyCaseReviews as reviews,
  agencyPartnerTerms as terms,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { can, resolveGrants } from "../authz";
import { liveParticipation } from "../cases/shared";
import { getEnv } from "../config/env";
import { hashRequest, keyedHash } from "../crypto";
import type { Executor } from "../db";
import { caseDocumentPurposes } from "../documents/purposes";
import { AppError } from "../errors";
import { visibleWhere } from "../work/shared";

type Kind = "partner_terms" | "case_review";
const nullableId = z.uuid().nullable();
const bindingSchema = z.object({
  kind: z.enum(["partner_terms", "case_review"]),
  id: z.uuid(),
  caseId: nullableId,
  partyId: z.uuid(),
  documentVersionId: nullableId,
  contentVersionId: nullableId,
  policyVersionId: nullableId,
});
type Binding = z.infer<typeof bindingSchema>;
export interface AgencySource {
  id: string;
  kind: Kind;
  version: number;
  digest: string;
  parties: string[];
}
const commitment = (value: SQL) =>
  sql<string>`encode(sha256(convert_to(${value}::text, 'UTF8')), 'hex')`;
const opaque = (value: unknown) =>
  keyedHash(
    getEnv().authSecret,
    `agency-source-revision:v1:${hashRequest(JSON.parse(JSON.stringify(value)))}`,
  );
const bounded = <T>(rows: T[], max: number): T[] => {
  if (rows.length > max) throw new AppError("validation_failed");
  return rows;
};
const termsKeys = [
  "id",
  "version",
  "createdAt",
  "updatedAt",
  "caseId",
  "counterpartyPartyId",
  "ownerId",
  "relationship",
  "purpose",
  "sourceReference",
  "sourceVersion",
  "termsText",
  "documentVersionId",
  "documentDigest",
  "acceptedReference",
  "acceptedAt",
  "validUntil",
  "unknowns",
  "termsHash",
  "state",
  "approvedHash",
  "professionalName",
  "approvedById",
  "approvedAt",
  "revokedReason",
  "decisionNote",
];
const reviewKeys = [
  "id",
  "version",
  "createdAt",
  "updatedAt",
  "caseId",
  "authorPartyId",
  "ownerId",
  "contentPageVersionId",
  "contentHash",
  "displayChoice",
  "publicName",
  "reviewText",
  "verificationStatement",
  "bindingHash",
  "consentState",
  "consentHash",
  "consentSource",
  "consentDocumentVersionId",
  "consentDocumentDigest",
  "consentPolicyVersionId",
  "consentPolicyHash",
  "consentById",
  "consentAt",
  "consentReference",
  "verifiedHash",
  "verifiedById",
  "verifiedAt",
  "verificationNote",
];
const knownSnapshot = (keys: string[]) =>
  sql<boolean>`(${history.snapshot} - array[${sql.join(
    keys.map((key) => sql`${key}`),
    sql`, `,
  )}]::text[]) = '{}'::jsonb`;

async function caseReadable(db: Executor, actor: Actor, id: string) {
  const [row] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, id));
  return Boolean(
    row && (await can(db, actor, "case.read", { type: "case", id, audience: "case_participants" })),
  );
}
async function fileRevision(db: Executor, actor: Actor, id: string) {
  const [row] = await db
    .select({
      id: documentVersions.id,
      version: documentVersions.version,
      number: documentVersions.versionNumber,
      digest: documentVersions.sha256,
      state: documentVersions.state,
      review: documentVersions.reviewType,
      scan: documentVersions.scan,
      scannedSha256: documentVersions.scannedSha256,
      scannedAt: documentVersions.scannedAt,
      reviewedAt: documentVersions.reviewedAt,
      reviewedById: documentVersions.reviewedById,
      documentId: documents.id,
      documentVersion: documents.version,
      current: documents.currentVersionNumber,
      caseId: documents.caseId,
      audience: documents.audience,
      purpose: documents.purpose,
      expiresAt: documents.expiresAt,
    })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(eq(documentVersions.id, id));
  if (
    !row ||
    (row.expiresAt && row.expiresAt <= new Date()) ||
    !(await can(db, actor, "document.read_restricted", {
      type: "document",
      id: row.documentId,
      audience: row.audience,
    })) ||
    (row.caseId && !(await caseReadable(db, actor, row.caseId)))
  )
    return null;
  if (
    (caseDocumentPurposes as readonly string[]).includes(row.purpose) &&
    (row.audience !== "internal" ||
      !row.caseId ||
      !(await can(db, actor, "compliance.review", {
        type: "case",
        id: row.caseId,
        audience: "internal",
      })))
  )
    return null;
  return row;
}
async function contentRevision(db: Executor, id: string) {
  const [row] = await db
    .select({
      id: contentPageVersions.id,
      version: contentPageVersions.versionNumber,
      locale: contentPageVersions.sourceLocale,
      contentHash: contentPageVersions.contentHash,
      body: commitment(sql`${contentPageVersions.body}`),
    })
    .from(contentPageVersions)
    .where(eq(contentPageVersions.id, id));
  return row ?? null;
}
async function bindingRevision(db: Executor, actor: Actor, binding: Binding) {
  if (
    actor.kind !== "staff" ||
    (await countActivePasskeys(db, actor.id)) < staffPasskeyMinimum ||
    (binding.kind === "case_review" && !binding.caseId)
  )
    return null;
  const [party] = await db
    .select({ id: parties.id })
    .from(parties)
    .where(eq(parties.id, binding.partyId));
  if (!party || (binding.caseId && !(await caseReadable(db, actor, binding.caseId)))) return null;
  const file = binding.documentVersionId
    ? await fileRevision(db, actor, binding.documentVersionId)
    : null;
  if (binding.documentVersionId && !file) return null;
  const resource = binding.caseId
    ? { type: "case", id: binding.caseId, audience: "internal" as const }
    : { type: "document", id: file?.documentId, audience: "internal" as const };
  if (!(await can(db, actor, "compliance.review", resource))) return null;
  if (binding.kind === "partner_terms") {
    const [participant] = binding.caseId
      ? await db
          .select({ id: caseParticipants.id })
          .from(caseParticipants)
          .where(
            and(
              eq(caseParticipants.caseId, binding.caseId),
              eq(caseParticipants.partyId, binding.partyId),
              liveParticipation(),
            ),
          )
          .limit(1)
      : [];
    if (!participant) {
      const grants = await resolveGrants(db, actor);
      const [contact] = await db
        .select({ id: inquiries.id })
        .from(inquiries)
        .where(
          and(
            eq(inquiries.partyId, binding.partyId),
            visibleWhere(grants, "inquiry.read", "inquiry"),
          ),
        )
        .limit(1);
      if (!contact) return null;
    }
  }
  const content = binding.contentVersionId
    ? await contentRevision(db, binding.contentVersionId)
    : null;
  const policy = binding.policyVersionId
    ? await contentRevision(db, binding.policyVersionId)
    : null;
  if ((binding.kind === "case_review" && !content) || (binding.policyVersionId && !policy))
    return null;
  // Original scopes remain readable history after identity association. A merged pointer
  // supplies no current-use eligibility, canonical consent, approval or editing authority.
  return { binding, file, content, policy };
}

/** A source is grouped with all its retained history, including earlier Party/Case scopes.
 * SQL returns only declared ACL fields and commitments, never wording, notes or snapshots.
 * Each unknown/unreadable historical scope holds the whole collection without identities. */
export async function collectAgencySources(
  db: Executor,
  actor: Actor,
  partyIds: string[],
  caseIds: string[],
  lock = false,
  max = 1000,
) {
  const selectedParties = [...new Set(partyIds)].sort(),
    selectedCases = [...new Set(caseIds)].sort();
  const historicalScope = or(
    and(
      eq(history.recordType, "partner_terms"),
      inArray(sql<string>`${history.snapshot}->>'counterpartyPartyId'`, selectedParties),
    ),
    and(
      eq(history.recordType, "case_review"),
      inArray(sql<string>`${history.snapshot}->>'authorPartyId'`, selectedParties),
    ),
    selectedCases.length
      ? inArray(sql<string>`${history.snapshot}->>'caseId'`, selectedCases)
      : undefined,
  );
  const historicalIds = (kind: Kind) =>
    db
      .select({ id: history.recordId })
      .from(history)
      .where(and(eq(history.recordType, kind), historicalScope));
  const termQuery = db
    .select({
      id: terms.id,
      version: terms.version,
      caseId: terms.caseId,
      partyId: terms.counterpartyPartyId,
      documentVersionId: terms.documentVersionId,
      digest:
        commitment(sql`jsonb_build_array(${terms.id}, ${terms.version}, ${terms.createdAt}, ${terms.updatedAt},
      ${terms.caseId}, ${terms.counterpartyPartyId}, ${terms.ownerId}, ${terms.relationship}, ${terms.purpose},
      ${terms.sourceReference}, ${terms.sourceVersion}, ${terms.termsText}, ${terms.documentVersionId},
      ${terms.documentDigest}, ${terms.acceptedReference}, ${terms.acceptedAt}, ${terms.validUntil}, ${terms.unknowns},
      ${terms.termsHash}, ${terms.state}, ${terms.approvedHash}, ${terms.professionalName}, ${terms.approvedById},
      ${terms.approvedAt}, ${terms.revokedReason})`),
    })
    .from(terms)
    .where(
      or(
        inArray(terms.counterpartyPartyId, selectedParties),
        selectedCases.length ? inArray(terms.caseId, selectedCases) : undefined,
        inArray(terms.id, historicalIds("partner_terms")),
      ),
    )
    .orderBy(asc(terms.id))
    .limit(max + 1);
  const reviewQuery = db
    .select({
      id: reviews.id,
      version: reviews.version,
      caseId: reviews.caseId,
      partyId: reviews.authorPartyId,
      documentVersionId: reviews.consentDocumentVersionId,
      contentVersionId: reviews.contentPageVersionId,
      policyVersionId: reviews.consentPolicyVersionId,
      digest:
        commitment(sql`jsonb_build_array(${reviews.id}, ${reviews.version}, ${reviews.createdAt}, ${reviews.updatedAt},
      ${reviews.caseId}, ${reviews.authorPartyId}, ${reviews.ownerId}, ${reviews.contentPageVersionId}, ${reviews.contentHash},
      ${reviews.displayChoice}, ${reviews.publicName}, ${reviews.reviewText}, ${reviews.verificationStatement}, ${reviews.bindingHash},
      ${reviews.consentState}, ${reviews.consentHash}, ${reviews.consentSource}, ${reviews.consentDocumentVersionId},
      ${reviews.consentDocumentDigest}, ${reviews.consentPolicyVersionId}, ${reviews.consentPolicyHash}, ${reviews.consentById},
      ${reviews.consentAt}, ${reviews.consentReference}, ${reviews.verifiedHash}, ${reviews.verifiedById}, ${reviews.verifiedAt}, ${reviews.verificationNote})`),
    })
    .from(reviews)
    .where(
      or(
        inArray(reviews.authorPartyId, selectedParties),
        selectedCases.length ? inArray(reviews.caseId, selectedCases) : undefined,
        inArray(reviews.id, historicalIds("case_review")),
      ),
    )
    .orderBy(asc(reviews.id))
    .limit(max + 1);
  const termRows = bounded(await (lock ? termQuery.for("share") : termQuery), max),
    reviewRows = bounded(await (lock ? reviewQuery.for("share") : reviewQuery), max);
  const historyQuery = db
    .select({
      id: history.id,
      kind: history.recordType,
      recordId: history.recordId,
      actorKind: history.actorKind,
      actorId: history.actorId,
      action: history.action,
      operationId: history.operationId,
      createdAt: history.createdAt,
      snapshotId: sql<unknown>`${history.snapshot}->>'id'`,
      caseId: sql<unknown>`${history.snapshot}->>'caseId'`,
      partyId: sql<unknown>`case when ${history.recordType} = 'partner_terms' then ${history.snapshot}->>'counterpartyPartyId' else ${history.snapshot}->>'authorPartyId' end`,
      documentVersionId: sql<unknown>`case when ${history.recordType} = 'partner_terms' then ${history.snapshot}->>'documentVersionId' else ${history.snapshot}->>'consentDocumentVersionId' end`,
      contentVersionId: sql<unknown>`${history.snapshot}->>'contentPageVersionId'`,
      policyVersionId: sql<unknown>`${history.snapshot}->>'consentPolicyVersionId'`,
      known: sql<boolean>`case when jsonb_typeof(${history.snapshot}) <> 'object'
        or octet_length(${history.snapshot}::text) > 65536 then false
        when ${history.recordType} = 'partner_terms' then ${knownSnapshot(termsKeys)} else ${knownSnapshot(reviewKeys)} end`,
      digest: commitment(sql`${history.snapshot}`),
    })
    .from(history)
    .where(
      or(
        historicalScope,
        termRows.length
          ? and(
              eq(history.recordType, "partner_terms"),
              inArray(
                history.recordId,
                termRows.map((row) => row.id),
              ),
            )
          : undefined,
        reviewRows.length
          ? and(
              eq(history.recordType, "case_review"),
              inArray(
                history.recordId,
                reviewRows.map((row) => row.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(asc(history.id))
    .limit(max + 1);
  const historyRows = bounded(await (lock ? historyQuery.for("share") : historyQuery), max);
  const sources: AgencySource[] = [];
  let mergeHeld = false;
  const records = [
    ...termRows.map((row) => ({
      ...row,
      kind: "partner_terms" as const,
      contentVersionId: null,
      policyVersionId: null,
    })),
    ...reviewRows.map((row) => ({ ...row, kind: "case_review" as const })),
  ];
  let blocked = historyRows.some(
    (event) => !records.some((row) => row.kind === event.kind && row.id === event.recordId),
  );
  for (const row of records) {
    const binding = bindingSchema.parse(row),
      current = await bindingRevision(db, actor, binding);
    if (binding.kind === "partner_terms" && !binding.caseId && !binding.documentVersionId)
      mergeHeld = true;
    const retained = historyRows.filter(
      (event) => event.kind === row.kind && event.recordId === row.id,
    );
    const revisions = [];
    const originalParties = new Set([row.partyId]);
    if (!current) blocked = true;
    for (const event of retained) {
      const historical = bindingSchema.safeParse({ ...event, id: event.recordId });
      if (!event.known || event.snapshotId !== row.id || !historical.success) {
        blocked = true;
        continue;
      }
      originalParties.add(historical.data.partyId);
      if (
        historical.data.kind === "partner_terms" &&
        !historical.data.caseId &&
        !historical.data.documentVersionId
      )
        mergeHeld = true;
      const scope = await bindingRevision(db, actor, historical.data);
      if (!scope) blocked = true;
      revisions.push({ event, scope });
    }
    sources.push({
      id: row.id,
      kind: row.kind,
      version: row.version,
      digest: opaque({ row, current, history: revisions }),
      parties: selectedParties.filter((id) => originalParties.has(id)),
    });
  }
  const visible = blocked ? [] : sources;
  return {
    blocked,
    mergeHeld: !blocked && mergeHeld,
    sources: visible,
    revision: opaque({ blocked, sources: visible }),
  };
}

export async function collectPartyAgencySources(db: Executor, actor: Actor, partyId: string) {
  const links = bounded(
    await db
      .select({ caseId: caseParticipants.caseId })
      .from(caseParticipants)
      .where(eq(caseParticipants.partyId, partyId))
      .orderBy(asc(caseParticipants.id))
      .limit(1001),
    1000,
  );
  return collectAgencySources(
    db,
    actor,
    [partyId],
    links.map((row) => row.caseId),
  );
}
