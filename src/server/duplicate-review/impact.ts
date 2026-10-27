import "server-only";
import { and, asc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import {
  inquiries,
  listings,
  parties,
  privacyExports,
  privacyRequests,
  properties,
} from "@/db/schema";
import type { Actor, Capability } from "@/domain/capabilities";
import { requireFreshAuth, type Session } from "@/server/auth/sessions";
import { can, type Resource, resolveGrants } from "@/server/authz";
import { getEnv } from "@/server/config/env";
import { hashRequest, keyedHash } from "@/server/crypto";
import type { Executor } from "@/server/db";
import { caseDocumentPurposes } from "@/server/documents/purposes";
import { assertRequestedDocumentAccess } from "@/server/documents/request-access";
import { AppError } from "@/server/errors";
import { documentAccess, mediaAccess } from "@/server/files/access";
import { privacyOperator } from "@/server/privacy/access";
import { collectAgencySources } from "@/server/privacy/agency-sources";
import { appointmentSourceRevision } from "@/server/privacy/photography-sources";
import { serviceContextRevision } from "@/server/privacy/service-sources";
import { privacySafetyRevision } from "@/server/privacy/source-fingerprint";
import { liveStaff, visibleWhere } from "@/server/work/shared";

export const duplicatePairSchema = z
  .object({
    subject: z.enum(["party", "property"]),
    left: z.uuid(),
    right: z.uuid(),
  })
  .strict()
  .refine((v) => v.left !== v.right);
export type DuplicatePair = z.infer<typeof duplicatePairSchema>;
export type MergeSubject = DuplicatePair["subject"];
export type Hold =
  | "restricted"
  | "unsupported"
  | "too_many"
  | "existing_merge"
  | "different_kind"
  | "verified_contact_conflict"
  | "privacy_restriction"
  | "agency_reconciliation"
  | "changed_after_merge"
  | "already_reversed";
export interface DuplicateIdentity {
  id: string;
  version: number;
  label: string;
  fields: Record<string, string | null>;
  aliases: string[];
  mergedInto: string | null;
  fingerprint: string;
}
export interface RetainedReference {
  table: string;
  id: string;
  sources: string[];
  digest: string;
  /** Only authorized, non-secret relationship/audience metadata. */
  audience: Record<string, unknown>;
  verifiedContact?: { kind: string; valueDigest: string };
}
export interface DuplicateImpact {
  left: DuplicateIdentity;
  right: DuplicateIdentity;
  references: RetainedReference[];
  held: Hold[];
  referenceDigest: string;
  digest: string;
}

/** A merge is an identity relation. This reader never substitutes an ID in an auth check. */
export async function readDuplicateSource(
  db: Executor,
  actor: Actor,
  subject: MergeSubject,
  id: string,
): Promise<DuplicateIdentity> {
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  if (subject === "party") {
    const [row] = await db.select().from(parties).where(eq(parties.id, id));
    if (!row) throw new AppError("not_found");
    // One readable inquiry establishes source visibility; impact checks EVERY linked inquiry.
    let readable = await can(db, actor, "inquiry.read", {
      type: "party",
      id,
      audience: "internal",
    });
    if (!readable) {
      const sources = await db.select().from(inquiries).where(eq(inquiries.partyId, id));
      for (const source of sources) {
        if (
          await can(db, actor, "inquiry.read", {
            type: "inquiry",
            id: source.id,
            caseId: source.caseId ?? undefined,
            locale: source.preferredLocale ?? undefined,
            audience: "internal",
          })
        ) {
          readable = true;
          break;
        }
      }
    }
    if (!readable) throw new AppError("not_found");
    return {
      id,
      version: row.version,
      label: row.displayName,
      fields: {
        kind: row.kind,
        displayName: row.displayName,
        givenName: row.givenName,
        familyName: row.familyName,
        legalName: row.legalName,
        registrationNumber: row.registrationNumber,
        country: row.country,
        preferredLocale: row.preferredLocale,
      },
      aliases: row.matchingAliases,
      mergedInto: row.mergedIntoPartyId,
      fingerprint: hashRequest(JSON.parse(JSON.stringify(row))),
    };
  }
  const [row] = await db.select().from(properties).where(eq(properties.id, id));
  if (!row) throw new AppError("not_found");
  let readable = await can(db, actor, "listing.read", {
    type: "property",
    id,
    audience: "internal",
  });
  if (!readable) {
    const sources = await db.select().from(listings).where(eq(listings.propertyId, id));
    for (const source of sources) {
      if (
        await can(db, actor, "listing.read", {
          type: "listing",
          id: source.id,
          propertyId: id,
          audience: "internal",
        })
      ) {
        readable = true;
        break;
      }
    }
  }
  if (!readable) throw new AppError("not_found");
  return {
    id,
    version: row.version,
    label: row.reference,
    fields: {
      reference: row.reference,
      propertyType: row.propertyType,
      country: row.country,
      region: row.region,
      settlement: row.settlement,
      neighborhood: row.neighborhood,
      exactAddress: row.exactAddress,
      unit: row.unit,
      latitude: row.latitude,
      longitude: row.longitude,
      publicPrecision: row.publicPrecision,
    },
    aliases: [],
    mergedInto: row.mergedIntoPropertyId,
    fingerprint: hashRequest(JSON.parse(JSON.stringify(row))),
  };
}

type Row = Record<string, unknown> & { id: string };
const directPolicies: Record<string, Capability | "source" | "existing_merge"> = {
  principals: "access.grant",
  contact_methods: "source",
  subscriptions: "privacy.manage",
  case_participants: "access.grant",
  property_relationships: "access.grant",
  inquiries: "inquiry.read",
  appointment_participants: "appointment.manage",
  proposal_responses: "proposal.manage",
  privacy_requests: "privacy.manage",
  service_agreements: "compliance.review",
  inbound_emails: "case.read_internal",
  inbound_attachment_imports: "document.read_restricted",
  cases: "case.read_internal",
  tasks: "task.manage",
  appointments: "appointment.manage",
  documents: "document.read_restricted",
  key_sets: "key.manage",
  seller_instructions: "listing.read",
  property_fact_revisions: "listing.read",
  listings: "listing.read",
  media_assets: "media.manage",
  parties: "existing_merge",
  properties: "existing_merge",
};
// Deliberately bounded projections. No credential, session, token or arbitrary JSON scans.
const safeColumns = new Set([
  "id",
  "version",
  "updated_at",
  "created_at",
  "party_id",
  "sender_party_id",
  "property_id",
  "case_id",
  "inquiry_id",
  "appointment_id",
  "revision_id",
  "proposal_revision_id",
  "principal_id",
  "owner_id",
  "host_id",
  "holder_id",
  "responsible_id",
  "service_name",
  "contact_method_id",
  "kind",
  "state",
  "status",
  "role",
  "authority",
  "scope",
  "audience",
  "classification",
  "reference",
  "normalized_value",
  "verification",
  "verified_at",
  "revoked_at",
  "expires_at",
  "valid_from",
  "authority_reviewed_at",
  "authority_reviewed_by_id",
  "merged_into_party_id",
  "merged_into_property_id",
  "capability",
  "record_type",
  "record_id",
  "subject_type",
  "subject_id",
  "result_type",
  "result_id",
  "target_type",
  "target_id",
  "source_key",
  "source_digest",
  "payload_digest",
  "provider",
  "provider_reference",
  "operation_id",
  "batch_id",
  "party_ids",
  "recipients",
  "purpose",
  "policy_version",
  "fact_revision_id",
  "locales",
  "approved_fact_revision_id",
  "processing_state",
  "approved_digest",
  "subject_hash",
  "source_url",
  "content_digest",
  "revision_number",
  "current_version_number",
  "document_version_id",
  "commercial_state",
  "editorial_state",
  "freshness_state",
  "publication_generation",
]);
const audienceColumns = [
  "party_id",
  "sender_party_id",
  "principal_id",
  "owner_id",
  "host_id",
  "holder_id",
  "responsible_id",
  "service_name",
  "case_id",
  "appointment_id",
  "property_id",
  "role",
  "authority",
  "scope",
  "audience",
  "classification",
  "capability",
  "record_type",
  "record_id",
  "revoked_at",
  "expires_at",
  "valid_from",
  "kind",
  "state",
  "status",
  "purpose",
  "contact_method_id",
  "policy_version",
  "provider",
  "provider_reference",
  "operation_id",
  "batch_id",
  "source_key",
  "content_digest",
  "revision_number",
  "current_version_number",
  "commercial_state",
  "editorial_state",
  "freshness_state",
  "publication_generation",
];
const sourceTable = (subject: MergeSubject) => (subject === "party" ? "parties" : "properties");
const ident = (name: string) => sql`${sql.identifier(name)}`;
const idsCondition = (column: SQL, pair: DuplicatePair) =>
  sql`${column} in (${pair.left}::uuid, ${pair.right}::uuid)`;

// Dedicated projections, including the restriction's composite key. A new FK/column is
// still unknown; this declaration does not authorize an arbitrary table or JSON scan.
const privacyPartyEdges = new Set([
  "privacy_exports.party_id",
  "privacy_safety_decisions.party_id",
  "privacy_processing_restrictions.party_id",
]);
const agencyPartyEdges = new Set([
  "agency_partner_terms.counterparty_party_id",
  "agency_case_reviews.author_party_id",
]);

async function privacyHistoryImpact(
  db: Executor,
  session: Session,
  pair: DuplicatePair,
  lock: boolean,
): Promise<{ held: Hold[]; reference?: RetainedReference }> {
  const sources = [pair.left, pair.right].sort();
  const [history] = await db.execute<{ present: boolean }>(sql`select
    exists(select 1 from privacy_exports where ${idsCondition(sql`party_id`, pair)}) or
    exists(select 1 from privacy_safety_decisions where ${idsCondition(sql`party_id`, pair)}) or
    exists(select 1 from privacy_processing_restrictions where ${idsCondition(sql`party_id`, pair)})
    as present`);
  if (!history?.present) return { held: [] };
  try {
    const live = await privacyOperator(db, session);
    for (const id of sources)
      if (
        !(await can(db, live.actor, "privacy.manage", { type: "party", id, audience: "internal" }))
      )
        return { held: ["restricted"] };
    const query = db
      .select({
        id: privacyExports.id,
        version: privacyExports.version,
        createdAt: privacyExports.createdAt,
        updatedAt: privacyExports.updatedAt,
        requestId: privacyExports.requestId,
        requestVersion: privacyExports.requestVersion,
        partyId: privacyExports.partyId,
        recipientId: privacyExports.recipientId,
        state: privacyExports.state,
        sha256: privacyExports.sha256,
        byteSize: privacyExports.byteSize,
        coverageComplete: privacyExports.coverageComplete,
        reviewSha256: privacyExports.reviewSha256,
        completedOperationId: privacyExports.completedOperationId,
        preparedById: privacyExports.preparedById,
        reviewedById: privacyExports.reviewedById,
        reviewedAt: privacyExports.reviewedAt,
        expiresAt: privacyExports.expiresAt,
        revokedAt: privacyExports.revokedAt,
        issuedOperationId: privacyExports.issuedOperationId,
      })
      .from(privacyExports)
      .where(inArray(privacyExports.partyId, sources))
      .orderBy(asc(privacyExports.id))
      .limit(501);
    const exports = await (lock ? query.for("share") : query);
    if (exports.length > 500) return { held: ["too_many"] };
    const safety = await privacySafetyRevision(db, sources, lock, 500);
    const bindings = [
      ...exports.map((row) => ({ id: row.requestId, partyId: row.partyId, required: true })),
      ...safety.requestBindings.map((row) => ({ ...row, required: false })),
    ];
    for (const binding of bindings) {
      const requestQuery = db
        .select({ id: privacyRequests.id, partyId: privacyRequests.partyId })
        .from(privacyRequests)
        .where(eq(privacyRequests.id, binding.id));
      const [request] = await (lock ? requestQuery.for("share") : requestQuery);
      // A restored safety tail may precede its request. This supplies no authority to
      // reopen a restored application; the independent recovery gate still applies.
      if (!request && !binding.required) continue;
      if (request?.partyId !== binding.partyId) return { held: ["restricted"] };
      await privacyOperator(db, live, binding.id);
    }
    return {
      held: safety.clientAccessRestricted ? ["privacy_restriction"] : [],
      reference: {
        table: "privacy_history",
        id: keyedHash(getEnv().authSecret, `duplicate-privacy-pair:v1:${JSON.stringify(sources)}`),
        sources,
        digest: keyedHash(
          getEnv().authSecret,
          `duplicate-privacy-history:v1:${hashRequest(
            JSON.parse(JSON.stringify({ exports, safety: safety.fingerprint })),
          )}`,
        ),
        // One pair-scoped boundary, regardless of private table/row counts or identities.
        audience: {},
      },
    };
  } catch (error) {
    if (error instanceof AppError)
      return { held: [error.code === "validation_failed" ? "too_many" : "restricted"] };
    throw error;
  }
}

/** Read only a declared parent to obtain the same case/property scope as its ordinary reader. */
async function referenceResource(db: Executor, table: string, row: Row): Promise<Resource> {
  let caseId = typeof row.case_id === "string" ? row.case_id : undefined;
  let propertyId = typeof row.property_id === "string" ? row.property_id : undefined;
  if (table === "appointment_participants" && typeof row.appointment_id === "string") {
    const [parent] = await db.execute<{ case_id: string | null; property_id: string | null }>(
      sql`select case_id, property_id from appointments where id = ${row.appointment_id}::uuid`,
    );
    caseId = parent?.case_id ?? undefined;
    propertyId = parent?.property_id ?? undefined;
  }
  if (table === "proposal_responses" && typeof row.revision_id === "string") {
    const [parent] = await db.execute<{ case_id: string }>(sql`
      select p.case_id from proposal_revisions r join proposals p on p.id = r.proposal_id
      where r.id = ${row.revision_id}::uuid`);
    caseId = parent?.case_id;
  }
  const type =
    (
      {
        inquiries: "inquiry",
        cases: "case",
        tasks: "task",
        listings: "listing",
        documents: "document",
        appointments: "appointment",
        appointment_participants: "appointment",
        property_relationships: "property",
        case_participants: "case",
      } as Record<string, string>
    )[table] ?? (propertyId ? "property" : "party");
  const id =
    table === "property_relationships"
      ? propertyId
      : table === "case_participants"
        ? caseId
        : table === "appointment_participants"
          ? String(row.appointment_id)
          : row.id;
  return { type, id, caseId, propertyId, audience: "internal" };
}

async function referenceReadable(
  db: Executor,
  session: Session,
  table: string,
  row: Row,
  pair: DuplicatePair,
) {
  const actor = session.actor;
  const policy = directPolicies[table];
  if (!policy || policy === "existing_merge") return false;
  // Match the ordinary source reader's additional guards; parent-case grants cannot stand
  // in for a document-specific grant, a fresh verification or restricted intake authority.
  try {
    if (table === "privacy_requests") {
      await privacyOperator(db, session, row.id);
      return true;
    }
    if (table === "appointment_participants")
      return (
        typeof row.appointment_id === "string" &&
        Boolean(await appointmentSourceRevision(db, actor, row.appointment_id))
      );
    if (table === "subscriptions") {
      requireFreshAuth(session);
      return can(db, actor, "privacy.manage");
    }
    if (table === "key_sets") return can(db, actor, "key.manage");
    if (table === "media_assets") {
      await mediaAccess(db, session, row.id);
      return true;
    }
    if (table === "documents") {
      requireFreshAuth(session);
      if (row.expires_at && new Date(String(row.expires_at)) <= new Date()) return false;
      if (
        !(await can(db, actor, "document.read_restricted", {
          type: "document",
          id: row.id,
          audience: row.audience as "internal" | "case_participants" | "specialist" | "public",
        }))
      )
        return false;
      if ((caseDocumentPurposes as readonly string[]).includes(String(row.purpose))) {
        if (row.audience !== "internal" || typeof row.case_id !== "string") return false;
        for (const capability of ["compliance.review", "case.read"] as const)
          if (
            !(await can(db, actor, capability, {
              type: "case",
              id: row.case_id,
              audience: "internal",
            }))
          )
            return false;
      }
      await assertRequestedDocumentAccess(db, session, row.id, "metadata");
      return true;
    }
    if (table === "inbound_emails" || table === "inbound_attachment_imports") {
      for (const capability of ["inquiry.assign", "case.read_internal", "message.draft"] as const)
        if (!(await can(db, actor, capability))) return false;
      if (table === "inbound_attachment_imports") {
        if (typeof row.document_version_id !== "string") return false;
        await documentAccess(db, session, row.document_version_id);
      }
      return true;
    }
  } catch (error) {
    if (error instanceof AppError) return false;
    throw error;
  }
  if (policy === "source") {
    const sourceId = String(row.party_id);
    if (await can(db, actor, "inquiry.read", { type: "party", id: sourceId, audience: "internal" }))
      return true;
    const [inquiry] = await db
      .select()
      .from(inquiries)
      .where(eq(inquiries.contactMethodId, row.id));
    return Boolean(
      inquiry &&
        (await can(db, actor, "inquiry.read", {
          type: "inquiry",
          id: inquiry.id,
          caseId: inquiry.caseId ?? undefined,
          audience: "internal",
        })),
    );
  }
  const resource =
    table === "principals" || table === "subscriptions" || table === "privacy_requests"
      ? {
          type: pair.subject,
          id: String(row.party_id ?? row.property_id),
          audience: "internal" as const,
        }
      : await referenceResource(db, table, row);
  if (!(await can(db, actor, policy, resource))) return false;
  if (table === "cases") return can(db, actor, "case.read", resource);
  // Permission-management is not a substitute for reading the actual private relationship.
  if (table === "case_participants") return can(db, actor, "case.read", resource);
  if (table === "property_relationships") return can(db, actor, "listing.read", resource);
  return true;
}

export async function readDuplicateImpact(
  db: Executor,
  session: Session,
  pair: DuplicatePair,
  lock = false,
): Promise<DuplicateImpact> {
  const live = await liveStaff(db, session);
  const left = await readDuplicateSource(db, live.actor, pair.subject, pair.left);
  const right = await readDuplicateSource(db, live.actor, pair.subject, pair.right);
  const held = new Set<Hold>();
  const references = new Map<string, RetainedReference>();
  const source = sourceTable(pair.subject);
  const edges = await db.execute<{ table_name: string; column_name: string }>(sql`
    select t.relname as table_name, a.attname as column_name
    from pg_constraint c join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = to_regclass(${source})
      and n.nspname = current_schema() order by t.relname, a.attname`);
  const columnRows = await db.execute<{ table_name: string; column_name: string }>(sql`
    select table_name, column_name from information_schema.columns where table_schema = current_schema()
    order by table_name, ordinal_position`);
  const columns = new Map<string, string[]>();
  for (const col of columnRows)
    columns.set(col.table_name, [...(columns.get(col.table_name) ?? []), col.column_name]);
  const readRows = async (table: string, condition: SQL, policy?: Capability) => {
    const selected = (columns.get(table) ?? []).filter((c) => safeColumns.has(c));
    if (!selected.includes("id")) {
      held.add("unsupported");
      return;
    }
    // Only these two declared B11 fields are read, and only an opaque commitment leaves
    // the reader. They never enter audience metadata or identity/ownership matching.
    const serviceColumn =
      table === "inquiries"
        ? sql`, context->'service' as retained_service_context`
        : table === "cases"
          ? sql`, service_context as retained_service_context`
          : sql``;
    const rows =
      await db.execute<Row>(sql`select ${sql.join(selected.map(ident), sql`, `)}${serviceColumn}
      from ${ident(table)} where ${condition} order by id limit 501 ${lock ? sql`for share` : sql``}`);
    if (rows.length > 500 || references.size + rows.length > 2000) {
      held.add("too_many");
      return;
    }
    for (const row of rows) {
      if (table === source && (row.id === pair.left || row.id === pair.right)) continue;
      if (directPolicies[table] === "existing_merge") {
        held.add("existing_merge");
        continue;
      }
      const readable =
        table === "grants" && row.principal_id === live.actor.id
          ? true
          : policy
            ? row.case_id
              ? await can(db, live.actor, policy, await referenceResource(db, table, row))
              : (await can(db, live.actor, policy, {
                  type: pair.subject,
                  id: pair.left,
                  audience: "internal",
                })) &&
                (await can(db, live.actor, policy, {
                  type: pair.subject,
                  id: pair.right,
                  audience: "internal",
                }))
            : await referenceReadable(db, live, table, row, pair);
      if (!readable) {
        held.add(directPolicies[table] || policy ? "restricted" : "unsupported");
        continue;
      }
      const { retained_service_context: service, ...record } = row;
      let serviceRevision: string | undefined;
      if (table === "inquiries" || table === "cases") {
        try {
          serviceRevision = serviceContextRevision(service);
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          held.add("unsupported");
          continue;
        }
      }
      let appointmentRevision: string | undefined;
      if (table === "appointments") {
        const source = await appointmentSourceRevision(db, live.actor, row.id, lock, 500);
        if (!source) {
          held.add("restricted");
          continue;
        }
        appointmentRevision = source.digest;
      }
      const serialized = JSON.stringify(record);
      references.set(`${table}:${row.id}`, {
        table,
        id: row.id,
        sources: [pair.left, pair.right].filter((id) => serialized.includes(id)),
        digest: hashRequest(
          JSON.parse(JSON.stringify({ ...record, serviceRevision, appointmentRevision })),
        ),
        audience: Object.fromEntries(
          audienceColumns.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]),
        ),
        ...(table === "contact_methods" && row.verification === "verified"
          ? {
              verifiedContact: {
                kind: String(row.kind),
                valueDigest: hashRequest(row.normalized_value),
              },
            }
          : {}),
      });
    }
  };
  for (const edge of edges) {
    const condition = idsCondition(ident(edge.column_name), pair);
    if (pair.subject === "party" && privacyPartyEdges.has(`${edge.table_name}.${edge.column_name}`))
      continue;
    if (pair.subject === "party" && agencyPartyEdges.has(`${edge.table_name}.${edge.column_name}`))
      continue;
    // Unknown populated edges are held; nothing about their contents is exposed or hashed.
    if (!(edge.table_name in directPolicies)) {
      const [exists] = await db.execute<{ present: boolean }>(sql`select exists(select 1 from
        ${ident(edge.table_name)} where ${condition}) as present`);
      if (exists?.present) held.add("unsupported");
      continue;
    }
    await readRows(edge.table_name, condition);
  }
  // Declared polymorphic identity references; the original IDs are preserved in every row.
  const polymorphic: Array<[string, string, string, Capability]> = [
    ["grants", "record_type", "record_id", "access.grant"],
    ["activity_events", "record_type", "record_id", "audit.read"],
    ["audit_events", "record_type", "record_id", "audit.read"],
    ["operations", "result_type", "result_id", "audit.read"],
    ["outbox_events", "subject_type", "subject_id", "audit.read"],
    ["external_actions", "subject_type", "subject_id", "audit.read"],
    ["approvals", "subject_type", "subject_id", "audit.read"],
    ["import_rows", "target_type", "target_id", "import.run"],
  ];
  for (const [table, type, id, policy] of polymorphic) {
    let condition = sql`${ident(type)} = ${pair.subject} and ${idsCondition(ident(id), pair)}`;
    // These append-only B04 receipts describe the mapping; they are retained history, not new dependents.
    if (table === "operations")
      condition = sql`${condition} and operation_type not in ('duplicate.merge','duplicate.reverse')`;
    if (table === "activity_events")
      condition = sql`${condition} and message_key not in ('duplicate.merge','duplicate.reverse')`;
    if (table === "audit_events")
      condition = sql`${condition} and action not in ('duplicate.merge','duplicate.reverse')`;
    if (table === "outbox_events")
      condition = sql`${condition} and event_type not in ('duplicate.merge','duplicate.reverse')`;
    await readRows(table, condition, policy);
  }
  // Invitation scopes and compliance-party sets are declared identity-bearing JSON fields.
  for (const table of ["case_participants", "property_relationships"]) {
    await readRows(
      table,
      sql`scope @> ${JSON.stringify({ resources: [{ type: pair.subject, id: pair.left }] })}::jsonb
      or scope @> ${JSON.stringify({ resources: [{ type: pair.subject, id: pair.right }] })}::jsonb`,
    );
  }
  if (pair.subject === "party") {
    const privacy = await privacyHistoryImpact(db, live, pair, lock);
    for (const hold of privacy.held) held.add(hold);
    if (privacy.reference)
      references.set(`${privacy.reference.table}:${privacy.reference.id}`, privacy.reference);
    await readRows(
      "case_process_reviews",
      sql`party_ids ?| array[${pair.left}, ${pair.right}]`,
      "compliance.review",
    );
    // Recipient identities are retained; sending/consent decisions are never folded together.
    await readRows(
      "messages",
      sql`recipients @> ${JSON.stringify([{ partyId: pair.left }])}::jsonb
      or recipients @> ${JSON.stringify([{ partyId: pair.right }])}::jsonb`,
      "case.read_internal",
    );
  }
  // Private documents in a source's related Cases keep their existing, explicit audiences.
  const caseIds = [
    ...new Set(
      [...references.values()]
        .map((r) => r.audience.case_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ].sort();
  if (caseIds.length) {
    await readRows(
      "cases",
      sql`id in (${sql.join(
        caseIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}) and (kind = 'service_intake' or service_context is not null)`,
    );
    await readRows(
      "documents",
      sql`case_id in (${sql.join(
        caseIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }
  const appointmentIds = [
    ...new Set(
      [...references.values()]
        .map((row) => row.audience.appointment_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ].sort();
  if (caseIds.length || appointmentIds.length)
    await readRows(
      "appointments",
      or(
        caseIds.length
          ? sql`case_id in (${sql.join(
              caseIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`
          : undefined,
        appointmentIds.length
          ? sql`id in (${sql.join(
              appointmentIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`
          : undefined,
      ) ?? sql`false`,
    );
  try {
    const agency = await collectAgencySources(
      db,
      live.actor,
      pair.subject === "party" ? [pair.left, pair.right] : [],
      caseIds,
      lock,
      500,
    );
    if (agency.blocked) held.add("restricted");
    if (agency.mergeHeld) held.add("agency_reconciliation");
    if (references.size + agency.sources.length > 2000) throw new AppError("validation_failed");
    for (const row of agency.sources)
      references.set(`agency:${row.kind}:${row.id}`, {
        table: row.kind === "partner_terms" ? "agency_partner_terms" : "agency_case_reviews",
        id: row.id,
        sources: row.parties,
        digest: row.digest,
        audience: {},
      });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    held.add(error.code === "validation_failed" ? "too_many" : "restricted");
  }
  const refs = [...references.values()].sort((a, b) =>
    `${a.table}:${a.id}`.localeCompare(`${b.table}:${b.id}`),
  );
  const referenceDigest = hashRequest({ edges: [...edges], references: refs });
  const result = { left, right, references: refs, held: [...held].sort(), referenceDigest };
  return { ...result, digest: hashRequest(result) };
}

export async function listDuplicateSources(
  db: Executor,
  session: Session,
  subject: MergeSubject,
  after?: string,
) {
  const live = await liveStaff(db, session);
  if (after && !z.uuid().safeParse(after).success) throw new AppError("not_found");
  const grants = await resolveGrants(db, live.actor);
  const table = subject === "party" ? parties : properties;
  const pointer = subject === "party" ? parties.mergedIntoPartyId : properties.mergedIntoPropertyId;
  const recordScope = (capability: Capability, type: string, id: SQL) =>
    or(
      ...grants
        .filter((grant) => grant.capability === capability)
        .flatMap(({ scope }) => {
          if (
            scope?.locales ||
            (scope?.expiresAt && new Date(scope.expiresAt) <= new Date()) ||
            (scope?.recordType && scope.recordType !== type)
          )
            return [];
          return [scope?.recordId ? sql`${id} = ${scope.recordId}::uuid` : sql`true`];
        }),
    ) ?? sql`false`;
  const readable =
    subject === "party"
      ? or(
          recordScope("inquiry.read", "party", sql`${parties.id}`),
          sql`exists(select 1 from ${inquiries}
        where ${inquiries.partyId} = ${parties.id} and ${visibleWhere(grants, "inquiry.read", "inquiry")})`,
        )
      : or(
          recordScope("listing.read", "property", sql`${properties.id}`),
          sql`exists(select 1 from ${listings}
        where ${listings.propertyId} = ${properties.id} and ${recordScope("listing.read", "listing", sql`${listings.id}`)})`,
        );
  const candidates = await db
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        recordScope("import.run", subject, sql`${table.id}`),
        readable,
        sql`${pointer} is null`,
        after ? sql`${table.id} > ${after}::uuid` : undefined,
      ),
    )
    .orderBy(asc(table.id))
    .limit(51);
  const visible: Array<{ id: string; label: string }> = [];
  for (const candidate of candidates.slice(0, 50)) {
    if (
      !(await can(db, live.actor, "import.run", {
        type: subject,
        id: candidate.id,
        audience: "internal",
      }))
    )
      continue;
    try {
      const row = await readDuplicateSource(db, live.actor, subject, candidate.id);
      if (!row.mergedInto) visible.push({ id: row.id, label: row.label });
    } catch (error) {
      if (!(error instanceof AppError && error.code === "not_found")) throw error;
    }
  }
  return {
    rows: visible,
    nextCursor: candidates.length > 50 ? (visible.at(-1)?.id ?? null) : null,
  };
}

/** Useful canonical navigation, with independent visibility checks for EVERY source/alias. */
export async function readCanonicalDuplicate(
  db: Executor,
  session: Session,
  subject: MergeSubject,
  id: string,
) {
  const live = await liveStaff(db, session);
  const source = await readDuplicateSource(db, live.actor, subject, id);
  let canonical = source;
  if (source.mergedInto)
    canonical = await readDuplicateSource(db, live.actor, subject, source.mergedInto);
  if (canonical.mergedInto) throw new AppError("transition_denied");
  const table = subject === "party" ? parties : properties;
  const pointer = subject === "party" ? parties.mergedIntoPartyId : properties.mergedIntoPropertyId;
  const aliases = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(pointer, canonical.id))
    .orderBy(asc(table.id));
  const visible: DuplicateIdentity[] = [];
  for (const alias of aliases) {
    try {
      visible.push(await readDuplicateSource(db, live.actor, subject, alias.id));
    } catch (error) {
      if (!(error instanceof AppError && error.code === "not_found")) throw error;
    }
  }
  return { subject, source, canonical, aliases: visible };
}
