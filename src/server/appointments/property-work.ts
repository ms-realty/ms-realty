import "server-only";
import { and, eq, or, type SQL, sql } from "drizzle-orm";
import { appointments, listings, properties } from "@/db/schema";
import type { CapabilityGrant } from "@/domain/capabilities";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import type { Session } from "../auth/sessions";
import { assertCanRead, can } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";

type Context = Pick<typeof appointments.$inferSelect, "listingId" | "propertyId"> & { id?: string };

/** Separate ordinary inventory visibility from appointment authority. No Case grant is widened. */
export async function propertyWorkFor(db: Executor, session: Session, row: Context) {
  if (session.account.kind !== "staff" || !row.listingId || !row.propertyId)
    throw new AppError("not_found");
  const [context] = await db
    .select({ listing: listings, property: properties })
    .from(listings)
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .where(and(eq(listings.id, row.listingId), eq(properties.id, row.propertyId)));
  if (!context) throw new AppError("not_found");
  await assertCanRead(db, session.actor, "listing.read", {
    type: "listing",
    id: context.listing.id,
    propertyId: context.property.id,
    audience: "internal",
  });
  if (!(await propertyHostCan(db, session.account.id, row))) throw new AppError("not_found");
  return context;
}

export async function propertyHostCan(db: Executor, hostId: string, row: Context) {
  if (!row.listingId || !row.propertyId) return false;
  const actor = { kind: "staff" as const, id: hostId };
  if ((await countActivePasskeys(db, hostId)) < staffPasskeyMinimum) return false;
  if (
    !(await can(db, actor, "listing.read", {
      type: "listing",
      id: row.listingId,
      propertyId: row.propertyId,
      audience: "internal",
    }))
  )
    return false;
  return (
    (await can(db, actor, "appointment.manage", {
      type: "appointment",
      id: row.id,
      audience: "internal",
    })) ||
    (await can(db, actor, "appointment.manage", {
      type: "property",
      id: row.propertyId,
      audience: "internal",
    })) ||
    (await can(db, actor, "appointment.manage", {
      type: "listing",
      id: row.listingId,
      propertyId: row.propertyId,
      audience: "internal",
    }))
  );
}

/** Applied before calendar ordering/counts. Expired/locale scopes never widen property work. */
export function propertyWorkVisibility(grants: readonly CapabilityGrant[]): SQL {
  const branches = (capability: "listing.read" | "appointment.manage") =>
    or(
      ...grants
        .filter((g) => g.capability === capability)
        .flatMap(({ scope }) => {
          if (scope?.locales || (scope?.expiresAt && new Date(scope.expiresAt) <= new Date()))
            return [];
          if (!scope?.recordType) return [sql`true`];
          if (scope.recordType === "listing")
            return [
              scope.recordId
                ? eq(appointments.listingId, scope.recordId)
                : sql`${appointments.listingId} is not null`,
            ];
          if (scope.recordType === "property")
            return [
              scope.recordId
                ? eq(appointments.propertyId, scope.recordId)
                : sql`${appointments.propertyId} is not null`,
            ];
          if (capability === "appointment.manage" && scope.recordType === "appointment")
            return [scope.recordId ? eq(appointments.id, scope.recordId) : sql`true`];
          return [];
        }),
    ) ?? sql`false`;
  return and(
    eq(appointments.purpose, "photography"),
    sql`${appointments.caseId} is null`,
    sql`exists (select 1 from ${listings} photo_listing where photo_listing.id = ${appointments.listingId} and photo_listing.property_id = ${appointments.propertyId})`,
    branches("listing.read"),
    branches("appointment.manage"),
  ) as SQL;
}
