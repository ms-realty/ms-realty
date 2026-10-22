import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, type SQLWrapper, sql } from "drizzle-orm";
import { appointmentResources, appointments, cases, principals } from "@/db/schema";
import { type CalendarQuery, calendarPeriod } from "@/features/appointments/calendar-period";
import type { Session } from "../auth/sessions";
import { liveUser } from "../cases/shared";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { staffAppointmentVisibility } from "./visibility";

export const calendarPageSize = 50;
export const calendarRequestPageSize = 20;
const fields = {
  id: appointments.id,
  reference: appointments.reference,
  state: appointments.state,
  version: appointments.version,
  caseId: appointments.caseId,
  caseReference: cases.reference,
  hostId: appointments.hostId,
  hostName: principals.displayName,
  propertyId: appointments.propertyId,
  timezone: appointments.timezone,
  proposedStartsAt: appointments.proposedStartsAt,
  proposedEndsAt: appointments.proposedEndsAt,
  confirmedStartsAt: appointments.confirmedStartsAt,
  confirmedEndsAt: appointments.confirmedEndsAt,
  propertyAccess: appointments.propertyAccess,
  externalBusyCheckedAt: appointments.externalBusyCheckedAt,
};
type ResourceKind = typeof appointmentResources.$inferSelect.kind;
export type CalendarResource = { kind: ResourceKind; start: Date; end: Date };
export type CalendarAppointment = {
  id: string;
  reference: string;
  state: typeof appointments.$inferSelect.state;
  version: number;
  caseId: string | null;
  caseReference: string;
  hostName: string | null;
  timezone: string;
  proposedStartsAt: Date | null;
  proposedEndsAt: Date | null;
  confirmedStartsAt: Date | null;
  confirmedEndsAt: Date | null;
  propertyAccess: typeof appointments.$inferSelect.propertyAccess;
  externalBusyCheckedAt: Date | null;
  resources: CalendarResource[];
  conflicts: ResourceKind[];
};

/** O08 is a read projection. Only O09's guarded command may commit an arrangement. */
export async function readCalendar(db: Executor, session: Session, query: CalendarQuery) {
  const live = await liveUser(db, session);
  if (live.account.kind !== "staff") throw new AppError("forbidden");
  const permitted = await staffAppointmentVisibility(db, live);
  const scope = query.scope === "mine" ? eq(appointments.hostId, live.account.id) : undefined;
  const period = calendarPeriod(query);
  const overlaps = (start: SQLWrapper, end: SQLWrapper) =>
    and(lt(start, period.end), gt(end, period.start));
  const confirmedInPeriod = overlaps(appointments.confirmedStartsAt, appointments.confirmedEndsAt);
  const proposedInPeriod = and(
    inArray(appointments.state, ["proposed", "reschedule_requested"]),
    overlaps(appointments.proposedStartsAt, appointments.proposedEndsAt),
  );
  const firstResourceInPeriod = sql`(select min(greatest(lower(ar.during), ${period.start.toISOString()}::timestamptz)) from ${appointmentResources} ar where ar.appointment_id = ${appointments.id} and ar.active = true and ar.during && tstzrange(${period.start.toISOString()}, ${period.end.toISOString()}, '[)'))`;
  const inPeriod = or(
    confirmedInPeriod,
    proposedInPeriod,
    sql`${firstResourceInPeriod} is not null`,
  );
  // An old confirmation outside this period must not pull its later replacement ahead of
  // earlier commitments or onto an earlier page. Buffers participate in the same ordering.
  const firstInPeriod = sql`least(
    case when ${confirmedInPeriod} then greatest(${appointments.confirmedStartsAt}, ${period.start.toISOString()}::timestamptz) end,
    case when ${proposedInPeriod} then greatest(${appointments.proposedStartsAt}, ${period.start.toISOString()}::timestamptz) end,
    ${firstResourceInPeriod}
  )`;
  const rows = await db
    .select(fields)
    .from(appointments)
    .innerJoin(cases, eq(cases.id, appointments.caseId))
    .leftJoin(principals, eq(principals.id, appointments.hostId))
    .where(and(permitted, scope, inPeriod))
    .orderBy(asc(firstInPeriod), asc(appointments.id))
    .limit(calendarPageSize + 1)
    .offset((query.page - 1) * calendarPageSize);
  const hasMore = rows.length > calendarPageSize;
  const selected = rows.slice(0, calendarPageSize);
  const requests = await db
    .select(fields)
    .from(appointments)
    .innerJoin(cases, eq(cases.id, appointments.caseId))
    .leftJoin(principals, eq(principals.id, appointments.hostId))
    .where(
      and(
        permitted,
        scope,
        eq(appointments.state, "requested"),
        isNull(appointments.proposedStartsAt),
        isNull(appointments.confirmedStartsAt),
      ),
    )
    .orderBy(desc(appointments.updatedAt), asc(appointments.id))
    .limit(calendarRequestPageSize + 1)
    .offset((query.requestPage - 1) * calendarRequestPageSize);

  // Never read another Case's private calendar, even as an overlap count. The UI labels this
  // as a scoped preview; the confirmation command still checks every exclusive resource.
  const resourceWindows = selected.flatMap((row) =>
    row.proposedStartsAt &&
    row.proposedEndsAt &&
    ["proposed", "reschedule_requested"].includes(row.state)
      ? [
          sql`${appointmentResources.during} && tstzrange(${row.proposedStartsAt.toISOString()}, ${row.proposedEndsAt.toISOString()}, '[)')`,
        ]
      : [],
  );
  const resources = selected.length
    ? await db
        .select({
          appointmentId: appointmentResources.appointmentId,
          kind: appointmentResources.kind,
          resourceId: appointmentResources.resourceId,
          start: sql<string>`lower(${appointmentResources.during})::text`,
          end: sql<string>`upper(${appointmentResources.during})::text`,
        })
        .from(appointmentResources)
        .where(
          and(
            eq(appointmentResources.active, true),
            inArray(
              appointmentResources.appointmentId,
              db.select({ id: appointments.id }).from(appointments).where(permitted),
            ),
            or(
              inArray(
                appointmentResources.appointmentId,
                selected.map((row) => row.id),
              ),
              ...resourceWindows,
            ),
          ),
        )
    : [];
  type Row = (typeof rows)[number];
  const project = (row: Row): CalendarAppointment => {
    const { hostId, propertyId, ...safe } = row;
    const proposal = ["proposed", "reschedule_requested"].includes(row.state);
    return {
      ...safe,
      proposedStartsAt: proposal ? row.proposedStartsAt : null,
      proposedEndsAt: proposal ? row.proposedEndsAt : null,
      resources: resources
        .filter((resource) => resource.appointmentId === row.id)
        .map((resource) => ({
          kind: resource.kind,
          start: new Date(resource.start),
          end: new Date(resource.end),
        })),
      conflicts: [
        ...new Set(
          resources.flatMap((resource) =>
            proposal &&
            row.proposedStartsAt &&
            row.proposedEndsAt &&
            resource.appointmentId !== row.id &&
            resource.resourceId === (resource.kind === "broker" ? hostId : propertyId) &&
            new Date(resource.start) < row.proposedEndsAt &&
            new Date(resource.end) > row.proposedStartsAt
              ? [resource.kind]
              : [],
          ),
        ),
      ],
    };
  };
  return {
    rows: selected.map(project),
    requests: requests.slice(0, calendarRequestPageSize).map(project),
    hasMore,
    hasMoreRequests: requests.length > calendarRequestPageSize,
    checkedAt: new Date(),
  };
}
export type CalendarData = Awaited<ReturnType<typeof readCalendar>>;
