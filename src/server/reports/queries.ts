// O22 / F25: report authority intersects ordinary record/field authority before aggregation.
import "server-only";
import { and, asc, eq, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  appointments,
  caseStageHistory,
  cases,
  inquiries,
  listings,
  messages,
  tasks,
} from "@/db/schema";
import type { Capability, CapabilityGrant } from "@/domain/capabilities";
import type { Session } from "../auth/sessions";
import { resolveGrants } from "../authz";
import type { Database } from "../db";
import { AppError } from "../errors";
import { liveStaff, openTaskStates } from "../work/shared";

export type ReportPeriod = 7 | 30 | 90;
export type ReportScope = "all" | "mine";
export type ReportMetricId =
  | "unowned"
  | "promises"
  | "nextActions"
  | "viewings"
  | "progressions"
  | "freshness"
  | "deliveries";
export interface ReportFilter {
  days: ReportPeriod;
  scope: ReportScope;
}
export interface ReportRow {
  id: string;
  reference: string;
  path: string;
}
export interface ReportMetric {
  id: ReportMetricId;
  state: "observed" | "denied";
  count: number | null;
  rows: ReportRow[];
  hasMore: boolean;
}
interface ResourceColumns {
  type: string;
  id: AnyPgColumn;
  caseId?: AnyPgColumn;
  propertyId?: AnyPgColumn;
}

/** A report grant is never a substitute for the workbench's ordinary record/field grant. */
function permitted(
  grants: readonly CapabilityGrant[],
  capability: Capability,
  record: ResourceColumns,
): SQL | null {
  const branches = grants
    .filter((g) => g.capability === capability)
    .flatMap(({ scope }) => {
      if (scope?.locales) return [];
      const column =
        !scope?.recordType || scope.recordType === record.type
          ? record.id
          : scope.recordType === "case"
            ? record.caseId
            : scope.recordType === "property"
              ? record.propertyId
              : undefined;
      if (!column) return [];
      return [scope?.recordId ? eq(column, scope.recordId) : sql`${column} is not null`];
    });
  return branches.length ? (or(...branches) ?? null) : null;
}

export function reportFilter(raw: Record<string, string | string[] | undefined>): ReportFilter {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const days = first(raw.days) ?? "30",
    scope = first(raw.scope) ?? "all";
  if (!["7", "30", "90"].includes(days) || !["all", "mine"].includes(scope))
    throw new AppError("validation_failed");
  return { days: Number(days) as ReportPeriod, scope: scope as ReportScope };
}

const total = sql<number>`count(*) over ()`.mapWith(Number);
const maxRows = 20;
function metric(id: ReportMetricId, rows: (ReportRow & { total: number })[] | null): ReportMetric {
  return {
    id,
    state: rows === null ? "denied" : "observed",
    count: rows === null ? null : (rows[0]?.total ?? 0),
    rows: (rows ?? []).map(({ total: _total, ...row }) => ({
      ...row,
      path: id === "freshness" ? `/inventory/${encodeURIComponent(row.reference)}` : row.path,
    })),
    hasMore: (rows?.[0]?.total ?? 0) > maxRows,
  };
}

export async function readReports(
  db: Database,
  session: Session,
  filter: ReportFilter,
  now = new Date(),
) {
  // Validate callers other than the page too. One repeatable read binds counts and drill samples.
  reportFilter({ days: String(filter.days), scope: filter.scope });
  return db.transaction(
    async (tx) => {
      const live = await liveStaff(tx, session);
      const grants = await resolveGrants(tx, live.actor, now);
      if (!grants.some((g) => g.capability === "report.read")) throw new AppError("forbidden");
      const from = new Date(now.getTime() - filter.days * 86400000);
      const mine = (owner: AnyPgColumn) =>
        filter.scope === "mine" ? eq(owner, live.account.id) : sql`true`;
      const scope = (resource: ResourceColumns, ...capabilities: Capability[]) => {
        const parts = [
          permitted(grants, "report.read", resource),
          ...capabilities.map((c) => permitted(grants, c, resource)),
        ];
        return parts.every(Boolean) ? and(...(parts as SQL[])) : null;
      };
      const inquiry = scope(
        { type: "inquiry", id: inquiries.id, caseId: inquiries.caseId },
        "inquiry.read",
      );
      const task = scope({ type: "task", id: tasks.id, caseId: tasks.caseId }, "task.manage");
      const internalCase = scope({ type: "case", id: cases.id }, "case.read", "case.read_internal");
      const viewing = scope(
        { type: "appointment", id: appointments.id, caseId: appointments.caseId },
        "appointment.manage",
      );
      const listing = scope(
        { type: "listing", id: listings.id, propertyId: listings.propertyId },
        "listing.read",
      );
      const email = scope({ type: "case", id: cases.id }, "case.read", "message.draft");
      const metrics: ReportMetric[] = [];
      metrics.push(
        metric(
          "unowned",
          inquiry
            ? await tx
                .select({
                  id: inquiries.id,
                  reference: inquiries.reference,
                  path: sql<string>`'/inquiries/' || ${inquiries.id}::text`,
                  total,
                })
                .from(inquiries)
                .where(
                  and(
                    inquiry,
                    mine(inquiries.ownerId),
                    isNull(inquiries.ownerId),
                    inArray(inquiries.state, ["received", "assigned", "awaiting_client"]),
                  ),
                )
                .orderBy(asc(inquiries.createdAt), asc(inquiries.id))
                .limit(maxRows)
            : null,
        ),
      );
      metrics.push(
        metric(
          "promises",
          task
            ? await tx
                .select({
                  id: tasks.id,
                  reference: tasks.title,
                  path: sql<string>`'/tasks/' || ${tasks.id}::text`,
                  total,
                })
                .from(tasks)
                .where(
                  and(
                    task,
                    mine(tasks.ownerId),
                    eq(tasks.promisedToClient, true),
                    inArray(tasks.state, [...openTaskStates]),
                    lt(tasks.dueAt, now),
                  ),
                )
                .orderBy(asc(tasks.dueAt), asc(tasks.id))
                .limit(maxRows)
            : null,
        ),
      );
      metrics.push(
        metric(
          "nextActions",
          internalCase
            ? await tx
                .select({
                  id: cases.id,
                  reference: cases.reference,
                  path: sql<string>`'/cases/' || ${cases.id}::text`,
                  total,
                })
                .from(cases)
                .where(
                  and(
                    internalCase,
                    mine(cases.ownerId),
                    eq(cases.disposition, "active"),
                    or(lt(cases.nextActionDueAt, now), lt(cases.reviewAt, now)),
                  ),
                )
                .orderBy(asc(cases.nextActionDueAt), asc(cases.id))
                .limit(maxRows)
            : null,
        ),
      );
      metrics.push(
        metric(
          "viewings",
          viewing
            ? await tx
                .select({
                  id: appointments.id,
                  reference: cases.reference,
                  path: sql<string>`'/calendar/' || ${appointments.id}::text`,
                  total,
                })
                .from(appointments)
                .innerJoin(cases, eq(cases.id, appointments.caseId))
                // The title/reference also requires Case read; appointment.manage alone cannot expose it.
                .where(
                  and(
                    viewing,
                    permitted(grants, "case.read", { type: "case", id: cases.id }) ?? sql`false`,
                    mine(appointments.hostId),
                    eq(appointments.state, "completed"),
                    sql`${appointments.confirmedEndsAt} >= ${from.toISOString()}::timestamptz`,
                    lt(appointments.confirmedEndsAt, now),
                  ),
                )
                .orderBy(asc(appointments.confirmedEndsAt), asc(appointments.id))
                .limit(maxRows)
            : null,
        ),
      );
      metrics.push(
        metric(
          "progressions",
          internalCase
            ? await tx
                .select({
                  id: caseStageHistory.id,
                  reference: cases.reference,
                  path: sql<string>`'/cases/' || ${cases.id}::text`,
                  total,
                })
                .from(caseStageHistory)
                .innerJoin(cases, eq(cases.id, caseStageHistory.caseId))
                .where(
                  and(
                    internalCase,
                    mine(cases.ownerId),
                    sql`${caseStageHistory.fromStage} is not null`,
                    sql`${caseStageHistory.fromStage} <> ${caseStageHistory.toStage}`,
                    sql`${caseStageHistory.occurredAt} >= ${from.toISOString()}::timestamptz`,
                    lt(caseStageHistory.occurredAt, now),
                  ),
                )
                .orderBy(asc(caseStageHistory.occurredAt), asc(caseStageHistory.id))
                .limit(maxRows)
            : null,
        ),
      );
      metrics.push(
        metric(
          "freshness",
          listing
            ? await tx
                .select({
                  id: listings.id,
                  reference: listings.reference,
                  path: sql<string>`'/inventory/' || ${listings.reference}`,
                  total,
                })
                .from(listings)
                .where(
                  and(
                    listing,
                    mine(listings.responsibleBrokerId),
                    or(
                      lt(listings.reviewDueAt, now),
                      inArray(listings.freshnessState, ["unknown", "conflicting", "review_due"]),
                    ),
                  ),
                )
                .orderBy(asc(listings.reviewDueAt), asc(listings.id))
                .limit(maxRows)
            : null,
        ),
      );
      metrics.push(
        metric(
          "deliveries",
          email
            ? await tx
                .select({
                  id: messages.id,
                  reference: cases.reference,
                  path: sql<string>`'/cases/' || ${cases.id}::text || '/email'`,
                  total,
                })
                .from(messages)
                .innerJoin(cases, eq(cases.id, messages.caseId))
                .where(
                  and(
                    email,
                    mine(cases.ownerId),
                    eq(messages.channel, "email"),
                    eq(messages.direction, "outbound"),
                    inArray(messages.state, ["failed", "bounced", "outcome_unknown"]),
                  ),
                )
                .orderBy(asc(messages.updatedAt), asc(messages.id))
                .limit(maxRows)
            : null,
        ),
      );
      const [response] = inquiry
        ? await tx
            .select({
              received: sql<number>`count(*)`.mapWith(Number),
              responded:
                sql<number>`count(*) filter (where ${inquiries.firstResponseAt} >= ${inquiries.createdAt} and ${inquiries.firstResponseAt} <= ${now.toISOString()}::timestamptz)`.mapWith(
                  Number,
                ),
              invalid:
                sql<number>`count(*) filter (where ${inquiries.firstResponseAt} < ${inquiries.createdAt} or ${inquiries.firstResponseAt} > ${now.toISOString()}::timestamptz)`.mapWith(
                  Number,
                ),
              medianMinutes: sql<
                number | null
              >`percentile_cont(0.5) within group (order by extract(epoch from (${inquiries.firstResponseAt} - ${inquiries.createdAt})) / 60)
        filter (where ${inquiries.firstResponseAt} >= ${inquiries.createdAt} and ${inquiries.firstResponseAt} <= ${now.toISOString()}::timestamptz)`.mapWith(
                (v) => (v === null ? null : Number(v)),
              ),
            })
            .from(inquiries)
            .where(
              and(
                inquiry,
                mine(inquiries.ownerId),
                sql`${inquiries.createdAt} >= ${from.toISOString()}::timestamptz`,
                lt(inquiries.createdAt, now),
              ),
            )
        : [];
      return {
        definition: "O22-v1",
        filter,
        from,
        asOf: now,
        timezone: "Europe/Sofia",
        metrics,
        response: response
          ? {
              ...response,
              missing: response.received - response.responded,
              smallSample: response.responded < 5,
            }
          : null,
        staffedResponse: { state: "unknown" as const, reason: "approved_hours_policy_not_bound" },
        correctionEffort: { state: "unknown" as const, reason: "effort_events_not_recorded" },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
