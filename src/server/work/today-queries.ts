// O01 projections: scoped before count/order/limit; no unpublished copy, facts or provider payloads.
import "server-only";
import { and, asc, desc, eq, inArray, lte, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  appointments,
  cases,
  destinationDeliveries,
  externalActions,
  listings,
  localizedRevisions,
  messages,
  principals,
  workerProgress,
} from "@/db/schema";
import { type Capability, type CapabilityGrant, hasCapability } from "@/domain/capabilities";
import { workerHealth } from "../ai/operations";
import type { Session } from "../auth/sessions";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { appointmentCoverageAt, ownerNeedsCoverage } from "./coverage-policy";
import { openAppointmentStates, visibleWhere } from "./shared";

interface Context {
  live: Session;
  grants: readonly CapabilityGrant[];
}
interface QueuePage<Row> {
  rows: Row[];
  total: number | null;
  hasMore: boolean;
}
export interface TodayQueue<Row> extends QueuePage<Row> {
  /** Unavailable always has an unknown total; empty rows are not evidence of no work. */
  status: "ready" | "unavailable";
  asOf: Date;
  page: number;
}
const limit = 30;
const total = sql<number>`count(*) over ()`.mapWith(Number);
const translationPosition = z
  .object({
    version: z.literal(1),
    at: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/),
    id: z.uuid(),
    filter: z.string(),
  })
  .strict();

function firstPage<Row extends { total: number }>(rows: Row[]) {
  return {
    rows: rows.slice(0, limit).map(({ total: _total, ...row }) => row),
    total: rows[0]?.total ?? 0,
    hasMore: rows.length > limit,
  };
}

export function todayQueueResult<Row>(
  result: PromiseSettledResult<QueuePage<Row>>,
  now: Date,
  queueName: string,
): TodayQueue<Row>;
export function todayQueueResult<Row>(
  result: PromiseSettledResult<QueuePage<Row> | null>,
  now: Date,
  queueName: string,
): TodayQueue<Row> | null;
export function todayQueueResult<Row>(
  result: PromiseSettledResult<QueuePage<Row> | null>,
  now: Date,
  queueName: string,
): TodayQueue<Row> | null {
  if (result.status === "rejected") {
    const code = isAppError(result.reason) ? result.reason.code : "internal_error";
    console.error(`[today] ${queueName} unavailable (${code})`);
    return { rows: [], total: null, hasMore: false, status: "unavailable", asOf: now, page: 1 };
  }
  return result.value === null ? null : { ...result.value, status: "ready", asOf: now, page: 1 };
}

// Match caseVisibility / caseEmailWorkbench authority using the one live request context.
function caseScope(
  grants: readonly CapabilityGrant[],
  capability: Capability = "case.read",
): SQL<boolean> {
  return (or(
    ...grants
      .filter((grant) => grant.capability === capability)
      .flatMap(({ scope }) => {
        if (scope?.locales || (scope?.recordType && scope.recordType !== "case")) return [];
        return [scope?.recordId ? eq(cases.id, scope.recordId) : sql`true`];
      }),
  ) ?? sql`false`) as SQL<boolean>;
}

// Same listing/property resource contexts as the inventory and translation workbenches.
// A locale grant can authorize only a recorded matching translation, never listing facts.
function listingScope(
  grants: readonly CapabilityGrant[],
  capability: Capability = "listing.read",
  locale?: AnyPgColumn,
): SQL<boolean> {
  return (or(
    ...grants
      .filter((grant) => grant.capability === capability)
      .flatMap(({ scope }) => {
        if (scope?.recordType && !["listing", "property"].includes(scope.recordType)) return [];
        const clauses: SQL[] = [];
        if (scope?.locales) {
          if (!locale || !scope.locales.length) return [];
          clauses.push(inArray(locale, [...scope.locales]));
        }
        if (scope?.recordId) {
          clauses.push(
            scope.recordType === "listing"
              ? eq(listings.id, scope.recordId)
              : scope.recordType === "property"
                ? eq(listings.propertyId, scope.recordId)
                : sql`(${listings.id} = ${scope.recordId} or ${listings.propertyId} = ${scope.recordId})`,
          );
        }
        return [and(...clauses) ?? sql`true`];
      }),
  ) ?? sql`false`) as SQL<boolean>;
}

export async function viewingQuery(db: Executor, context: Context, now: Date) {
  // A pending replacement keeps the original confirmed arrangement. Open past viewings
  // need a recorded outcome and remain ahead of future slots rather than disappearing.
  const startsAt =
    sql<Date | null>`coalesce(${appointments.confirmedStartsAt}, ${appointments.proposedStartsAt})`.mapWith(
      appointments.confirmedStartsAt,
    );
  const endsAt =
    sql<Date | null>`coalesce(${appointments.confirmedEndsAt}, ${appointments.proposedEndsAt})`.mapWith(
      appointments.confirmedEndsAt,
    );
  const rows = await db
    .select({
      total,
      id: appointments.id,
      reference: appointments.reference,
      state: appointments.state,
      format: appointments.format,
      caseId: cases.id,
      caseReference: cases.reference,
      hostId: appointments.hostId,
      ownerName: principals.displayName,
      needsCoverage: ownerNeedsCoverage(appointments.hostId, appointmentCoverageAt),
      awaitingAcceptance: sql<boolean>`coalesce(${appointments.pendingHostId} = ${context.live.account.id}, false)`,
      startsAt,
      endsAt,
      timezone: appointments.timezone,
      reason: sql<"arrange_viewing" | "record_outcome" | "review_slot" | "upcoming_viewing">`case
        when ${startsAt} is null then 'arrange_viewing'
        when ${appointments.confirmedEndsAt} <= ${now.toISOString()}::timestamptz then 'record_outcome'
        when ${appointments.confirmedStartsAt} is null then 'review_slot'
        else 'upcoming_viewing' end`,
    })
    .from(appointments)
    .innerJoin(cases, eq(cases.id, appointments.caseId))
    .leftJoin(principals, eq(principals.id, appointments.hostId))
    .where(
      and(
        caseScope(context.grants),
        visibleWhere(context.grants, "appointment.manage", "appointment"),
        inArray(appointments.state, [...openAppointmentStates]),
      ),
    )
    .orderBy(asc(startsAt), asc(appointments.createdAt), asc(appointments.id))
    .limit(limit + 1);
  return firstPage(rows);
}

export async function caseContinueQuery(db: Executor, context: Context) {
  // Match readCase's shared-summary fallback. Private work, review dates and private
  // update ordering require the Case's own case.read_internal grant, not another Case's.
  const internal = caseScope(context.grants, "case.read_internal");
  const nextAction = sql<string | null>`case when ${cases.disposition} = 'active'
    then case when ${internal} then ${cases.nextAction} else ${cases.clientSummary} end
    else null end`;
  const nextActionDueAt = sql<Date | null>`case
    when ${cases.disposition} = 'active' and (${internal} or ${cases.clientSummary} is not null)
      then ${cases.nextActionDueAt} else null end`.mapWith(cases.nextActionDueAt);
  const waitingOn = sql<string | null>`case when ${internal} then ${cases.waitingOn} else null end`;
  const reviewAt =
    sql<Date | null>`case when ${internal} then ${cases.reviewAt} else null end`.mapWith(
      cases.reviewAt,
    );
  const dueAt = sql<Date | null>`least(${nextActionDueAt}, ${reviewAt})`.mapWith(
    cases.nextActionDueAt,
  );
  const updatedAt = sql<Date | null>`case when ${internal} then ${cases.updatedAt} else null end`;
  const rows = await db
    .select({
      total,
      id: cases.id,
      reference: cases.reference,
      title: cases.title,
      kind: cases.kind,
      stage: cases.stage,
      disposition: cases.disposition,
      ownerId: cases.ownerId,
      ownerName: principals.displayName,
      needsCoverage: ownerNeedsCoverage(cases.ownerId),
      nextAction,
      nextActionDueAt,
      waitingOn,
      reviewAt,
      dueAt,
    })
    .from(cases)
    .leftJoin(principals, eq(principals.id, cases.ownerId))
    .where(
      and(
        caseScope(context.grants),
        eq(cases.ownerId, context.live.account.id),
        inArray(cases.disposition, ["active", "paused"]),
      ),
    )
    .orderBy(asc(dueAt), sql`${updatedAt} desc nulls last`, asc(cases.id))
    .limit(limit + 1);
  return firstPage(rows);
}

export async function draftContinueQuery(db: Executor, context: Context) {
  const rows = await db
    .select({
      total,
      id: listings.id,
      reference: listings.reference,
      editorialState: listings.editorialState,
      ownerId: listings.responsibleBrokerId,
      ownerName: principals.displayName,
      needsCoverage: ownerNeedsCoverage(listings.responsibleBrokerId),
      updatedAt: listings.updatedAt,
    })
    .from(listings)
    .leftJoin(principals, eq(principals.id, listings.responsibleBrokerId))
    .where(
      and(
        listingScope(context.grants),
        listingScope(context.grants, "listing.edit"),
        eq(listings.responsibleBrokerId, context.live.account.id),
        // Requested changes and missing facts are review work: listingReviewQuery lists them
        // under the same read and edit scope, so listing them here too would count one action
        // twice. A draft may still be there for its own, differently named check.
        eq(listings.editorialState, "draft"),
      ),
    )
    .orderBy(desc(listings.updatedAt), asc(listings.id))
    .limit(limit + 1);
  return firstPage(rows);
}

export async function listingReviewQuery(db: Executor, context: Context, now: Date) {
  const canEdit = listingScope(context.grants, "listing.edit");
  const canReviewFacts = listingScope(context.grants, "listing.review_facts");
  const canRelease = listingScope(context.grants, "publication.release");
  const rows = await db
    .select({
      total,
      id: listings.id,
      reference: listings.reference,
      editorialState: listings.editorialState,
      commercialState: listings.commercialState,
      freshnessState: listings.freshnessState,
      dueAt: listings.reviewDueAt,
      ownerId: listings.responsibleBrokerId,
      ownerName: principals.displayName,
      needsCoverage: ownerNeedsCoverage(listings.responsibleBrokerId),
      canEdit,
      canReviewFacts,
      canRelease,
    })
    .from(listings)
    .leftJoin(principals, eq(principals.id, listings.responsibleBrokerId))
    .where(
      and(
        listingScope(context.grants),
        or(
          and(canEdit, inArray(listings.editorialState, ["changes_requested", "needs_facts"])),
          and(or(canReviewFacts, canRelease), eq(listings.editorialState, "in_review")),
          and(
            canEdit,
            or(
              eq(listings.commercialState, "confirmation_required"),
              eq(listings.freshnessState, "review_due"),
              lte(listings.reviewDueAt, now),
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(listings.reviewDueAt), asc(listings.updatedAt), asc(listings.id))
    .limit(limit + 1);
  return firstPage(rows);
}

/** A cursor never grants access: every request rechecks live listing and locale review grants. */
export async function translationReviewPageQuery(db: Executor, context: Context, cursor?: string) {
  const filter = hashRequest({ actor: context.live.actor, queue: "translationReviews" });
  let position: z.infer<typeof translationPosition> | undefined;
  if (cursor !== undefined) {
    if (cursor.length < 1 || cursor.length > 1024) throw new AppError("validation_failed");
    try {
      const parsed = translationPosition.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString()),
      );
      if (parsed.filter !== filter) throw new Error("Different actor or queue");
      position = parsed;
    } catch {
      throw new AppError("validation_failed");
    }
  }
  const matches = db.$with("today_translation_matches").as(
    db
      .select({
        id: localizedRevisions.id,
        listingId: sql<string>`${listings.id}`.as("listing_id"),
        reference: listings.reference,
        sourceRevisionId: localizedRevisions.sourceRevisionId,
        locale: localizedRevisions.locale,
        ownerId: listings.responsibleBrokerId,
        ownerName: principals.displayName,
        needsCoverage: ownerNeedsCoverage(listings.responsibleBrokerId).as("needs_coverage"),
        requestedAt: localizedRevisions.updatedAt,
        position:
          sql<string>`to_char(${localizedRevisions.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
            "position",
          ),
      })
      .from(localizedRevisions)
      .innerJoin(listings, eq(listings.id, localizedRevisions.listingId))
      .leftJoin(principals, eq(principals.id, listings.responsibleBrokerId))
      .where(
        and(
          listingScope(context.grants, "listing.read", localizedRevisions.locale),
          listingScope(context.grants, "translation.review", localizedRevisions.locale),
          eq(localizedRevisions.sourceRevisionId, listings.approvedRevisionId),
          eq(localizedRevisions.state, "reviewing"),
        ),
      ),
  );
  const count = db
    .$with("today_translation_count")
    .as(db.select({ total: sql<number>`count(*)::integer`.as("total") }).from(matches));
  const page = db.$with("today_translation_page").as(
    db
      .select()
      .from(matches)
      .where(
        position
          ? sql`(${matches.requestedAt}, ${matches.id}) > (${position.at}::timestamptz, ${position.id}::uuid)`
          : undefined,
      )
      .orderBy(asc(matches.requestedAt), asc(matches.id))
      .limit(limit + 1),
  );
  // Count and page share one snapshot, including an empty later page. No hidden rows enter
  // either the total or the cursor because the grant intersection is in matches.
  const fetched = await db
    .with(matches, count, page)
    .select({
      total: count.total,
      id: page.id,
      listingId: page.listingId,
      reference: page.reference,
      sourceRevisionId: page.sourceRevisionId,
      locale: page.locale,
      ownerId: page.ownerId,
      ownerName: page.ownerName,
      needsCoverage: page.needsCoverage,
      requestedAt: page.requestedAt,
      position: page.position,
    })
    .from(count)
    .leftJoin(page, sql`true`)
    .orderBy(asc(page.requestedAt), asc(page.id));
  type Projected = (typeof fetched)[number];
  // Every page column is null together on the count row when a later page is empty.
  const visible = fetched
    .filter(
      (
        row,
      ): row is Projected & {
        id: string;
        listingId: string;
        reference: string;
        sourceRevisionId: string;
        locale: NonNullable<Projected["locale"]>;
        needsCoverage: boolean;
        requestedAt: Date;
        position: string;
      } => row.id !== null,
    )
    .map(({ total: _total, ...row }) => row);
  const rows = visible.slice(0, limit).map(({ position: _position, ...row }) => row);
  const last = visible[limit - 1];
  const hasMore = visible.length > limit;
  return {
    rows,
    total: fetched[0]?.total ?? 0,
    hasMore,
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({ version: 1, at: last.position, id: last.id, filter }),
          ).toString("base64url")
        : null,
  };
}

export async function translationReviewQuery(db: Executor, context: Context) {
  const { rows, total, hasMore } = await translationReviewPageQuery(db, context);
  return { rows, total, hasMore };
}

export async function deliveryExceptionQuery(db: Executor, context: Context) {
  // A Case email is readable from caseEmailWorkbench only with case.read + message.draft.
  // Recipient lists, body, subject, approvals and provider errors stay in that workbench.
  const rows = await db
    .select({
      total,
      id: messages.id,
      state: messages.state,
      caseId: cases.id,
      reference: cases.reference,
      ownerId: cases.ownerId,
      ownerName: principals.displayName,
      needsCoverage: ownerNeedsCoverage(cases.ownerId),
      recordedAt: messages.updatedAt,
    })
    .from(messages)
    .innerJoin(cases, eq(cases.id, messages.caseId))
    .leftJoin(principals, eq(principals.id, cases.ownerId))
    .where(
      and(
        caseScope(context.grants),
        caseScope(context.grants, "message.draft"),
        eq(messages.channel, "email"),
        eq(messages.direction, "outbound"),
        inArray(messages.state, ["failed", "bounced", "outcome_unknown"]),
      ),
    )
    .orderBy(asc(messages.updatedAt), asc(messages.id))
    .limit(limit + 1);
  return firstPage(rows);
}

export async function publicationExceptionQuery(db: Executor, context: Context) {
  const rows = await db
    .select({
      total,
      id: destinationDeliveries.id,
      listingId: listings.id,
      reference: listings.reference,
      state: destinationDeliveries.state,
      kind: destinationDeliveries.kind,
      destination: destinationDeliveries.destination,
      locale: destinationDeliveries.locale,
      generation: destinationDeliveries.generation,
      currentGeneration: listings.publicationGeneration,
      ownerId: listings.responsibleBrokerId,
      ownerName: principals.displayName,
      needsCoverage: ownerNeedsCoverage(listings.responsibleBrokerId),
      recordedAt: destinationDeliveries.updatedAt,
    })
    .from(destinationDeliveries)
    .innerJoin(listings, eq(listings.id, destinationDeliveries.listingId))
    .leftJoin(principals, eq(principals.id, listings.responsibleBrokerId))
    .where(
      and(
        listingScope(context.grants),
        listingScope(context.grants, "publication.release"),
        inArray(destinationDeliveries.state, ["failed", "outcome_unknown"]),
      ),
    )
    .orderBy(asc(destinationDeliveries.updatedAt), asc(destinationDeliveries.id))
    .limit(limit + 1);
  return firstPage(rows);
}

function canReadOperations(context: Context) {
  return hasCapability(context.live.actor, context.grants, "report.read", {
    now: new Date().toISOString(),
  });
}

export async function operatorDeliveryExceptionQuery(db: Executor, context: Context) {
  if (!canReadOperations(context)) return null;
  const rows = await db
    .select({
      total,
      id: externalActions.id,
      kind: externalActions.kind,
      state: externalActions.state,
      attempts: externalActions.attempts,
      lastAttemptAt: externalActions.lastAttemptAt,
    })
    .from(externalActions)
    .where(inArray(externalActions.state, ["failed", "outcome_unknown"]))
    .orderBy(asc(externalActions.updatedAt), asc(externalActions.id))
    .limit(limit + 1);
  return firstPage(rows);
}

export async function workerQueueQuery(db: Executor, context: Context, now: Date) {
  if (!canReadOperations(context)) return null;
  const [progress] = await db
    .select({ buildSha: workerProgress.buildSha, completedAt: workerProgress.completedAt })
    .from(workerProgress)
    .where(eq(workerProgress.key, "queue-worker"))
    .limit(1);
  // Reuse the existing operations heartbeat check. It proves worker progress only, never
  // source freshness, a useful human response, provider delivery or completion of a promise.
  return workerHealth(progress, process.env.BUILD_SHA?.trim(), now);
}
