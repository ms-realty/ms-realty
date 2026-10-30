// O26/O26L, W14-T3: read only the recorded listing history the current staff member can see.
import "server-only";
import { and, desc, eq, inArray, isNotNull, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import {
  auditEvents,
  currentPublications,
  destinationDeliveries,
  listings,
  operations,
  principals,
  publicationManifests,
} from "@/db/schema";
import type { Actor, CapabilityGrant } from "@/domain/capabilities";
import type { PublicLocale } from "@/domain/ids";
import { resolveGrants } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import {
  objectRecord,
  projectRecordedChange,
  type RecordedChange,
  safeRecordedText,
} from "./projection";

const querySchema = z
  .object({
    reference: z
      .string()
      .trim()
      .max(80)
      .transform((value) => value.toUpperCase())
      .default(""),
    cursor: z.string().min(1).max(1024).optional(),
    pageSize: z.int().min(1).max(50).default(20),
  })
  .strict();
const cursorSchema = z
  .object({
    v: z.literal(1),
    at: z.iso.datetime(),
    id: z.uuid(),
    filter: z.string().length(64),
  })
  .strict();
const uuid = z.uuid();

export interface HistoryEntry {
  readonly id: string;
  readonly reference: string;
  readonly occurredAt: Date;
  readonly change: RecordedChange;
  readonly actor: {
    readonly kind: Actor["kind"];
    /** Current staff directory name; never a historical name snapshot or a client profile. */
    readonly currentName: string | null;
  };
}
export interface HistoryList {
  readonly reference: string;
  readonly entries: readonly HistoryEntry[];
  readonly nextCursor: string | null;
}
export interface HistoryDetail extends HistoryEntry {
  readonly publication: {
    readonly state:
      | "working"
      | "prepared"
      | "published"
      | "unconfirmed"
      | "restricted"
      | "withdrawn"
      | "other";
    readonly locale: PublicLocale | null;
    readonly verifiedAt: Date | null;
    readonly current: "active" | "restricted" | "withdrawn" | "replaced" | "none" | null;
  };
  readonly technical: {
    readonly action: string | null;
    readonly operationId: string | null;
    readonly manifestId: string | null;
    readonly actorId: string | null;
  };
}

/** Same listing/property contexts as authz.can; apply each capability before counts/paging. */
function scopeFor(
  grants: readonly CapabilityGrant[],
  capability: "audit.read" | "listing.read",
  now: Date,
): SQL | undefined {
  return or(
    ...grants
      .filter((grant) => grant.capability === capability)
      .flatMap(({ scope }): SQL[] => {
        if (scope?.locales || (scope?.expiresAt && Date.parse(scope.expiresAt) <= now.getTime()))
          return [];
        if (scope?.recordType && !["listing", "property"].includes(scope.recordType)) return [];
        if (!scope?.recordId) return [sql`true`];
        // Invalid legacy scope IDs grant nothing and must not cause a PostgreSQL UUID error.
        if (!uuid.safeParse(scope.recordId).success) return [];
        if (scope.recordType === "listing") return [eq(listings.id, scope.recordId)];
        if (scope.recordType === "property") return [eq(listings.propertyId, scope.recordId)];
        return [
          sql`(${listings.id} = ${scope.recordId} or ${listings.propertyId} = ${scope.recordId})`,
        ];
      }),
  );
}
async function visibleScope(db: Executor, actor: Actor, now: Date) {
  if (actor.kind !== "staff") throw new AppError("forbidden");
  const grants = await resolveGrants(db, actor, now);
  const audit = scopeFor(grants, "audit.read", now);
  const listing = scopeFor(grants, "listing.read", now);
  if (!audit || !listing) throw new AppError("forbidden");
  return sql`(${audit}) and (${listing})`;
}

const selection = {
  id: auditEvents.id,
  reference: listings.reference,
  listingId: listings.id,
  action: auditEvents.action,
  payload: auditEvents.payload,
  operationId: auditEvents.operationId,
  actorKind: auditEvents.actorKind,
  actorId: auditEvents.actorId,
  occurredAt: auditEvents.occurredAt,
  // Preserve PostgreSQL's microseconds for cursor ties rather than truncating them to JS ms.
  positionAt: sql<string>`to_char(${auditEvents.occurredAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
};
type EventRow = {
  id: string;
  reference: string;
  listingId: string;
  action: string;
  payload: unknown;
  operationId: string | null;
  actorKind: Actor["kind"];
  actorId: string;
  occurredAt: Date;
};
async function entries(db: Executor, rows: readonly EventRow[]): Promise<HistoryEntry[]> {
  const ids = [
    ...new Set(
      rows
        .filter((row) => row.actorKind === "staff" && uuid.safeParse(row.actorId).success)
        .map((row) => row.actorId),
    ),
  ];
  const directory = ids.length
    ? await db
        .select({ id: principals.id, name: principals.displayName })
        .from(principals)
        .where(and(inArray(principals.id, ids), eq(principals.kind, "staff")))
    : [];
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    occurredAt: row.occurredAt,
    change: projectRecordedChange(row.action, row.payload),
    actor: {
      kind: row.actorKind,
      currentName:
        row.actorKind === "staff"
          ? safeRecordedText(directory.find((entry) => entry.id === row.actorId)?.name, 120)
          : null,
    },
  }));
}

export async function listListingHistory(
  db: Executor,
  actor: Actor,
  input: unknown = {},
  now = new Date(),
): Promise<HistoryList> {
  const scope = await visibleScope(db, actor, now);
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation_failed");
  const query = parsed.data;
  const filter = hashRequest({ reference: query.reference, pageSize: query.pageSize });
  let cursor: z.infer<typeof cursorSchema> | null = null;
  if (query.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/u.test(query.cursor)) throw new Error("Invalid encoding");
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")),
      );
      if (cursor.filter !== filter) throw new Error("Different query");
    } catch {
      throw new AppError("validation_failed");
    }
  }
  const rows = await db
    .select(selection)
    .from(auditEvents)
    .innerJoin(
      listings,
      and(eq(auditEvents.recordType, "listing"), eq(auditEvents.recordId, listings.id)),
    )
    .where(
      and(
        scope,
        query.reference ? eq(listings.reference, query.reference) : undefined,
        cursor
          ? sql`(${auditEvents.occurredAt} < ${cursor.at}::timestamptz or (${auditEvents.occurredAt} = ${cursor.at}::timestamptz and ${auditEvents.id} < ${cursor.id}::uuid))`
          : undefined,
      ),
    )
    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
    .limit(query.pageSize + 1);
  const page = rows.slice(0, query.pageSize);
  const last = page.at(-1);
  return {
    reference: query.reference,
    entries: await entries(db, page),
    nextCursor:
      rows.length > query.pageSize && last
        ? Buffer.from(JSON.stringify({ v: 1, at: last.positionAt, id: last.id, filter })).toString(
            "base64url",
          )
        : null,
  };
}

export async function readListingHistory(
  db: Executor,
  actor: Actor,
  eventId: string,
  now = new Date(),
): Promise<HistoryDetail> {
  const scope = await visibleScope(db, actor, now);
  if (!uuid.safeParse(eventId).success) throw new AppError("not_found");
  const [row] = await db
    .select(selection)
    .from(auditEvents)
    .innerJoin(
      listings,
      and(eq(auditEvents.recordType, "listing"), eq(auditEvents.recordId, listings.id)),
    )
    .where(and(scope, eq(auditEvents.id, eventId)));
  if (!row) throw new AppError("not_found");
  const [entry] = await entries(db, [row]);
  if (!entry) throw new AppError("not_found");
  const payload = objectRecord(row.payload);
  const manifestId = uuid.safeParse(payload.manifestId).success ? String(payload.manifestId) : null;
  const operationId = uuid.safeParse(row.operationId).success ? row.operationId : null;
  // Binding comes from the exact stored event, never today's latest manifest.
  const [manifest] = manifestId
    ? await db
        .select({
          id: publicationManifests.id,
          generation: publicationManifests.generation,
          locale: publicationManifests.locale,
          destination: publicationManifests.destination,
        })
        .from(publicationManifests)
        .where(
          and(
            eq(publicationManifests.id, manifestId),
            eq(publicationManifests.listingId, row.listingId),
          ),
        )
    : [];
  let publication: HistoryDetail["publication"] = {
    state: entry.change.kind === "publication" ? "unconfirmed" : entry.change.kind,
    locale: manifest?.locale ?? null,
    verifiedAt: null,
    current: null,
  };
  if (
    row.action === "publication.activate" &&
    manifest?.destination === "website" &&
    operationId &&
    manifest.generation === payload.generation
  ) {
    const [operation] = await db
      .select({ outcome: operations.outcome, status: operations.status })
      .from(operations)
      .where(
        and(
          eq(operations.id, operationId),
          eq(operations.operationType, "publication.activate"),
          eq(operations.actorKind, row.actorKind),
          eq(operations.actorId, row.actorId),
        ),
      );
    const outcome = objectRecord(operation?.outcome);
    const [delivery] = await db
      .select({ verifiedAt: destinationDeliveries.verifiedAt })
      .from(destinationDeliveries)
      .where(
        and(
          eq(destinationDeliveries.listingId, row.listingId),
          eq(destinationDeliveries.manifestId, manifest.id),
          eq(destinationDeliveries.generation, manifest.generation),
          eq(destinationDeliveries.locale, manifest.locale),
          eq(destinationDeliveries.destination, manifest.destination),
          eq(destinationDeliveries.kind, "publish"),
          eq(destinationDeliveries.state, "verified"),
          isNotNull(destinationDeliveries.verifiedAt),
          eq(destinationDeliveries.verifiedAt, row.occurredAt),
        ),
      )
      .limit(1);
    if (
      operation?.status === "succeeded" &&
      outcome.manifestId === manifest.id &&
      outcome.reference === row.reference &&
      outcome.generation === manifest.generation &&
      outcome.locale === manifest.locale &&
      delivery?.verifiedAt
    ) {
      const [pointer] = await db
        .select({
          manifestId: currentPublications.manifestId,
          generation: currentPublications.generation,
          state: currentPublications.state,
        })
        .from(currentPublications)
        .where(
          and(
            eq(currentPublications.listingId, row.listingId),
            eq(currentPublications.locale, manifest.locale),
            eq(currentPublications.destination, manifest.destination),
          ),
        );
      publication = {
        state: "published",
        locale: manifest.locale,
        verifiedAt: delivery.verifiedAt,
        current: !pointer
          ? "none"
          : pointer.manifestId === manifest.id && pointer.generation === manifest.generation
            ? pointer.state
            : "replaced",
      };
    }
  }
  return {
    ...entry,
    publication,
    technical: {
      action: /^[a-z][a-z0-9_.]{0,100}$/u.test(row.action) ? row.action : null,
      operationId,
      manifestId: manifest?.id ?? null,
      actorId:
        row.actorKind === "staff" && uuid.safeParse(row.actorId).success ? row.actorId : null,
    },
  };
}
