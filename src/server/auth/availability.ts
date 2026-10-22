import "server-only";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { principals, staffMemberships } from "@/db/schema";
import type { Executor } from "../db";
import { AppError } from "../errors";

/** Availability is responsibility policy, not a sign-in or authorization grant. */
export const availableStaff = () =>
  or(
    isNull(staffMemberships.absenceFrom),
    gt(staffMemberships.absenceFrom, sql`clock_timestamp()`),
  );

export async function requireAvailableStaff(
  db: Executor,
  id: string,
  lock = false,
  through?: Date,
) {
  const query = db
    .select({ absenceFrom: staffMemberships.absenceFrom })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(
      and(
        eq(principals.id, id),
        eq(principals.kind, "staff"),
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
      ),
    );
  const [row] = await (lock ? query.for("share") : query);
  // Evaluate after acquiring the lock; a wait must not reuse a transaction-start timestamp.
  if (
    !row ||
    (row.absenceFrom && row.absenceFrom.getTime() <= Math.max(Date.now(), through?.getTime() ?? 0))
  )
    throw new AppError("transition_denied");
}
