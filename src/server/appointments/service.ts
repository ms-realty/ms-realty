import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  appointmentParticipants,
  appointmentResources,
  appointments,
  appointmentVersions,
  caseParticipants,
  cases,
  interests,
  listings,
  principals,
  properties,
  servicePolicies,
} from "@/db/schema";
import { appointmentMachine, guardAppointmentTransition } from "@/domain/appointment";
import type { PublicLocale } from "@/i18n/config";
import { requireAvailableStaff } from "../auth/availability";
import type { Session } from "../auth/sessions";
import { assertCan, can, resolveGrants } from "../authz";
import {
  bumpCase,
  caseEvent,
  caseFor,
  caseVisibility,
  liveParticipation,
  liveUser,
} from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { runOperation } from "../operations";
import { loadPublishedListings } from "../publication/presentation";
import { nextReference } from "../references";
import { appointmentCoverageAt, ownerNeedsCoverage } from "../work/coverage-policy";
import { allow, commandEnvelope, openAppointmentStates, parseInput, version } from "../work/shared";
import { readHostReceivers } from "./host-receivers";
import { readAppointmentListing } from "./listing-context";
import { appointmentTimezone, calendarFile, inServiceHours, sofiaInstant } from "./time";

const requestSchema = z.object({
  ...commandEnvelope,
  interestId: z.uuid(),
  preferredWindow: z.string().trim().min(3).max(500),
  participantPartyId: z.uuid().optional(),
});
const arrangeSchema = z.object({
  ...commandEnvelope,
  action: z.enum(["propose", "confirm"]),
  startsAt: z.string(),
  endsAt: z.string(),
  bufferMinutes: z.number().int().min(0).max(180),
  propertyAccessConfirmed: z.boolean(),
  externalBusyChecked: z.boolean(),
  accessNotes: z.string().trim().max(1500),
});
const responseSchema = z.object({
  ...commandEnvelope,
  state: z.enum(["reschedule_requested", "cancelled", "completed", "no_show", "declined"]),
  reason: z.string().trim().min(3).max(1500),
});

export async function appointmentFor(
  db: Executor,
  session: Session,
  id: string,
  write = false,
  lock = false,
) {
  if (!z.uuid().safeParse(id).success) throw new AppError("not_found");
  const live = await liveUser(db, session);
  const query = db.select().from(appointments).where(eq(appointments.id, id));
  const [row] = await (lock ? query.for("update") : query);
  if (!row?.caseId) throw new AppError("not_found");
  await caseFor(db, live, row.caseId);
  const resource = {
    type: "appointment",
    id,
    caseId: row.caseId,
    audience: "case_participants" as const,
  };
  if (live.account.kind === "staff" || write)
    await assertCan(
      db,
      live.actor,
      live.account.kind === "staff" ? "appointment.manage" : "portal.appointment.request",
      resource,
    );
  if (live.account.kind === "client") {
    const [principal] = await db
      .select({ partyId: principals.partyId })
      .from(principals)
      .where(eq(principals.id, live.account.id));
    const [participant] = principal
      ? await db
          .select({ id: appointmentParticipants.id })
          .from(appointmentParticipants)
          .where(
            and(
              eq(appointmentParticipants.appointmentId, id),
              eq(appointmentParticipants.partyId, principal.partyId),
            ),
          )
      : [];
    if (!participant) throw new AppError("not_found");
  }
  return { row, live, resource };
}

export async function recordAppointmentVersion(
  db: Executor,
  row: typeof appointments.$inferSelect,
  session: Session,
) {
  await db.insert(appointmentVersions).values({
    appointmentId: row.id,
    versionNumber: row.version,
    snapshot: {
      state: row.state,
      proposedStartsAt: row.proposedStartsAt?.toISOString(),
      proposedEndsAt: row.proposedEndsAt?.toISOString(),
      confirmedStartsAt: row.confirmedStartsAt?.toISOString(),
      confirmedEndsAt: row.confirmedEndsAt?.toISOString(),
      icsSequence: row.icsSequence,
      hostId: row.hostId,
      pendingHostId: row.pendingHostId,
      pendingHostVersion: row.pendingHostVersion,
      pendingHostNote: row.pendingHostNote,
      pendingHostOfferedAt: row.pendingHostOfferedAt?.toISOString(),
    },
    actorKind: session.actor.kind,
    actorId: session.actor.id,
  });
}

export async function requestAppointment(
  db: Executor,
  session: Session,
  raw: z.input<typeof requestSchema>,
) {
  const input = parseInput(requestSchema, raw);
  const capability =
    session.account.kind === "staff" ? "appointment.manage" : "portal.appointment.request";
  const { live } = await caseFor(db, session, input.id, capability);
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "appointment.request",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row: caseRow } = await caseFor(ctx.tx, session, input.id, capability, true);
      version(caseRow, input.expectedVersion);
      if (caseRow.disposition !== "active") throw new AppError("transition_denied");
      const [interest] = await ctx.tx
        .select()
        .from(interests)
        .where(and(eq(interests.id, input.interestId), eq(interests.caseId, caseRow.id)))
        .for("share");
      if (interest?.state !== "shortlisted") throw new AppError("transition_denied");
      const [listing] = await ctx.tx
        .select()
        .from(listings)
        .where(eq(listings.id, interest.listingId));
      if (!listing) throw new AppError("not_found");
      const [property] = await ctx.tx
        .select()
        .from(properties)
        .where(eq(properties.id, listing.propertyId));
      if (property?.country !== "BG")
        throw new AppError("validation_failed", {
          fieldErrors: {
            preferredWindow: ["This scheduling workflow is configured for Bulgaria only."],
          },
        });
      const [principal] = await ctx.tx
        .select({ partyId: principals.partyId })
        .from(principals)
        .where(eq(principals.id, live.account.id));
      const partyId =
        live.account.kind === "client" ? principal?.partyId : input.participantPartyId;
      if (!partyId) throw new AppError("validation_failed");
      const [participant] = await ctx.tx
        .select()
        .from(caseParticipants)
        .where(
          and(
            eq(caseParticipants.caseId, caseRow.id),
            eq(caseParticipants.partyId, partyId),
            liveParticipation(),
          ),
        )
        .for("share");
      if (!participant) throw new AppError("not_found");
      const [existing] = await ctx.tx
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.interestId, interest.id),
            inArray(appointments.state, [
              "requested",
              "proposed",
              "confirmed",
              "reschedule_requested",
            ]),
          ),
        );
      if (existing) throw new AppError("transition_denied");
      const [row] = await ctx.tx
        .insert(appointments)
        .values({
          reference: await nextReference(ctx.tx, "appointment"),
          format: "in_person",
          caseId: caseRow.id,
          interestId: interest.id,
          listingId: listing.id,
          propertyId: listing.propertyId,
          hostId: caseRow.ownerId,
          timezone: appointmentTimezone,
          requestedWindows: [{ text: input.preferredWindow, requestedById: live.account.id }],
          icsUid: `${randomUUID()}@appointments.ms-realty.com`,
        })
        .returning();
      if (!row) throw new Error("Appointment insert failed");
      await ctx.tx
        .insert(appointmentParticipants)
        .values({ appointmentId: row.id, partyId, role: "client" });
      await recordAppointmentVersion(ctx.tx, row, live);
      await bumpCase(ctx.tx, caseRow.id, caseRow.version);
      await caseEvent(ctx, "appointment", row.id, "appointment.requested", capability, {
        caseId: caseRow.id,
      });
      return {
        id: row.id,
        reference: row.reference,
        version: row.version,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

export async function arrangeAppointment(
  db: Executor,
  session: Session,
  raw: z.input<typeof arrangeSchema>,
) {
  const input = parseInput(arrangeSchema, raw);
  const { live } = await appointmentFor(db, session, input.id, true);
  if (live.account.kind !== "staff") throw new AppError("forbidden");
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "appointment.arrange",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await appointmentFor(ctx.tx, session, input.id, true, true);
      version(row, input.expectedVersion);
      const start = sofiaInstant(input.startsAt);
      const end = sofiaInstant(input.endsAt);
      if (
        !start ||
        !end ||
        start.getTime() <= Date.now() ||
        end.getTime() <= start.getTime() ||
        end.getTime() - start.getTime() > 6 * 3600000
      )
        throw new AppError("validation_failed", {
          fieldErrors: {
            startsAt: [
              "Use a valid future Sofia time and explicit +02:00 or +03:00 offset. Gaps and incorrect offsets are rejected.",
            ],
            endsAt: ["End must follow start, within six hours."],
          },
        });
      if (row.state !== "reschedule_requested")
        allow(
          appointmentMachine.check(
            row.state,
            input.action === "propose" ? "proposed" : "confirmed",
          ),
        );
      const slot = {
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        timezone: appointmentTimezone,
      };
      if (input.action === "confirm") {
        if (!row.listingId || !row.propertyId || !row.hostId)
          throw new AppError("transition_denied");
        await requireAvailableStaff(
          ctx.tx,
          row.hostId,
          true,
          new Date(end.getTime() + input.bufferMinutes * 60000 - 1),
        );
        const [listing] = await ctx.tx
          .select()
          .from(listings)
          .where(eq(listings.id, row.listingId))
          .for("share");
        const [published] = listing
          ? await loadPublishedListings(ctx.tx, { ids: [listing.id] }, "bg")
          : [];
        const available = Boolean(
          published &&
            listing?.commercialState === "available" &&
            listing.availabilityConfirmedAt &&
            listing.reviewDueAt &&
            listing.reviewDueAt.getTime() > Date.now() &&
            listing.freshnessState === "current_under_policy",
        );
        const hostAvailable = await can(
          ctx.tx,
          { kind: "staff", id: row.hostId },
          "appointment.manage",
          { type: "appointment", caseId: row.caseId ?? undefined, audience: "internal" },
        );
        const participants = await ctx.tx
          .select({ id: appointmentParticipants.id })
          .from(appointmentParticipants)
          .innerJoin(
            caseParticipants,
            and(
              eq(caseParticipants.partyId, appointmentParticipants.partyId),
              eq(caseParticipants.caseId, row.caseId as string),
              liveParticipation(),
            ),
          )
          .where(eq(appointmentParticipants.appointmentId, row.id));
        const [policy] = await ctx.tx
          .select()
          .from(servicePolicies)
          .where(
            and(
              lte(servicePolicies.effectiveFrom, new Date()),
              sql`${servicePolicies.approvedById} is not null`,
            ),
          )
          .orderBy(desc(servicePolicies.effectiveFrom))
          .limit(1);
        if (
          !policy ||
          policy.timezone !== appointmentTimezone ||
          !inServiceHours(start, end, policy.serviceHours)
        )
          throw new AppError("validation_failed", {
            fieldErrors: {
              startsAt: ["An approved service-hours policy covering this time is required."],
            },
          });
        const bufferedStart = new Date(start.getTime() - input.bufferMinutes * 60000);
        const bufferedEnd = new Date(end.getTime() + input.bufferMinutes * 60000);
        // Sorted advisory locks prevent competing confirmation deadlocks; the DB exclusion
        // constraint is the final defense, including callers outside this service.
        const resources = [
          { kind: "broker" as const, id: row.hostId },
          { kind: "property_access" as const, id: row.propertyId },
        ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
        for (const resource of resources)
          await ctx.tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`appointment:${resource.kind}:${resource.id}`}, 0))`,
          );
        const during = `[${bufferedStart.toISOString()},${bufferedEnd.toISOString()})`;
        let free = true;
        for (const resource of resources) {
          const [conflict] = await ctx.tx
            .select({ id: appointmentResources.id })
            .from(appointmentResources)
            .where(
              and(
                eq(appointmentResources.kind, resource.kind),
                eq(appointmentResources.resourceId, resource.id),
                eq(appointmentResources.active, true),
                ne(appointmentResources.appointmentId, row.id),
                sql`${appointmentResources.during} && ${during}::tstzrange`,
              ),
            )
            .limit(1);
          if (conflict) free = false;
        }
        allow(
          guardAppointmentTransition(
            row.state,
            "confirmed",
            {
              slot,
              hostAvailable,
              propertyAccess: input.propertyAccessConfirmed ? "confirmed" : "unknown",
              participantCount: participants.length,
              externalBusyChecked: input.externalBusyChecked,
              resourcesFree: free,
              availabilityConfirmed: available,
            },
            live.actor,
          ),
        );
        await ctx.tx
          .update(appointmentResources)
          .set({ active: false, releasedAt: new Date() })
          .where(
            and(
              eq(appointmentResources.appointmentId, row.id),
              eq(appointmentResources.active, true),
            ),
          );
        await ctx.tx.insert(appointmentResources).values(
          resources.map((resource) => ({
            appointmentId: row.id,
            kind: resource.kind,
            resourceId: resource.id,
            during,
          })),
        );
      } else allow(guardAppointmentTransition(row.state, "proposed", { slot }, live.actor));
      const [changed] = await ctx.tx
        .update(appointments)
        .set({
          proposedStartsAt: start,
          proposedEndsAt: end,
          ...(input.action === "confirm"
            ? {
                state: "confirmed" as const,
                confirmedStartsAt: start,
                confirmedEndsAt: end,
                propertyAccess: "confirmed" as const,
                externalBusyCheckedAt: new Date(),
                externalBusyCheckedById: live.account.id,
                icsSequence: row.icsSequence + 1,
                accessNotes: input.accessNotes || null,
              }
            : {
                state:
                  row.state === "reschedule_requested"
                    ? ("reschedule_requested" as const)
                    : ("proposed" as const),
              }),
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, row.id))
        .returning();
      if (!changed) throw new Error("Appointment update failed");
      await recordAppointmentVersion(ctx.tx, changed, live);
      await caseEvent(
        ctx,
        "appointment",
        row.id,
        input.action === "confirm" ? "appointment.confirmed" : "appointment.proposed",
        "appointment.manage",
      );
      return {
        id: row.id,
        reference: row.reference,
        version: changed.version,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

export async function respondToAppointment(
  db: Executor,
  session: Session,
  raw: z.input<typeof responseSchema>,
) {
  const input = parseInput(responseSchema, raw);
  const { live } = await appointmentFor(db, session, input.id, true);
  const capability =
    live.account.kind === "staff" ? "appointment.manage" : "portal.appointment.request";
  return runOperation(
    db,
    {
      actor: live.actor,
      type: "appointment.respond",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      expectedVersion: input.expectedVersion,
    },
    async (ctx) => {
      const { row } = await appointmentFor(ctx.tx, session, input.id, true, true);
      version(row, input.expectedVersion);
      allow(appointmentMachine.check(row.state, input.state));
      if (
        ["completed", "no_show"].includes(input.state) &&
        (!row.confirmedEndsAt || row.confirmedEndsAt.getTime() > Date.now())
      )
        throw new AppError("transition_denied");
      allow(
        guardAppointmentTransition(
          row.state,
          input.state,
          {
            reason: input.reason,
            attendanceRecorded: input.state === "completed",
            factualCheckNote: input.state === "no_show" ? input.reason : undefined,
          },
          live.actor,
        ),
      );
      const terminal = ["cancelled", "declined", "completed", "no_show"].includes(input.state);
      if (terminal)
        await ctx.tx
          .update(appointmentResources)
          .set({ active: false, releasedAt: new Date() })
          .where(
            and(
              eq(appointmentResources.appointmentId, row.id),
              eq(appointmentResources.active, true),
            ),
          );
      const [changed] = await ctx.tx
        .update(appointments)
        .set({
          state: input.state,
          cancelReason:
            input.state === "cancelled" || input.state === "declined"
              ? input.reason
              : row.cancelReason,
          outcomeNote:
            input.state === "completed" || input.state === "no_show"
              ? input.reason
              : row.outcomeNote,
          ...(input.state === "reschedule_requested"
            ? {
                requestedWindows: [{ text: input.reason, requestedById: live.account.id }],
                proposedStartsAt: null,
                proposedEndsAt: null,
              }
            : {}),
          icsSequence: row.icsSequence + (input.state === "cancelled" ? 1 : 0),
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, row.id))
        .returning();
      if (!changed) throw new Error("Appointment response failed");
      await recordAppointmentVersion(ctx.tx, changed, live);
      await caseEvent(ctx, "appointment", row.id, `appointment.${input.state}`, capability);
      return {
        id: row.id,
        reference: row.reference,
        version: changed.version,
        recordedAt: new Date().toISOString(),
      };
    },
  );
}

export async function readAppointment(
  db: Executor,
  session: Session,
  id: string,
  locale?: PublicLocale,
) {
  const { row, live, resource } = await appointmentFor(db, session, id);
  const listing = locale
    ? await readAppointmentListing(db, resource.caseId, row.interestId, locale)
    : null;
  const [reservation] =
    live.actor.kind === "staff"
      ? await db
          .select({
            startsAt: sql<string>`lower(${appointmentResources.during})::text`,
            endsAt: sql<string>`upper(${appointmentResources.during})::text`,
          })
          .from(appointmentResources)
          .where(
            and(
              eq(appointmentResources.appointmentId, row.id),
              eq(appointmentResources.kind, "broker"),
              eq(appointmentResources.active, true),
            ),
          )
          .limit(1)
      : [];
  const [coverage] =
    live.actor.kind === "staff" && (openAppointmentStates as readonly string[]).includes(row.state)
      ? await db
          .select({ needed: ownerNeedsCoverage(appointments.hostId, appointmentCoverageAt) })
          .from(appointments)
          .where(eq(appointments.id, id))
      : [];
  const windows = z.array(z.object({ text: z.string() })).safeParse(row.requestedWindows);
  const [host] = row.hostId
    ? await db
        .select({ name: principals.displayName })
        .from(principals)
        .where(eq(principals.id, row.hostId))
    : [];
  const logisticsAllowed =
    live.account.kind === "staff" ||
    Boolean(
      row.confirmedStartsAt &&
        row.confirmedEndsAt &&
        ["confirmed", "reschedule_requested"].includes(row.state) &&
        Date.now() >= row.confirmedStartsAt.getTime() - 7 * 86400000 &&
        Date.now() <= row.confirmedEndsAt.getTime() + 86400000,
    );
  const future =
    (!row.confirmedStartsAt || row.confirmedStartsAt.getTime() > Date.now()) &&
    (!row.proposedStartsAt || row.confirmedStartsAt || row.proposedStartsAt.getTime() > Date.now());
  const open = (openAppointmentStates as readonly string[]).includes(row.state);
  const ownHost = live.account.kind === "staff" && row.hostId === live.account.id;
  const [pending] =
    live.account.kind === "staff" && row.pendingHostId
      ? await db
          .select({ name: principals.displayName })
          .from(principals)
          .where(eq(principals.id, row.pendingHostId))
      : [];
  const canOfferHost = Boolean(ownHost && open && future && !row.pendingHostId);
  const hostReceivers = canOfferHost
    ? await readHostReceivers(
        db,
        row,
        reservation ? new Date(reservation.endsAt) : (row.proposedEndsAt ?? undefined),
      )
    : [];
  return {
    listing,
    appointment: {
      id: row.id,
      reference: row.reference,
      version: row.version,
      state: row.state,
      caseId: row.caseId,
      interestId: row.interestId,
      hostName: host?.name ?? null,
      timezone: row.timezone,
      requestedWindows: windows.success ? windows.data : [],
      proposedStartsAt: row.proposedStartsAt,
      proposedEndsAt: row.proposedEndsAt,
      confirmedStartsAt: row.confirmedStartsAt,
      confirmedEndsAt: row.confirmedEndsAt,
      accessNotes: logisticsAllowed ? row.accessNotes : null,
      outcomeNote: row.outcomeNote,
      cancelReason: row.cancelReason,
      icsSequence: row.icsSequence,
    },
    canManage: live.account.kind === "staff",
    needsCoverage: Boolean(coverage?.needed),
    canOfferHost,
    canWithdrawHost: Boolean(ownHost && row.pendingHostId),
    hostReceivers,
    hostOffer:
      live.account.kind === "staff" && row.pendingHostId
        ? {
            name: pending?.name ?? "—",
            note: row.pendingHostNote,
            current: row.pendingHostVersion === row.version,
          }
        : null,
    canAcceptHost: Boolean(
      live.account.kind === "staff" &&
        open &&
        (coverage?.needed ||
          (row.pendingHostId === live.account.id && row.pendingHostVersion === row.version)) &&
        row.hostId !== live.account.id &&
        future,
    ),
    reservedInterval: reservation
      ? { startsAt: new Date(reservation.startsAt), endsAt: new Date(reservation.endsAt) }
      : null,
    canRespond: await can(
      db,
      live.actor,
      live.account.kind === "staff" ? "appointment.manage" : "portal.appointment.request",
      resource,
    ),
  };
}

export async function listAppointments(db: Executor, session: Session, caseId?: string) {
  const live = await liveUser(db, session);
  const visibility = await caseVisibility(db, live);
  // First narrow by currently readable cases; appointment-level checks then project safely.
  const allowedCases = db.select({ id: cases.id }).from(cases).where(visibility);
  const grants = await resolveGrants(db, live.actor);
  const appointmentScope =
    live.account.kind === "staff"
      ? (or(
          ...grants
            .filter((g) => g.capability === "appointment.manage")
            .flatMap(({ scope }) => {
              if (scope?.locales) return [];
              if (!scope?.recordType) return [sql`true`];
              if (scope.recordType === "appointment")
                return [scope.recordId ? eq(appointments.id, scope.recordId) : sql`true`];
              if (scope.recordType === "case")
                return [scope.recordId ? eq(appointments.caseId, scope.recordId) : sql`true`];
              return [];
            }),
        ) ?? sql`false`)
      : sql`exists (select 1 from ${appointmentParticipants} ap join ${principals} p on p.party_id = ap.party_id where ap.appointment_id = ${appointments.id} and p.id = ${live.account.id})`;
  const candidates = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        inArray(appointments.caseId, allowedCases),
        appointmentScope,
        caseId ? eq(appointments.caseId, caseId) : undefined,
      ),
    )
    .orderBy(desc(appointments.updatedAt), desc(appointments.id))
    .limit(100);
  const rows = [];
  for (const candidate of candidates) {
    try {
      rows.push((await readAppointment(db, live, candidate.id)).appointment);
    } catch (error) {
      if (!(error instanceof AppError) || !["not_found", "forbidden"].includes(error.code))
        throw error;
    }
  }
  return rows;
}

export async function exportAppointmentCalendar(db: Executor, session: Session, id: string) {
  const { row } = await appointmentFor(db, session, id);
  if (
    !row.confirmedStartsAt ||
    !row.confirmedEndsAt ||
    !["confirmed", "reschedule_requested", "cancelled", "completed", "no_show"].includes(row.state)
  )
    throw new AppError("not_found");
  return calendarFile({
    uid: row.icsUid,
    sequence: row.icsSequence,
    reference: row.reference,
    start: row.confirmedStartsAt,
    end: row.confirmedEndsAt,
    cancelled: row.state === "cancelled",
    updatedAt: row.updatedAt,
  });
}
