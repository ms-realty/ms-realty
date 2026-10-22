import "server-only";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { passkeys, principals, staffMemberships } from "@/db/schema";
import { availableStaff, requireAvailableStaff } from "../auth/availability";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { can, staffWhoCan } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";

interface Hosting {
  id: string;
  caseId: string | null;
  hostId: string | null;
}
const appointmentResource = (row: Hosting) => ({
  type: "appointment",
  id: row.id,
  caseId: row.caseId ?? undefined,
});

/** Both Case read and appointment authority apply; selection never grants access. */
export async function readHostReceivers(db: Executor, row: Hosting, through?: Date) {
  if (!row.caseId) return [];
  const people = (
    await db
      .select({ id: principals.id, name: principals.displayName })
      .from(principals)
      .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
      .where(
        and(
          eq(principals.kind, "staff"),
          eq(principals.status, "active"),
          eq(staffMemberships.state, "active"),
          availableStaff(),
          through
            ? or(isNull(staffMemberships.absenceFrom), gt(staffMemberships.absenceFrom, through))
            : undefined,
          sql`(select count(*) from ${passkeys} where ${passkeys.principalId} = ${principals.id}
            and ${passkeys.revokedAt} is null) >= ${staffPasskeyMinimum}`,
        ),
      )
      .orderBy(asc(principals.displayName), asc(principals.id))
  ).filter((person) => person.id !== row.hostId);
  const ids = people.map((person) => person.id);
  const caseReaders = await staffWhoCan(db, ids, ["case.read"], { type: "case", id: row.caseId });
  const hosts = await staffWhoCan(db, ids, ["appointment.manage"], appointmentResource(row));
  return people.filter((person) => caseReaders.has(person.id) && hosts.has(person.id));
}

export async function requireHostReceiver(db: Executor, row: Hosting, id: string, through?: Date) {
  if (!row.caseId || id === row.hostId) throw new AppError("transition_denied");
  await requireAvailableStaff(db, id, true, through);
  if (
    (await countActivePasskeys(db, id)) < staffPasskeyMinimum ||
    !(await can(db, { kind: "staff", id }, "case.read", { type: "case", id: row.caseId })) ||
    !(await can(db, { kind: "staff", id }, "appointment.manage", appointmentResource(row)))
  )
    throw new AppError("forbidden");
}
