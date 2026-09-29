import "server-only";
import { getTableName, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const agencyCoverageQueue = "agency";

/**
 * Effective coverage changes with the membership transaction itself: no worker gap and
 * no rewrite of the last accepted owner. This is a responsibility projection, not a grant.
 * Physical key holders must never be replaced by this queue.
 */
export function ownerNeedsCoverage(owner: AnyPgColumn) {
  // Drizzle unqualifies columns in single-table SELECTs. Keep the outer reference
  // qualified so the correlated subquery cannot bind to its own id/owner column.
  const outerOwner = sql`${sql.identifier(getTableName(owner.table))}.${sql.identifier(owner.name)}`;
  return sql<boolean>`not exists (
    select 1 from principals coverage_owner
    join staff_memberships coverage_membership
      on coverage_membership.principal_id = coverage_owner.id
    where coverage_owner.id = ${outerOwner}
      and coverage_owner.kind = 'staff' and coverage_owner.status = 'active'
      and coverage_membership.state = 'active'
      and (coverage_membership.absence_from is null
        or coverage_membership.absence_from > clock_timestamp())
  )`;
}
