// A bounded own-party inventory with opaque dependency/retention evidence.
import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  contactMethods,
  grants,
  parties,
  passkeys,
  principals,
  privacyRequests,
  staffMemberships,
  subscriptions,
} from "@/db/schema";
import type { ErasureInventory, ErasureSource } from "@/domain/privacy-erasure";
import { optionalProcessingPurposes } from "@/domain/privacy-erasure";
import type { Session } from "../auth/sessions";
import { hasPrivacyRetentionHold } from "../compliance/retention";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { captureOperatingPolicy } from "../operating-policy/service";
import { privacyOperator } from "./access";

type Dependency = { tableName: string; columnName: string; targetName: string };
async function dependencyColumns(db: Executor) {
  return db.execute<Dependency>(sql`
    select rel.relname as "tableName", col.attname as "columnName", target.relname as "targetName"
    from pg_constraint c join pg_class rel on rel.oid=c.conrelid
    join pg_namespace ns on ns.oid=rel.relnamespace
    join pg_class target on target.oid=c.confrelid
    join pg_attribute col on col.attrelid=c.conrelid and col.attnum=c.conkey[1]
    where c.contype='f' and ns.nspname='public' and cardinality(c.conkey)=1
      and target.relname in ('parties','contact_methods','principals')
    order by rel.relname, col.attname`);
}

/** Short, offline-provider-free explicit privacy command. Lock the known dependency tables
 * before re-inventory so a new relationship or revoked grant cannot race copy removal.
 * Deterministic table ordering avoids relying on every writer adopting an advisory lock. */
export async function lockErasureSources(db: Executor) {
  const deps = await dependencyColumns(db);
  const names = [
    ...new Set([
      ...deps.map((row) => row.tableName),
      "parties",
      "contact_methods",
      "principals",
      "subscriptions",
      "grants",
      "staff_memberships",
      "passkeys",
      "sessions",
      "privacy_requests",
      "operating_policy_versions",
      "consent_events",
      "cases",
      "case_stage_history",
      "case_process_reviews",
      "case_process_items",
      "document_requests",
      "document_versions",
      "service_agreements",
      "suspicion_reports",
      "process_policies",
    ]),
  ].sort();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`lock table ${sql.join(
          names.map((name) => sql.identifier(name)),
          sql`, `,
        )} in exclusive mode nowait`,
      );
    });
  } catch (error) {
    const code =
      (error as { code?: string; cause?: { code?: string } }).cause?.code ??
      (error as { code?: string }).code;
    if (code === "55P03" || code === "40P01") throw new AppError("unavailable");
    throw error;
  }
}

async function dependencyEvidence(
  db: Executor,
  partyId: string,
  contactIds: string[],
  clientIds: string[],
) {
  const columns = await dependencyColumns(db),
    fingerprints: unknown[] = [];
  let businessDependencies = false;
  const ownPartyTables = new Set([
    "principals",
    "contact_methods",
    "subscriptions",
    "privacy_requests",
    "privacy_exports",
    "privacy_safety_decisions",
    "privacy_processing_restrictions",
  ]);
  const ownPrincipalTables = new Set([
    "grants",
    "sessions",
    "passkeys",
    "email_sign_in_tokens",
    "invitations",
    "webauthn_challenges",
  ]);
  for (const column of columns) {
    const ids =
      column.targetName === "parties"
        ? [partyId]
        : column.targetName === "contact_methods"
          ? contactIds
          : clientIds;
    if (!ids.length) continue;
    const field = sql.identifier(column.columnName);
    const [row] = await db.execute<{ count: string; digest: string }>(sql`
      select count(*)::text as count,
        md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by md5(to_jsonb(r)::text)),'')) as digest
      from ${sql.identifier(column.tableName)} r where ${field} in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`,`,
      )})`);
    if (!row) throw new AppError("unavailable");
    fingerprints.push({ ...column, ...row });
    const known =
      column.targetName === "parties"
        ? ownPartyTables.has(column.tableName)
        : column.targetName === "principals"
          ? ownPrincipalTables.has(column.tableName)
          : column.tableName === "subscriptions";
    if (!known && row.count !== "0") businessDependencies = true;
  }
  return { businessDependencies, dependencyDigest: hashRequest(fingerprints) };
}

export async function erasureRequest(db: Executor, session: Session, id: string, version?: number) {
  const live = await privacyOperator(db, session, id);
  const [request] = await db.select().from(privacyRequests).where(eq(privacyRequests.id, id));
  if (!request?.partyId || !["deletion", "restriction"].includes(request.kind))
    throw new AppError("not_found");
  if (version !== undefined && request.version !== version) throw new AppError("version_conflict");
  return { live, request };
}

export async function collectErasureInventory(
  db: Executor,
  session: Session,
  requestId: string,
): Promise<ErasureInventory> {
  const { live, request } = await erasureRequest(db, session, requestId);
  const partyId = request.partyId;
  if (!partyId) throw new AppError("not_found");
  const [party] = await db.select().from(parties).where(eq(parties.id, partyId));
  if (!party) throw new AppError("not_found");
  const contacts = await db
    .select()
    .from(contactMethods)
    .where(eq(contactMethods.partyId, partyId))
    .orderBy(asc(contactMethods.id));
  const accounts = await db
    .select()
    .from(principals)
    .where(eq(principals.partyId, partyId))
    .orderBy(asc(principals.id));
  const clients = accounts.filter((row) => row.kind === "client");
  const streams = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.partyId, partyId))
    .orderBy(asc(subscriptions.id));
  if (contacts.length + accounts.length + streams.length > 450) throw new AppError("unavailable");
  const dependency = await dependencyEvidence(
    db,
    partyId,
    contacts.map((row) => row.id),
    clients.map((row) => row.id),
  );
  const retentionHold = await hasPrivacyRetentionHold(db, partyId);
  const eligible =
    !retentionHold &&
    !dependency.businessDependencies &&
    !accounts.some((row) => row.kind === "staff");
  const source = (
    key: string,
    category: ErasureSource["category"],
    value: unknown,
    canErase: boolean,
  ): ErasureSource => ({
    key,
    category,
    digest: hashRequest(JSON.parse(JSON.stringify(value))),
    eligible: canErase,
  });
  const sources: ErasureSource[] = [
    ...optionalProcessingPurposes.map((purpose) =>
      source(
        `purpose:${purpose}`,
        "optional_processing",
        streams.filter((row) => row.purpose === purpose),
        true,
      ),
    ),
    source(
      `party:${partyId}:preferences`,
      "contact_preferences",
      { version: party.version, value: party.contactPreferences },
      eligible,
    ),
    source(
      `party:${partyId}:aliases`,
      "matching_aliases",
      { version: party.version, value: party.matchingAliases },
      eligible,
    ),
    ...streams
      .filter((row) => row.purpose === "search_alerts")
      .map((row) =>
        source(`subscription:${row.id}:criteria`, "optional_search_criteria", row, eligible),
      ),
    ...contacts.map((row) =>
      source(
        `contact:${row.id}`,
        "optional_contacts",
        row,
        eligible &&
          !streams.some(
            (stream) => stream.contactMethodId === row.id && stream.purpose === "service_updates",
          ),
      ),
    ),
    ...clients.map((row) =>
      source(`principal:${row.id}:profile`, "client_profile_copies", row, eligible),
    ),
    ...clients.map((row) => source(`principal:${row.id}:access`, "client_access", row, true)),
  ];
  const actorGrants = await db
    .select()
    .from(grants)
    .where(eq(grants.principalId, live.account.id))
    .orderBy(asc(grants.id));
  const actorKeys = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.principalId, live.account.id))
    .orderBy(asc(passkeys.id));
  const [membership] = await db
    .select()
    .from(staffMemberships)
    .where(eq(staffMemberships.principalId, live.account.id));
  const [operator] = await db.select().from(principals).where(eq(principals.id, live.account.id));
  // JSON-normalize Dates before hashing; no contact values or restricted record IDs leave this reader.
  const authorityDigest = hashRequest(
    JSON.parse(JSON.stringify({ actorGrants, actorKeys, membership, operator })),
  );
  return {
    kind: "privacy_erasure_inventory_v1",
    requestId: request.id,
    requestVersion: request.version,
    partyId,
    reviewerId: live.account.id,
    reviewerSessionId: live.id,
    authorityDigest,
    sources,
    retentionHold,
    ...dependency,
    policy: await captureOperatingPolicy(db),
  };
}

/** Own source values are shown only to a current privacy operator, never copied into the
 * immutable safety review. Its source hashes bind this preview without retaining removed PII. */
export async function erasureSourcePreviews(db: Executor, inventory: ErasureInventory) {
  const [party] = await db.select().from(parties).where(eq(parties.id, inventory.partyId));
  const contacts = await db
    .select()
    .from(contactMethods)
    .where(eq(contactMethods.partyId, inventory.partyId));
  const clients = await db
    .select()
    .from(principals)
    .where(and(eq(principals.partyId, inventory.partyId), eq(principals.kind, "client")));
  const streams = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.partyId, inventory.partyId));
  const values: Record<string, unknown> = {
    [`party:${inventory.partyId}:preferences`]: party?.contactPreferences,
    [`party:${inventory.partyId}:aliases`]: party?.matchingAliases,
  };
  for (const purpose of optionalProcessingPurposes)
    values[`purpose:${purpose}`] = streams
      .filter((row) => row.purpose === purpose)
      .map((row) => ({ id: row.id, state: row.state, purpose: row.purpose }));
  for (const row of streams.filter((row) => row.purpose === "search_alerts"))
    values[`subscription:${row.id}:criteria`] = {
      criteria: row.criteria,
      summary: row.criteriaSummary,
    };
  for (const row of contacts)
    values[`contact:${row.id}`] = {
      kind: row.kind,
      value: row.value,
      verification: row.verification,
    };
  for (const row of clients) {
    values[`principal:${row.id}:profile`] = { displayName: row.displayName, email: row.email };
    values[`principal:${row.id}:access`] = { principalId: row.id, status: row.status };
  }
  return inventory.sources.map((row) => ({ key: row.key, value: values[row.key] }));
}
